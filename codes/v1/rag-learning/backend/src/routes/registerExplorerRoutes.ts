import type { Router } from 'express';
import type { RouterDependencies } from './applicationRouterDependencies.js';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { embeddingFingerprint } from '../repositories/applicationSettingsRepository.js';
import { ApplicationError, nodeNameSchema } from '../config/requestValidation.js';
export function registerExplorerRoutes(router: Router, dependencies: RouterDependencies) {
  const { database, nodes, settings, events, jobs, uploadsDirectory, upload } = dependencies;
  router.get('/nodes', async (_request, response) => {
    const fingerprint = embeddingFingerprint(await settings.readSettings());
    response.json(
      (await nodes.listNodes()).map((node) => ({
        ...node,
        status:
          node.kind === 'folder'
            ? undefined
            : !node.index_fingerprint
              ? 'unindexed'
              : node.index_fingerprint === fingerprint
                ? 'ready'
                : 'stale',
      })),
    );
  });
  router.post('/folders', async (request, response) => {
    const body = z.object({ parentId: z.string(), name: nodeNameSchema }).parse(request.body);
    const node = await nodes.createFolder(body.parentId, body.name);
    events.publishChange('library');
    response.status(201).json(node);
  });
  router.patch('/nodes/:id', async (request, response) => {
    const body = z
      .object({ name: nodeNameSchema.optional(), parentId: z.string().optional() })
      .parse(request.body);
    response.json(await nodes.updateNode(String(request.params.id), body));
    events.publishChange('library');
  });
  router.delete('/nodes/:id', async (request, response) => {
    const ids = await nodes.deleteNode(String(request.params.id));
    await Promise.all(ids.map((id) => rm(path.join(uploadsDirectory, id), { force: true })));
    events.publishChange('library');
    events.publishChange('jobs');
    response.json({ deleted: ids.length });
  });
  router.get('/nodes/:id/content', async (request, response) => {
    const node = await nodes.getNode(String(request.params.id));
    const chunks = (
      await database.query(
        'SELECT id,kind,parent_chunk_id,start_offset,end_offset,content FROM document_chunks WHERE document_id=$1 ORDER BY start_offset,kind',
        [node.id],
      )
    ).rows;
    response.json({ node, text: node.extracted_text ?? '', chunks });
  });
  router.get('/nodes/:id/download', async (request, response) => {
    const node = await nodes.getNode(String(request.params.id));
    if (node.kind !== 'file') throw new ApplicationError('Select a file');
    response.download(path.join(uploadsDirectory, node.id), node.name);
  });
  const multipart = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 100, fields: 3 },
  });
  router.post('/upload', multipart.array('files', 100), async (request, response) => {
    const parentId = z.string().parse(request.body.parentId ?? 'root');
    await nodes.requireFolder(parentId);
    const files = request.files as Express.Multer.File[];
    if (!files?.length) throw new ApplicationError('Choose files to upload');
    const paths = z.array(z.string()).parse(JSON.parse(request.body.paths ?? '[]'));
    if (paths.length !== files.length)
      throw new ApplicationError('Upload paths must match the file count');
    const results = [];
    for (let index = 0; index < files.length; index++) {
      try {
        const result = await upload(parentId, paths[index], files[index]);
        if (!result.duplicate) await jobs.enqueueDocument(result.id);
        results.push(result);
      } catch (error) {
        results.push({
          name: paths[index],
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }
    events.publishChange('library');
    response.json({ results });
  });
}
