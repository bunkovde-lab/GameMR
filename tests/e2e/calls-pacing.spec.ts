import { expect, test } from './fixtures';

test.use({ viewport: { width: 1366, height: 768 } });

// Со смены 2 вызовы приходят в течение дня; новый вызов ставит игру на паузу и сообщает об этом.
test('a call arriving during the shift pauses the game with a notice', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc-1366', 'один прогон достаточно');
  test.setTimeout(120_000);
  await page.clock.install();
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('end-shift').click();
  await page.getByTestId('confirm-end-shift').click();
  await page.getByTestId('next-shift').click();
  await expect(page.getByTestId('briefing')).toContainText('Смена 2');
  await page.getByTestId('start-shift').click();
  const pauseBtn = page.getByTestId('toggle-pause');
  // Ждём (в ускоренном времени) первый вызов дня: не позже 9 часов смены.
  await page.getByRole('button', { name: '×4' }).click();
  for (let i = 0; i < 150; i++) {
    await page.clock.runFor(1_000);
    // Развилки операций и отчёты закрываем «как игрок» (обработчики фикстуры срабатывают только на действиях).
    if (await page.getByTestId('decision-dialog').count()) await page.locator('[data-testid^="option-"]').first().dispatchEvent('click');
    if (await page.getByTestId('operation-report').count()) await page.getByTestId('ack-report').dispatchEvent('click');
    if ((await pauseBtn.getAttribute('aria-label')) === 'Продолжить') break;
  }
  await expect(pauseBtn).toHaveAttribute('aria-label', 'Продолжить');
  await expect(page.getByTestId('toast')).toContainText('Новый вызов');
  await expect(page.getByTestId('toast')).toContainText('Игра на паузе');
  await page.screenshot({ path: 'test-results/screens/calls-autopause-pc-1366.png' });
  const t1 = await page.getByTestId('clock').textContent();
  await page.clock.runFor(5_000);
  expect(await page.getByTestId('clock').textContent()).toBe(t1);
  await pauseBtn.click();
  await page.clock.runFor(5_000);
  expect(await page.getByTestId('clock').textContent()).not.toBe(t1);
});
