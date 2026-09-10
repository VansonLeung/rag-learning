import express from 'express';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { openApplicationDatabase } from './database/openApplicationDatabase.js';
import { createApplicationEventBus } from './events/applicationEventBus.js';
import { createApplicationSettingsRepository } from './repositories/applicationSettingsRepository.js';
import { createExplorerNodeRepository } from './repositories/explorerNodeRepository.js';
import { createDocumentUploadService } from './services/ingestion/documentUploadService.js';
import { createDocumentIndexingJobService } from './services/ingestion/documentIndexingJobService.js';
import { createDocumentRetrievalService } from './services/retrieval/documentRetrievalService.js';
import { createGroundedAnswerService } from './services/retrieval/groundedAnswerService.js';
import { createApplicationRouter } from './routes/createApplicationRouter.js';
import { ApplicationError } from './config/requestValidation.js';
export async function createBackendApplication(options: {
  dataDirectory: string;
  frontendDirectory?: string;
}) {
  await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
  const uploadsDirectory = path.join(options.dataDirectory, 'uploads');
  await mkdir(uploadsDirectory, { recursive: true, mode: 0o700 });
  const database = await openApplicationDatabase(path.join(options.dataDirectory, 'postgres'));
  const events = createApplicationEventBus();
  const settings = createApplicationSettingsRepository(database);
  const nodes = createExplorerNodeRepository(database);
  const upload = createDocumentUploadService(database, nodes, uploadsDirectory);
  const jobs = createDocumentIndexingJobService(database, settings, events, uploadsDirectory);
  const retrieve = createDocumentRetrievalService(database, settings, nodes);
  const answer = createGroundedAnswerService(settings);
  const app = express();
  app.disable('x-powered-by');
  // Local single-user service: reject browser requests from other origins, including simple multipart POSTs.
  app.use('/api', (request, response, next) => {
    const origin = request.get('origin');
    if (origin) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          ['127.0.0.1', 'localhost'].includes(url.hostname) &&
          [String(process.env.PORT || 3001), '5173'].includes(url.port) &&
          url.protocol === 'http:';
      } catch {}
      if (!allowed) {
        response
          .status(403)
          .json({ error: 'This local app only accepts requests from its own origin' });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(
    '/api',
    createApplicationRouter({
      database,
      nodes,
      settings,
      events,
      jobs,
      uploadsDirectory,
      upload,
      retrieve,
      answer,
    }),
  );
  app.use('/api', (_request, response) =>
    response.status(404).json({ error: 'API route not found' }),
  );
  if (options.frontendDirectory) {
    app.use(express.static(options.frontendDirectory));
    app.get('/{*path}', (_request, response) =>
      response.sendFile(path.join(options.frontendDirectory!, 'index.html')),
    );
  }
  app.use(
    (
      error: any,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof ZodError) {
        response.status(400).json({
          error: error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        });
        return;
      }
      const conflict = error.code === '23505';
      const status =
        error instanceof ApplicationError
          ? error.status
          : conflict
            ? 409
            : error.code === 'LIMIT_FILE_SIZE'
              ? 413
              : error instanceof SyntaxError
                ? 400
                : 500;
      response.status(status).json({
        error: conflict
          ? 'A file or folder already uses this name'
          : status === 500
            ? 'The operation failed. Check the server log.'
            : error.message,
      });
      if (status === 500) console.error(error instanceof Error ? error.message : 'Internal error');
    },
  );
  await jobs.start();
  return {
    app,
    database,
    jobs,
    async close() {
      await jobs.stop();
      await database.close();
    },
  };
}
