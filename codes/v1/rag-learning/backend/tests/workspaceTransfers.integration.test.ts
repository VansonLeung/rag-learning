import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createBackendApplication } from '../src/createBackendApplication.js';
import {
  embeddingFingerprint,
  defaultApplicationSettings,
} from '../src/repositories/applicationSettingsRepository.js';
test('workspaces isolate their data and support transactional recursive copy/move', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grove-workspaces-'));
  let application = await createBackendApplication({ dataDirectory: directory });
  let api = request(application.app);
  try {
    const personal = await application.workspaces.getWorkspace('personal');
    const settings = structuredClone(defaultApplicationSettings);
    settings.embedding.model = 'original-model';
    await personal.settings.saveSettings(settings);
    const fingerprint = embeddingFingerprint(settings);
    await personal.nodes.createFolder('root', 'Research');
    const folder = (await personal.nodes.listNodes()).find((node) => node.name === 'Research')!;
    const child = await personal.nodes.createFolder(folder.id, 'Nested');
    await writeFile(
      path.join(personal.uploadsDirectory, 'document-one'),
      'Apple trees need sunlight.',
    );
    await personal.database.query(
      "INSERT INTO explorer_nodes(id,parent_id,name,kind,extracted_text,index_fingerprint,indexed_at) VALUES('document-one',$1,'orchard.txt','file','Apple trees need sunlight.',$2,now())",
      [folder.id, fingerprint],
    );
    await personal.database.query(
      "INSERT INTO document_chunks(id,document_id,parent_chunk_id,kind,content,start_offset,end_offset,embedding,index_fingerprint) VALUES('normal-one','document-one',NULL,'normal','Apple trees need sunlight.',0,26,'[1,2,3]',$1),('parent-one','document-one',NULL,'parent','Apple trees need sunlight.',0,26,NULL,$1),('child-one','document-one','parent-one','child','Apple trees',0,11,'[1,2,3]',$1)",
      [fingerprint],
    );
    const beta = (await api.post('/api/workspaces').send({ name: 'Work' }).expect(201)).body;
    const betaApi = `/api/workspaces/${beta.id}`;
    assert.equal((await api.get(betaApi + '/nodes')).body.length, 1);
    assert.equal((await api.get(betaApi + '/settings')).body.embedding.model, '');
    assert.equal((await api.get(betaApi + '/chat/sessions')).body.length, 0);
    await api.get(betaApi + '/nodes/document-one/content').expect(404);
    const transfer = {
      sourceWorkspaceId: 'personal',
      targetWorkspaceId: 'personal',
      nodeIds: ['document-one'],
      destinationFolderId: folder.id,
      operation: 'copy',
    };
    const conflict = (await api.post('/api/transfers').send(transfer).expect(409)).body;
    assert.deepEqual(conflict.conflicts, ['orchard.txt']);
    const copied = (
      await api
        .post('/api/transfers')
        .send({ ...transfer, conflict: 'keep-both' })
        .expect(200)
    ).body;
    const copy = await personal.nodes.getNode(copied.copied[0]);
    assert.equal(copy.name, 'orchard (copy).txt');
    assert.equal(copy.index_fingerprint, fingerprint);
    const chunks = (
      await personal.database.query<any>('SELECT * FROM document_chunks WHERE document_id=$1', [
        copy.id,
      ])
    ).rows;
    assert.equal(chunks.length, 3);
    assert.ok(
      chunks.every((chunk) => !['normal-one', 'child-one', 'parent-one'].includes(chunk.id)),
    );
    assert.equal(
      chunks.find((chunk) => chunk.kind === 'child').parent_chunk_id,
      chunks.find((chunk) => chunk.kind === 'parent').id,
    );
    assert.equal(
      await readFile(path.join(personal.uploadsDirectory, copy.id), 'utf8'),
      'Apple trees need sunlight.',
    );
    await api
      .post('/api/transfers')
      .send({ ...transfer, nodeIds: [folder.id], destinationFolderId: child.id })
      .expect(400);
    await api
      .post('/api/transfers')
      .send({ ...transfer, nodeIds: [folder.id], destinationFolderId: child.id, operation: 'move' })
      .expect(400);
    const destination = await personal.nodes.createFolder('root', 'Destination');
    await api
      .post('/api/transfers')
      .send({
        ...transfer,
        nodeIds: ['document-one', copy.id],
        destinationFolderId: destination.id,
        operation: 'move',
      })
      .expect(200);
    assert.equal((await personal.nodes.getNode('document-one')).parent_id, destination.id);
    assert.equal((await personal.nodes.getNode(copy.id)).parent_id, destination.id);
    // The target database can reuse indexes only after its own settings match.
    const work = await application.workspaces.getWorkspace(beta.id);
    await work.settings.saveSettings(settings);
    const cross = (
      await api
        .post('/api/transfers')
        .send({
          ...transfer,
          nodeIds: [destination.id],
          targetWorkspaceId: beta.id,
          destinationFolderId: 'root',
        })
        .expect(200)
    ).body;
    assert.equal(cross.needsIndexing.length, 0);
    const copiedNodes = (await api.get(betaApi + '/nodes')).body;
    assert.equal(copiedNodes.filter((node: any) => node.kind === 'file').length, 2);
    const snapshot = JSON.stringify((await api.get('/api/workspaces/personal/nodes')).body);
    await api.delete(betaApi + '/nodes/' + cross.copied[0]).expect(200);
    assert.equal(JSON.stringify((await api.get('/api/workspaces/personal/nodes')).body), snapshot);
    const mismatch = (await api.post('/api/workspaces').send({ name: 'Different model' })).body;
    const reindex = (
      await api
        .post('/api/transfers')
        .send({ ...transfer, targetWorkspaceId: mismatch.id, destinationFolderId: 'root' })
        .expect(200)
    ).body;
    assert.equal(reindex.needsIndexing.length, 1);
    const other = await application.workspaces.getWorkspace(mismatch.id);
    assert.equal((await other.nodes.getNode(reindex.copied[0])).index_fingerprint, null);
    assert.ok((await other.jobs.listJobs()).length > 0);
    await api.patch(betaApi).send({ name: 'Renamed Work' }).expect(200);
    await application.close();
    application = await createBackendApplication({ dataDirectory: directory });
    api = request(application.app);
    assert.equal(
      (await api.get('/api/workspaces')).body.find((record: any) => record.id === beta.id).name,
      'Renamed Work',
    );
    assert.equal(
      (await api.get('/api/workspaces/personal/nodes')).body.filter(
        (node: any) => node.kind === 'file',
      ).length,
      2,
    );
    await api.delete(betaApi).expect(200);
    await api.get(betaApi + '/nodes').expect(404);
    await api.delete('/api/workspaces/' + mismatch.id).expect(200);
    await api.delete('/api/workspaces/personal').expect(400);
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});
