import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ApplicationError, nodeNameSchema } from '../../config/requestValidation.js';
import { createWorkspaceRuntime, type WorkspaceRuntime } from './createWorkspaceRuntime.js';
const registrySchema = z
  .array(
    z.object({
      id: z.string().regex(/^(personal|[a-f0-9-]{36})$/),
      name: z.string(),
      createdAt: z.string(),
      legacy: z.boolean().optional(),
    }),
  )
  .min(1);
export type WorkspaceRecord = z.infer<typeof registrySchema>[number];
export async function createWorkspaceRegistryService(dataDirectory: string) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const registryPath = path.join(dataDirectory, 'workspaces.json');
  let records: WorkspaceRecord[];
  try {
    records = registrySchema.parse(JSON.parse(await readFile(registryPath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    records = [
      { id: 'personal', name: 'Personal', createdAt: new Date().toISOString(), legacy: true },
    ];
    await persistRecords(records);
  }
  const runtimes = new Map<string, Promise<WorkspaceRuntime>>();
  const deleting = new Set<string>();
  let mutationQueue = Promise.resolve();
  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationQueue.then(operation);
    mutationQueue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async function persistRecords(next: WorkspaceRecord[]) {
    const temporary = registryPath + '.tmp';
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(temporary, registryPath);
  }
  function recordFor(id: string) {
    const record = records.find((record) => record.id === id);
    if (!record || deleting.has(id)) throw new ApplicationError('Workspace not found', 404);
    return record;
  }
  function directoryFor(record: WorkspaceRecord) {
    return record.legacy ? dataDirectory : path.join(dataDirectory, 'workspaces', record.id);
  }
  async function getWorkspace(id: string) {
    const record = recordFor(id);
    let runtime = runtimes.get(id);
    if (!runtime) {
      runtime = createWorkspaceRuntime(directoryFor(record));
      runtimes.set(id, runtime);
      runtime.catch(() => runtimes.delete(id));
    }
    return runtime;
  }
  return {
    listWorkspaces: () => records.map(({ legacy, ...record }) => record),
    getWorkspace,
    createWorkspace: (name: string) =>
      mutate(async () => {
        nodeNameSchema.parse(name);
        if (records.some((record) => record.name.toLowerCase() === name.toLowerCase()))
          throw new ApplicationError('Workspace name already exists', 409);
        const record = { id: randomUUID(), name, createdAt: new Date().toISOString() };
        await persistRecords([...records, record]);
        records.push(record);
        return record;
      }),
    renameWorkspace: (id: string, name: string) =>
      mutate(async () => {
        nodeNameSchema.parse(name);
        recordFor(id);
        if (
          records.some(
            (record) => record.id !== id && record.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw new ApplicationError('Workspace name already exists', 409);
        const next = records.map((record) => (record.id === id ? { ...record, name } : record));
        await persistRecords(next);
        records = next;
        return recordFor(id);
      }),
    deleteWorkspace: (id: string) =>
      mutate(async () => {
        const record = recordFor(id);
        if (records.length === 1) throw new ApplicationError('Keep at least one workspace');
        deleting.add(id);
        try {
          const runtime = await runtimes.get(id);
          if (runtime) {
            if (runtime.activeRequests > 0)
              throw new ApplicationError(
                'Workspace has an operation in progress. Try again when it finishes.',
                409,
              );
            await runtime.close();
            runtimes.delete(id);
          }
          const next = records.filter((record) => record.id !== id);
          await persistRecords(next);
          records = next;
          if (record.legacy) {
            await rm(path.join(dataDirectory, 'postgres'), { recursive: true, force: true });
            await rm(path.join(dataDirectory, 'uploads'), { recursive: true, force: true });
          } else await rm(directoryFor(record), { recursive: true, force: true });
        } finally {
          deleting.delete(id);
        }
      }),
    async close() {
      await mutationQueue;
      for (const runtime of runtimes.values()) await (await runtime).close();
      runtimes.clear();
    },
  };
}
export type WorkspaceRegistryService = Awaited<ReturnType<typeof createWorkspaceRegistryService>>;
