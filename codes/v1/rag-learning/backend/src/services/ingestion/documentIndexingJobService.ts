import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ApplicationDatabase } from '../../database/openApplicationDatabase.js';
import type { ApplicationSettingsRepository } from '../../repositories/applicationSettingsRepository.js';
import { embeddingFingerprint } from '../../repositories/applicationSettingsRepository.js';
import type { ApplicationEventBus } from '../../events/applicationEventBus.js';
import type { IndexingJob, ExplorerNode } from '../../types/applicationTypes.js';
import { ApplicationError } from '../../config/requestValidation.js';
import { extractDocumentText } from './extractDocumentText.js';
import { createDocumentChunks } from './createDocumentChunks.js';
import { createTextEmbeddings } from '../../models/openCompatibleModelClients.js';
export function createDocumentIndexingJobService(
  database: ApplicationDatabase,
  settingsRepository: ApplicationSettingsRepository,
  events: ApplicationEventBus,
  uploadsDirectory: string,
) {
  let running: Promise<void> | undefined;
  let stopped = false;
  const controllers = new Map<string, AbortController>();
  async function updateJob(id: string, status: string, progress: number, message: string) {
    await database.query('UPDATE indexing_jobs SET status=$2,progress=$3,message=$4 WHERE id=$1', [
      id,
      status,
      progress,
      message,
    ]);
    events.publishChange('jobs');
  }
  async function processJob(job: IndexingJob) {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    const signal = controller.signal;
    try {
      await updateJob(job.id, 'running', 5, 'Extracting document text');
      const document = (
        await database.query<ExplorerNode>('SELECT * FROM explorer_nodes WHERE id=$1', [
          job.document_id,
        ])
      ).rows[0];
      if (!document) throw new Error('Document was deleted');
      const text = await extractDocumentText(
        await readFile(path.join(uploadsDirectory, document.id)),
        document.name,
      );
      signal.throwIfAborted();
      await database.query('UPDATE explorer_nodes SET extracted_text=$2 WHERE id=$1', [
        document.id,
        text,
      ]);
      const settings = await settingsRepository.readSettings();
      const fingerprint = embeddingFingerprint(settings);
      const chunks = createDocumentChunks(text);
      const embeddable = chunks.filter((chunk) => chunk.kind !== 'parent');
      const vectors = new Map<string, number[]>();
      let dimensions: number | undefined;
      for (let offset = 0; offset < embeddable.length; offset += 16) {
        signal.throwIfAborted();
        const batch = embeddable.slice(offset, offset + 16);
        await updateJob(
          job.id,
          'running',
          Math.round(10 + (offset / embeddable.length) * 80),
          `Embedding chunks ${offset + 1}–${Math.min(offset + 16, embeddable.length)} of ${embeddable.length}`,
        );
        const embeddings = await createTextEmbeddings(
          settings.embedding,
          batch.map((chunk) => chunk.content),
          signal,
        );
        for (let index = 0; index < batch.length; index++) {
          dimensions ??= embeddings[index].length;
          if (embeddings[index].length !== dimensions)
            throw new Error('Embedding dimensions changed between batches');
          vectors.set(batch[index].id, embeddings[index]);
        }
      }
      signal.throwIfAborted();
      await database.transaction(async (transaction) => {
        const current = (
          await transaction.query<{ status: string }>(
            'SELECT status FROM indexing_jobs WHERE id=$1',
            [job.id],
          )
        ).rows[0];
        if (!current || current.status !== 'running' || signal.aborted)
          throw new Error('Indexing cancelled');
        await transaction.query('DELETE FROM document_chunks WHERE document_id=$1', [document.id]);
        for (const chunk of chunks) {
          signal.throwIfAborted();
          await transaction.query(
            `INSERT INTO document_chunks(id,document_id,parent_chunk_id,kind,content,start_offset,end_offset,embedding,index_fingerprint)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$9)`,
            [
              chunk.id,
              document.id,
              chunk.parentId,
              chunk.kind,
              chunk.content,
              chunk.start,
              chunk.end,
              vectors.has(chunk.id) ? JSON.stringify(vectors.get(chunk.id)) : null,
              fingerprint,
            ],
          );
        }
        await transaction.query(
          'UPDATE explorer_nodes SET index_fingerprint=$2,indexed_at=now() WHERE id=$1',
          [document.id, fingerprint],
        );
        await transaction.query(
          "UPDATE indexing_jobs SET status='completed',progress=100,message=$2 WHERE id=$1",
          [job.id, `Indexed ${embeddable.length} searchable chunks`],
        );
      });
      events.publishChange('library');
      events.publishChange('jobs');
    } catch (error) {
      await updateJob(
        job.id,
        signal.aborted ? 'cancelled' : 'failed',
        0,
        signal.aborted
          ? 'Indexing cancelled; previous index retained'
          : error instanceof Error
            ? error.message
            : 'Indexing failed',
      );
    } finally {
      controllers.delete(job.id);
    }
  }
  async function drainQueue() {
    while (!stopped) {
      const next = (
        await database.query<IndexingJob>(
          "SELECT * FROM indexing_jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
        )
      ).rows[0];
      if (!next) break;
      await processJob(next);
    }
  }
  function wakeQueue() {
    if (!running && !stopped) {
      running = drainQueue()
        .catch((error) => {
          console.error(
            'Indexing queue error:',
            error instanceof Error ? error.message : 'Unknown error',
          );
        })
        .finally(() => {
          running = undefined;
        });
    }
  }
  async function enqueueDocument(documentId: string) {
    const document = (
      await database.query<ExplorerNode>('SELECT * FROM explorer_nodes WHERE id=$1', [documentId])
    ).rows[0];
    if (!document || document.kind !== 'file')
      throw new ApplicationError('Select a document to index');
    const id = randomUUID();
    await database.query(
      "INSERT INTO indexing_jobs(id,document_id,document_name,status) VALUES($1,$2,$3,'queued') ON CONFLICT DO NOTHING",
      [id, documentId, document.name],
    );
    events.publishChange('jobs');
    wakeQueue();
  }
  async function cancelJob(id: string) {
    controllers.get(id)?.abort();
    await database.query(
      "UPDATE indexing_jobs SET status='cancelled',message='Cancelled by user' WHERE id=$1 AND status IN ('queued','running')",
      [id],
    );
    events.publishChange('jobs');
  }
  // A short scheduler also covers an enqueue that races with the end of a drain.
  const timer = setInterval(wakeQueue, 1000);
  timer.unref();
  return {
    enqueueDocument,
    cancelJob,
    async listJobs() {
      return (
        await database.query<IndexingJob>(
          'SELECT * FROM indexing_jobs ORDER BY created_at DESC LIMIT 100',
        )
      ).rows;
    },
    async start() {
      await database.query(
        "UPDATE indexing_jobs SET status='queued',message='Resuming interrupted indexing' WHERE status='running'",
      );
      wakeQueue();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      for (const controller of controllers.values()) controller.abort();
      await running;
    },
  };
}
export type DocumentIndexingJobService = ReturnType<typeof createDocumentIndexingJobService>;
