import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1366, height: 768 } });

test('full shift: pause, end shift, report from ledger, next shift, autosave survives reload', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366', 'один прогон достаточно');
  await page.goto('/');
  await expect(page.getByTestId('briefing')).toContainText('Смена 1');
  await page.getByTestId('start-shift').click();

  // время идёт и останавливается
  await page.getByTestId('toggle-pause').click();
  const t1 = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1500);
  expect(await page.getByTestId('clock').textContent()).toBe(t1);
  await page.getByTestId('toggle-pause').click();

  await page.getByTestId('incident-bioleak').getByRole('button', { name: 'Принять вызов' }).click();
  await expect(page.getByTestId('incident-bioleak')).toContainText('Принят');

  await page.getByTestId('end-shift').click();
  await page.getByTestId('confirm-end-shift').click();
  await expect(page.getByTestId('shift-report')).toContainText('Финансирование смены');
  await expect(page.getByTestId('closing-balance')).toHaveText('117 РЕ');
  await page.screenshot({ path: 'test-results/screens/w2-shift-report.png' });
  await page.getByTestId('next-shift').click();
  await expect(page.getByTestId('briefing')).toContainText('Смена 2');

  // автосохранение после смены: перезагрузка возвращает в смену 2 с той же кассой
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId('briefing')).toContainText('Смена 2');
  await expect(page.getByTestId('stat-budget')).toContainText('117');
});

test('manual slot save and load', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366', 'один прогон достаточно');
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('slot-slot1').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('slot-slot1')).toContainText('Смена 1');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.getByTestId('end-shift').click();
  await page.getByTestId('confirm-end-shift').click();
  await page.getByTestId('next-shift').click();
  await expect(page.getByTestId('briefing')).toContainText('Смена 2');
  await page.getByTestId('briefing-saves').click();
  await page.getByTestId('slot-slot1').getByRole('button', { name: 'Загрузить' }).click();
  await expect(page.getByTestId('clock')).toContainText('Смена 01');
  await expect(page.getByTestId('stat-budget')).toContainText('105');
});
