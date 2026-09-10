import { randomUUID } from 'node:crypto';
export interface DocumentChunkDraft {
  id: string;
  parentId: string | null;
  kind: 'normal' | 'child' | 'parent';
  content: string;
  start: number;
  end: number;
}
function splitTextIntoWindows(text: string, size: number, overlap: number, baseOffset = 0) {
  const windows: { content: string; start: number; end: number }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end),
        text.lastIndexOf('。', end),
      );
      if (boundary > start + size * 0.6) end = boundary + 1;
      if (/^[\uDC00-\uDFFF]$/.test(text[end] ?? '')) end--;
    }
    if (text.slice(start, end).trim())
      windows.push({
        content: text.slice(start, end),
        start: start + baseOffset,
        end: end + baseOffset,
      });
    if (end === text.length) break;
    start = Math.max(start + 1, end - overlap);
    if (/^[\uDC00-\uDFFF]$/.test(text[start] ?? '')) start++;
  }
  return windows;
}
export function createDocumentChunks(text: string): DocumentChunkDraft[] {
  const normal = splitTextIntoWindows(text, 1600, 200).map((window) => ({
    ...window,
    id: randomUUID(),
    parentId: null,
    kind: 'normal' as const,
  }));
  const hierarchical: DocumentChunkDraft[] = [];
  for (const parent of splitTextIntoWindows(text, 4800, 0)) {
    const parentId = randomUUID();
    hierarchical.push({ ...parent, id: parentId, parentId: null, kind: 'parent' });
    hierarchical.push(
      ...splitTextIntoWindows(parent.content, 650, 100, parent.start).map((window) => ({
        ...window,
        id: randomUUID(),
        parentId,
        kind: 'child' as const,
      })),
    );
  }
  return [...normal, ...hierarchical];
}
