import { randomUUID } from 'node:crypto';
import type { ApplicationDatabase } from '../database/openApplicationDatabase.js';
import type { ExplorerNode } from '../types/applicationTypes.js';
import { ApplicationError, nodeNameSchema } from '../config/requestValidation.js';
export function createExplorerNodeRepository(database: ApplicationDatabase) {
  async function getNode(id: string) {
    const result = await database.query<ExplorerNode>('SELECT * FROM explorer_nodes WHERE id=$1', [
      id,
    ]);
    if (!result.rows[0]) throw new ApplicationError('File or folder not found', 404);
    return result.rows[0];
  }
  async function requireFolder(id: string) {
    if ((await getNode(id)).kind !== 'folder')
      throw new ApplicationError('Destination must be a folder');
  }
  async function listNodes() {
    return (
      await database.query<ExplorerNode>(`WITH RECURSIVE tree AS (
      SELECT *, ''::text AS path FROM explorer_nodes WHERE id='root'
      UNION ALL SELECT n.*, tree.path || '/' || n.name FROM explorer_nodes n JOIN tree ON n.parent_id=tree.id
    ) SELECT id,parent_id,name,kind,mime_type,size,content_hash,index_fingerprint,indexed_at,created_at,path FROM tree ORDER BY kind,name`)
    ).rows;
  }
  async function createFolder(parentId: string, name: string) {
    nodeNameSchema.parse(name);
    await requireFolder(parentId);
    const id = randomUUID();
    await database.query(
      "INSERT INTO explorer_nodes(id,parent_id,name,kind) VALUES($1,$2,$3,'folder')",
      [id, parentId, name],
    );
    return getNode(id);
  }
  async function ensureFolder(parentId: string, name: string) {
    const found = await database.query<ExplorerNode>(
      'SELECT * FROM explorer_nodes WHERE parent_id=$1 AND name=$2',
      [parentId, name],
    );
    if (found.rows[0]) {
      if (found.rows[0].kind !== 'folder')
        throw new ApplicationError(`A file already uses the name ${name}`);
      return found.rows[0];
    }
    return createFolder(parentId, name);
  }
  async function updateNode(id: string, changes: { name?: string; parentId?: string }) {
    if (id === 'root') throw new ApplicationError('The library root cannot be moved or renamed');
    await database.transaction(async (transaction) => {
      const node = (
        await transaction.query<ExplorerNode>('SELECT * FROM explorer_nodes WHERE id=$1', [id])
      ).rows[0];
      if (!node) throw new ApplicationError('File or folder not found', 404);
      if (changes.name !== undefined) nodeNameSchema.parse(changes.name);
      if (changes.parentId !== undefined) {
        const destination = (
          await transaction.query<ExplorerNode>('SELECT * FROM explorer_nodes WHERE id=$1', [
            changes.parentId,
          ])
        ).rows[0];
        if (destination?.kind !== 'folder')
          throw new ApplicationError('Destination must be a folder');
        const descendants = await transaction.query<{ id: string }>(
          `WITH RECURSIVE subtree AS (
          SELECT id FROM explorer_nodes WHERE id=$1 UNION ALL SELECT n.id FROM explorer_nodes n JOIN subtree ON n.parent_id=subtree.id
        ) SELECT id FROM subtree`,
          [id],
        );
        if (descendants.rows.some((row) => row.id === changes.parentId))
          throw new ApplicationError('A folder cannot be moved into itself or its descendants');
      }
      await transaction.query('UPDATE explorer_nodes SET name=$2,parent_id=$3 WHERE id=$1', [
        id,
        changes.name ?? node.name,
        changes.parentId ?? node.parent_id,
      ]);
    });
    return getNode(id);
  }
  async function deleteNode(id: string) {
    if (id === 'root') throw new ApplicationError('The library root cannot be deleted');
    await getNode(id);
    const descendants = await database.query<{ id: string }>(
      `WITH RECURSIVE subtree AS (SELECT id FROM explorer_nodes WHERE id=$1 UNION ALL SELECT n.id FROM explorer_nodes n JOIN subtree ON n.parent_id=subtree.id) SELECT id FROM subtree`,
      [id],
    );
    await database.query('DELETE FROM explorer_nodes WHERE id=$1', [id]);
    return descendants.rows.map((row) => row.id);
  }
  return { getNode, requireFolder, listNodes, createFolder, ensureFolder, updateNode, deleteNode };
}
export type ExplorerNodeRepository = ReturnType<typeof createExplorerNodeRepository>;
