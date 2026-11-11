import { expect, testWithMenu as test, openIncident } from './fixtures';

test('sandbox entry, locked district, manual/auto pause and responsive map', async ({ page }, info) => {
  const errors: string[] = [];
  const missing: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto('/');
  await page.getByTestId('menu-sandbox').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('sandbox-dock')).toContainText('№418');
  await expect(page.getByTestId('end-shift')).toHaveCount(0);
  await expect(page.locator('[data-locked="true"]')).not.toHaveCount(0);
  await page.screenshot({ path: `test-results/screens/sandbox-map-${info.project.name}.png` });

  await page.getByTestId('nav-investigations').click();
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Продолжить');
  const stopped = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(500);
  expect(await page.getByTestId('clock').textContent()).toBe(stopped);
  await page.getByRole('button', { name: 'Вернуться к карте' }).click();
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Пауза');

  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-investigations').click();
  await page.getByRole('button', { name: 'Вернуться к карте' }).click();
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Продолжить');
  await page.getByTestId('toggle-pause').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});

test('real case operation opens the investigation and sandbox save survives reload', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366', 'Полный оперативный цикл на одном эталонном viewport');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('menu-sandbox').click();
  await openIncident(page, 'sandbox-1');
  await expect(page.getByTestId('sandbox-event-brief')).toContainText('Цель выезда');
  await page.getByTestId('open-dispatch').click();
  await expect(page.getByTestId('dispatch-sandbox-goal')).toContainText('Тактику ниже выбираете отдельно');
  await page.getByTestId('pick-axon').click();
  await page.getByTestId('tactic-recon').click(); // сохранение улик без судебного ордера на арест
  await page.screenshot({ path: 'test-results/screens/sandbox-dispatch-pc-1366.png' });
  await page.getByTestId('confirm-dispatch').click();
  await page.getByRole('button', { name: '×4' }).click();

  for (let i = 0; i < 8 && !(await page.getByTestId('operation-report').count()); i++) {
    const decision = page.getByTestId('decision-dialog');
    if (await decision.count()) await decision.locator('[data-testid^="option-"]').first().click();
    else await page.waitForTimeout(500);
  }
  const report = page.getByTestId('operation-report');
  await expect(report).toBeVisible({ timeout: 20_000 });
  await expect(report).toContainText('Пропажа регистратора');
  await page.getByTestId('ack-report').click();
  await page.getByTestId('nav-investigations').click();
  if (await page.getByTestId('case-help-close').count()) await page.getByTestId('case-help-close').click();
  await expect(page.getByTestId('case-c1')).toBeVisible();
  await expect(page.getByTestId('sandbox-case-summary')).toContainText('Что произошло');
  await page.screenshot({ path: 'test-results/screens/sandbox-case-pc-1366.png' });

  await page.getByTestId('open-settings').click();
  await page.getByTestId('slot-sandbox-slot1').getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('slot-sandbox-slot1')).toContainText('Минута');
  await page.getByTestId('to-main-menu').click();
  await page.reload();
  await expect(page.getByTestId('menu-sandbox')).toContainText('Сохранённый сценарий');
  await page.getByTestId('menu-sandbox').click();
  await page.getByTestId('nav-investigations').click();
  if (await page.getByTestId('case-help-close').count()) await page.getByTestId('case-help-close').click();
  await expect(page.getByTestId('case-c1')).toBeVisible();
  expect(errors).toEqual([]);
});
