import express from 'express';
import path from 'node:path';
import { z, ZodError } from 'zod';
import { ApplicationError, nodeNameSchema } from './config/requestValidation.js';
import { createWorkspaceRegistryService } from './services/workspaces/workspaceRegistryService.js';
import {
  transferExplorerNodes,
  TransferConflictError,
} from './services/explorer/transferExplorerNodes.js';
export async function createBackendApplication(options: {
  dataDirectory: string;
  frontendDirectory?: string;
  desktopToken?: string;
}) {
  const workspaces = await createWorkspaceRegistryService(options.dataDirectory);
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (request, response, next) => {
    if (options.desktopToken && request.get('x-grove-desktop-token') !== options.desktopToken) {
      response.status(401).json({ error: 'Desktop session required' });
      return;
    }
    const origin = request.get('origin');
    if (origin) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname) &&
          (url.host === request.get('host') || url.port === '5173');
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
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/workspaces', (_request, response) => response.json(workspaces.listWorkspaces()));
  app.post('/api/workspaces', async (request, response) => {
    const { name } = z.object({ name: nodeNameSchema }).parse(request.body);
    response.status(201).json(await workspaces.createWorkspace(name));
  });
  app.patch('/api/workspaces/:id', async (request, response) => {
    const { name } = z.object({ name: nodeNameSchema }).parse(request.body);
    response.json(await workspaces.renameWorkspace(String(request.params.id), name));
  });
  app.delete('/api/workspaces/:id', async (request, response) => {
    await workspaces.deleteWorkspace(String(request.params.id));
    response.json({ ok: true });
  });
  app.post('/api/transfers', async (request, response) => {
    const body = z
      .object({
        sourceWorkspaceId: z.string(),
        targetWorkspaceId: z.string(),
        nodeIds: z.array(z.string()).min(1).max(1000),
        destinationFolderId: z.string(),
        operation: z.enum(['copy', 'move']),
        conflict: z.enum(['ask', 'keep-both', 'skip', 'replace']).default('ask'),
      })
      .parse(request.body);
    const source = await workspaces.getWorkspace(body.sourceWorkspaceId);
    source.activeRequests++;
    try {
      const target = await workspaces.getWorkspace(body.targetWorkspaceId);
      target.activeRequests++;
      try {
        response.json(await transferExplorerNodes(source, target, body));
      } finally {
        target.activeRequests--;
      }
    } finally {
      source.activeRequests--;
    }
  });
  app.use('/api/workspaces/:workspaceId', async (request, response, next) => {
    try {
      const runtime = await workspaces.getWorkspace(String(request.params.workspaceId));
      if (request.path !== '/events') {
        runtime.activeRequests++;
        let released = false;
        const release = () => {
          if (!released) {
            runtime.activeRequests--;
            released = true;
          }
        };
        response.once('finish', release);
        response.once('close', release);
      }
      runtime.router(request, response, next);
    } catch (error) {
      next(error);
    }
  });
  // Existing API clients continue to address the original Personal library explicitly.
  app.use('/api', async (request, response, next) => {
    try {
      const runtime = await workspaces.getWorkspace('personal');
      runtime.router(request, response, next);
    } catch (error) {
      next(error);
    }
  });
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
      if (error instanceof TransferConflictError) {
        response.status(409).json({ error: error.message, conflicts: error.names });
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
  const initial = await workspaces.getWorkspace(
    workspaces.listWorkspaces().find((workspace) => workspace.id === 'personal')?.id ??
      workspaces.listWorkspaces()[0].id,
  );
  return {
    app,
    database: initial.database,
    jobs: initial.jobs,
    workspaces,
    close: () => workspaces.close(),
  };
}
