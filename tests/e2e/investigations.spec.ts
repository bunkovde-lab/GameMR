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
  await expect(page.getByTestId('permit-a_list')).toContainText('Второй Дом');
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
