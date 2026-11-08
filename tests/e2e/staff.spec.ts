import { expect, test } from './fixtures';

// W6, часть 1: штат и назначения, медицина, найм (ТЗ UI-10, UI-13, UI-14).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
});

test('roster: commander, transfer to reserve and back', async ({ page }, info) => {
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('staff-tab-roster').click();
  const roster = page.getByTestId('roster');
  await expect(roster).toBeVisible();
  await expect(page.getByTestId('deficit')).toContainText('Вакансии');
  const axon = page.getByTestId('roster-axon');
  const second = axon.locator('[data-testid^="make-cmd-"]').nth(1);
  const id = (await second.getAttribute('data-testid'))!.replace('make-cmd-', '');
  const box = (await second.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await second.click();
  await expect(axon).toContainText('командир');
  await expect(second).toBeDisabled();
  await page.screenshot({ path: `test-results/screens/w6-roster-${info.project.name}.png` });
  await page.getByTestId(`to-reserve-${id}`).click();
  await expect(page.getByTestId('roster-reserve')).toContainText('1 чел.');
  await page.getByTestId(`assign-${id}-axon`).click();
  await expect(page.getByTestId('roster-reserve')).toContainText('0 чел.');
});

test('medical: capacity and an empty ward at start', async ({ page }, info) => {
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('staff-tab-medical').click();
  await expect(page.getByTestId('beds')).toHaveText('0 / 2');
  await expect(page.getByTestId('no-injured')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/w6-medical-${info.project.name}.png` });
});

test('hiring: deep check is paid and pending, hiring fills the vacancy', async ({ page }, info) => {
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('staff-tab-hiring').click();
  const hiring = page.getByTestId('hiring');
  await expect(hiring).toContainText('биокриминалист (1)', { ignoreCase: true });
  const cards = hiring.locator('[data-testid^="candidate-"]');
  await expect(cards).toHaveCount(3);
  const first = cards.first();
  const cid = (await first.getAttribute('data-testid'))!.replace('candidate-', '');
  await expect(page.getByTestId(`fit-${cid}`)).not.toBeEmpty();
  await page.screenshot({ path: `test-results/screens/w6-hiring-${info.project.name}.png` });
  await page.getByTestId(`check-${cid}`).click();
  await expect(page.getByTestId(`check-${cid}`)).toBeDisabled();
  await page.getByTestId(`hire-${cid}`).click();
  await expect(hiring).toContainText('Вакансии: нет');
  await page.getByTestId('staff-tab-summary').click();
  await expect(page.getByTestId('staff-p13')).toContainText('адаптация');
});
