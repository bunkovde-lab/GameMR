import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

// Понятные расследования: вызовы дела выделены на карте, предыстория в карточке, страница «Как вести дело», «Следующий шаг».

type Page = import('@playwright/test').Page;
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `test-results/screens/case-guide-${name}-${project}.png` });

async function loadCase(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'case_c1.json', mimeType: 'application/json', buffer: readFileSync('test-results/fixtures/case_c1.json') });
  await expect(page.getByTestId('settings')).toHaveCount(0);
}

test('map: the call that opens case №418 carries a gold case label and its card tells the backstory', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('toggle-pause').click();
  const badge = page.locator('[data-testid^="case-badge-"]');
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText('№418');
  const marker = page.locator('.marker.incident.case-link');
  await marker.click();
  const card = page.getByTestId('card-case-link');
  await expect(card).toContainText('Дело №418');
  await expect(card).toContainText('Предыстория');
  await expect(card).toContainText('Сохранность улик');
  await shot(page, 'map-card', info.project.name);
});

test('first case: the help page opens once, then the next-step hint leads to the evidence', async ({ page }, info) => {
  await page.removeLocatorHandler(page.getByTestId('case-help'));
  await loadCase(page);
  await page.getByTestId('nav-investigations').click();
  const help = page.getByTestId('case-help');
  await expect(help).toBeVisible();
  await expect(help).toContainText('Дело не нужно раскрывать за одну смену');
  await shot(page, 'help', info.project.name);
  await page.getByTestId('case-help-close').click();
  await expect(help).toHaveCount(0);

  const guide = page.getByTestId('case-guide');
  await expect(guide).toContainText('Следующий шаг');
  await expect(page.getByTestId('case-next')).toContainText('Проверьте улику');
  await expect(page.getByTestId('training-progress')).toContainText('1 из 6');
  await page.getByTestId('case-mode-actions').click();
  await page.getByTestId('case-next-go').click();
  await expect(page.getByTestId('case-mode-board')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('evidence-panel')).toBeVisible();
  await page.getByTestId('case-guide').scrollIntoViewIfNeeded();
  await shot(page, 'next-step', info.project.name);

  // Повторно сама не открывается; по кнопке — открывается.
  await page.getByTestId('nav-map').click();
  await page.getByTestId('nav-investigations').click();
  await expect(help).toHaveCount(0);
  await page.getByTestId('case-help-open').click();
  await expect(help).toBeVisible();
});

test('training can be hidden and the case chronicle shows the backstory by shift', async ({ page }) => {
  await loadCase(page);
  await page.getByTestId('nav-investigations').click();
  await page.getByTestId('case-chronicle').locator('summary').click();
  await expect(page.getByTestId('case-chronicle')).toContainText('Смена 1. Вычеркнутый');
  await page.getByTestId('training-toggle').click();
  await expect(page.getByTestId('training-steps')).toHaveCount(0);
  await expect(page.getByTestId('case-next')).toBeVisible();
});
