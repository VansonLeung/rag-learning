import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createBackendApplication } from '../src/createBackendApplication.js';
import { evaluateGraph, sampleGraph } from '../../frontend/src/features/learning/graphMath.js';
import { createGraphExercise } from '../src/services/learning/createGraphExercise.js';

let directory: string;
let application: Awaited<ReturnType<typeof createBackendApplication>>;
let api: ReturnType<typeof request>;
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'grove-learning-'));
  application = await createBackendApplication({ dataDirectory: directory });
  api = request(application.app);
});
after(async () => {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
});

test('graph evaluation preserves domains and never joins reciprocal branches', () => {
  const reciprocal = {
    kind: 'reciprocal' as const,
    a: 2,
    h: 1,
    k: -1,
    domain: { excluded: [1] },
    viewport: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
  };
  assert.equal(evaluateGraph(reciprocal, 1), null);
  assert.equal(evaluateGraph(reciprocal, 0), -3);
  assert.equal(evaluateGraph(reciprocal, 3), 0);
  const segments = sampleGraph(reciprocal);
  assert.equal(segments.length, 2);
  assert.ok(segments[0].every((point) => point.x < 1));
  assert.ok(segments[1].every((point) => point.x > 1));
  assert.ok(segments.flat().every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const quadratic = { ...reciprocal, kind: 'quadratic' as const, a: -2, domain: { excluded: [] } };
  assert.equal(evaluateGraph(quadratic, 1), -1);
  assert.equal(evaluateGraph(quadratic, -1), -9);
  assert.equal(evaluateGraph(quadratic, 3), -9);
});

test('generated sets have distinct function families and finite sampled curves', () => {
  for (let i = 0; i < 50; i++) {
    const { exercise, answerKey } = createGraphExercise();
    assert.equal(new Set(exercise.graphs.map((graph) => graph.spec.kind)).size, 4);
    assert.equal(new Set(exercise.choices.map((choice) => choice.label)).size, 4);
    assert.equal(new Set(Object.values(answerKey).map((key) => key.choiceId)).size, 4);
    for (const graph of exercise.graphs) {
      assert.ok(exercise.choices.some((choice) => choice.id === answerKey[graph.id].choiceId));
      assert.ok(
        sampleGraph(graph.spec)
          .flat()
          .every((point) => Number.isFinite(point.y)),
      );
    }
  }
});

test('learning API saves drafts, checks attempts, isolates workspaces, and survives restart', async () => {
  const catalog = (await api.get('/api/learning/catalog').expect(200)).body;
  assert.equal(catalog.resources.length, 4);
  assert.ok(
    catalog.resources.every(
      (resource: any) =>
        resource.type === 'linked_resource' &&
        resource.reuse === 'reference_only' &&
        !resource.content,
    ),
  );
  const created = (await api.post('/api/learning/sessions').send({}).expect(201)).body;
  assert.equal(created.exercise.graphs.length, 4);
  assert.equal(created.feedback, null);
  assert.equal(created.answer_key, undefined);
  assert.ok(!JSON.stringify(created).includes('choiceId'));
  const url = `/api/learning/sessions/${created.id}`;
  const firstGraph = created.exercise.graphs[0].id;
  const firstChoice = created.exercise.choices[0].id;
  const draft = (
    await api
      .put(`${url}/draft`)
      .send({ version: 0, responses: { [firstGraph]: firstChoice } })
      .expect(200)
  ).body;
  assert.equal(draft.version, 1);
  assert.deepEqual((await api.get(url).expect(200)).body.responses, { [firstGraph]: firstChoice });
  await api.put(`${url}/draft`).send({ version: 0, responses: {} }).expect(409);
  await api
    .put(`${url}/submit`)
    .send({ version: 1, responses: { [firstGraph]: firstChoice } })
    .expect(400);
  await api
    .put(`${url}/draft`)
    .send({ version: 1, responses: { unknown: firstChoice } })
    .expect(400);
  await api
    .put(`${url}/draft`)
    .send({ version: 1, responses: { [firstGraph]: 'unknown' } })
    .expect(400);
  await api
    .put(`${url}/draft`)
    .send({
      version: 1,
      responses: { [firstGraph]: firstChoice, [created.exercise.graphs[1].id]: firstChoice },
    })
    .expect(400);
  await api.put(`${url}/draft`).send({ version: 1, responses: {}, score: 4 }).expect(400);

  // Read the private key only in the test fixture; public API responses exclude it.
  const { rows } = await application.database.query<{
    answer_key: Record<string, { choiceId: string }>;
  }>('SELECT answer_key FROM learning_sessions WHERE id=$1', [created.id]);
  const responses = Object.fromEntries(
    Object.entries(rows[0].answer_key).map(([id, key]) => [id, key.choiceId]),
  );
  const ids = Object.keys(responses);
  [responses[ids[0]], responses[ids[1]]] = [responses[ids[1]], responses[ids[0]]];
  const checked = (await api.put(`${url}/submit`).send({ version: 1, responses }).expect(200)).body;
  assert.equal(checked.feedback.score, 2);
  assert.equal(checked.feedback.total, 4);
  assert.ok(checked.submitted_at);
  assert.equal(checked.answer_key, undefined);
  await api.put(`${url}/draft`).send({ version: 2, responses: {} }).expect(409);
  await api.put(`${url}/submit`).send({ version: 2, responses }).expect(409);
  assert.equal((await api.get('/api/learning/sessions').expect(200)).body[0].score, 2);
  assert.deepEqual(
    (await api.post('/api/search').send({ query: 'graph answers' }).expect(200)).body.passages,
    [],
  );

  const other = (await api.post('/api/workspaces').send({ name: 'Other learner' }).expect(201))
    .body;
  assert.deepEqual(
    (await api.get(`/api/workspaces/${other.id}/learning/sessions`).expect(200)).body,
    [],
  );
  await api.get(`/api/workspaces/${other.id}/learning/sessions/${created.id}`).expect(404);
  await application.close();
  application = await createBackendApplication({ dataDirectory: directory });
  api = request(application.app);
  const restored = (await api.get(url).expect(200)).body;
  assert.deepEqual(restored.exercise, created.exercise);
  assert.deepEqual(restored.responses, responses);
  assert.equal(restored.feedback.score, 2);
});
