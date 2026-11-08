import { expect, test } from './fixtures';

// W7, часть 1: Дирекция — обзор (UI-15), финансы (UI-16), инфраструктура (UI-17).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
  await page.getByTestId('nav-directorate').click();
});

test('infrastructure: queuing an upgrade reserves money without spending it', async ({ page }, info) => {
  await expect(page.getByTestId('dir-overview')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/w7-overview-${info.project.name}.png` });
  await page.getByTestId('dir-tab-finance').click();
  const freeBefore = await page.getByTestId('fin-free').textContent();
  await expect(page.getByTestId('fin-reserved')).toHaveText('0 РЕ');
  await page.getByTestId('dir-tab-infra').click();
  await expect(page.getByTestId('facility-detention')).toContainText('W9');
  const up = page.getByTestId('upgrade-medical');
  expect((await up.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await up.click();
  await expect(page.getByTestId('build-queue')).toContainText('Медицинский блок → ур. 2');
  await page.getByTestId('upgrade-training').click();
  await expect(page.getByTestId('build-queue')).toContainText('ждёт бригаду');
  await page.getByTestId('prio-training').click();
  await expect(page.getByTestId('build-queue').locator('li').first()).toContainText('Учебный центр');
  await page.screenshot({ path: `test-results/screens/w7-infra-${info.project.name}.png` });
  await page.getByTestId('dir-tab-finance').click();
  await expect(page.getByTestId('fin-reserved')).toHaveText('−27 РЕ');
  expect(await page.getByTestId('fin-free').textContent()).not.toBe(freeBefore);
  await expect(page.getByTestId('hud')).toContainText('105');
  await page.screenshot({ path: `test-results/screens/w7-finance-${info.project.name}.png` });
});
