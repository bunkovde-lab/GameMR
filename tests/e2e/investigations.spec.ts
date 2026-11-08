import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

// W9: расследования (ТЗ §11). Дело готовит настоящее ядро (setup/make-saves.ts), игра загружает его через импорт сохранения.

const saveWithCase = () => readFileSync('test-results/fixtures/case_c1.json');

async function loadCase(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'case.json', mimeType: 'application/json', buffer: saveWithCase() });
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await page.getByTestId('nav-investigations').click();
}

test('no case yet: the section explains which calls open cases', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-investigations').click();
  await expect(page.getByTestId('no-cases-yet')).toContainText('Пропажа регистратора');
});

test('board: evidence, links drawn by the player, analysis by a chosen specialist', async ({ page }, info) => {
  await loadCase(page);
  await expect(page.getByTestId('case-tab-c1')).toContainText('№418');
  await expect(page.locator('[data-testid^="ev-e"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="hyp-h"]')).toHaveCount(4);
  await page.getByTestId('ev-e1').click();
  const link = page.getByTestId('link-e1-h1');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(link).toContainText('предложена');
  await page.getByTestId('ev-e5').click();
  await page.getByTestId('link-e5-h3').click();
  await page.getByTestId('analyst-p7').click();
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('ev-e5')).toContainText('в работе');
  if (info.project.name.startsWith('pc') || info.project.name.startsWith('tablet')) await expect(page.locator('.board-lines path')).toHaveCount(2);
  await page.getByTestId('ev-e5').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/w9-board-${info.project.name}.png` });
  await page.getByTestId('evidence-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/w9-evidence-${info.project.name}.png` });
});

test('reconstruction: the player places sources and finds a contradiction', async ({ page }, info) => {
  await loadCase(page);
  await page.getByTestId('case-mode-timeline').click();
  await page.getByTestId('place-e2-1').click();
  await page.getByTestId('place-e4-3').click();
  await expect(page.getByTestId('conflicts')).toContainText('Прощальная записка');
  await page.getByTestId('place-e3-0').click();
  await expect(page.getByTestId('slot-0')).toContainText('другое время');
  await page.getByTestId('timeline').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/w9-timeline-${info.project.name}.png` });
});

test('interrogation and conclusion: methods with consequences, the legal decision needs grounds', async ({ page }, info) => {
  await loadCase(page);
  await page.getByTestId('case-mode-interviews').click();
  await expect(page.getByTestId('person-p2')).toContainText('Неизвестный фигурант');
  await page.getByTestId('interrogator-p9').click();
  await expect(page.getByTestId('ask-p1-pressure')).toBeEnabled();
  await page.getByTestId('ask-p1-standard').click();
  await expect(page.getByTestId('person-p1')).toContainText('идёт допрос');
  await page.screenshot({ path: `test-results/screens/w9-interviews-${info.project.name}.png` });
  await page.getByTestId('case-mode-conclusion').click();
  await expect(page.getByTestId('forecast').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('forecast')).not.toContainText('%');
  await expect(page.getByTestId('decide-charge')).toBeDisabled();
  await expect(page.getByTestId('decide-close')).toBeDisabled(); // идёт допрос
  await page.screenshot({ path: `test-results/screens/w9-conclusion-${info.project.name}.png` });
});
