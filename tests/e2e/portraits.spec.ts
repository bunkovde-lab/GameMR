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
  await page.locator('.person-head').screenshot({ path: `test-results/screens/art005-head-${info.project.name}.png` });
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

test('ART-009: candidates show their portrait; a hired candidate keeps the same face', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-844', 'ПК и планшет');
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('staff-tab-hiring').click();
  const first = page.getByTestId('hiring').locator('[data-testid^="candidate-"]').first();
  const img = first.locator('.portrait.lg img');
  await expect.poll(() => loaded(img)).toBe(true);
  const name = (await first.locator('header b').textContent())!;
  await page.screenshot({ path: `test-results/screens/art009-hiring-${info.project.name}.png` });
  const cid = (await first.getAttribute('data-testid'))!.replace('candidate-', '');
  await page.getByTestId(`hire-${cid}`).click();
  await page.getByTestId('staff-tab-summary').click();
  const face = page.locator('.staff-table').getByTestId('portrait-p13').locator('img');
  await face.scrollIntoViewIfNeeded();
  await expect.poll(() => loaded(face)).toBe(true);
  // Портрет привязан к имени из пула: нанятый — тот же человек, лицо не заменено монограммой.
  await expect(page.getByTestId('staff-p13')).toContainText(name);
  await expect(page.locator('.staff-table').getByTestId('portrait-p13').locator('.portrait-initials')).toHaveCount(0);
  await page.getByTestId('staff-tab-roster').click();
  await page.screenshot({ path: `test-results/screens/art009-hired-${info.project.name}.png` });
});
