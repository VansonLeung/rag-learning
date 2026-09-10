import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { initialApplicationSchema } from './migrations/initialApplicationSchema.js';
export async function openApplicationDatabase(directory: string) {
  const database = await PGlite.create(directory, { extensions: { vector } });
  await database.exec(initialApplicationSchema);
  return database;
}
export type ApplicationDatabase = Awaited<ReturnType<typeof openApplicationDatabase>>;
