import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// W3: утверждённая карта, районы, маркеры, маршрут и движение (docs/map/W3_ACCEPTANCE_TESTS.md).

async function start(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('map-image')).toBeVisible();
  await expect.poll(() => page.getByTestId('map-image').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2560);
  return errors;
}

/** Выбор вызова из списка — камера сама подводит метку в видимую зону. */
async function openIncident(page: Page, id: string) {
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId(`incident-${id}`).locator('.incident-title').click();
  await expect(page.getByTestId('incident-card')).toBeVisible();
}

/** Точка привязки метки: у щита ART-003/004 это его нижний кончик, у кружка — центр. */
async function centerOf(page: Page, testId: string) {
  const el = page.getByTestId(testId);
  const b = (await el.boundingBox())!;
  const shield = await el.evaluate((e) => e.classList.contains('shield') && !e.classList.contains('squad'));
  return { x: b.x + b.width / 2, y: b.y + b.height * (shield ? 0.97 : 0.5) };
}

test('ART-019: the whole city fits the free part of the map window without zooming or scrolling', async ({ page }, info) => {
  const errors = await start(page);
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  const img = (await page.getByTestId('map-image').boundingBox())!;
  expect(img.x).toBeGreaterThanOrEqual(stage.x - 1);
  expect(img.y).toBeGreaterThanOrEqual(stage.y - 1);
  expect(img.x + img.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
  expect(img.y + img.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  // карта занимает свободное место целиком по одной из сторон
  const left = (await page.getByTestId('left-panel').count()) ? await page.getByTestId('left-panel').boundingBox() : null;
  // на широком экране область карты закреплена между местами обеих панелей (открыты они или нет)
  const wide = info.project.name !== 'phone-844';
  const rightW = wide ? await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--right-w'))) : 0;
  const freeW = stage.width - (left && wide ? left.x + left.width - stage.x : 0) - rightW;
  expect(Math.max(img.width / freeW, img.height / stage.height)).toBeGreaterThan(0.97);
  if (left) expect(img.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
  // все вызовы видны без прокрутки
  for (const id of ['medriot', 'bioleak', 'raid', 'missing', 'illegal']) await expect(page.getByTestId(`marker-incident-${id}`)).toBeInViewport();
  await expect(page.getByTestId('map-life')).toBeAttached();
  await expect(page.getByTestId('map-ambient')).toBeVisible();
  expect(errors).toEqual([]);
});

test('MAP-CENTER: on a wide screen the city is pinned between the side panels — centred, never under the card, and it does not move when panels close', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-844', 'на телефоне панели выдвижные, поверх карты');
  const errors = await start(page);
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.locator('.squad').first().click();
  await expect(page.getByTestId('right-panel')).toBeVisible();
  const left = (await page.getByTestId('left-panel').boundingBox())!;
  const right = (await page.getByTestId('right-panel').boundingBox())!;
  await expect.poll(async () => (await page.getByTestId('map-image').boundingBox())!.x + (await page.getByTestId('map-image').boundingBox())!.width)
    .toBeLessThanOrEqual(right.x + 1);
  const img = (await page.getByTestId('map-image').boundingBox())!;
  expect(img.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
  // отступы слева и справа от карты одинаковые
  expect(Math.abs((img.x - (left.x + left.width)) - (right.x - (img.x + img.width)))).toBeLessThan(4);
  // кнопки слоёв не уходят под карточку справа
  const tools = (await page.locator('.layer-tools').boundingBox())!;
  expect(tools.x + tools.width).toBeLessThanOrEqual(right.x + 1);
  // карточку и панель вызовов закрыли — карта остаётся на месте и того же размера (область закреплена)
  await page.getByTestId('right-panel').getByRole('button', { name: /Закрыть/ }).click();
  await expect(page.getByTestId('right-panel')).toHaveCount(0);
  await page.getByTestId('left-panel').getByRole('button', { name: /Свернуть|Закрыть/ }).first().click();
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  await page.waitForTimeout(200);
  const after = (await page.getByTestId('map-image').boundingBox())!;
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - img[k])).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test('ART-019: night falls smoothly, weather, unrest and a patrol en route are drawn; effects can be turned down', async ({ page }, info) => {
  const errors = await start(page);
  await page.getByTestId('open-settings').click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'city_night.json', mimeType: 'application/json', buffer: readFileSync('test-results/fixtures/city_night.json') });
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.getByTestId('map-night')).toHaveAttribute('data-night', '1.00');
  await expect(page.getByTestId('map-ambient')).toContainText('Ночь');
  await expect(page.getByTestId('map-ambient')).toContainText('Неспокойно: 3');
  await page.getByTestId('toggle-pause').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `test-results/screens/art019-night-${info.project.name}.png` });

  await page.getByTestId('open-settings').click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'city_rain.json', mimeType: 'application/json', buffer: readFileSync('test-results/fixtures/city_rain.json') });
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.getByTestId('map-weather')).toBeVisible();
  await page.getByTestId('toggle-pause').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `test-results/screens/art019-rain-${info.project.name}.png` });

  await page.getByTestId('open-settings').click();
  await page.getByTestId('effects-off').click();
  await expect(page.getByTestId('effects-off')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByTestId('map-life')).toHaveAttribute('data-level', 'off');
  await page.reload();
  await expect(page.getByTestId('map-stage')).toBeVisible();
  if (await page.getByTestId('start-shift').isVisible()) await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('map-life')).toHaveAttribute('data-level', 'off');
  expect(errors).toEqual([]);
});

