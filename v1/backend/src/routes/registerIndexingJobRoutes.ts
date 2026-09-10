import type { Router } from 'express';
import type { RouterDependencies } from './applicationRouterDependencies.js';
import { z } from 'zod';
import { ApplicationError } from '../config/requestValidation.js';
export function registerIndexingJobRoutes(router: Router, dependencies: RouterDependencies) {
  const { database, jobs } = dependencies;
  router.get('/jobs', async (_request, response) => response.json(await jobs.listJobs()));
  router.post('/jobs/index', async (request, response) => {
    const body = z
      .object({ documentIds: z.array(z.string()).min(1).max(10000) })
      .parse(request.body);
    for (const id of body.documentIds) await jobs.enqueueDocument(id);
    response.json({ queued: body.documentIds.length });
  });
  router.post('/jobs/:id/cancel', async (request, response) => {
    await jobs.cancelJob(String(request.params.id));
    response.json({ ok: true });
  });
  router.post('/jobs/:id/retry', async (request, response) => {
    const job = (
      await database.query<{ document_id: string }>(
        'SELECT document_id FROM indexing_jobs WHERE id=$1',
        [request.params.id],
      )
    ).rows[0];
    if (!job) throw new ApplicationError('Job not found', 404);
    await jobs.enqueueDocument(job.document_id);
    response.json({ ok: true });
  });
}
