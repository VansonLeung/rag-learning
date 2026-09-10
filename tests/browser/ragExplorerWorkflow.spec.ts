import { test, expect } from '@playwright/test';
test('configure models, upload, retrieve, cite sources, and compare modes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your knowledge, within reach.' })).toBeVisible();
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/empty-library.png', fullPage: true });
  await page.getByRole('button', { name: 'Set up models' }).click();
  const drawer = page.getByRole('dialog').filter({ hasText: 'Model connections' });
  for (const role of ['Embeddings', 'Reranking', 'Generation']) {
    await drawer.getByRole('tab', { name: role, exact: true }).click();
    const panel = drawer.getByRole('tabpanel', { name: role, exact: true });
    await panel.getByLabel('API base URL', { exact: true }).fill('http://127.0.0.1:3002/v1');
    await panel.getByLabel('Model name', { exact: true }).fill('test-model');
  }
  await drawer.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: false }).first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByRole('textbox', { name: 'Item name' }).fill('Research');
  await page.getByRole('button', { name: 'Create folder', exact: true }).last().click();
  await page.getByRole('button', { name: 'Research', exact: true }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'orchard.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# Orchard care\n\nApple trees need water, soil, and sunlight.\n\nHarvest the apples in autumn.\n'.repeat(
          45,
        ),
      ),
    });
  await expect(page.getByText('Indexed', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'test-results/populated-library.png', fullPage: true });
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search documents' }).fill('What do apple trees need?');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
  await expect(page.getByText('/Research/orchard.md', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Source', exact: true }).first().click();
  await expect(page.locator('#source-passage')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/search-evidence.png', fullPage: true });
  await page.getByRole('tab', { name: 'Ask your library', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ask your documents' }).fill('What do apple trees need?');
  await page.getByRole('button', { name: 'Ask Grove', exact: true }).click();
  await expect(page.locator('.citation-link').first()).toBeVisible();
  await page.locator('.citation-link').first().click();
  await expect(page.locator('#source-passage')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Compare', exact: true }).click();
  await page.getByLabel('Generate an answer for each mode').check();
  await page.getByRole('button', { name: 'Compare four modes' }).click();
  await expect(page.locator('.comparison-card')).toHaveCount(4);
  await expect(page.locator('.comparison-answer')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/comparison.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('mobile layout keeps navigation and file actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your knowledge, within reach.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload documents', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-library.png', fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('switch workspaces, copy across them, and drag files to move or copy', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = (
    await (await request.post('/api/workspaces', { data: { name: 'Drag source' } })).json()
  ).id;
  const target = (
    await (await request.post('/api/workspaces', { data: { name: 'Drag target' } })).json()
  ).id;
  const prefix = `/api/workspaces/${source}`;
  const first = (
    await (
      await request.post(prefix + '/folders', { data: { parentId: 'root', name: 'First' } })
    ).json()
  ).id;
  const second = (
    await (
      await request.post(prefix + '/folders', { data: { parentId: 'root', name: 'Second' } })
    ).json()
  ).id;
  await request.post(prefix + '/upload', {
    multipart: {
      parentId: 'root',
      paths: JSON.stringify(['drag.txt']),
      files: {
        name: 'drag.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('A document for drag and drop.'),
      },
    },
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Active workspace' }).click();
  await page.getByTitle('Drag source', { exact: true }).click();
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'drag.txt', exact: true }) });
  const destination = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'First', exact: true }) });
  await row.dragTo(destination);
  await expect(page.getByRole('button', { name: 'drag.txt', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'First', exact: true }).click();
  await expect(page.getByRole('button', { name: 'drag.txt', exact: true })).toBeVisible();
  // A modifier drop copies into the sidebar target without removing the original.
  await page.keyboard.down('Alt');
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'drag.txt', exact: true }) })
    .dragTo(page.locator('.folder-drop-label').filter({ hasText: /^Second$/ }));
  await page.keyboard.up('Alt');
  await expect(page.getByRole('button', { name: 'drag.txt', exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const nodes = await (await request.get(prefix + '/nodes')).json();
      return nodes.filter((node: any) => node.parent_id === second && node.kind === 'file').length;
    })
    .toBe(1);
  await page.getByRole('button', { name: 'Actions for drag.txt' }).click();
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  await page.getByRole('combobox', { name: 'Active workspace' }).click();
  await page.getByTitle('Drag target', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'drag.txt', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'drag.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Items already exist' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep both', exact: true }).click();
  await expect(page.getByRole('button', { name: 'drag (copy).txt', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('workspace management and keyboard folder copy work through the UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create workspace' });
  await create.getByRole('textbox', { name: 'Workspace name' }).fill('Interface workspace');
  await create.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(
    page.locator('.workspace-switcher').getByText('Interface workspace', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByRole('textbox', { name: 'Item name' }).fill('Copy me');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create folder', exact: true })
    .click();
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Copy me', exact: true }) })
    .getByRole('checkbox')
    .check();
  await page.keyboard.press('Control+c');
  await expect(page.getByRole('button', { name: 'Paste', exact: true })).toBeVisible();
  await page.keyboard.press('Control+v');
  await page
    .getByRole('dialog', { name: 'Items already exist' })
    .getByRole('button', { name: 'Keep both' })
    .click();
  await expect(page.getByRole('button', { name: 'Copy me (copy)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workspace actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename workspace' }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Renamed interface workspace');
  await page
    .getByRole('dialog', { name: 'Rename workspace' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(
    page.locator('.workspace-switcher').getByText('Renamed interface workspace', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Workspace actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete workspace' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete workspace', exact: true })
    .click();
  await expect(
    page.locator('.workspace-switcher').getByText('Personal', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy me', exact: true })).toHaveCount(0);
});
