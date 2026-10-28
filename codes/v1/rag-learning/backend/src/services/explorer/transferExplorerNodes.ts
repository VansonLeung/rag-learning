import { randomUUID } from 'node:crypto';
import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspaceRuntime } from '../workspaces/createWorkspaceRuntime.js';
import type { ExplorerNode } from '../../types/applicationTypes.js';
import { ApplicationError } from '../../config/requestValidation.js';
import { embeddingFingerprint } from '../../repositories/applicationSettingsRepository.js';
export interface TransferOptions {
  nodeIds: string[];
  destinationFolderId: string;
  operation: 'copy' | 'move';
  conflict: 'ask' | 'keep-both' | 'skip' | 'replace';
}
export class TransferConflictError extends ApplicationError {
  constructor(public names: string[]) {
    super('Some names already exist in the destination', 409);
  }
}
interface ChunkSnapshot {
  id: string;
  document_id: string;
  parent_chunk_id: string | null;
  kind: string;
  content: string;
  start_offset: number;
  end_offset: number;
  embedding: string | null;
  index_fingerprint: string;
}
export async function transferExplorerNodes(
  source: WorkspaceRuntime,
  target: WorkspaceRuntime,
  options: TransferOptions,
) {
  if (source !== target && options.operation === 'move')
    throw new ApplicationError(
      'Use Copy to transfer items between workspaces; then delete the originals if desired.',
    );
  const stagedFiles: string[] = [];
  const obsoleteFiles: string[] = [];
  let committed = false;
  try {
    const snapshot = await source.database.transaction(async (transaction) => {
      const all = (await transaction.query<ExplorerNode>('SELECT * FROM explorer_nodes')).rows;
      const byId = new Map(all.map((node) => [node.id, node]));
      const selected = new Set(options.nodeIds);
      if (selected.has('root'))
        throw new ApplicationError('The library root cannot be copied or moved');
      for (const id of selected)
        if (!byId.has(id))
          throw new ApplicationError('One or more selected items no longer exist', 404);
      const hasSelectedAncestor = (node: ExplorerNode) => {
        let parent = node.parent_id;
        while (parent) {
          if (selected.has(parent)) return true;
          parent = byId.get(parent)?.parent_id ?? null;
        }
        return false;
      };
      const roots = all.filter((node) => selected.has(node.id) && !hasSelectedAncestor(node));
      const included = new Set(roots.map((node) => node.id));
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of all)
          if (node.parent_id && included.has(node.parent_id) && !included.has(node.id)) {
            included.add(node.id);
            changed = true;
          }
      }
      if (source === target && included.has(options.destinationFolderId))
        throw new ApplicationError(
          'A folder cannot be copied or moved into itself or its descendants',
        );
      const nodes = all.filter((node) => included.has(node.id));
      const chunks =
        options.operation === 'copy'
          ? (
              await transaction.query<ChunkSnapshot>(
                'SELECT id,document_id,parent_chunk_id,kind,content,start_offset,end_offset,embedding::text,index_fingerprint FROM document_chunks WHERE document_id=ANY($1::text[])',
                [nodes.filter((node) => node.kind === 'file').map((node) => node.id)],
              )
            ).rows
          : [];
      const newIds = new Map(nodes.map((node) => [node.id, randomUUID()]));
      if (options.operation === 'copy')
        for (const node of nodes.filter((node) => node.kind === 'file')) {
          const destination = path.join(target.uploadsDirectory, newIds.get(node.id)!);
          await copyFile(path.join(source.uploadsDirectory, node.id), destination);
          stagedFiles.push(destination);
        }
      return { roots, nodes, chunks, newIds };
    });
    const fingerprint = embeddingFingerprint(await target.settings.readSettings());
    const result = await target.database.transaction(async (transaction) => {
      const current = (await transaction.query<ExplorerNode>('SELECT * FROM explorer_nodes')).rows;
      const byId = new Map(current.map((node) => [node.id, node]));
      if (byId.get(options.destinationFolderId)?.kind !== 'folder')
        throw new ApplicationError('Destination folder not found', 404);
      // Revalidate after snapshot acquisition so concurrent moves cannot introduce a cycle.
      if (source === target) {
        let ancestor: string | null = options.destinationFolderId;
        while (ancestor) {
          if (snapshot.roots.some((root) => root.id === ancestor))
            throw new ApplicationError('Destination is inside a selected folder');
          ancestor = byId.get(ancestor)?.parent_id ?? null;
        }
      }
      const occupied = new Map(
        current
          .filter((node) => node.parent_id === options.destinationFolderId)
          .map((node) => [node.name, node]),
      );
      const conflicts = snapshot.roots
        .filter(
          (root) =>
            occupied.has(root.name) &&
            !(options.operation === 'move' && occupied.get(root.name)?.id === root.id),
        )
        .map((root) => root.name);
      if (conflicts.length && options.conflict === 'ask')
        throw new TransferConflictError(conflicts);
      const copied: string[] = [];
      const moved: string[] = [];
      const skipped: string[] = [];
      const needsIndexing: string[] = [];
      for (const root of snapshot.roots) {
        let name = root.name;
        const existing = occupied.get(name);
        if (existing?.id === root.id && options.operation === 'move') {
          skipped.push(root.name);
          continue;
        }
        if (existing) {
          if (options.conflict === 'skip') {
            skipped.push(root.name);
            continue;
          }
          if (options.conflict === 'keep-both') {
            const extension = root.kind === 'file' ? path.extname(name) : '';
            const base = name.slice(0, name.length - extension.length);
            let counter = 1;
            do {
              name = `${base.slice(0, 220)} (copy${counter === 1 ? '' : ` ${counter}`})${extension}`;
              counter++;
            } while (occupied.has(name));
          } else if (options.conflict === 'replace') {
            const descendants = new Set([existing.id]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const node of current)
                if (
                  node.parent_id &&
                  descendants.has(node.parent_id) &&
                  !descendants.has(node.id)
                ) {
                  descendants.add(node.id);
                  changed = true;
                }
            }
            if (source === target && snapshot.nodes.some((node) => descendants.has(node.id)))
              throw new ApplicationError(
                'Replacement would delete a selected source. Choose Keep both.',
              );
            obsoleteFiles.push(
              ...current
                .filter((node) => node.kind === 'file' && descendants.has(node.id))
                .map((node) => path.join(target.uploadsDirectory, node.id)),
            );
            await transaction.query('DELETE FROM explorer_nodes WHERE id=$1', [existing.id]);
          }
        }
        if (options.operation === 'move') {
          const present = byId.get(root.id);
          if (!present)
            throw new ApplicationError('Source changed during the move. Try again.', 409);
          await transaction.query('UPDATE explorer_nodes SET parent_id=$2,name=$3 WHERE id=$1', [
            root.id,
            options.destinationFolderId,
            name,
          ]);
          moved.push(root.id);
          occupied.set(name, { ...root, name });
          continue;
        }
        const subtree: ExplorerNode[] = [];
        function appendSubtree(node: ExplorerNode) {
          subtree.push(node);
          for (const child of snapshot.nodes.filter((child) => child.parent_id === node.id))
            appendSubtree(child);
        }
        appendSubtree(root);
        for (const node of subtree) {
          const newId = snapshot.newIds.get(node.id)!;
          const compatible = node.index_fingerprint === fingerprint;
          await transaction.query(
            `INSERT INTO explorer_nodes(id,parent_id,name,kind,mime_type,size,content_hash,extracted_text,index_fingerprint,indexed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              newId,
              node.id === root.id
                ? options.destinationFolderId
                : snapshot.newIds.get(node.parent_id!),
              node.id === root.id ? name : node.name,
              node.kind,
              node.mime_type,
              node.size,
              node.content_hash,
              node.extracted_text,
              compatible ? fingerprint : null,
              compatible ? node.indexed_at : null,
            ],
          );
          if (node.kind === 'file') {
            if (compatible) {
              const chunks = snapshot.chunks.filter((chunk) => chunk.document_id === node.id);
              const chunkIds = new Map(chunks.map((chunk) => [chunk.id, randomUUID()]));
              chunks.sort((a, b) => Number(!!a.parent_chunk_id) - Number(!!b.parent_chunk_id));
              for (const chunk of chunks)
                await transaction.query(
                  `INSERT INTO document_chunks(id,document_id,parent_chunk_id,kind,content,start_offset,end_offset,embedding,index_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8::vector,$9)`,
                  [
                    chunkIds.get(chunk.id),
                    newId,
                    chunk.parent_chunk_id ? chunkIds.get(chunk.parent_chunk_id) : null,
                    chunk.kind,
                    chunk.content,
                    chunk.start_offset,
                    chunk.end_offset,
                    chunk.embedding,
                    fingerprint,
                  ],
                );
            } else needsIndexing.push(newId);
          }
        }
        const newRootId = snapshot.newIds.get(root.id)!;
        copied.push(newRootId);
        occupied.set(name, { ...root, id: newRootId, name });
      }
      return { copied, moved, skipped, needsIndexing };
    });
    committed = true;
    // Files created for skipped entries are not referenced by any committed node.
    const retained = new Set(
      (
        await target.database.query<{ id: string }>(
          "SELECT id FROM explorer_nodes WHERE kind='file'",
        )
      ).rows.map((row) => row.id),
    );
    await Promise.all(
      [...obsoleteFiles, ...stagedFiles.filter((file) => !retained.has(path.basename(file)))].map(
        (file) => rm(file, { force: true }),
      ),
    );
    stagedFiles.length = 0;
    for (const id of result.needsIndexing) await target.jobs.enqueueDocument(id);
    target.events.publishChange('library');
    target.events.publishChange('jobs');
    return result;
  } catch (error) {
    if (!committed) await Promise.all(stagedFiles.map((file) => rm(file, { force: true })));
    throw error;
  }
}
