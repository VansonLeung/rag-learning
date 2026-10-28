import { z } from 'zod';
export class ApplicationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const endpoint = z.object({
  baseUrl: z
    .string()
    .trim()
    .refine((value) => !value || /^https?:\/\//.test(value), 'Use an http(s) base URL'),
  apiKey: z.string().default(''),
  model: z.string().trim(),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
});
export const settingsSchema = z.object({
  embedding: endpoint.extend({
    dimensions: z.preprocess(
      (value) => (value === null ? undefined : value),
      z.number().int().min(1).max(16000).optional(),
    ),
  }),
  reranker: endpoint.extend({
    format: z.enum(['tei', 'cohere']),
    path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
  }),
  llm: endpoint,
});
export const retrievalSchema = z
  .object({
    query: z.string().trim().min(1).max(8000),
    method: z.enum(['vector', 'hybrid']).default('hybrid'),
    strategy: z.enum(['normal', 'parent-child']).default('parent-child'),
    scope: z.enum(['all', 'folder', 'subtree', 'files']).default('all'),
    folderId: z.string().default('root'),
    fileIds: z.array(z.string()).max(500).default([]),
    rerank: z.boolean().default(false),
    candidateCount: z.number().int().min(1).max(100).default(30),
    resultCount: z.number().int().min(1).max(20).default(5),
    contextTokens: z.number().int().min(256).max(16000).default(4000),
  })
  .refine(
    (value) => value.resultCount <= value.candidateCount,
    'Result count must not exceed candidate count',
  )
  .refine(
    (value) => value.scope !== 'files' || value.fileIds.length > 0,
    'Select at least one file',
  );
export const nodeNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) => !/[\/\\\x00-\x1f]/.test(value) && value !== '.' && value !== '..',
    'Invalid file or folder name',
  );
