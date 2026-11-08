import { expect, test } from './fixtures';

// ART-005: утверждённые портреты в «Кадрах», окне отправки и отчёте.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
});

const loaded = (img: import('@playwright/test').Locator) =>
  img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);

test('staff: every starting employee shows a loaded portrait; dossier has a large one', async ({ page }, info) => {
  await page.getByTestId('nav-staff').click();
  const table = page.locator('.staff-table');
  for (let i = 1; i <= 12; i++) {
    const img = table.getByTestId(`portrait-p${i}`).locator('img');
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => loaded(img)).toBe(true);
  }
  await page.screenshot({ path: `test-results/screens/art005-summary-${info.project.name}.png` });
  await page.getByTestId('staff-tab-roster').click();
  await expect(page.getByTestId('roster').locator('.portrait.sm').first()).toBeVisible();
  await page.screenshot({ path: `test-results/screens/art005-roster-${info.project.name}.png` });
  await page.getByTestId('staff-tab-history').click();
  await page.getByTestId('person-p9').click();
  const big = page.locator('.person-head').getByTestId('portrait-p9');
  await expect(big.locator('img')).toHaveAttribute('alt', 'Портрет: Сели Ренн');
  await expect.poll(() => loaded(big.locator('img'))).toBe(true);
  expect((await page.getByTestId('person-p9').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/screens/art005-dossier-${info.project.name}.png` });
});

test('dispatch: member buttons carry portraits and keep a 44 px touch target', async ({ page }, info) => {
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId('incident-bioleak').locator('.incident-title').click();
  await page.getByTestId('open-dispatch').click();
  await page.getByTestId('pick-axon').click();
  await page.getByTestId('mode-manual').click();
  const btn = page.locator('[data-testid^="member-"]').first();
  await btn.scrollIntoViewIfNeeded();
  await expect(btn.locator('.portrait img')).toBeVisible();
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/screens/art005-dispatch-${info.project.name}.png` });
});
