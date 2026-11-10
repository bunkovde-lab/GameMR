import { expect, test } from './fixtures';

// Кадры: сотрудники сгруппированы по составам в «Сводке» и в личных вкладках («Развитие» и др.).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-staff').click();
});

test('summary opens straight into the personal file; squads group the list; status sits on the portrait', async ({ page }, info) => {
  await expect(page.getByTestId('person-cabinet')).toBeVisible();
  const axon = page.getByTestId('pick-group-axon');
  await expect(axon).toContainText('«Аксон»');
  await expect(axon.locator('[data-testid^="person-"]')).toHaveCount(2);
  const face = page.getByTestId('person-p1').getByTestId('face-p1');
  await expect(face.locator('.sf-rank')).toHaveText('III');
  await expect(face.locator('.sf-fatigue')).toBeVisible();
  await expect(page.getByTestId('dossier').getByTestId('face-p1').locator('.sf-rank')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/groups-summary-${info.project.name}.png` });
});

test('development: squads fold and unfold by the arrow; touch-sized toggles', async ({ page }, info) => {
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
  await expect(page.getByTestId('dossier')).toContainText(await page.getByTestId('person-p4').locator('b').innerText());
  await page.screenshot({ path: `test-results/screens/groups-development-open-${info.project.name}.png` });
});
