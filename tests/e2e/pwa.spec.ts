import { expect, test } from './fixtures';

// W10: установка на главный экран (PWA) и запуск без сети после первого открытия.

test('the game can be installed: manifest with name and icons, service worker active', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'pc-1920', 'одной конфигурации достаточно');
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.name).toContain('Право на порядок');
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const i of m.icons) expect((await request.get(i.src.startsWith('/') ? i.src : `/${i.src}`)).ok()).toBe(true);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});

test('after the first visit the game starts without network and keeps the autosave', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'pc-1920', 'одной конфигурации достаточно');
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // страница теперь под управлением service worker, файлы сборки в кэше
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByTestId('briefing')).toHaveCount(0); // автосохранение из IndexedDB: смена уже идёт
  await context.setOffline(false);
});
