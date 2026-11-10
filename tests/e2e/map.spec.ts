import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openIncident as openMarker, test } from './fixtures';

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

/** Выбор вызова меткой на карте (списка вызовов нет). */
async function openIncident(page: Page, id: string) {
  await openMarker(page, id);
  await expect(page.getByTestId('incident-card')).toBeVisible();
}

test('ART-019: the whole city fits the free part of the map window without zooming or scrolling', async ({ page }, info) => {
  const errors = await start(page);
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  const img = (await page.getByTestId('map-image').boundingBox())!;
  expect(img.x).toBeGreaterThanOrEqual(stage.x - 1);
  expect(img.y).toBeGreaterThanOrEqual(stage.y - 1);
  expect(img.x + img.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
  expect(img.y + img.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  // город вписан в окно карты целиком и прижат к его левому краю; пустых полос почти нет
  expect(Math.abs(img.x - stage.x)).toBeLessThan(2);
  expect(Math.max(img.width / stage.width, img.height / stage.height)).toBeGreaterThan(0.97);
  // ПК 16:9 и телефон лёжа: группы колонкой справа — окно карты почти 16:9, город заполняет его по обеим сторонам
  if (info.project.name !== 'tablet-1194') expect(Math.min(img.width / stage.width, img.height / stage.height)).toBeGreaterThan(0.9);
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  // все вызовы видны без прокрутки
  for (const id of ['medriot', 'bioleak', 'raid', 'missing', 'illegal']) {
    const where = page.locator(`[data-testid="marker-incident-${id}"], [data-testid="marker-cluster"][data-ids~="${id}"]`).first();
    await expect(where).toBeInViewport({ ratio: 0.9 });
  }
  await expect(page.getByTestId('map-life')).toBeAttached();
  await expect(page.getByTestId('map-ambient')).toBeVisible();
  expect(errors).toEqual([]);
});

test('MAP-CENTER: the city is pinned to the left edge and does not move when the card on the right opens or closes', async ({ page }) => {
  const errors = await start(page);
  const img = (await page.getByTestId('map-image').boundingBox())!;
  await page.locator('.squad-list .squad').first().click();
  await expect(page.getByTestId('right-panel')).toBeVisible();
  await page.waitForTimeout(200);
  const open = (await page.getByTestId('map-image').boundingBox())!;
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(open[k] - img[k])).toBeLessThan(1.5);
  await page.getByTestId('right-panel').getByRole('button', { name: /Закрыть/ }).click();
  await expect(page.getByTestId('right-panel')).toHaveCount(0);
  await page.waitForTimeout(200);
  const after = (await page.getByTestId('map-image').boundingBox())!;
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - img[k])).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test('calls list is gone: each call marker shows a timer, case calls also show the case number', async ({ page }, info) => {
  const errors = await start(page);
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Вызовы/ })).toHaveCount(0);
  await expect(page.getByTestId('incident-count')).toContainText('Вызовы: 5');
  // таймер — над щитом
  const marker = page.getByTestId('marker-incident-bioleak');
  const timer = page.getByTestId('timer-bioleak');
  await expect(timer).toHaveText(/\d+ мин/);
  const mb = (await marker.boundingBox())!, tb = (await timer.boundingBox())!;
  expect(tb.y + tb.height).toBeLessThanOrEqual(mb.y + 2);
  // вызов по делу: время и номер дела, золотое свечение
  const caseNo = page.locator('[data-testid^="case-badge-"]').first();
  await expect(caseNo).toHaveText(/^№\d+$/);
  await expect(caseNo.locator('xpath=..')).toHaveClass(/case/);
  await expect(page.locator('.marker.incident.case-link').first()).toBeVisible();
  // щит вызова вдвое крупнее прежнего (56/64 px; на телефоне — 64 px)
  const h = mb.height;
  if (info.project.name === 'phone-844') expect(h).toBeGreaterThanOrEqual(62);
  else expect(h).toBeGreaterThanOrEqual(110);
  await page.screenshot({ path: `test-results/screens/map-timers-${info.project.name}.png` });
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
  // Клик по подписи района проходит в полигон под ней (подпись не перехватывает указатель).
  await page.getByTestId('district-admin').dispatchEvent('click');
  await expect(page.getByTestId('district-card')).toHaveAttribute('data-district', 'admin');
});

test('MAP-008: markers select incidents; choosing another marker moves the selection', async ({ page }) => {
  await start(page);
  await page.getByTestId('marker-incident-missing').click();
  await expect(page.getByTestId('incident-card')).toContainText('Пропажа регистратора');
  await expect(page.getByTestId('marker-incident-missing')).toHaveAttribute('aria-pressed', 'true');
  await openMarker(page, 'bioleak');
  await expect(page.getByTestId('incident-card')).toContainText('Утечка биоматериала');
  // карточка ложится на колонку групп, а не на город: метка выбранного вызова не под ней
  const card = (await page.getByTestId('right-panel').boundingBox())!;
  const mk = (await page.getByTestId('marker-incident-bioleak').boundingBox())!;
  if (page.viewportSize()!.width / page.viewportSize()!.height >= 1.5) expect(mk.x + mk.width).toBeLessThanOrEqual(card.x + 1);
  await expect(page.getByTestId('marker-incident-bioleak')).toHaveAttribute('aria-pressed', 'true');
  // На телефоне камера могла увести прежнюю метку за край — тогда её просто нет.
  await expect(page.locator('[data-testid="marker-incident-missing"][aria-pressed="true"]')).toHaveCount(0);
});

