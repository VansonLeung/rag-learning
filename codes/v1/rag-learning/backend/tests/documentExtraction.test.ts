import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractDocumentText } from '../src/services/ingestion/extractDocumentText.js';
for (const extension of ['pdf', 'docx'])
  test(`extracts text from ${extension.toUpperCase()} documents`, async () => {
    const buffer = await readFile(new URL(`./fixtures/orchard.${extension}`, import.meta.url));
    assert.match(
      await extractDocumentText(buffer, `orchard.${extension}`),
      /Apple trees need sunlight\./,
    );
  });
test('rejects empty, unsupported, and malformed UTF-8 documents', async () => {
  await assert.rejects(extractDocumentText(Buffer.from('  '), 'empty.txt'), /No text found/);
  await assert.rejects(
    extractDocumentText(Buffer.from('hello'), 'script.exe'),
    /Unsupported file format/,
  );
  await assert.rejects(extractDocumentText(Buffer.from([255, 254]), 'bad.txt'));
});
