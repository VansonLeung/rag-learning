import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ApplicationDatabase } from '../../database/openApplicationDatabase.js';
import type { ExplorerNodeRepository } from '../../repositories/explorerNodeRepository.js';
import { ApplicationError, nodeNameSchema } from '../../config/requestValidation.js';
import { supportedFileExtensions } from './extractDocumentText.js';
export function createDocumentUploadService(
  database: ApplicationDatabase,
  nodes: ExplorerNodeRepository,
  directory: string,
) {
  return async function uploadDocument(
    parentId: string,
    relativePath: string,
    file: Express.Multer.File,
  ) {
    const parts = relativePath.replace(/\\/g, '/').split('/');
    if (parts.length > 30 || parts.some((part) => !nodeNameSchema.safeParse(part).success))
      throw new ApplicationError('Invalid upload path');
    const name = parts.pop()!;
    if (!supportedFileExtensions.has(path.extname(name).toLowerCase()))
      throw new ApplicationError(`Unsupported file: ${name}`);
    await nodes.requireFolder(parentId);
    for (const part of parts) parentId = (await nodes.ensureFolder(parentId, part)).id;
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await database.query<{ id: string; name: string }>(
      'SELECT id,name FROM explorer_nodes WHERE parent_id=$1 AND content_hash=$2',
      [parentId, hash],
    );
    if (duplicate.rows[0])
      return { id: duplicate.rows[0].id, name: duplicate.rows[0].name, duplicate: true };
    const conflict = await database.query(
      'SELECT id FROM explorer_nodes WHERE parent_id=$1 AND name=$2',
      [parentId, name],
    );
    if (conflict.rows.length)
      throw new ApplicationError(
        `“${name}” already exists in this folder. Rename or delete it before uploading a replacement.`,
        409,
      );
    const id = randomUUID();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, id), file.buffer, { mode: 0o600 });
    try {
      await database.query(
        "INSERT INTO explorer_nodes(id,parent_id,name,kind,mime_type,size,content_hash) VALUES($1,$2,$3,'file',$4,$5,$6)",
        [id, parentId, name, file.mimetype, file.size, hash],
      );
    } catch (error) {
      await rm(path.join(directory, id), { force: true });
      throw error;
    }
    return { id, name, duplicate: false };
  };
}
