import { expect, test } from './fixtures';

// Кадры: сотрудники сгруппированы по составам в «Сводке» и в личных вкладках («Развитие» и др.).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-staff').click();
});

test('summary: every squad is a framed block with its name; members sit inside', async ({ page }, info) => {
  const axon = page.getByTestId('summary-group-axon');
  await expect(axon.locator('.group-head')).toContainText('Состав «Аксон»');
  await expect(axon.locator('.group-head')).toContainText('Готов');
  await expect(axon.getByTestId('staff-p1')).toBeVisible();
  await expect(axon.getByTestId('staff-p2')).toBeVisible();
  await expect(axon.locator('[data-testid^="staff-p"]')).toHaveCount(2);
  await expect(page.getByTestId('summary-group-vector').getByTestId('staff-p3')).toBeVisible();
  await expect(page.getByTestId('summary-group-reserve')).toContainText('Резерв');
  await expect(page.getByTestId('staff-screen').locator('.group-head')).toHaveCount(7);
  await page.screenshot({ path: `test-results/screens/groups-summary-${info.project.name}.png` });
});

test('development: squads fold and unfold by the arrow; touch-sized toggles', async ({ page }, info) => {
  await page.getByTestId('staff-tab-development').click();
  const toggle = page.getByTestId('group-toggle-axon');
  // состав выбранного сотрудника раскрыт, остальные свёрнуты
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('group-toggle-vector')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('person-p3')).toHaveCount(0);
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/screens/groups-development-${info.project.name}.png` });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('person-p1')).toHaveCount(0);
  await expect(toggle).toContainText('выбран');

  await page.getByTestId('group-toggle-vector').click();
  await expect(page.getByTestId('pick-group-vector').locator('[data-testid^="person-"]')).toHaveCount(2);
  await page.getByTestId('person-p4').click();
  await expect(page.locator('.person-head')).toContainText(await page.getByTestId('person-p4').locator('b').innerText());
  await page.screenshot({ path: `test-results/screens/groups-development-open-${info.project.name}.png` });
});
