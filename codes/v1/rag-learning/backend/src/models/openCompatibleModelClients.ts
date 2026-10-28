import type { ApplicationSettings, ModelEndpointSettings } from '../types/applicationTypes.js';
import { ApplicationError } from '../config/requestValidation.js';
export function buildModelEndpointUrl(baseUrl: string, endpoint: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}
function validateEndpoint(settings: ModelEndpointSettings) {
  if (!settings.baseUrl || !settings.model)
    throw new ApplicationError('Configure the model base URL and model name in Settings first');
}
export async function requestModelEndpoint(
  settings: ModelEndpointSettings,
  endpoint: string,
  body: unknown,
  signal?: AbortSignal,
) {
  validateEndpoint(settings);
  const response = await fetch(buildModelEndpointUrl(settings.baseUrl, endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([AbortSignal.timeout(settings.timeoutMs), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) {
    // Provider bodies can echo credentials or submitted documents. Keep errors bounded and private.
    await response.body?.cancel();
    throw new ApplicationError(
      `Model endpoint returned HTTP ${response.status}. Check its URL, credentials, and model name.`,
      502,
    );
  }
  return response;
}
export async function createTextEmbeddings(
  settings: ApplicationSettings['embedding'],
  texts: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  const response = await requestModelEndpoint(
    settings,
    'embeddings',
    {
      model: settings.model,
      input: texts,
      ...(settings.dimensions ? { dimensions: settings.dimensions } : {}),
    },
    signal,
  );
  const data = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
  if (!Array.isArray(data.data) || data.data.length !== texts.length)
    throw new ApplicationError('Embedding endpoint returned the wrong number of vectors', 502);
  const rows = [...data.data].sort((a, b) => a.index - b.index);
  const dimensions = rows[0]?.embedding?.length;
  if (
    !dimensions ||
    (settings.dimensions && dimensions !== settings.dimensions) ||
    rows.some(
      (row, index) =>
        row.index !== index ||
        !Array.isArray(row.embedding) ||
        row.embedding.length !== dimensions ||
        row.embedding.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
        !row.embedding.some((n) => n !== 0),
    )
  ) {
    throw new ApplicationError(
      'Embedding response must contain ordered, finite, nonzero vectors with consistent dimensions',
      502,
    );
  }
  return rows.map((row) => row.embedding);
}
export async function rerankTextPassages(
  settings: ApplicationSettings['reranker'],
  query: string,
  texts: string[],
  signal?: AbortSignal,
) {
  const body =
    settings.format === 'tei'
      ? { query, texts, raw_scores: false, return_text: false }
      : { model: settings.model, query, documents: texts, top_n: texts.length };
  const response = await requestModelEndpoint(settings, settings.path, body, signal);
  const data = (await response.json()) as any;
  const rows = settings.format === 'tei' ? data : data.results;
  if (!Array.isArray(rows) || rows.length !== texts.length)
    throw new ApplicationError('Reranker must return a score for each candidate', 502);
  const mapped = rows.map((row) => ({
    index: row.index as number,
    score: (settings.format === 'tei' ? row.score : row.relevance_score) as number,
  }));
  if (
    new Set(mapped.map((row) => row.index)).size !== texts.length ||
    mapped.some(
      (row) =>
        !Number.isInteger(row.index) ||
        row.index < 0 ||
        row.index >= texts.length ||
        !Number.isFinite(row.score),
    )
  )
    throw new ApplicationError('Reranker returned invalid indexes or scores', 502);
  return mapped.sort((a, b) => b.score - a.score);
}
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export async function streamLanguageModelAnswer(
  settings: ModelEndpointSettings,
  messages: ModelMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
) {
  const response = await requestModelEndpoint(
    settings,
    'chat/completions',
    { model: settings.model, messages, stream: true },
    signal,
  );
  if (!response.body) throw new ApplicationError('The LLM returned an empty stream', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let completed = false;
  function consumeEvent(event: string) {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data === '[DONE]') {
      completed = true;
      return;
    }
    const parsed = JSON.parse(data);
    if (parsed.error) throw new ApplicationError('The LLM reported a streaming error', 502);
    const token = parsed.choices?.[0]?.delta?.content;
    if (typeof token === 'string') {
      answer += token;
      onToken(token);
    }
    if (parsed.choices?.[0]?.finish_reason) completed = true;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        consumeEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeEvent(buffer);
    if (!completed || !answer.trim())
      throw new ApplicationError('The LLM stream ended without a complete answer', 502);
    return answer;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
