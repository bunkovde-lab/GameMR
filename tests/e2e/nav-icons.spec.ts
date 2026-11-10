import { expect, test } from './fixtures';

// ART-021: значки нижней панели и кнопки «Сохранения». Пока нет рисованных — «Дирекция» показывает герб Дирекции.

test('ART-021: nav buttons and saves button show icons; Directorate uses the approved crest', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  const crest = page.getByTestId('nav-directorate').locator('img.nav-art');
  await expect(crest).toBeVisible();
  expect(await crest.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  for (const id of ['map', 'staff', 'investigations', 'directorate'] as const) {
    const box = (await page.getByTestId(`nav-${id}`).locator('img.nav-art, svg.icon').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(16);
  }
  await expect(page.getByTestId('end-shift').locator('img.nav-art, svg.icon')).toHaveCount(1);
  await expect(page.getByTestId('open-settings').locator('img.nav-art, svg.icon')).toHaveCount(1);
  // Сенсорное нажатие на рисованный значок открывает раздел (картинка не перехватывает касание).
  await page.getByTestId('nav-directorate').tap().catch(() => page.getByTestId('nav-directorate').click());
  await expect(page.getByTestId('directorate-screen')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/art021-nav-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
