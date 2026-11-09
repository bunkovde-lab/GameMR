import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

// W10: карта без наложения меток (MAP-05) и телефон в портретном положении.

test('map markers never overlap; three calls in one spot form a cluster that expands on tap', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'cluster.json', mimeType: 'application/json', buffer: readFileSync('test-results/fixtures/cluster.json') });
  await expect(page.getByTestId('settings')).toHaveCount(0);
  const cluster = page.getByTestId('marker-cluster');
  await expect(cluster).toHaveCount(1);
  await expect(cluster).toContainText('3');
  const box = (await cluster.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/screens/w10-cluster-${info.project.name}.png` });
  await cluster.click();
  await expect(cluster).toHaveCount(0);
  const boxes = await page.locator('[data-testid^="marker-incident-"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.x + r.width / 2, r.y + r.height / 2]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    expect(Math.hypot(boxes[i]![0]! - boxes[j]![0]!, boxes[i]![1]! - boxes[j]![1]!)).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/screens/w10-cluster-open-${info.project.name}.png` });
  await page.getByTestId('cluster-collapse').click();
  await expect(page.getByTestId('marker-cluster')).toHaveCount(1);
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
  test('no sideways scroll; briefing, map, sections and dialogs fit the screen', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc-1920', 'проверка одного портретного размера');
    await page.goto('/');
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(await fits()).toBe(true);
    await page.getByTestId('start-shift').click();
    expect(await fits()).toBe(true);
    for (const v of ['investigations', 'staff', 'directorate']) {
      await page.getByTestId(`nav-${v}`).click();
      expect(await fits()).toBe(true);
      await page.screenshot({ path: `test-results/screens/w10-portrait-${v}.png` });
    }
    await page.getByTestId('open-settings').click();
    expect(await fits()).toBe(true);
    const r = (await page.getByTestId('settings').boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(391);
  });
});
