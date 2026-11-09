import { expect, test } from './fixtures';

// W6, часть 2: развитие (UI-08), модификации (UI-09), отношения (UI-11), история (UI-12).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-staff').click();
});

test('development: a course spends points and money, then shows in the service history', async ({ page }, info) => {
  await page.getByTestId('staff-tab-development').click();
  await page.getByTestId('person-p1').click();
  await expect(page.getByTestId('skill-points')).toHaveText('2 из 2');
  await expect(page.getByTestId('course-cmd2')).toBeDisabled();
  const course = page.getByTestId('course-cmd1');
  expect((await course.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/screens/w6b-development-${info.project.name}.png` });
  await course.click();
  await expect(page.getByTestId('skill-points')).toHaveText('1 из 2');
  await expect(page.getByTestId('development')).toContainText('идёт курс');
  await expect(page.getByTestId('promotion')).toContainText('Опыт');
  await page.getByTestId('staff-tab-history').click();
  await expect(page.getByTestId('history-list')).toContainText('направлен(а) на курс «Координация группы»');
  await page.screenshot({ path: `test-results/screens/w6b-history-${info.project.name}.png` });
});

test('modifications: incompatible organ is explained; installation goes to the clinic', async ({ page }, info) => {
  await page.getByTestId('staff-tab-mods').click();
  await page.getByTestId('person-p1').click();
  await expect(page.getByTestId('install-org_scent')).toBeDisabled();
  await expect(page.getByTestId('modifications')).toContainText('дублирует сенсорную линию Ловчих');
  await page.screenshot({ path: `test-results/screens/w6b-mods-${info.project.name}.png` });
  await page.getByTestId('person-p2').click();
  await page.getByTestId('install-org_dermal').click();
  await expect(page.getByTestId('modifications')).toContainText('Реабилитация');
  await page.getByTestId('staff-tab-medical').click();
  await expect(page.getByTestId('patient-p2')).toContainText('реабилитация');
});

test('relations: links with reasons from the journal and seeded history', async ({ page }, info) => {
  await page.getByTestId('staff-tab-relations').click();
  await page.getByTestId('group-toggle-vector').click();
  await page.getByTestId('person-p3').click();
  await expect(page.getByTestId('relations-table')).toContainText('Лика Орт');
  await expect(page.getByTestId('relations-table')).toContainText('конфликт');
  await expect(page.getByTestId('relations')).toContainText('спор о методах ведения допроса');
  await page.screenshot({ path: `test-results/screens/w6b-relations-${info.project.name}.png` });
});
