import { test, expect } from '@playwright/test';

test('practice saves responses, checks an attempt, and opens curated resources without fetching them', async ({
  page,
  request,
}) => {
  const workspace = await (
    await request.post('/api/workspaces', { data: { name: 'Practice browser test' } })
  ).json();
  await page.addInitScript((id) => localStorage.setItem('grove-workspace', id), workspace.id);
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => {
    if (req.url().includes('hanlun')) remoteRequests.push(req.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Maths practice' });
  await drawer.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(drawer.getByRole('img', { name: /^Graph / })).toHaveCount(4);
  await expect(drawer.getByRole('button', { name: 'Check answers' })).toBeDisabled();
  for (const label of ['A', 'B', 'C', 'D']) {
    const answer = drawer.getByRole('combobox', { name: `Equation for graph ${label}` });
    await expect(answer).toBeEnabled();
    await answer.click();
    await answer.press('ArrowDown');
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/draft') && response.request().method() === 'PUT',
    );
    await answer.press('Enter');
    await saved;
    await expect(drawer.getByRole('status', { name: 'Exercise save status' })).toHaveText(
      'Answers saved in this workspace',
    );
  }
  await drawer.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(drawer.getByText('First identify the shape:', { exact: false })).toBeVisible();
  await drawer.getByRole('button', { name: 'Expand practice to fullscreen' }).click();
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.width))
    .toBe(page.viewportSize()!.width);
  const state = await request.get(`/api/workspaces/${workspace.id}/learning/sessions`);
  const id = (await state.json())[0].id;
  const draft = await (
    await request.get(`/api/workspaces/${workspace.id}/learning/sessions/${id}`)
  ).json();
  expect(Object.keys(draft.responses)).toHaveLength(4);
  expect(draft.feedback).toBeNull();
  expect(draft.answer_key).toBeUndefined();
  await page.reload();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Check answers' })).toBeEnabled();
  await drawer.getByRole('button', { name: 'Check answers' }).click();
  await expect(drawer.getByText(/of 4 correct/)).toBeVisible();
  await expect(drawer.locator('.graph-feedback')).toHaveCount(4);
  await expect(drawer.getByRole('button', { name: 'Check answers' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/graph-practice.png' });
  await drawer.getByRole('tab', { name: 'Linked resources' }).click();
  await drawer.getByRole('searchbox', { name: 'Find linked resources' }).fill('CP02');
  await expect(drawer.locator('.linked-resource')).toHaveCount(3);
  const link = drawer.getByRole('link', { name: 'Open Graph activities on Hanlun' });
  await expect(link).toHaveAttribute(
    'href',
    'https://www.hanlunelr.com/content/Maths_Shirley_M23/lesson_1b.html',
  );
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(drawer.getByText('CP02 · Candidate mapping')).toHaveCount(3);
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('practice is usable on a narrow screen and keeps its footer visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Maths practice' });
  await drawer.getByRole('button', { name: 'New set', exact: true }).click();
  await expect(drawer.getByRole('slider', { name: 'x coordinate for graph A' })).toBeVisible();
  await drawer.getByRole('slider', { name: 'x coordinate for graph A' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(drawer.getByRole('slider', { name: 'x coordinate for graph A' })).toHaveValue(
    '0.25',
  );
  await drawer.getByRole('combobox', { name: 'Equation for graph D' }).scrollIntoViewIfNeeded();
  await expect(drawer.getByRole('button', { name: 'Check answers' })).toBeInViewport();
  expect(await drawer.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/graph-practice-mobile.png' });
});
