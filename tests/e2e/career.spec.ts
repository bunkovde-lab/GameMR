import { expect, test } from './fixtures';

// W6, часть 2: развитие (UI-08), модификации (UI-09), отношения (UI-11), история (UI-12).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-staff').click();
});

test('development: clicking an open skill icon starts the course; the tooltip shows the price', async ({ page }, info) => {
  await expect(page.getByTestId('person-cabinet')).toBeVisible();
  await expect(page.getByTestId('skill-points')).toHaveText('2 из 2');
  const locked = page.getByTestId('course-cmd2');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await locked.hover();
  await expect(page.locator('#tip-cmd2')).toContainText('Сначала «Координация группы»');
  await locked.click({ force: true });
  await expect(page.getByTestId('skill-points')).toHaveText('2 из 2');
  const course = page.getByTestId('course-cmd1');
  expect((await course.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await course.hover();
  await expect(page.locator('#tip-cmd1')).toContainText('Курс: 1 оч. навыка · 3 РЕ · 1 смен.');
  await expect(page.locator('#tip-cmd1')).toContainText('начать курс');
  await page.screenshot({ path: `test-results/screens/cabinet-tooltip-${info.project.name}.png` });
  await course.click();
  await expect(page.getByTestId('skill-points')).toHaveText('1 из 2');
  await expect(page.getByTestId('development')).toContainText('Идёт курс «Координация группы»');
  await expect(page.getByTestId('promotion')).toContainText('опыт');
  await expect(page.getByTestId('history-list')).toContainText('направлен(а) на курс «Координация группы»');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `test-results/screens/cabinet-${info.project.name}.png` });
});

test('touch: first tap shows the description, second tap starts the course', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('pc'), 'сенсорные разрешения');
  const course = page.getByTestId('course-op1');
  await course.tap();
  await expect(page.locator('#tip-op1')).toBeVisible();
  await expect(page.locator('#tip-op1')).toContainText('Нажмите ещё раз');
  await expect(page.getByTestId('skill-points')).toHaveText('2 из 2');
  await page.screenshot({ path: `test-results/screens/cabinet-touch-tip-${info.project.name}.png` });
  await course.tap();
  await expect(page.getByTestId('skill-points')).toHaveText('1 из 2');
});

test('modifications: incompatible organ is explained; installation goes to the clinic', async ({ page }, info) => {
  await expect(page.getByTestId('install-org_scent')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('modifications')).toContainText('дублирует сенсорную линию Ловчих');
  await page.getByTestId('modifications').screenshot({ path: `test-results/screens/cabinet-mods-${info.project.name}.png` });
  await page.getByTestId('person-p2').click();
  await page.getByTestId('install-org_dermal').hover();
  await expect(page.locator('#tip-org_dermal')).toContainText('Установка: 16 РЕ');
  await page.getByTestId('install-org_dermal').click();
  await expect(page.getByTestId('modifications')).toContainText('Реабилитация');
  await page.getByTestId('staff-tab-medical').click();
  await expect(page.getByTestId('patient-p2')).toContainText('реабилитация');
});

test('relations: links with reasons from seeded history; a colleague opens on click', async ({ page }, info) => {
  await page.getByTestId('group-toggle-vector').click();
  await page.getByTestId('person-p3').click();
  await expect(page.getByTestId('relations-table')).toContainText('Лика Орт');
  await expect(page.getByTestId('relations-table')).toContainText('конфликт');
  await expect(page.getByTestId('relations')).toContainText('спор о методах ведения допроса');
  await page.getByTestId('relations').screenshot({ path: `test-results/screens/cabinet-relations-${info.project.name}.png` });
  const first = page.getByTestId('relations-table').locator('[data-testid^="rel-open-"]').first();
  const other = (await first.getAttribute('data-testid'))!.replace('rel-open-', '');
  await first.click();
  await expect(page.getByTestId('person-' + other)).toHaveAttribute('aria-pressed', 'true');
});
