import { Router } from 'express';
import type { RouterDependencies } from './applicationRouterDependencies.js';
import { registerApplicationEventRoutes } from './registerApplicationEventRoutes.js';
import { registerModelSettingsRoutes } from './registerModelSettingsRoutes.js';
import { registerExplorerRoutes } from './registerExplorerRoutes.js';
import { registerIndexingJobRoutes } from './registerIndexingJobRoutes.js';
import { registerRetrievalAndChatRoutes } from './registerRetrievalAndChatRoutes.js';
import { registerLearningRoutes } from './registerLearningRoutes.js';

export function createApplicationRouter(dependencies: RouterDependencies) {
  const router = Router();
  registerApplicationEventRoutes(router, dependencies);
  registerModelSettingsRoutes(router, dependencies);
  registerExplorerRoutes(router, dependencies);
  registerIndexingJobRoutes(router, dependencies);
  registerRetrievalAndChatRoutes(router, dependencies);
  registerLearningRoutes(router, dependencies);
  return router;
}
