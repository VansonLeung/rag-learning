import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ApplicationDatabase } from '../database/openApplicationDatabase.js';
import type { DocumentRetrievalService } from '../services/retrieval/documentRetrievalService.js';
import type { createGroundedAnswerService } from '../services/retrieval/groundedAnswerService.js';
import { ApplicationError, retrievalSchema } from '../config/requestValidation.js';
import type { ModelMessage } from '../models/openCompatibleModelClients.js';
export function createChatController(
  database: ApplicationDatabase,
  retrieve: DocumentRetrievalService,
  answer: ReturnType<typeof createGroundedAnswerService>,
) {
  const activeSessions = new Set<string>();
  return async function streamChatResponse(request: Request, response: Response) {
    const body = z
      .object({ sessionId: z.string().optional(), options: retrievalSchema })
      .parse(request.body);
    let sessionId = body.sessionId;
    if (sessionId) {
      if (
        !(await database.query('SELECT id FROM chat_sessions WHERE id=$1', [sessionId])).rows.length
      )
        throw new ApplicationError('Conversation not found', 404);
      if (activeSessions.has(sessionId))
        throw new ApplicationError('This conversation already has a response in progress', 409);
    } else {
      sessionId = randomUUID();
      await database.query('INSERT INTO chat_sessions(id,title) VALUES($1,$2)', [
        sessionId,
        body.options.query.slice(0, 80),
      ]);
    }
    activeSessions.add(sessionId);
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const send = (type: string, payload: unknown) => {
      if (!response.destroyed) response.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
    };
    try {
      send('session', { id: sessionId });
      const history = (
        await database.query<ModelMessage>(
          'SELECT role,content FROM (SELECT role,content,created_at FROM chat_messages WHERE session_id=$1 ORDER BY created_at DESC LIMIT 10) recent ORDER BY created_at',
          [sessionId],
        )
      ).rows;
      const retrieval = await retrieve(body.options, controller.signal);
      send('retrieval', retrieval);
      const content = await answer(
        retrieval,
        history,
        (token) => send('token', token),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      await database.transaction(async (transaction) => {
        await transaction.query(
          "INSERT INTO chat_messages(id,session_id,role,content) VALUES($1,$2,'user',$3)",
          [randomUUID(), sessionId, body.options.query],
        );
        await transaction.query(
          "INSERT INTO chat_messages(id,session_id,role,content,retrieval) VALUES($1,$2,'assistant',$3,$4)",
          [randomUUID(), sessionId, content, JSON.stringify(retrieval)],
        );
      });
      send('done', { content });
    } catch (error) {
      if (!controller.signal.aborted)
        send('error', { message: error instanceof Error ? error.message : 'Answer failed' });
    } finally {
      activeSessions.delete(sessionId);
      response.end();
    }
  };
}
