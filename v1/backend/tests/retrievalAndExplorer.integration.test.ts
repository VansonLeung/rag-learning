import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import type { Server } from 'node:http';
import { createBackendApplication } from '../src/createBackendApplication.js';
import { defaultApplicationSettings } from '../src/repositories/applicationSettingsRepository.js';
import { createDocumentChunks } from '../src/services/ingestion/createDocumentChunks.js';
import {
  buildBudgetedContext,
  countContextTokens,
} from '../src/services/retrieval/buildBudgetedContext.js';
import { combineRankedCandidates } from '../src/services/retrieval/combineRankedCandidates.js';
let application: Awaited<ReturnType<typeof createBackendApplication>>;
let modelServer: Server;
let directory: string;
let api: ReturnType<typeof request>;
let modelUrl: string;
let delayEmbeddings = false;
let failEmbeddings = false;
let malformedVectors = false;
let slowChat = false;
let embeddingSettings: any;
const options = {
  query: 'orchard apple',
  method: 'hybrid',
  strategy: 'parent-child',
  scope: 'all',
  folderId: 'root',
  fileIds: [],
  rerank: false,
  candidateCount: 30,
  resultCount: 5,
  contextTokens: 600,
};
let orchardId: string;
let childFolderId: string;
let otherFolderId: string;
let documentId: string;
let childDocumentId: string;
function embedding(text: string) {
  return [
    1 + (text.match(/apple|orchard/gi)?.length ?? 0),
    1 + (text.match(/ocean|whale/gi)?.length ?? 0),
    1,
  ];
}
before(async () => {
  const models = express();
  models.use(express.json());
  models.post('/v1/embeddings', async (req, res) => {
    if (delayEmbeddings) await new Promise((resolve) => setTimeout(resolve, 700));
    if (failEmbeddings) {
      res.status(503).json({ error: 'test failure' });
      return;
    }
    res.json({
      data: req.body.input.map((text: string, index: number) => ({
        index,
        embedding: malformedVectors ? [0, 0, 0] : embedding(text),
      })),
    });
  });
  models.post('/v1/rerank', (req, res) =>
    res.json({
      results: req.body.documents.map((_: string, index: number) => ({
        index,
        relevance_score: 1 / (index + 1),
      })),
    }),
  );
  models.post('/v1/tei-rerank', (req, res) =>
    res.json(req.body.texts.map((_: string, index: number) => ({ index, score: 1 / (index + 1) }))),
  );
  models.post('/v1/chat/completions', async (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    for (const token of ['The orchard ', 'grows apples ', '[1].']) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`);
      if (slowChat) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    res.end('data: [DONE]\n\n');
  });
  modelServer = await new Promise<Server>((resolve) => {
    const server = models.listen(0, '127.0.0.1', () => resolve(server));
  });
  modelUrl = `http://127.0.0.1:${(modelServer.address() as any).port}/v1`;
  directory = await mkdtemp(path.join(os.tmpdir(), 'grove-test-'));
  application = await createBackendApplication({ dataDirectory: directory });
  api = request(application.app);
  embeddingSettings = {
    ...structuredClone(defaultApplicationSettings),
    embedding: {
      baseUrl: modelUrl,
      apiKey: 'test-secret',
      model: 'test-embeddings',
      timeoutMs: 5000,
    },
    llm: { baseUrl: modelUrl, apiKey: '', model: 'test-chat', timeoutMs: 5000 },
    reranker: {
      baseUrl: modelUrl,
      apiKey: '',
      model: 'test-reranker',
      timeoutMs: 5000,
      format: 'cohere',
      path: '/rerank',
    },
  };
  await api.put('/api/settings').send(embeddingSettings).expect(200);
});
after(async () => {
  await application?.close();
  modelServer?.closeAllConnections();
  await new Promise<void>((resolve) => modelServer?.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
async function upload(parentId: string, name: string, text: string) {
  const response = await api
    .post('/api/upload')
    .field('parentId', parentId)
    .field('paths', JSON.stringify([name]))
    .attach('files', Buffer.from(text), name)
    .expect(200);
  assert.ok(!response.body.results[0].error, JSON.stringify(response.body));
  return response.body.results[0];
}
async function waitForJob(documentId: string, status = 'completed') {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const jobs = (await api.get('/api/jobs')).body;
    const job = jobs.find((job: any) => job.document_id === documentId);
    if (job?.status === status) return job;
    if (job?.status === 'failed' && status !== 'failed') assert.fail(job.message);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail(`Timed out waiting for ${status}`);
}
test('settings redact keys, preserve saved keys, validate connections, and reject foreign origins', async () => {
  const settings = (await api.get('/api/settings').expect(200)).body;
  assert.equal(settings.embedding.apiKey, '');
  assert.equal(settings.embedding.hasApiKey, true);
  await api.put('/api/settings').send(settings).expect(200);
  const persisted = (
    await application.database.query<any>('SELECT value FROM application_settings')
  ).rows[0].value;
  assert.equal(persisted.embedding.apiKey, 'test-secret');
  for (const role of ['embedding', 'reranker', 'llm'])
    await api.post(`/api/settings/test/${role}`).expect(200);
  await api
    .post('/api/folders')
    .set('Origin', 'https://untrusted.example')
    .send({ parentId: 'root', name: 'bad' })
    .expect(403);
  await api.post('/api/folders').send({ parentId: 'root', name: '../bad' }).expect(400);
});
test('folder uploads preserve paths, detect duplicates, extract text, and build both indexes', async () => {
  orchardId = (
    await api.post('/api/folders').send({ parentId: 'root', name: 'Orchard' }).expect(201)
  ).body.id;
  otherFolderId = (
    await api.post('/api/folders').send({ parentId: 'root', name: 'Ocean' }).expect(201)
  ).body.id;
  const text = 'An apple orchard grows apples. Trees need soil, water, and sunlight.\n\n'.repeat(
    110,
  );
  documentId = (await upload(orchardId, 'orchard.md', text)).id;
  childDocumentId = (
    await upload(
      orchardId,
      'Growing/seasons.txt',
      'The apple orchard harvest occurs in autumn.\n'.repeat(20),
    )
  ).id;
  const ocean = (
    await upload(otherFolderId, 'whales.txt', 'Whales swim in the ocean.\n'.repeat(20))
  ).id;
  await waitForJob(documentId);
  await waitForJob(childDocumentId);
  await waitForJob(ocean);
  const duplicate = await upload(orchardId, 'copy.md', text);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.id, documentId);
  const content = (await api.get(`/api/nodes/${documentId}/content`)).body;
  assert.equal(content.text, text);
  assert.deepEqual(
    new Set(content.chunks.map((chunk: any) => chunk.kind)),
    new Set(['normal', 'child', 'parent']),
  );
  for (const chunk of content.chunks)
    assert.equal(text.slice(chunk.start_offset, chunk.end_offset), chunk.content);
  const nodes = (await api.get('/api/nodes')).body;
  childFolderId = nodes.find((node: any) => node.name === 'Growing').id;
  assert.equal(
    nodes.find((node: any) => node.id === childDocumentId).path,
    '/Orchard/Growing/seasons.txt',
  );
  assert.equal(nodes.find((node: any) => node.id === documentId).status, 'ready');
});
test('folder and subtree scopes never leak documents, across all retrieval combinations', async () => {
  for (const method of ['vector', 'hybrid'])
    for (const strategy of ['normal', 'parent-child']) {
      const direct = (
        await api
          .post('/api/search')
          .send({ ...options, method, strategy, scope: 'folder', folderId: orchardId })
          .expect(200)
      ).body;
      assert.ok(direct.matches.length > 0);
      assert.ok(direct.candidates.every((chunk: any) => chunk.document_id === documentId));
      assert.ok(direct.contextTokenCount <= options.contextTokens);
      assert.equal(
        new Set(direct.passages.map((passage: any) => passage.chunkId)).size,
        direct.passages.length,
      );
      const subtree = (
        await api
          .post('/api/search')
          .send({ ...options, method, strategy, scope: 'subtree', folderId: orchardId })
          .expect(200)
      ).body;
      assert.ok(subtree.candidates.some((chunk: any) => chunk.document_id === childDocumentId));
      assert.ok(
        subtree.candidates.every((chunk: any) =>
          [documentId, childDocumentId].includes(chunk.document_id),
        ),
      );
      if (strategy === 'parent-child')
        assert.ok(subtree.passages[0].content.length > subtree.matches[0].content.length);
    }
  const selected = (
    await api
      .post('/api/search')
      .send({ ...options, scope: 'files', fileIds: [childDocumentId] })
      .expect(200)
  ).body;
  assert.ok(selected.matches.every((chunk: any) => chunk.document_id === childDocumentId));
  await api
    .post('/api/search')
    .send({ ...options, scope: 'files', fileIds: [] })
    .expect(400);
  await api
    .post('/api/search')
    .send({ ...options, scope: 'folder', folderId: 'missing' })
    .expect(404);
});
test('reranking and comparison return traceable results and generated answers', async () => {
  const reranked = (
    await api
      .post('/api/search')
      .send({ ...options, rerank: true })
      .expect(200)
  ).body;
  assert.ok(reranked.matches.every((chunk: any) => typeof chunk.rerankerScore === 'number'));
  assert.ok(reranked.timings.reranking >= 0);
  const compared = (
    await api
      .post('/api/compare')
      .send({ ...options, generateAnswers: true })
      .expect(200)
  ).body;
  assert.equal(compared.results.length, 4);
  for (const result of compared.results) {
    assert.ok(!result.error, result.error);
    assert.ok(result.answer.includes('[1]'));
    assert.ok(result.retrieval.context.length > 0);
  }
  await api
    .put('/api/settings')
    .send({
      ...embeddingSettings,
      reranker: { ...embeddingSettings.reranker, format: 'tei', path: '/tei-rerank' },
    })
    .expect(200);
  await api
    .post('/api/search')
    .send({ ...options, rerank: true })
    .expect(200);
  await api.put('/api/settings').send(embeddingSettings).expect(200);
});
test('streamed chat saves completed exchanges and citations, and handles empty scopes', async () => {
  const response = await api.post('/api/chat').send({ options }).expect(200);
  const events = response.text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
  const sessionId = events.find((event) => event.type === 'session').payload.id;
  assert.ok(events.some((event) => event.type === 'token'));
  assert.ok(events.some((event) => event.type === 'done'));
  const messages = (await api.get(`/api/chat/sessions/${sessionId}`)).body;
  assert.equal(messages.length, 2);
  assert.ok(messages[1].retrieval.passages.length);
  const emptyFolder = (await api.post('/api/folders').send({ parentId: 'root', name: 'Empty' }))
    .body.id;
  const empty = await api
    .post('/api/chat')
    .send({ options: { ...options, scope: 'folder', folderId: emptyFolder } })
    .expect(200);
  assert.ok(empty.text.includes('insufficient evidence'));
});
test('model changes mark old indexes stale and exclude them until reindexed', async () => {
  await api
    .put('/api/settings')
    .send({
      ...embeddingSettings,
      embedding: { ...embeddingSettings.embedding, model: 'changed-model' },
    })
    .expect(200);
  assert.equal(
    (await api.get('/api/nodes')).body.find((node: any) => node.id === documentId).status,
    'stale',
  );
  const result = (await api.post('/api/search').send(options).expect(200)).body;
  assert.equal(result.matches.length, 0);
  assert.ok(result.warnings.length);
  await api
    .post('/api/jobs/index')
    .send({ documentIds: [documentId] })
    .expect(200);
  await waitForJob(documentId);
  const reindexed = (await api.post('/api/search').send(options).expect(200)).body;
  assert.ok(reindexed.matches.length > 0);
  assert.ok(reindexed.matches.every((chunk: any) => chunk.document_id === documentId));
  await api.put('/api/settings').send(embeddingSettings).expect(200);
  await api
    .post('/api/jobs/index')
    .send({ documentIds: [documentId] })
    .expect(200);
  await waitForJob(documentId);
});
test('failed and cancelled indexing retain the previous index, with retry support', async () => {
  const before = (
    await application.database.query<any>('SELECT id FROM document_chunks WHERE document_id=$1', [
      documentId,
    ])
  ).rows
    .map((row) => row.id)
    .sort();
  failEmbeddings = true;
  await api.post('/api/jobs/index').send({ documentIds: [documentId] });
  const failed = await waitForJob(documentId, 'failed');
  failEmbeddings = false;
  assert.match(failed.message, /503/);
  assert.deepEqual(
    (
      await application.database.query<any>('SELECT id FROM document_chunks WHERE document_id=$1', [
        documentId,
      ])
    ).rows
      .map((row) => row.id)
      .sort(),
    before,
  );
  delayEmbeddings = true;
  await api.post(`/api/jobs/${failed.id}/retry`).expect(200);
  const running = await waitForJob(documentId, 'running');
  await api.post(`/api/jobs/${running.id}/cancel`).expect(200);
  await waitForJob(documentId, 'cancelled');
  delayEmbeddings = false;
  assert.deepEqual(
    (
      await application.database.query<any>('SELECT id FROM document_chunks WHERE document_id=$1', [
        documentId,
      ])
    ).rows
      .map((row) => row.id)
      .sort(),
    before,
  );
  await api.post(`/api/jobs/${running.id}/retry`).expect(200);
  await waitForJob(documentId);
});
test('invalid embedding responses are rejected', async () => {
  malformedVectors = true;
  await api.post('/api/search').send(options).expect(502);
  malformedVectors = false;
});
test('move prevents cycles and updates hierarchical search; delete cascades chunks', async () => {
  await api.patch(`/api/nodes/${orchardId}`).send({ parentId: childFolderId }).expect(400);
  await api.patch(`/api/nodes/${childFolderId}`).send({ parentId: otherFolderId }).expect(200);
  const result = (
    await api
      .post('/api/search')
      .send({ ...options, scope: 'subtree', folderId: orchardId })
      .expect(200)
  ).body;
  assert.ok(result.candidates.every((chunk: any) => chunk.document_id !== childDocumentId));
  await api.patch(`/api/nodes/${documentId}`).send({ name: 'renamed.md' }).expect(200);
  assert.equal(
    (await api.get('/api/nodes')).body.find((node: any) => node.id === documentId).path,
    '/Orchard/renamed.md',
  );
  await api.delete(`/api/nodes/${otherFolderId}`).expect(200);
  assert.equal(
    (
      await application.database.query('SELECT id FROM document_chunks WHERE document_id=$1', [
        childDocumentId,
      ])
    ).rows.length,
    0,
  );
  await api.delete('/api/nodes/root').expect(400);
});
test('chunk offsets and bounded contexts handle Unicode without splitting surrogate pairs', () => {
  const text = '蘋果樹 🌳 grows apples.\n'.repeat(700);
  const chunks = createDocumentChunks(text);
  for (const chunk of chunks) {
    assert.equal(chunk.content, text.slice(chunk.start, chunk.end));
    assert.ok(!/^[\uDC00-\uDFFF]/.test(chunk.content));
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.content));
  }
  const passage = {
    chunkId: 'one',
    documentId: 'doc',
    path: '/蘋果.txt',
    content: text,
    startOffset: 0,
    endOffset: text.length,
  };
  const built = buildBudgetedContext([passage, passage], 256);
  assert.ok(countContextTokens(built.context) <= 256);
  assert.equal(built.passages.length, 1);
  assert.equal(built.passages[0].truncated, true);
  assert.equal(
    text.slice(built.passages[0].startOffset, built.passages[0].endOffset),
    built.passages[0].content,
  );
});
test('reciprocal rank fusion promotes candidates supported by both retrievers', () => {
  const chunk = (id: string) => ({
    id,
    document_id: 'd',
    parent_chunk_id: null,
    kind: 'normal',
    content: id,
    start_offset: 0,
    end_offset: 1,
    path: '/d',
  });
  const fused = combineRankedCandidates([chunk('a'), chunk('b')], [chunk('b'), chunk('c')], 3);
  assert.equal(fused[0].id, 'b');
});

test('the library, settings, and completed conversations survive a database restart', async () => {
  const before = (await api.get('/api/nodes')).body;
  const sessionsBefore = (await api.get('/api/chat/sessions')).body;
  await application.close();
  application = await createBackendApplication({ dataDirectory: directory });
  api = request(application.app);
  assert.deepEqual((await api.get('/api/nodes')).body, before);
  assert.equal((await api.get('/api/settings')).body.embedding.hasApiKey, true);
  assert.deepEqual((await api.get('/api/chat/sessions')).body, sessionsBefore);
  const result = (await api.post('/api/search').send(options).expect(200)).body;
  assert.ok(result.matches.length > 0);
});
