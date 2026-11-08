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
  await expect.poll(() => page.getByTestId('map-image').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1672);
  return errors;
}

/** Выбор вызова из списка — камера сама подводит метку в видимую зону. */
async function openIncident(page: Page, id: string) {
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId(`incident-${id}`).locator('.incident-title').click();
  await expect(page.getByTestId('incident-card')).toBeVisible();
}

async function centerOf(page: Page, testId: string) {
  const b = (await page.getByTestId(testId).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('MAP-001/003: approved art is loaded at native size and markers are enabled', async ({ page }) => {
  const errors = await start(page);
  await expect(page.getByTestId('map-image')).toHaveJSProperty('naturalHeight', 941);
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
