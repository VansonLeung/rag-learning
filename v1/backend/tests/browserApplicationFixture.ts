import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackendApplication } from '../src/createBackendApplication.js';
const model = express();
model.use(express.json());
model.post('/v1/embeddings', (request, response) =>
  response.json({
    data: request.body.input.map((text: string, index: number) => ({
      index,
      embedding: [
        1 + (text.match(/apple|orchard/gi)?.length ?? 0),
        1 + (text.match(/ocean/gi)?.length ?? 0),
        1,
      ],
    })),
  }),
);
model.post('/v1/rerank', (request, response) =>
  response.json({
    results: request.body.documents.map((_: string, index: number) => ({
      index,
      relevance_score: 1 / (index + 1),
    })),
  }),
);
model.post('/v1/chat/completions', (_request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Apple trees need water, soil, and sunlight. [1]' } }] })}\n\n`,
  );
  response.end('data: [DONE]\n\n');
});
const modelServer = model.listen(3002, '127.0.0.1');
const directory = await mkdtemp(path.join(os.tmpdir(), 'grove-browser-'));
const application = await createBackendApplication({
  dataDirectory: directory,
  frontendDirectory: path.resolve('v1/frontend/dist'),
});
const server = application.app.listen(3001, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, async () => {
    server.closeAllConnections();
    server.close();
    modelServer.closeAllConnections();
    modelServer.close();
    await application.close();
    await rm(directory, { recursive: true, force: true });
    process.exit(0);
  });
