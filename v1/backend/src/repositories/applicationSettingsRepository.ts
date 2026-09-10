import { createHash } from 'node:crypto';
import type { ApplicationDatabase } from '../database/openApplicationDatabase.js';
import type { ApplicationSettings } from '../types/applicationTypes.js';
const emptyEndpoint = { baseUrl: '', apiKey: '', model: '', timeoutMs: 60000 };
export const defaultApplicationSettings: ApplicationSettings = {
  embedding: { ...emptyEndpoint },
  reranker: { ...emptyEndpoint, format: 'cohere', path: '/rerank' },
  llm: { ...emptyEndpoint },
};
export function embeddingFingerprint(settings: ApplicationSettings) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        settings.embedding.baseUrl.replace(/\/+$/, ''),
        settings.embedding.model,
        settings.embedding.dimensions ?? null,
      ]),
    )
    .digest('hex');
}
export function createApplicationSettingsRepository(database: ApplicationDatabase) {
  return {
    async readSettings(): Promise<ApplicationSettings> {
      const result = await database.query<{ value: ApplicationSettings }>(
        'SELECT value FROM application_settings WHERE id=1',
      );
      return result.rows[0]?.value ?? structuredClone(defaultApplicationSettings);
    },
    async saveSettings(value: ApplicationSettings) {
      await database.query(
        'INSERT INTO application_settings(id,value) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET value=$1',
        [JSON.stringify(value)],
      );
    },
  };
}
export function redactSettings(settings: ApplicationSettings) {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      { ...value, apiKey: '', hasApiKey: Boolean(value.apiKey) },
    ]),
  );
}
export type ApplicationSettingsRepository = ReturnType<typeof createApplicationSettingsRepository>;