test('ART-019: the previous city art is the splash behind the briefing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('briefing')).toBeVisible();
  await expect(page.getByTestId('city-splash')).toBeVisible();
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('city-splash')).toHaveCount(0);
});

test('MAP-001/003: approved art is loaded at native size and markers are enabled', async ({ page }) => {
  const errors = await start(page);
  await expect(page.getByTestId('map-image')).toHaveJSProperty('naturalHeight', 1440);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('marker-incident-missing')).toBeVisible();
  expect(errors).toEqual([]);
});

test('MAP-006/007: district click opens the district card', async ({ page }) => {
  await start(page);
  await page.getByTestId('layer-districts').click();
  // Клик по подписи района проходит в полигон под ней (подпись не перехватывает указатель).
  await page.getByTestId('district-admin').dispatchEvent('click');
  await expect(page.getByTestId('district-card')).toHaveAttribute('data-district', 'admin');
});

test('MAP-008: marker and list select the same incident', async ({ page }) => {
  await start(page);
  await page.getByTestId('marker-incident-missing').click();
  await expect(page.getByTestId('incident-card')).toContainText('Пропажа регистратора');
  await expect(page.getByTestId('marker-incident-missing')).toHaveAttribute('aria-pressed', 'true');
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId('incident-bioleak').getByRole('button', { name: 'Утечка биоматериала' }).click();
  await expect(page.getByTestId('incident-card')).toContainText('Утечка биоматериала');
  await expect(page.getByTestId('marker-incident-bioleak')).toHaveAttribute('aria-pressed', 'true');
  // На телефоне камера могла увести прежнюю метку за край — тогда её просто нет.
  await expect(page.locator('[data-testid="marker-incident-missing"][aria-pressed="true"]')).toHaveCount(0);
});

test('MAP-012/013: zoom keeps the marker anchored to the same map point', async ({ page }) => {
  await start(page);
  const img = (await page.getByTestId('map-image').boundingBox())!;
  const rel = (p: { x: number; y: number }, b: typeof img) => ({ u: (p.x - b.x) / b.width, v: (p.y - b.y) / b.height });
  const before = rel(await centerOf(page, 'marker-incident-missing'), img);
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('camera-zoom')).toHaveText('1.56');
  const img2 = (await page.getByTestId('map-image').boundingBox())!;
  expect(img2.width).toBeGreaterThan(img.width * 1.5);
  if (await page.getByTestId('marker-incident-missing').isVisible()) {
    const after = rel(await centerOf(page, 'marker-incident-missing'), img2);
    expect(Math.abs(after.u - before.u)).toBeLessThan(0.003);
    expect(Math.abs(after.v - before.v)).toBeLessThan(0.003);
  }
  await page.getByTestId('zoom-reset').click();
  await expect(page.getByTestId('camera-zoom')).toHaveText('1.00');
});

