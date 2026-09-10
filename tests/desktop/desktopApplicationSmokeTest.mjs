import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
const directory = await mkdtemp(path.join(os.tmpdir(), 'grove-desktop-test-'));
const modelServer = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const data = JSON.parse(body);
  response.setHeader('Content-Type', 'application/json');
  response.end(
    JSON.stringify({ data: data.input.map((_, index) => ({ index, embedding: [1, 2, 3] })) }),
  );
});
await new Promise((resolve) => modelServer.listen(0, '127.0.0.1', resolve));
const env = { ...process.env, GROVE_USER_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.RAG_DATA_DIR;
let executablePath = process.env.GROVE_PACKAGED_APP;
if (executablePath && process.platform === 'darwin') {
  const isolatedBundle = path.join(directory, 'Grove.app');
  await cp(path.resolve(executablePath, '../../..'), isolatedBundle, {
    recursive: true,
    verbatimSymlinks: true,
  });
  executablePath = path.join(isolatedBundle, 'Contents/MacOS/Grove');
}
let application;
async function launch() {
  application = await electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: [path.resolve('v1/desktop/app')] }),
    env,
    timeout: 60000,
  });
  application.process().stderr?.on('data', (data) => process.stderr.write(data));
  const page = await application.firstWindow({ timeout: 60000 });
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.getByRole('combobox', { name: 'Active workspace' }).waitFor();
  return page;
}
try {
  const page = await launch();
  const origin = new URL(page.url()).origin;
  if ((await fetch(origin + '/api/health')).status !== 401)
    throw new Error('Desktop API accepted an unauthenticated request');
  const modelUrl = `http://127.0.0.1:${modelServer.address().port}/v1`;
  await page.evaluate(async (modelUrl) => {
    const url = '/api/workspaces/personal/settings';
    const settings = await (await fetch(url)).json();
    settings.embedding = { ...settings.embedding, baseUrl: modelUrl, model: 'desktop-smoke' };
    const saved = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!saved.ok) throw new Error('Settings save failed');
  }, modelUrl);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(path.resolve('v1/backend/tests/fixtures/orchard.pdf'));
  try {
    await expect(page.getByText('Indexed', { exact: true })).toBeVisible({ timeout: 30000 });
  } catch (error) {
    console.error(
      'Desktop indexing jobs:',
      await page.evaluate(async () => await (await fetch('/api/workspaces/personal/jobs')).json()),
    );
    throw error;
  }
  await page.getByRole('checkbox', { name: 'Select row 1', exact: true }).check();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+c');
  await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
  await expect(page.getByRole('dialog', { name: 'Items already exist' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep both', exact: true }).click();
  await expect(page.getByRole('button', { name: 'orchard (copy).pdf', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'orchard.pdf', exact: true }).click();
  await expect(
    page.getByText('Apple trees need sunlight.', { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search documents' }).fill('Apple trees');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
  await expect(page.locator('.result-card')).not.toHaveCount(0);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop-application.png' });
  await application.close();
  application = undefined;
  const reopened = await launch();
  await expect(reopened.getByRole('button', { name: 'orchard.pdf', exact: true })).toBeVisible();
  console.log(
    'Desktop smoke test passed: renderer, authenticated API, PDF extraction, pgvector indexing/search, and restart persistence.',
  );
} finally {
  await application?.close();
  modelServer.closeAllConnections();
  await new Promise((resolve) => modelServer.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
