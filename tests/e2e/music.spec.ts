import { expect, test } from './fixtures';

type Snap = { audible: string | null; scene: string | null; waitingForGesture: boolean; settings: { volume: number; muted: boolean } };
const snap = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __gamemrMusic: { getSnapshot(): Snap } }).__gamemrMusic.getSnapshot());

test('AUDIO v1: тема меню на брифинге, фон игры на смене, плавный переход и настройки', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('briefing')).toBeVisible();
  expect((await snap(page)).scene).toBe('menu');

  // Первое действие игрока разрешает звук (ограничение автозапуска браузеров).
  await page.mouse.click(5, 5);
  await expect.poll(async () => (await snap(page)).audible, { timeout: 8000 }).toBe('menu');

  await page.getByTestId('start-shift').click();
  await expect.poll(async () => (await snap(page)).audible, { timeout: 8000 }).toBe('game');

  // Окно сохранений и настроек — это «меню».
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('music-settings')).toBeVisible();
  await expect.poll(async () => (await snap(page)).audible, { timeout: 8000 }).toBe('menu');

  await page.getByTestId('music-volume').fill('30');
  await expect(page.getByTestId('music-settings')).toContainText('Громкость 30%');
  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveText('Выключена');
  await expect(page.getByTestId('music-volume')).toBeDisabled();
  await expect.poll(async () => (await snap(page)).audible, { timeout: 4000 }).toBe(null);

  // Настройки переживают перезагрузку.
  await page.reload();
  await expect(page.getByTestId('hud')).toBeVisible();
  expect((await snap(page)).settings).toEqual({ volume: 0.3, muted: true });
  expect(errors).toEqual([]);
});

test('AUDIO v1: MP3 из сборки реально воспроизводится в браузере', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(5, 5);
  // Проверяем, что элемент <audio> реально воспроизводит (время трека идёт).
  const played = () => page.evaluate(() => {
    const m = (window as unknown as { __gamemrMusic: { tracks: Map<string, { voices: { el: HTMLAudioElement }[] }> } }).__gamemrMusic;
    const els = [...m.tracks.values()].flatMap((t) => t.voices.map((v) => v.el));
    return els.some((e) => e.currentTime > 0.5 && e.duration > 200 && !e.error);
  });
  await expect.poll(played, { timeout: 15000 }).toBe(true);
});
