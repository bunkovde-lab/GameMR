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


test('ordinary duty call follows a real case operation and supports patrol delegation', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366', 'Полный цикл на эталонном viewport; мобильный срез проверяется изменением размера ниже');
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByTestId('menu-sandbox').click();
  await openIncident(page, 'sandbox-1');
  await page.getByTestId('open-dispatch').click();
  await page.getByTestId('pick-axon').click();
  await page.getByTestId('tactic-recon').click();
  await page.getByTestId('confirm-dispatch').click();
  await page.getByRole('button', { name: '×4' }).click();
  for (let i = 0; i < 10 && !(await page.getByTestId('operation-report').count()); i++) {
    const decision = page.getByTestId('decision-dialog');
    if (await decision.count()) await decision.locator('[data-testid^="option-"]').first().click();
    else await page.waitForTimeout(500);
  }
  await expect(page.getByTestId('operation-report')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('ack-report').click();
  if (await page.getByTestId('toggle-pause').getAttribute('aria-label') === 'Продолжить') await page.getByTestId('toggle-pause').click();

  await expect(page.getByTestId('duty-badge-duty-2')).toBeVisible({ timeout: 40_000 });
  await openIncident(page, 'duty-2');
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('duty-brief')).toContainText('К расследованию не относится');
  await expect(page.getByTestId('duty-brief')).toContainText('Передать наряду');
  await expect(page.getByTestId('card-case-link')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screens/sandbox-duty-card-pc-1366.png' });

  await page.getByTestId('open-dispatch').click();
  await expect(page.getByTestId('dispatch-duty-brief')).toContainText('Чем опасно');
  await page.getByTestId('pick-axon').click();
  await expect(page.getByTestId('tactic-arrest')).toContainText('Осмотр и опрос свидетелей');
  await expect(page.getByTestId('tactic-suppression')).toContainText('Избыточно');
  await expect(page.getByTestId('legal-box')).toHaveCount(0);
  await page.getByTestId('tactic-arrest').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/screens/sandbox-duty-dispatch-pc-1366.png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByTestId('tactic-arrest').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('dispatch-dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screens/sandbox-duty-dispatch-phone-844.png' });
  await page.getByTestId('dispatch-dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByTestId('duty-brief')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screens/sandbox-duty-card-phone-844.png' });
  await page.getByTestId('delegate-duty').click();
  await expect(page.getByTestId('card-state')).not.toHaveText('Новый');
  expect(errors).toEqual([]);
});