test('MAP-012/014: the map is fixed — no zoom buttons; wheel, drag and pinch do not move it', async ({ page }, info) => {
  await start(page);
  await expect(page.getByTestId('zoom-in')).toHaveCount(0);
  await expect(page.getByTestId('zoom-out')).toHaveCount(0);
  await expect(page.getByTestId('zoom-reset')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Масштаб карты' })).toHaveCount(0);
  const img0 = (await page.getByTestId('map-image').boundingBox())!;
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  const cx = stage.x + stage.width * 0.55, cy = stage.y + stage.height * 0.5;
  if (info.project.name !== 'phone-844') {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy + 40, { steps: 8 });
    await page.mouse.up();
  } else {
    // щипок двумя пальцами: синтетические указатели на окне карты
    await page.getByTestId('map-stage').evaluate((el, [x, y]) => {
      const ev = (type: string, id: number, px: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: px, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
      ev('pointerdown', 1, x - 20); ev('pointerdown', 2, x + 20);
      for (let k = 1; k <= 8; k++) { ev('pointermove', 1, x - 20 - k * 10); ev('pointermove', 2, x + 20 + k * 10); }
      ev('pointerup', 1, x - 100); ev('pointerup', 2, x + 100);
    }, [cx, cy] as const);
  }
  await page.waitForTimeout(150);
  const img1 = (await page.getByTestId('map-image').boundingBox())!;
  expect(Math.abs(img1.x - img0.x)).toBeLessThan(1);
  expect(Math.abs(img1.y - img0.y)).toBeLessThan(1);
  expect(Math.abs(img1.width - img0.width)).toBeLessThan(1);
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

test('map has no layer buttons: events, patrols, districts and threats are always shown', async ({ page }) => {
  await start(page);
  await expect(page.locator('.layer-tools')).toHaveCount(0);
  await expect(page.locator('[data-testid^="layer-"]')).toHaveCount(0);
  await expect(page.getByTestId('marker-incident-missing')).toBeVisible();
  await expect(page.getByTestId('marker-squad-axon')).toBeVisible();
  await expect(page.getByTestId('district-label-admin')).toBeVisible();
  await expect(page.locator('.road')).toHaveCount(0);
  await expect(page.locator('.depot')).toHaveCount(0);
});

test('district: no border or fill; hover highlights the district name', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-844', 'наведение мышью — только ПК/планшет');
  await start(page);
  const hit = page.getByTestId('district-admin');
  const label = page.getByTestId('district-label-admin');
  await expect(label).not.toHaveClass(/hover/);
  // Наведение указателя на район (центр района может быть закрыт меткой вызова, поэтому событие — прямо в полигон).
  await hit.dispatchEvent('pointerover');
  await expect(label).toHaveClass(/hover/);
  const style = await hit.evaluate((el) => { const s = getComputedStyle(el); return { stroke: s.stroke, fill: s.fill }; });
  expect(style.stroke).toBe('none');
  expect(style.fill === 'transparent' || style.fill === 'rgba(0, 0, 0, 0)').toBe(true);
  await hit.dispatchEvent('click');
  await expect(label).toHaveClass(/selected/);
  await hit.dispatchEvent('pointerout');
  await expect(label).not.toHaveClass(/hover/);
  const sel = await hit.evaluate((el) => getComputedStyle(el).stroke);
  expect(sel).toBe('none');
  await page.screenshot({ path: `test-results/screens/district-hover-${info.project.name}.png` });
});

test('MAP-030: on a phone the card opens by tapping a marker and does not cover the whole screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-844', 'только телефон');
  await start(page);
  await page.getByTestId('marker-incident-missing').tap();
  await expect(page.getByTestId('incident-card')).toBeVisible();
  const card = (await page.getByTestId('right-panel').boundingBox())!;
  expect(card.width).toBeLessThan(844 * 0.9);
});

test('W3 screenshots', async ({ page }, info) => {
  await start(page);
  await openIncident(page, 'medriot');
  await page.getByTestId('dispatch-axon').hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `test-results/screens/w3-${info.project.name}.png` });
});

test('ART-003/004: map markers are the approved shields', async ({ page }, info) => {
  const errors = await start(page);
  const inc = page.getByTestId('marker-incident-missing');
  await expect(inc).toHaveClass(/shield/);
  await expect.poll(() => inc.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(128);
  // Кончик щита (низ по центру) — на точке вызова: нажатие возле кончика открывает тот же вызов.
  const b = (await inc.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.9);
  await expect(page.getByTestId('incident-card')).toBeVisible();
  const squad = page.getByTestId('marker-squad-axon');
  await expect(squad).toHaveClass(/shield/);
  await expect.poll(() => squad.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(128);
  // Сенсорная область не меньше 44 px по обеим сторонам.
  for (const el of [inc, squad]) {
    const b = (await el.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/screens/art034-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
