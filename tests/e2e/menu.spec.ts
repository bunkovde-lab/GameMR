import type { Page } from '@playwright/test';
import { expect, testWithMenu as test } from './fixtures';

// M00-B: главное меню «Наблюдательный рубеж» — кнопки, сохранения, атмосфера, производительность.

type Stats = { fps: number; quality: number; storms: number; running: boolean; flash: number };
const fx = async (page: Page) => {
  await page.getByTestId('main-menu').waitFor();
  return page.evaluate(() => (window as unknown as { __gamemrMenuFx: { stats(): Stats } }).__gamemrMenuFx.stats());
};
const lightning = (page: Page) => page.evaluate(() => (window as unknown as { __gamemrMenuFx: { triggerLightning(): boolean } }).__gamemrMenuFx.triggerLightning());
const press = async (page: Page, testId: string, touch: boolean) => (touch ? page.getByTestId(testId).tap() : page.getByTestId(testId).click());

/** Записать в автосохранение произвольные данные (имитация повреждённого слота). */
const corruptAuto = (page: Page) => page.evaluate(() => new Promise<void>((resolve, reject) => {
  const req = indexedDB.open('gamemr', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('saves');
  req.onsuccess = () => {
    const t = req.result.transaction('saves', 'readwrite');
    t.objectStore('saves').put({ format: 'gamemr-save', schemaVersion: 1, savedAt: 'x', label: 'x', state: { broken: true } }, 'auto');
    t.oncomplete = () => { req.result.close(); resolve(); };
    t.onerror = () => reject(t.error);
  };
}));

test('первый запуск: меню M00-B, шесть живых кнопок, «Продолжить» неактивно, HUD скрыт', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const menu = page.getByTestId('main-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('hud')).toHaveCount(0);
  await expect(page.locator('.m00b-btn .m00b-label')).toHaveText(['Продолжить', 'Новая игра', 'Песочница', 'Настройки', 'Авторы', 'Выход']);
  await expect(page.getByTestId('menu-continue')).toBeDisabled();
  await expect(page.getByTestId('menu-continue')).toContainText('Сохранённой игры нет');

  // Читаемые зоны касания, ничего не выходит за экран, нет горизонтальной прокрутки
  const vp = page.viewportSize()!;
  for (const id of ['continue', 'new', 'sandbox', 'settings', 'credits', 'exit']) {
    const b = (await page.getByTestId(`menu-${id}`).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Логотип и меню — слева, правая часть кадра (панорама) свободна
  const nav = (await page.locator('.m00b-menu').boundingBox())!;
  expect(nav.x + nav.width).toBeLessThan(vp.width * 0.5);

  // Атмосфера работает
  await expect.poll(async () => (await fx(page)).fps, { timeout: 5000 }).toBeGreaterThan(20);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/screens/menu-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('клавиатура: стрелки, Enter, Escape; «Авторы» и «Выход»', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('menu-new')).toBeFocused(); // первый доступный пункт
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('menu-sandbox')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('menu-settings')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('menu-credits-dialog')).toContainText('github.com/bunkovde-lab/GameMR');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-credits-dialog')).toHaveCount(0);
  await page.keyboard.press('End');
  await expect(page.getByTestId('menu-exit')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // по кругу, неактивное «Продолжить» пропускается
  await expect(page.getByTestId('menu-new')).toBeFocused();
  await page.getByTestId('menu-exit').click();
  await expect(page.getByTestId('menu-farewell')).toContainText('Можете закрыть вкладку');
  await page.getByTestId('farewell-back').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});

test('новая игра → смена → в меню время стоит → перезагрузка → «Продолжить» ту же смену', async ({ page }, info) => {
  const touch = info.project.use.hasTouch === true;
  await page.goto('/');
  await press(page, 'menu-new', touch);
  await expect(page.getByTestId('briefing')).toBeVisible();
  await page.getByTestId('start-shift').click(); // автосохранение
  await page.waitForTimeout(1200);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('to-main-menu').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('menu-continue')).toBeEnabled();
  await expect(page.getByTestId('menu-continue')).toContainText('Смена 1');
  await press(page, 'menu-continue', touch);
  const clock = await page.getByTestId('clock').textContent();
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Продолжить'); // смена на паузе
  await page.getByTestId('open-settings').click();
  await page.getByTestId('to-main-menu').click();
  await page.waitForTimeout(2500); // время в меню не идёт
  await press(page, 'menu-continue', touch);
  expect(await page.getByTestId('clock').textContent()).toBe(clock);

  // Перезагрузка: снова меню, «Продолжить» доступно из автосохранения
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('menu-continue')).toBeEnabled();
  await press(page, 'menu-continue', touch);
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('briefing')).toHaveCount(0); // та же смена идёт, а не новый брифинг
});

