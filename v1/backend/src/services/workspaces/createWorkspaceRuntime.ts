import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openApplicationDatabase } from '../../database/openApplicationDatabase.js';
import { createApplicationEventBus } from '../../events/applicationEventBus.js';
import { createApplicationSettingsRepository } from '../../repositories/applicationSettingsRepository.js';
import { createExplorerNodeRepository } from '../../repositories/explorerNodeRepository.js';
import { createDocumentUploadService } from '../../services/ingestion/documentUploadService.js';
import { createDocumentIndexingJobService } from '../../services/ingestion/documentIndexingJobService.js';
import { createDocumentRetrievalService } from '../../services/retrieval/documentRetrievalService.js';
import { createGroundedAnswerService } from '../../services/retrieval/groundedAnswerService.js';
import { createApplicationRouter } from '../../routes/createApplicationRouter.js';
export async function createWorkspaceRuntime(dataDirectory: string) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const uploadsDirectory = path.join(dataDirectory, 'uploads');
  await mkdir(uploadsDirectory, { recursive: true, mode: 0o700 });
  const database = await openApplicationDatabase(path.join(dataDirectory, 'postgres'));
  const events = createApplicationEventBus();
  const settings = createApplicationSettingsRepository(database);
  const nodes = createExplorerNodeRepository(database);
  const upload = createDocumentUploadService(database, nodes, uploadsDirectory);
  const jobs = createDocumentIndexingJobService(database, settings, events, uploadsDirectory);
  const retrieve = createDocumentRetrievalService(database, settings, nodes);
  const answer = createGroundedAnswerService(settings);
  const dependencies = {
    database,
    nodes,
    settings,
    events,
    jobs,
    uploadsDirectory,
    upload,
    retrieve,
    answer,
  };
  const router = createApplicationRouter(dependencies);
  await jobs.start();
  return {
    ...dependencies,
    router,
    activeRequests: 0,
    async close() {
      events.publishChange('workspace-closed');
      await jobs.stop();
      await database.close();
    },
  };
}
export type WorkspaceRuntime = Awaited<ReturnType<typeof createWorkspaceRuntime>>;
