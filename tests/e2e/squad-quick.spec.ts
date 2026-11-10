import { expect, test } from './fixtures';

// Карточка «Отряд» на карте: сводка и быстрые действия (в резерв, замена, добавление, командир).

test('squad card: summary, to reserve, swap from reserve, add back, commander', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('squad-axon').click();
  const card = page.getByTestId('squad-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('squad-summary')).toBeVisible();
  await expect(page.getByTestId('squad-fit')).toHaveText('2/2');
  await expect(page.getByTestId('squad-stats').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('sq-swap-p1')).toBeDisabled(); // резерв пуст
  await page.screenshot({ path: `test-results/screens/squad-quick-${info.project.name}.png` });

  await page.getByTestId('sq-reserve-p2').click();
  await expect(page.getByTestId('sq-member-p2')).toHaveCount(0);
  await expect(page.getByTestId('squad-warnings')).toContainText('Свободных мест: 2');

  await page.getByTestId('sq-swap-p1').click();
  await expect(page.getByTestId('sq-swap-list-p1')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/squad-quick-swap-${info.project.name}.png` });
  await page.getByTestId('sq-swap-list-p1-p2').click();
  await expect(page.getByTestId('sq-member-p2')).toBeVisible();
  await expect(page.getByTestId('sq-member-p1')).toHaveCount(0);

  await page.getByTestId('sq-add').click();
  await page.getByTestId('sq-add-list-p1').click();
  await expect(page.getByTestId('sq-member-p1')).toBeVisible();
  await expect(page.getByTestId('sq-cmd-p1')).toBeDisabled(); // старший по рангу — командир по умолчанию
  await page.getByTestId('sq-cmd-p2').click();
  await expect(page.getByTestId('sq-member-p2')).toContainText('командир');
  await expect(page.getByTestId('sq-cmd-p2')).toBeDisabled();
  await expect(page.getByTestId('sq-cmd-p1')).toBeEnabled();
});

test('deployed squad: management is locked until return', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('squad-vector').click();
  await expect(page.getByTestId('squad-card')).toContainText('после возвращения');
  await expect(page.getByTestId('sq-reserve-p3')).toBeDisabled();
});
