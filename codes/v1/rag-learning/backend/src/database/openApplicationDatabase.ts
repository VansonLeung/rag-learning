import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { initialApplicationSchema } from './migrations/initialApplicationSchema.js';
import { learningSchema } from './migrations/learningSchema.js';
export async function openApplicationDatabase(directory: string) {
  const database = await PGlite.create(directory, { extensions: { vector } });
  await database.exec(initialApplicationSchema);
  await database.exec(learningSchema);
  return database;
}
export type ApplicationDatabase = Awaited<ReturnType<typeof openApplicationDatabase>>;
