export async function readDroppedFiles(transfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(transfer.items).map((item) => item.webkitGetAsEntry?.());
  const fallback = Array.from(transfer.files);
  if (!entries.some(Boolean)) return fallback;
  const result: File[] = [];
  async function visit(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      Object.defineProperty(file, 'webkitRelativePath', { value: prefix + entry.name });
      result.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await visit(child, prefix + entry.name + '/');
      }
    }
  }
  for (const entry of entries) if (entry) await visit(entry, '');
  return result;
}
