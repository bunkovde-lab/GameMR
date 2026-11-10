import { expect, test } from './fixtures';

// ART-021: рисованные значки нижней панели и кнопки «Сохранения».

test('ART-021: nav buttons and the saves button show painted medallions; Directorate keeps its crest', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  const buttons = ['nav-map', 'nav-staff', 'nav-investigations', 'nav-directorate', 'end-shift', 'open-settings'];
  for (const testId of buttons) {
    const src = testId === 'nav-directorate' ? 'closest' : 'art021';
    const img = page.getByTestId(testId).locator(`img.nav-art[data-src="${src}"]`);
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth >= 96)).toBe(true);
    expect((await img.boundingBox())!.width).toBeGreaterThanOrEqual(24);
    await expect(page.getByTestId(testId).locator('svg.icon')).toHaveCount(0);
  }
  // Сенсорное нажатие на рисованный значок открывает раздел (картинка не перехватывает касание).
  await page.getByTestId('nav-directorate').tap().catch(() => page.getByTestId('nav-directorate').click());
  await expect(page.getByTestId('directorate-screen')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/art021-nav-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
