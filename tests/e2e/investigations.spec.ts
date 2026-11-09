import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

// W9 «Неисполненный жребий»: сохранения готовит настоящее ядро (setup/make-saves.ts), игра загружает их через импорт.

type Page = import('@playwright/test').Page;
const fixture = (name: string) => readFileSync(`test-results/fixtures/${name}.json`);

async function load(page: Page, name: string, openInvestigations = true) {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  await page.locator('input[type="file"]').setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: fixture(name) });
  await expect(page.getByTestId('settings')).toHaveCount(0);
  if (openInvestigations) await page.getByTestId('nav-investigations').click();
}
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `test-results/screens/w9-${name}-${project}.png` });
const tall = async (page: Page, testid: string) => expect((await page.getByTestId(testid).boundingBox())!.height).toBeGreaterThanOrEqual(44);

test('no case yet: the campaign tab explains which calls open cases', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-investigations').click();
  await expect(page.getByTestId('campaign-panel')).toContainText('Неисполненный жребий');
  await expect(page.getByTestId('campaign-cases')).toContainText('Пропажа регистратора');
  await expect(page.getByTestId('art-campaign_title')).toBeVisible();
});

test('board: links to versions, a comparison of two items, analysis by a chosen specialist', async ({ page }, info) => {
  await load(page, 'case_c1');
  await expect(page.getByTestId('case-tab-c1')).toContainText('№418');
  await expect(page.locator('[data-testid^="ev-e"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="hyp-h"]')).toHaveCount(4);
  await page.getByTestId('ev-e01').click();
  await tall(page, 'link-e01-h1b');
  await page.getByTestId('link-e01-h1b').click();
  await expect(page.getByTestId('link-e01-h1b')).toContainText('предложена');
  await page.getByTestId('pair-with-e02').click();
  await expect(page.getByTestId('pair-list')).toContainText('ждёт проверки');
  await page.getByTestId('analyst-p8').click();
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('ev-e01')).toContainText('в работе');
  if (/^(pc|tablet)/.test(info.project.name)) {
    await expect(page.locator('.board-lines path')).toHaveCount(1);
    await expect(page.locator('.board-lines line')).toHaveCount(1);
  }
  await page.getByTestId('board').scrollIntoViewIfNeeded();
  await shot(page, 'board', info.project.name);
});

test('actions: closed House records need a permit; the request costs a fee and waits for a decision', async ({ page }, info) => {
  await load(page, 'case_c1');
  await page.getByTestId('case-mode-actions').click();
  await expect(page.getByTestId('action-start-a_list')).toBeDisabled();
  await expect(page.getByTestId('permit-a_list')).toContainText('Дом Вельт');
  await page.getByTestId('permit-req-a_list').click();
  await expect(page.getByTestId('permit-a_list')).toContainText('рассматривается');
  await expect(page.getByTestId('action-a_search')).toContainText('✗ «Маршрут контейнера»');
  await page.getByTestId('actor-a_pay-p8').click();
  await expect(page.getByTestId('action-start-a_pay')).toBeEnabled();
  await shot(page, 'actions', info.project.name);
});

test('interrogation: questions open with evidence; presenting refers to specific items', async ({ page }, info) => {
  await load(page, 'case_c1');
  await page.getByTestId('case-mode-interviews').click();
  await expect(page.getByTestId('person-p1')).toContainText('Фигурант пока неизвестен');
  await expect(page.getByTestId('person-p3')).toContainText('найти человека');
  await page.getByTestId('interrogator-p9').click();
  await expect(page.getByTestId('ask-p2-l2')).toHaveCount(0); // нужна «Показания Бо Этты»
  await page.getByTestId('ask-p2-l1').click();
  await expect(page.getByTestId('person-p2')).toContainText('идёт допрос');
  await shot(page, 'interviews', info.project.name);
  await page.getByTestId('case-mode-conclusion').click();
  await expect(page.getByTestId('forecast').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('forecast')).not.toContainText('%');
  await expect(page.getByTestId('decide-charge_noris')).toBeDisabled();
  await expect(page.getByTestId('decide-discipline')).toBeDisabled(); // идёт допрос
  await shot(page, 'conclusion', info.project.name);
});

test('reconstruction: placing sources reveals a contradiction (forged valve log)', async ({ page }, info) => {
  await load(page, 'case_c3');
  await page.getByTestId('case-mode-timeline').click();
  await page.getByTestId('place-e01-1').click();
  await page.getByTestId('place-e05-2').click();
  await expect(page.getByTestId('conflicts')).toContainText('Журнал аварийных клапанов');
  await page.getByTestId('place-e04-0').click();
  await expect(page.getByTestId('slot-0')).toContainText('другое время');
  await page.getByTestId('timeline').scrollIntoViewIfNeeded();
  await shot(page, 'timeline', info.project.name);
});

