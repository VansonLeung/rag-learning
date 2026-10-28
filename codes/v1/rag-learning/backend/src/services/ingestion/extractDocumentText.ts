import path from 'node:path';
import mammoth from 'mammoth';
import { ApplicationError } from '../../config/requestValidation.js';
export const supportedFileExtensions = new Set(['.txt', '.md', '.markdown', '.pdf', '.docx']);
export async function extractDocumentText(buffer: Buffer, filename: string): Promise<string> {
  const extension = path.extname(filename).toLowerCase();
  if (!supportedFileExtensions.has(extension))
    throw new ApplicationError(`Unsupported file format: ${extension}`);
  let text: string;
  if (extension === '.docx') text = (await mammoth.extractRawText({ buffer })).value;
  else if (extension === '.pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // Electron utility processes do not receive PDF.js's automatic Node worker path.
    // Resolve the installed asset explicitly in both source and packaged applications.
    GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    try {
      const document = await loadingTask.promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const content = await (await document.getPage(pageNumber)).getTextContent();
        pages.push(
          content.items
            .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
            .join(''),
        );
      }
      text = pages.join('\n\n');
    } finally {
      await loadingTask.destroy();
    }
  } else text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  text = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n');
  if (!text.trim())
    throw new ApplicationError(
      'No text found. Scanned PDFs need OCR, which is not included in v1.',
    );
  if (text.length > 5_000_000)
    throw new ApplicationError('Extracted text exceeds the 5 million character limit');
  return text;
}