test('«Новая игра» поверх кампании: подтверждение, автосохранение перезаписано, ручной слот цел', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-new').click();
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('slot-slot1').getByRole('button', { name: 'Сохранить' }).click();
  await page.getByTestId('to-main-menu').click();

  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('menu-confirm-new')).toContainText('Автосохранение кампании будет перезаписано');
  await page.getByTestId('confirm-new-game').click();
  await expect(page.getByTestId('briefing')).toBeVisible();

  await page.reload();
  await page.getByTestId('menu-continue').click();
  await expect(page.getByTestId('briefing')).toBeVisible(); // новая кампания, а не прежняя смена

  // Ручной слот остался и загружается из настроек меню
  await page.reload();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('menu-tab-saves').click();
  await expect(page.getByTestId('slot-slot1')).toContainText('Смена 1');
  await page.getByTestId('slot-slot1').getByRole('button', { name: 'Загрузить' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('briefing')).toHaveCount(0); // та же смена идёт, а не новый брифинг
});

test('повреждённое автосохранение: меню не падает, «Продолжить» неактивно с причиной', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await corruptAuto(page);
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('menu-continue')).toBeDisabled();
  await expect(page.getByTestId('menu-continue')).toContainText('Автосохранение повреждено');
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('briefing')).toBeVisible();
  expect(errors).toEqual([]);
});

test('атмосфера: молния 1–2 вспышки и гаснет; «Отключить вспышки» и «Снизить движение» сохраняются', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await fx(page)).running).toBe(true);
  const before = (await fx(page)).storms;
  expect(await lightning(page)).toBe(true);
  await expect.poll(async () => (await fx(page)).flash, { timeout: 1000, intervals: [16, 16, 16, 16, 16] }).toBeGreaterThan(0);
  await expect.poll(async () => (await fx(page)).flash, { timeout: 2000 }).toBe(0);
  expect((await fx(page)).storms).toBe(before + 1);

  await page.getByTestId('menu-settings').click();
  await page.getByTestId('menu-tab-video').click();
  await page.getByTestId('fx-no-flashes').check();
  await page.getByTestId('fx-reduce-motion').check();
  expect(await lightning(page)).toBe(false);
  await page.reload();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('menu-tab-video').click();
  await expect(page.getByTestId('fx-no-flashes')).toBeChecked();
  await expect(page.getByTestId('fx-reduce-motion')).toBeChecked();
  await expect(page.getByTestId('main-menu')).toHaveClass(/reduce-motion/);
  expect(await lightning(page)).toBe(false);
});

test('производительность: плавно на ПК даже без видеокарты, эффекты останавливаются при уходе в игру', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('pc'), 'замер на ПК');
  await page.goto('/');
  // Браузер тестов рисует без видеокарты (программно) — это заметно медленнее любого реального устройства.
  // и параллельно идут другие тесты. Поэтому порог здесь 24 кадра/с; качество эффектов само снижается, композиция не меняется.
  await page.waitForTimeout(4000);
  const fps = await page.evaluate(() => new Promise<number>((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  expect(fps).toBeGreaterThanOrEqual(24);
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('briefing')).toBeVisible();
  expect(await page.evaluate(() => 'undefined' === typeof (window as unknown as { __gamemrMenuFx?: unknown }).__gamemrMenuFx)).toBe(true);
});

test('музыка: в главном меню звучит тема меню', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('main-menu').waitFor();
  const scene = () => page.evaluate(() => (window as unknown as { __gamemrMusic: { getSnapshot(): { scene: string | null } } }).__gamemrMusic.getSnapshot().scene);
  expect(await scene()).toBe('menu');
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('music-settings')).toBeVisible();
});
