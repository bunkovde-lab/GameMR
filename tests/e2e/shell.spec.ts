import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByTestId('map-stage')).toBeVisible();
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('no page-level scroll in landscape viewports', async ({ page }) => {
  const size = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(size.sw).toBeLessThanOrEqual(size.w);
  expect(size.sh).toBeLessThanOrEqual(size.h);
});

test('every visible button is at least 44×44 CSS px', async ({ page }) => {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => ({ b, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
      .map(({ b, r }) => `${b.getAttribute('aria-label') ?? b.textContent}: ${r.width}×${r.height}`),
  );
  expect(small).toEqual([]);
});

test('collapsing the incident panel does not resize the map area', async ({ page }) => {
  const before = await page.getByTestId('map-stage').boundingBox();
  await page.getByLabel('Свернуть список вызовов').click();
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  const after = await page.getByTestId('map-stage').boundingBox();
  expect(after).toEqual(before);
});

test('keyboard: Tab reaches navigation, Enter opens a section, Escape returns', async ({ page }) => {
  const staff = page.getByTestId('nav-staff');
  for (let i = 0; i < 20 && !(await staff.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(staff).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('staff-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('staff-screen')).toHaveCount(0);
  await expect(page.getByTestId('left-panel')).toBeVisible();
});

test('screenshot', async ({ page }, info) => {
  await page.screenshot({ path: `test-results/screens/${info.project.name}.png` });
});
