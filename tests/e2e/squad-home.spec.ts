import { expect, test } from './fixtures';

// Постоянный состав: после курса (лечения, органа…) сотрудник сам возвращается в свой отряд.

test('course: the person waits with a note and comes back to the same squad next shift', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('course-cmd1').click();
  await expect(page.getByTestId('development')).toContainText('Идёт курс');
  await page.getByTestId('staff-tab-roster').click();
  await expect(page.getByTestId('roster-away-axon')).toContainText('на обучении');
  await expect(page.getByTestId('roster-reserve')).toContainText('Вернётся в отряд «Аксон»');
  await page.getByTestId('roster-away-axon').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/squad-home-away-${info.project.name}.png` });

  await page.getByTestId('end-shift').click();
  await page.getByTestId('confirm-end-shift').click();
  await page.getByTestId('next-shift').click();
  await page.getByTestId('start-shift').click();
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('staff-tab-roster').click();
  await expect(page.getByTestId('roster-away-axon')).toHaveCount(0);
  await expect(page.getByTestId('roster-axon').locator('[data-testid^="make-cmd-"]')).toHaveCount(2);
  await expect(page.getByTestId('roster-reserve')).not.toContainText('Вернётся');
  await page.screenshot({ path: `test-results/screens/squad-home-back-${info.project.name}.png` });
});