test('linked cases: evidence of case №418 is pinned on the №431 board and can be compared', async ({ page }, info) => {
  await load(page, 'mid_c2');
  await page.getByTestId('case-tab-c2').click();
  await expect(page.getByTestId('ev-c1-e05')).toContainText('дело №418');
  await page.getByTestId('ev-e04').click();
  await page.getByTestId('pair-with-c1-e05').click();
  await expect(page.getByTestId('pair-list')).toContainText('связь подтверждена');
  await expect(page.getByTestId('pair-list')).toContainText('один подрядчик');
  await page.getByTestId('case-mode-actions').click();
  await expect(page.getByTestId('action-a_crosscheck')).toContainText('✓ «№418: Список отсрочек»');
  await shot(page, 'linked', info.project.name);
});

test('campaign: story decision at shift 6 and the special operation with phases and a report', async ({ page }, info) => {
  await load(page, 'mid_c2');
  await page.getByTestId('case-tab-campaign').click();
  await expect(page.getByTestId('story-card')).toContainText('Журнал за людей');
  await tall(page, 'story-choice-refuse');
  await page.getByTestId('story-choice-refuse').click();
  await expect(page.getByTestId('story-chosen')).toContainText('Никаких сделок');
  await shot(page, 'campaign', info.project.name);
  await page.getByTestId('op-start-op1').click();
  const dlg = page.getByTestId('special-op');
  await expect(dlg).toContainText('Подход');
  await expect(page.getByTestId('op-choice-cordon')).toBeDisabled(); // нет ордера
  await shot(page, 'special-op', info.project.name);
  for (const o of ['recon', 'talk', 'evacuate', 'leave']) await page.getByTestId(`op-choice-${o}`).click();
  const rep = page.getByTestId('special-op-report');
  await expect(rep).toContainText('Защитить пациентов');
  await shot(page, 'op-report', info.project.name);
  await page.getByTestId('ack-special-op').click();
  await expect(rep).toHaveCount(0);
  await expect(page.getByTestId('op-op1')).toContainText('Проведена');
});

test('ending: the end of shift 12 shows the campaign outcome before the shift report', async ({ page }, info) => {
  await load(page, 'ending', false);
  const e = page.getByTestId('ending');
  await expect(e).toContainText('Дирекция отстранена');
  await expect(page.getByTestId('ending-reasons')).toContainText('кризис');
  await shot(page, 'ending', info.project.name);
  await page.getByTestId('ack-ending').click();
  await expect(e).toHaveCount(0);
});