test('MAP-014: dragging pans the map without selecting anything', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-844', 'проверяется на ПК и планшете');
  await start(page);
  // ART-019: при zoom 1 весь город на экране — сдвигать нечего; приближаем и тянем.
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-in').click();
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  const x0 = (await page.getByTestId('map-image').boundingBox())!.x;
  const cx = stage.x + stage.width * 0.55, cy = stage.y + stage.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy, { steps: 8 });
  await page.mouse.up();
  const x1 = (await page.getByTestId('map-image').boundingBox())!.x;
  expect(x1).toBeLessThan(x0 - 60);
  await expect(page.getByTestId('district-card')).toHaveCount(0);
});

test('MAP-017/019/020: dispatch shows route and ETA, pause freezes it, squad arrives', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366' && info.project.name !== 'phone-844', 'ПК и телефон');
  await start(page);
  await openIncident(page, 'medriot');
  await expect(page.getByTestId('marker-incident-medriot')).toBeInViewport();
  const option = page.getByTestId('dispatch-axon');
  await expect(option).toContainText('≈11 мин');
  await expect(option).toContainText('1,25 РЕ');
  await option.hover();
  await expect(page.getByTestId('route-preview')).toHaveCount(1);
  await option.click();
  await page.getByTestId('confirm-dispatch').click();
  await expect(page.getByTestId('dispatch-dialog')).toHaveCount(0);
  await expect(page.getByTestId('card-state')).toContainText('в пути');
  await expect(page.getByTestId('route-active')).toHaveCount(1);
  await expect(page.getByTestId('stat-budget')).toContainText('103,75');

  await page.getByTestId('toggle-pause').click();
  const eta = await page.getByTestId('card-eta').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('card-eta')).toHaveText(eta!);
  await page.getByTestId('toggle-pause').click();

  await page.getByRole('button', { name: '×4' }).click();
  await expect(page.getByTestId('card-state')).toContainText('на месте', { timeout: 15_000 });
  await expect(page.getByTestId('route-active')).toHaveCount(0);
  await page.screenshot({ path: `test-results/screens/w3-arrived-${info.project.name}.png` });
});

test('layers toggle independently and survive reload', async ({ page }) => {
  await start(page);
  await page.getByTestId('layer-patrols').click();
  await expect(page.getByTestId('marker-squad-axon')).toBeVisible();
  await page.getByTestId('layer-events').click();
  await expect(page.getByTestId('marker-incident-missing')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('map-stage')).toBeVisible();
  await expect(page.getByTestId('layer-events')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('layer-patrols')).toHaveAttribute('aria-pressed', 'true');
});

test('MAP-030: on a phone the card replaces the list instead of covering the map twice', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-844', 'только телефон');
  await start(page);
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  await page.getByTestId('marker-incident-missing').tap();
  await expect(page.getByTestId('incident-card')).toBeVisible();
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  const card = (await page.getByTestId('right-panel').boundingBox())!;
  expect(card.width).toBeLessThan(844 * 0.9);
});

test('W3 screenshots', async ({ page }, info) => {
  await start(page);
  await page.getByTestId('layer-districts').click();
  await openIncident(page, 'medriot');
  await page.getByTestId('dispatch-axon').hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `test-results/screens/w3-${info.project.name}.png` });
});

test('ART-003/004: map markers are the approved shields; list and legend use the small icons', async ({ page }, info) => {
  const errors = await start(page);
  const inc = page.getByTestId('marker-incident-missing');
  await expect(inc).toHaveClass(/shield/);
  await expect.poll(() => inc.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(128);
  // Кончик щита (низ по центру) — на точке вызова: нажатие возле кончика открывает тот же вызов.
  const b = (await inc.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.9);
  await expect(page.getByTestId('incident-card')).toBeVisible();
  await page.getByTestId('layer-patrols').click();
  const squad = page.getByTestId('marker-squad-axon');
  await expect(squad).toHaveClass(/shield/);
  await expect.poll(() => squad.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(128);
  // Сенсорная область не меньше 44 px по обеим сторонам.
  for (const el of [inc, squad]) {
    const b = (await el.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  // Значки 24×24 в легенде слоёв и в списке вызовов.
  await expect(page.getByTestId('layer-events').getByTestId('mk-icon-marker_cluster')).toBeVisible();
  await expect(page.getByTestId('layer-patrols').getByTestId('mk-icon-marker_squad_transport')).toBeVisible();
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await expect(page.getByTestId('incident-missing').getByTestId('mk-icon-marker_incident_search')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/art034-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
