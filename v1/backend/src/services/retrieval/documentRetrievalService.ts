import type { ApplicationDatabase } from '../../database/openApplicationDatabase.js';
import type { ApplicationSettingsRepository } from '../../repositories/applicationSettingsRepository.js';
import { embeddingFingerprint } from '../../repositories/applicationSettingsRepository.js';
import type { ExplorerNodeRepository } from '../../repositories/explorerNodeRepository.js';
import type {
  RetrievalOptions,
  RetrievalResult,
  RetrievedChunk,
} from '../../types/applicationTypes.js';
import {
  createTextEmbeddings,
  rerankTextPassages,
} from '../../models/openCompatibleModelClients.js';
import { ApplicationError } from '../../config/requestValidation.js';
import { combineRankedCandidates } from './combineRankedCandidates.js';
import { buildBudgetedContext } from './buildBudgetedContext.js';
export function createDocumentRetrievalService(
  database: ApplicationDatabase,
  settingsRepository: ApplicationSettingsRepository,
  nodeRepository: ExplorerNodeRepository,
) {
  return async function retrieveDocumentPassages(
    options: RetrievalOptions,
    signal?: AbortSignal,
  ): Promise<RetrievalResult> {
    const start = performance.now();
    const timings: Record<string, number> = {};
    const warnings: string[] = [];
    const settings = await settingsRepository.readSettings();
    const fingerprint = embeddingFingerprint(settings);
    const nodes = await nodeRepository.listNodes();
    if (options.scope === 'folder' || options.scope === 'subtree')
      await nodeRepository.requireFolder(options.folderId);
    const folders = new Set([options.folderId]);
    if (options.scope === 'subtree') {
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of nodes)
          if (
            node.kind === 'folder' &&
            node.parent_id &&
            folders.has(node.parent_id) &&
            !folders.has(node.id)
          ) {
            folders.add(node.id);
            changed = true;
          }
      }
    }
    const scoped = nodes.filter(
      (node) =>
        node.kind === 'file' &&
        (options.scope === 'all' ||
          (options.scope === 'files'
            ? options.fileIds.includes(node.id)
            : folders.has(node.parent_id ?? ''))),
    );
    if (options.scope === 'files' && scoped.length !== new Set(options.fileIds).size)
      throw new ApplicationError('One or more selected files no longer exist');
    const ready = scoped.filter((node) => node.index_fingerprint === fingerprint);
    if (ready.length < scoped.length)
      warnings.push(
        `${scoped.length - ready.length} file(s) are unindexed or use another embedding model. Reindex them to include them.`,
      );
    const empty = () => ({
      query: options.query,
      options,
      candidates: [],
      matches: [],
      passages: [],
      context: '',
      contextTokenCount: 0,
      timings: { ...timings, total: performance.now() - start },
      warnings,
    });
    if (!ready.length) {
      warnings.push('No indexed documents are available in this scope.');
      return empty();
    }
    const embeddingStart = performance.now();
    const [queryVector] = await createTextEmbeddings(settings.embedding, [options.query], signal);
    timings.embedding = performance.now() - embeddingStart;
    const ids = ready.map((node) => node.id);
    const pathMap = new Map(nodes.map((node) => [node.id, node.path || node.name]));
    const kind = options.strategy === 'normal' ? 'normal' : 'child';
    const retrievalStart = performance.now();
    const dimensionRows = await database.query<{ dimensions: number }>(
      'SELECT DISTINCT vector_dims(embedding) AS dimensions FROM document_chunks WHERE document_id=ANY($1::text[]) AND kind=$2 AND index_fingerprint=$3',
      [ids, kind, fingerprint],
    );
    if (dimensionRows.rows.some((row) => row.dimensions !== queryVector.length))
      throw new ApplicationError(
        'The endpoint now returns different embedding dimensions. Reindex the affected documents.',
        409,
      );
    const vectorRows = await database.query<RetrievedChunk & { vector_score: number }>(
      `SELECT id,document_id,parent_chunk_id,kind,content,start_offset,end_offset,
      1-(embedding <=> $4::vector) AS vector_score FROM document_chunks
      WHERE document_id=ANY($1::text[]) AND kind=$2 AND index_fingerprint=$3
      ORDER BY embedding <=> $4::vector, id LIMIT $5`,
      [ids, kind, fingerprint, JSON.stringify(queryVector), options.candidateCount],
    );
    const vectorCandidates = vectorRows.rows.map((row) => ({
      ...row,
      path: pathMap.get(row.document_id)!,
      vectorScore: row.vector_score,
    }));
    let candidates: RetrievedChunk[] = vectorCandidates;
    if (options.method === 'hybrid') {
      const keywordRows = await database.query<RetrievedChunk & { keyword_score: number }>(
        `SELECT id,document_id,parent_chunk_id,kind,content,start_offset,end_offset,
        ts_rank_cd(search_tokens,websearch_to_tsquery('simple',$4)) AS keyword_score FROM document_chunks
        WHERE document_id=ANY($1::text[]) AND kind=$2 AND index_fingerprint=$3 AND search_tokens @@ websearch_to_tsquery('simple',$4)
        ORDER BY keyword_score DESC,id LIMIT $5`,
        [ids, kind, fingerprint, options.query, options.candidateCount],
      );
      candidates = combineRankedCandidates(
        vectorCandidates,
        keywordRows.rows.map((row) => ({
          ...row,
          path: pathMap.get(row.document_id)!,
          keywordScore: row.keyword_score,
        })),
        options.candidateCount,
      );
      if (/[\u3400-\u9fff]/.test(options.query))
        warnings.push(
          'Keyword retrieval uses PostgreSQL simple tokenization; Chinese segmentation is limited. Vector retrieval still supports your embedding model’s languages.',
        );
    }
    timings.retrieval = performance.now() - retrievalStart;
    candidates = candidates.map((candidate, index) => ({
      ...candidate,
      rankBeforeRerank: index + 1,
    }));
    if (options.rerank && candidates.length) {
      const rerankStart = performance.now();
      const ranking = await rerankTextPassages(
        settings.reranker,
        options.query,
        candidates.map((candidate) => candidate.content),
        signal,
      );
      candidates = ranking.map((row) => ({ ...candidates[row.index], rerankerScore: row.score }));
      timings.reranking = performance.now() - rerankStart;
    }
    const matches = candidates.slice(0, options.resultCount);
    const contextCandidates = [];
    for (const match of matches) {
      const chunk =
        options.strategy === 'parent-child' && match.parent_chunk_id
          ? (
              await database.query<RetrievedChunk>('SELECT * FROM document_chunks WHERE id=$1', [
                match.parent_chunk_id,
              ])
            ).rows[0]
          : match;
      if (chunk)
        contextCandidates.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          path: match.path,
          content: chunk.content,
          startOffset: chunk.start_offset,
          endOffset: chunk.end_offset,
        });
    }
    const context = buildBudgetedContext(contextCandidates, options.contextTokens);
    if (context.passages.some((passage) => passage.truncated))
      warnings.push('The last context passage was truncated to fit the token budget.');
    timings.total = performance.now() - start;
    return { query: options.query, options, candidates, matches, ...context, timings, warnings };
  };
}
export type DocumentRetrievalService = ReturnType<typeof createDocumentRetrievalService>;
