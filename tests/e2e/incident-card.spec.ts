import type { Page } from '@playwright/test';
import { expect, openIncident as openMarker, test } from './fixtures';

// ART-023: иллюстрация, значки «что на кону» и штамп итога в карточке происшествия.

async function openIncident(page: Page, id: string) {
  await openMarker(page, id);
  await expect(page.getByTestId('incident-card')).toBeVisible();
}

test('ART-023: карточка показывает иллюстрацию и значки категорий', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await openIncident(page, 'bioleak');
  const hero = page.getByTestId('inc-hero');
  await expect(hero).toHaveAttribute('data-art', 'scene_sci_breakin');
  await expect(hero).toHaveClass(/has-art/);
  const box = (await hero.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(80); // на телефоне полоса ниже (3:1), на ПК 2:1
  // Картинка не вылезает за карточку.
  const panel = (await page.getByTestId('right-panel').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  await expect(page.locator('[data-testid="aftermath-list"] li[data-cat="people"] .aft-ico.mk-icon')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/incident-card-${info.project.name}.png` });

  await openIncident(page, 'missing');
  await expect(page.getByTestId('inc-hero')).toHaveAttribute('data-art', 'inc_type_search');
  await expect(page.getByTestId('inc-hero')).toHaveClass(/has-art/);
});
