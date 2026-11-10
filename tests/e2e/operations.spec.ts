import { expect, test as base } from '@playwright/test';

// Проверки начинают сразу с игры, минуя главное меню (оно проверяется в menu.spec.ts).
const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => { (window as unknown as { __GAMEMR_SKIP_MENU__: boolean }).__GAMEMR_SKIP_MENU__ = true; });
    await provide(page);
  },
});

// W5: развилки особого события, отчёт операции, итоги в отчёте смены (ТЗ §2.2 DECISION_PAUSE, §6.1, §12).

test('special operation: three orders with time stopped, then the operation report', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByRole('button', { name: '×4' }).click();
  const decision = page.getByTestId('decision-dialog');
  await expect(decision).toBeVisible({ timeout: 10_000 });
  await expect(decision).toContainText('Подход: Склад реагентов');
  await expect(decision).toContainText('этап 1 из 3');
  const t1 = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1500);
  expect(await page.getByTestId('clock').textContent()).toBe(t1);
  await page.screenshot({ path: `test-results/screens/w5-decision-${info.project.name}.png` });
  const box = (await page.getByTestId('option-observe').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.getByTestId('option-observe').click();
  await expect(decision).toContainText('Контакт', { timeout: 10_000 });
  await page.getByTestId('option-hold').click();
  await expect(decision).toContainText('Кризис', { timeout: 10_000 });
  await page.getByTestId('option-secure').click();
  const report = page.getByTestId('operation-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await expect(report).toContainText('Вооружённая вылазка');
  await expect(page.getByTestId('report-outcome')).toHaveText(/Успех|Частичный успех|Провал/);
  await expect(report).toContainText('Сохранность улик');
  await page.screenshot({ path: `test-results/screens/w5-report-${info.project.name}.png` });
  await page.getByTestId('ack-report').click();
  await expect(report).toHaveCount(0);
  await expect(page.getByTestId('squad-vector')).toContainText(/Возвращается|Готов|Отдых|Недоступен/);
});

test('routine dispatch resolves by itself; staff and shift report show the consequences', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366' && info.project.name !== 'tablet-1194', 'ПК и планшет');
  await page.addLocatorHandler(page.getByTestId('decision-dialog'), async () => {
    await page.locator('[data-testid^="option-"]').first().click();
  });
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('incident-missing').locator('.incident-title').click();
  await page.getByTestId('dispatch-axon').click();
  await page.getByTestId('confirm-dispatch').click();
  await page.getByTestId('toggle-pause').click();
  await page.getByRole('button', { name: '×4' }).click();
  const report = page.getByTestId('operation-report');
  for (let i = 0; i < 3; i++) {
    await expect(report).toBeVisible({ timeout: 20_000 });
    if ((await report.textContent())!.includes('Пропажа регистратора')) break;
    await page.getByTestId('ack-report').click();
  }
  await expect(report).toContainText('Пропажа регистратора');
  await expect(report).toContainText('Цель операции');
  await page.getByTestId('ack-report').click();
  // Время идёт на ×4: отчёт другого отряда (демо-«Вектор» уже на месте) может всплыть поверх следующих окон.
  await page.addLocatorHandler(report, async () => { await page.getByTestId('ack-report').click(); });
  await page.getByTestId('nav-staff').click();
  await expect(page.getByTestId('face-p1').first()).toContainText(/здоров|ранение|погиб/);
  await page.keyboard.press('Escape');
  await page.getByTestId('end-shift').click();
  await page.getByTestId('confirm-end-shift').click();
  await expect(page.getByTestId('report-ops')).toHaveText(/^\d+ \/ \d+ \/ \d+$/);
});
