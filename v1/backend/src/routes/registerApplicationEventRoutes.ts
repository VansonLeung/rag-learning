import type { Router } from 'express';
import type { RouterDependencies } from './applicationRouterDependencies.js';
export function registerApplicationEventRoutes(router: Router, dependencies: RouterDependencies) {
  const { events } = dependencies;
  router.get('/health', (_request, response) => response.json({ status: 'ok' }));
  router.get('/events', (request, response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.flushHeaders();
    response.write('data: {"type":"connected"}\n\n');
    const unsubscribe = events.subscribeToChanges((event) => {
      if (response.destroyed || response.writableEnded) return;
      response.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'workspace-closed') {
        unsubscribe();
        response.end();
      }
    });
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20000);
    request.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
