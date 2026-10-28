import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import { z } from 'zod';
import type { RouterDependencies } from './applicationRouterDependencies.js';
import { ApplicationError } from '../config/requestValidation.js';
import { learningCatalog } from '../services/learning/learningCatalog.js';
import {
  createGraphExercise,
  type GraphExercise,
  type GraphAnswerKey,
} from '../services/learning/createGraphExercise.js';

interface SessionRow {
  id: string;
  exercise: GraphExercise;
  answer_key: GraphAnswerKey;
  responses: Record<string, string>;
  feedback: {
    score: number;
    total: number;
    parts: Record<string, { correct: boolean; choiceId: string; explanation: string }>;
  } | null;
  version: number;
  created_at: string;
  submitted_at: string | null;
}
const responseSchema = z
  .object({
    version: z.number().int().nonnegative(),
    responses: z
      .record(z.string().max(80), z.string().max(80))
      .refine((value) => Object.keys(value).length <= 4, 'At most four responses are allowed'),
  })
  .strict();
function publicSession(row: SessionRow) {
  const { answer_key, ...session } = row;
  return session;
}

export function registerLearningRoutes(router: Router, { database }: RouterDependencies) {
  router.get('/learning/catalog', (_request, response) => response.json(learningCatalog));
  router.get('/learning/sessions', async (_request, response) => {
    const result = await database.query(
      "SELECT id,created_at,submitted_at,feedback->'score' AS score FROM learning_sessions ORDER BY created_at DESC,id DESC LIMIT 50",
    );
    response.json(result.rows);
  });
  router.post('/learning/sessions', async (_request, response) => {
    const { exercise, answerKey } = createGraphExercise();
    const result = await database.query<SessionRow>(
      'INSERT INTO learning_sessions(id,exercise,answer_key) VALUES($1,$2,$3) RETURNING *',
      [randomUUID(), JSON.stringify(exercise), JSON.stringify(answerKey)],
    );
    response.status(201).json(publicSession(result.rows[0]));
  });
  router.get('/learning/sessions/:id', async (request, response) => {
    const result = await database.query<SessionRow>('SELECT * FROM learning_sessions WHERE id=$1', [
      request.params.id,
    ]);
    if (!result.rows[0]) throw new ApplicationError('Exercise not found', 404);
    response.json(publicSession(result.rows[0]));
  });
  for (const action of ['draft', 'submit'] as const) {
    router.put(`/learning/sessions/:id/${action}`, async (request, response) => {
      const input = responseSchema.parse(request.body);
      const saved = await database.transaction(async (transaction) => {
        const { rows } = await transaction.query<SessionRow>(
          'SELECT * FROM learning_sessions WHERE id=$1 FOR UPDATE',
          [request.params.id],
        );
        const session = rows[0];
        if (!session) throw new ApplicationError('Exercise not found', 404);
        if (session.submitted_at)
          throw new ApplicationError(
            'This attempt has already been checked. Start a new set to practise again.',
            409,
          );
        if (session.version !== input.version)
          throw new ApplicationError(
            'This exercise changed in another window. Reopen it to load the latest answers.',
            409,
          );
        const graphIds = session.exercise.graphs.map((graph) => graph.id);
        const choiceIds: string[] = session.exercise.choices.map((choice) => choice.id);
        if (
          Object.entries(input.responses).some(
            ([id, value]) => !graphIds.includes(id) || !choiceIds.includes(value),
          )
        )
          throw new ApplicationError('Unknown graph or equation');
        if (new Set(Object.values(input.responses)).size !== Object.keys(input.responses).length)
          throw new ApplicationError('Use each equation once');
        if (action === 'submit' && graphIds.some((id) => !input.responses[id]))
          throw new ApplicationError('Choose an equation for every graph');
        let feedback: SessionRow['feedback'] = null;
        if (action === 'submit') {
          const parts = Object.fromEntries(
            graphIds.map((id) => [
              id,
              {
                ...session.answer_key[id],
                correct: input.responses[id] === session.answer_key[id].choiceId,
              },
            ]),
          );
          feedback = {
            score: Object.values(parts).filter((part) => part.correct).length,
            total: graphIds.length,
            parts,
          };
        }
        const updated = await transaction.query<SessionRow>(
          'UPDATE learning_sessions SET responses=$2,feedback=$3,submitted_at=CASE WHEN $4 THEN now() ELSE NULL END,version=version+1 WHERE id=$1 RETURNING *',
          [
            session.id,
            JSON.stringify(input.responses),
            feedback ? JSON.stringify(feedback) : null,
            action === 'submit',
          ],
        );
        return publicSession(updated.rows[0]);
      });
      response.json(saved);
    });
  }
}
