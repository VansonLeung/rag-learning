import type { Router } from 'express';
import type { RouterDependencies } from './applicationRouterDependencies.js';
import { z } from 'zod';
import {
  embeddingFingerprint,
  redactSettings,
} from '../repositories/applicationSettingsRepository.js';
import { settingsSchema } from '../config/requestValidation.js';
import {
  createTextEmbeddings,
  rerankTextPassages,
  streamLanguageModelAnswer,
} from '../models/openCompatibleModelClients.js';
export function registerModelSettingsRoutes(router: Router, dependencies: RouterDependencies) {
  const { settings, events } = dependencies;
  router.get('/settings', async (_request, response) =>
    response.json(redactSettings(await settings.readSettings())),
  );
  router.put('/settings', async (request, response) => {
    const parsed = settingsSchema.parse(request.body);
    const previous = await settings.readSettings();
    for (const role of ['embedding', 'reranker', 'llm'] as const) {
      if (!parsed[role].apiKey && request.body[role]?.hasApiKey && !request.body[role]?.clearApiKey)
        parsed[role].apiKey = previous[role].apiKey;
    }
    await settings.saveSettings(parsed);
    events.publishChange('settings');
    events.publishChange('library');
    response.json({
      settings: redactSettings(parsed),
      requiresReindex: embeddingFingerprint(previous) !== embeddingFingerprint(parsed),
    });
  });
  router.post('/settings/test/:role', async (request, response) => {
    const role = z.enum(['embedding', 'reranker', 'llm']).parse(request.params.role);
    const config = await settings.readSettings();
    const start = performance.now();
    let details = '';
    if (role === 'embedding') {
      const vectors = await createTextEmbeddings(config.embedding, ['Connection test']);
      details = `${vectors[0].length} dimensions`;
    } else if (role === 'reranker') {
      await rerankTextPassages(config.reranker, 'test', [
        'A test document',
        'An unrelated passage',
      ]);
      details = 'Ranking response validated';
    } else {
      await streamLanguageModelAnswer(
        config.llm,
        [{ role: 'user', content: 'Reply with OK.' }],
        () => {},
      );
      details = 'Streaming response validated';
    }
    response.json({ ok: true, details, durationMs: Math.round(performance.now() - start) });
  });
}
