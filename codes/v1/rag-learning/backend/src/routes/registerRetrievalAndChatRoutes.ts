import type { Router } from 'express';
import type { RouterDependencies } from './applicationRouterDependencies.js';
import { z } from 'zod';
import { retrievalSchema } from '../config/requestValidation.js';
import { createChatController } from '../controllers/createChatController.js';
export function registerRetrievalAndChatRoutes(router: Router, dependencies: RouterDependencies) {
  const { database, retrieve, answer } = dependencies;
  router.post('/search', async (request, response) =>
    response.json(await retrieve(retrievalSchema.parse(request.body))),
  );
  router.post('/compare', async (request, response) => {
    const options = retrievalSchema.parse(request.body);
    const generateAnswers = z.boolean().parse(request.body.generateAnswers ?? false);
    const results = [];
    for (const method of ['vector', 'hybrid'] as const)
      for (const strategy of ['normal', 'parent-child'] as const) {
        const variant = { ...options, method, strategy };
        try {
          const retrieval = await retrieve(variant);
          const start = performance.now();
          const content = generateAnswers ? await answer(retrieval, [], () => {}) : undefined;
          results.push({
            method,
            strategy,
            retrieval,
            answer: content,
            answerDurationMs: generateAnswers ? performance.now() - start : undefined,
          });
        } catch (error) {
          results.push({
            method,
            strategy,
            error: error instanceof Error ? error.message : 'Comparison failed',
          });
        }
      }
    response.json({ results });
  });
  router.get('/chat/sessions', async (_request, response) =>
    response.json(
      (await database.query('SELECT * FROM chat_sessions ORDER BY created_at DESC')).rows,
    ),
  );
  router.get('/chat/sessions/:id', async (request, response) =>
    response.json(
      (
        await database.query(
          'SELECT * FROM chat_messages WHERE session_id=$1 ORDER BY created_at',
          [request.params.id],
        )
      ).rows,
    ),
  );
  router.post('/chat', createChatController(database, retrieve, answer));
}
