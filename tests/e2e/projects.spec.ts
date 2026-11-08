import { expect, test } from './fixtures';

// W7, часть 2: Дирекция — Проекты (UI-18).

test('projects: start with a protocol and a researcher; locked projects explain why', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-directorate').click();
  await page.getByTestId('dir-tab-projects').click();
  await expect(page.getByTestId('project-porog')).toContainText('Нужно завершить');
  await expect(page.getByTestId('reagents')).toHaveText('4 / 12');
  await page.getByTestId('plan-forecast_model').click();
  await page.getByTestId('proto-forecast_model-experimental').click();
  await expect(page.getByTestId('start-form-forecast_model')).toContainText('Риск провала');
  await page.screenshot({ path: `test-results/screens/w7b-start-${info.project.name}.png` });
  const btn = page.getByTestId('start-forecast_model');
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  await expect(page.getByTestId('project-forecast_model')).toContainText('идёт');
  await expect(page.getByTestId('cells')).toHaveText('1 / 1');
  await page.screenshot({ path: `test-results/screens/w7b-projects-${info.project.name}.png` });
});
