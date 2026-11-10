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
  await page.getByTestId('open-p1').click();
  await expect(page.getByTestId('person-cabinet')).toBeVisible();
  await expect(page.getByTestId('skill-points')).toHaveText('2 из 2');
  await page.getByTestId('skill-cmd2').click();
  await expect(page.getByTestId('course-cmd2')).toBeDisabled();
  await expect(page.getByTestId('skill-detail')).toContainText('Сначала «Координация группы»');
  await page.getByTestId('skill-cmd1').click();
  const course = page.getByTestId('course-cmd1');
  expect((await course.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/screens/w6b-development-${info.project.name}.png` });
  await course.click();
  await expect(page.getByTestId('skill-points')).toHaveText('1 из 2');
  await expect(page.getByTestId('development')).toContainText('идёт курс');
  await expect(page.getByTestId('promotion')).toContainText('Опыт');
  await page.getByTestId('cab-tab-history').click();
  await expect(page.getByTestId('history-list')).toContainText('направлен(а) на курс «Координация группы»');
  await page.screenshot({ path: `test-results/screens/w6b-history-${info.project.name}.png` });
});

test('modifications: incompatible organ is explained; installation goes to the clinic', async ({ page }, info) => {
  await page.getByTestId('open-p1').click();
  await page.getByTestId('cab-tab-mods').click();
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
  await page.getByTestId('open-p3').click();
  await page.getByTestId('cab-tab-relations').click();
  await expect(page.getByTestId('relations-table')).toContainText('Лика Орт');
  await expect(page.getByTestId('relations-table')).toContainText('конфликт');
  await expect(page.getByTestId('relations')).toContainText('спор о методах ведения допроса');
  await page.screenshot({ path: `test-results/screens/w6b-relations-${info.project.name}.png` });
});

test('cabinet: skill icons explain themselves on hover (PC) or tap (touch); relations open a colleague', async ({ page }, info) => {
  await page.getByTestId('open-p1').click();
  const node = page.getByTestId('skill-op2');
  expect((await node.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (info.project.name.startsWith('pc')) {
    await node.hover();
    await expect(page.locator('#tip-op2')).toBeVisible();
    await expect(page.locator('#tip-op2')).toContainText('Разведка');
    await page.screenshot({ path: `test-results/screens/cabinet-tooltip-${info.project.name}.png` });
  }
  await node.click();
  await expect(page.getByTestId('skill-detail')).toContainText('Скрытый подход');
  await expect(page.getByTestId('skill-detail')).toContainText('Что даёт');
  await page.screenshot({ path: `test-results/screens/cabinet-development-${info.project.name}.png` });
  await page.getByTestId('cab-tab-relations').click();
  const first = page.getByTestId('relations-table').locator('[data-testid^="rel-open-"]').first();
  const other = (await first.getAttribute('data-testid'))!.replace('rel-open-', '');
  await first.click();
  await expect(page.getByTestId('person-' + other)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `test-results/screens/cabinet-relations-${info.project.name}.png` });
  await page.getByTestId('cabinet-back').click();
  await expect(page.getByTestId('person-cabinet')).toHaveCount(0);
});
