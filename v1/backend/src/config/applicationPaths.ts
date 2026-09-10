import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const backendDirectory = fileURLToPath(new URL('../..', import.meta.url));
export const dataDirectory = path.resolve(
  process.env.RAG_DATA_DIR || path.join(backendDirectory, '.data'),
);
export const frontendBuildDirectory = path.resolve(backendDirectory, '../frontend/dist');