test('ART-010: board background, evidence frames and type icons are the delivered files', async ({ page }, info) => {
  await load(page, 'mid_c2');
  await page.getByTestId('case-tab-c2').click();
  const board = page.getByTestId('board');
  await expect(board).toHaveAttribute('style', /investigation_board_bg/);
  const icons = board.locator('img.ev-icon');
  await expect(icons.first()).toBeVisible();
  // Vite встраивает маленькие SVG как data:-адрес; проверяем, что картинка загрузилась и это именно SVG ART-010 (цвет #C9A46A).
  await expect.poll(() => icons.evaluateAll((xs) => xs.every((x) => (x as HTMLImageElement).complete && (x as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const srcs = await icons.evaluateAll((xs) => xs.map((x) => decodeURIComponent((x as HTMLImageElement).src)));
  for (const s of srcs) expect(s).toMatch(/C9A46A|\.svg/i);
  const card = board.locator('.evidence-card').first();
  const frame = () => card.evaluate((el) => getComputedStyle(el, '::before').borderImageSource);
  expect(await frame()).toMatch(/evidence_card_9s/);
  await page.getByText('Сохранение импортировано.').waitFor({ state: 'hidden' }).catch(() => {});
  await board.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/art010-board-${info.project.name}.png` });
  await card.click();
  expect(await frame()).toMatch(/evidence_card_selected_9s/);
  const box = (await card.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('ART-011: interrogation room background and faces of known persons; unknown persons stay faceless', async ({ page }, info) => {
  await load(page, 'mid_c2');
  await page.getByTestId('case-tab-c2').click();
  await page.getByTestId('case-mode-interviews').click();
  const room = page.getByTestId('interviews');
  await expect(room).toHaveAttribute('style', /interrogation_room_bg/);
  const imgs = room.locator('.person-card img');
  await expect(imgs.first()).toBeVisible();
  // Маленькие webp Vite встраивает как data:-адрес, поэтому проверяем число лиц: по одному на каждого известного фигуранта.
  const unknown = room.locator('.person-card', { hasText: 'Фигурант пока неизвестен' });
  const known = (await room.locator('.person-card').count()) - (await unknown.count());
  expect(known).toBeGreaterThan(0);
  await expect(imgs).toHaveCount(known);
  await expect.poll(() => imgs.evaluateAll((xs) => xs.every((x) => (x as HTMLImageElement).naturalWidth > 0))).toBe(true);
  for (let i = 0; i < (await unknown.count()); i++) await expect(unknown.nth(i).locator('img')).toHaveCount(0);
  await page.getByText('Сохранение импортировано.').waitFor({ state: 'hidden' }).catch(() => {});
  await page.screenshot({ path: `test-results/screens/art011-interviews-${info.project.name}.png` });
});

for (const op of ['op1', 'op2'] as const) {
  test(`ART-012: key art of ${op} fills the campaign thumbnail and the operation band`, async ({ page }, info) => {
    await load(page, op === 'op1' ? 'mid_c2' : 'op2_window');
    await page.getByTestId('case-tab-campaign').click();
    const thumb = page.locator(`[data-testid="op-${op}"] [data-art="${op}_key"]`);
    await expect(thumb).toHaveClass(/has-art/);
    await page.getByText('Сохранение импортировано.').waitFor({ state: 'hidden' }).catch(() => {});
    await thumb.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/screens/art012-${op}-campaign-${info.project.name}.png` });
    await page.getByTestId(`op-start-${op}`).click();
    const band = page.getByTestId('special-op').locator('.op-art');
    await expect(band).toHaveClass(/has-art/);
    await expect(band).toHaveAttribute('style', new RegExp(`${op}_key`));
    const box = (await band.boundingBox())!;
    // Полоса: на широком экране ≥ 180 px, на телефоне ≥ 90 px; картинка ложится по центру кадра (y 324–756 исходника).
    expect(box.height).toBeGreaterThanOrEqual(info.project.name === 'phone-844' ? 90 : 180);
    expect(await band.evaluate((el) => getComputedStyle(el).backgroundPositionY)).toBe('50%');
    await band.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/screens/art012-${op}-band-${info.project.name}.png` });
    if (info.project.name === 'pc-1920') {
      // Телефон вертикально: полоса не уже 90 px и без горизонтальной прокрутки.
      await page.setViewportSize({ width: 390, height: 844 });
      await band.scrollIntoViewIfNeeded();
      expect((await band.boundingBox())!.height).toBeGreaterThanOrEqual(90);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/screens/art012-${op}-band-portrait.png` });
    }
  });
}

for (const [fx, id, key] of [['case_c1', 'c1', 'case1_registry_office'], ['mid_c2', 'c2', 'case2_clinic'], ['case_c3', 'c3', 'case3_lab']] as const) {
  test(`ART-013: case header of ${id} shows the location ${key}`, async ({ page }, info) => {
    await load(page, fx);
    await page.getByTestId(`case-tab-${id}`).click();
    const head = page.getByTestId(`case-${id}`).locator(`header.case-head[data-art="${key}"]`);
    await expect(head).toHaveClass(/with-art/);
    await expect(head).toHaveAttribute('style', /url\(/);
    // Текст шапки читаем: слева затемнение 92 %, место — справа.
    expect((await head.boundingBox())!.height).toBeGreaterThanOrEqual(60);
    await page.getByText('Сохранение импортировано.').waitFor({ state: 'hidden' }).catch(() => {});
    await page.screenshot({ path: `test-results/screens/art013-${id}-${info.project.name}.png` });
    if (info.project.name === 'pc-1920') {
      await page.setViewportSize({ width: 390, height: 844 });
      await head.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/screens/art013-${id}-portrait.png` });
    }
  });
}

test('ART-014: campaign title art on the campaign tab', async ({ page }, info) => {
  await load(page, 'mid_c2');
  await page.getByTestId('case-tab-campaign').click();
  const t = page.getByTestId('art-campaign_title');
  await expect(t).toHaveClass(/has-art/);
  expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(info.project.name === 'phone-844' ? 90 : 150);
  await page.getByText('Сохранение импортировано.').waitFor({ state: 'hidden' }).catch(() => {});
  await page.screenshot({ path: `test-results/screens/art014-title-${info.project.name}.png` });
});

for (const id of ['order', 'cost', 'collapse'] as const) {
  test(`ART-014: ending ${id} shows its art band`, async ({ page }, info) => {
    await load(page, `ending_${id}`, false);
    const band = page.getByTestId('ending').locator(`[data-art="ending_${id}"]`);
    await expect(band).toHaveClass(/has-art/);
    expect((await band.boundingBox())!.height).toBeGreaterThanOrEqual(info.project.name === 'phone-844' ? 90 : 180);
    await page.screenshot({ path: `test-results/screens/art014-ending-${id}-${info.project.name}.png` });
    if (info.project.name === 'pc-1920') {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/screens/art014-ending-${id}-portrait.png` });
    }
  });
}
