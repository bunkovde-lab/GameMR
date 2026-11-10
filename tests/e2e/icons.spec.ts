import { expect, test } from './fixtures';

// ART-007: иконки интерфейса из единого набора арт-директора на всех основных экранах.

test('ART-007: sprite uses the 35 approved-style icons; screens render them', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('symbol[data-src="art007"]')).toHaveCount(35);
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('map-image')).toBeVisible();
  // Иконки в кнопках действительно рисуются (символ найден, у svg есть размер).
  const box = (await page.getByTestId('toggle-pause').locator('svg.icon').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(13);
  await page.screenshot({ path: `test-results/screens/art007-map-${info.project.name}.png` });
  for (const name of ['staff', 'directorate'] as const) {
    await page.getByTestId(`nav-${name}`).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/screens/art007-${name}-${info.project.name}.png` });
  }
  expect(errors).toEqual([]);
});
