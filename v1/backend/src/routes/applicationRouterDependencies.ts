import type { ApplicationDatabase } from '../database/openApplicationDatabase.js';
import type { ExplorerNodeRepository } from '../repositories/explorerNodeRepository.js';
import type { ApplicationSettingsRepository } from '../repositories/applicationSettingsRepository.js';
import type { ApplicationEventBus } from '../events/applicationEventBus.js';
import type { DocumentIndexingJobService } from '../services/ingestion/documentIndexingJobService.js';
import type { createDocumentUploadService } from '../services/ingestion/documentUploadService.js';
import type { DocumentRetrievalService } from '../services/retrieval/documentRetrievalService.js';
import type { createGroundedAnswerService } from '../services/retrieval/groundedAnswerService.js';
export interface RouterDependencies {
  database: ApplicationDatabase;
  nodes: ExplorerNodeRepository;
  settings: ApplicationSettingsRepository;
  events: ApplicationEventBus;
  jobs: DocumentIndexingJobService;
  uploadsDirectory: string;
  upload: ReturnType<typeof createDocumentUploadService>;
  retrieve: DocumentRetrievalService;
  answer: ReturnType<typeof createGroundedAnswerService>;
}
