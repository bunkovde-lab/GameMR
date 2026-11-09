import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// W10 часть 2: 36 происшествий сценария. Сцена ART-015 у сложного события, «что на кону» в карточке, скрытая правда не видна.

async function loadW10(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('open-settings').click();
  // Окно развилки автоматически закрывается общей фикстурой — снимаем этот обработчик для проверки самого окна.
  await page.removeLocatorHandler(page.getByTestId('decision-dialog'));
  await page.locator('input[type="file"]').setInputFiles({ name: 'w10.json', mimeType: 'application/json', buffer: readFileSync('test-results/fixtures/w10_events.json') });
}

test('W10: complex event shows its ART-015 scene at the fork', async ({ page }, info) => {
  await loadW10(page);
  const dlg = page.getByTestId('decision-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Развилка: Судебная лестница');
  await expect(dlg).toContainText('Оставить коридор в суд открытым');
  const band = dlg.locator('.op-art');
  await expect(band).toHaveAttribute('data-art', 'scene_adm_plaza');
  await expect(band).toHaveClass(/has-art/);
  await expect(dlg.getByTestId('option-talk')).toBeVisible();
  await page.getByText('Сохранение импортировано.').waitFor({ state: 'hidden' }).catch(() => {});
  await page.screenshot({ path: `test-results/screens/w10p2-fork-${info.project.name}.png` });
  expect((await dlg.getByTestId('option-talk').boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('W10: routine event card shows what happens if late and what is at stake, never the hidden truth', async ({ page }, info) => {
  await loadW10(page);
  await page.getByTestId('decision-dialog').getByTestId('option-talk').click();
  await expect(page.getByTestId('decision-dialog')).toHaveCount(0);
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  const row = page.locator('[data-testid^="incident-"]', { hasText: 'Третий поток сортировки' }).first();
  await row.locator('.incident-title').click();
  const card = page.getByTestId('incident-card');
  await expect(card).toContainText('Третий поток сортировки');
  const stakes = card.getByTestId('card-stakes');
  await expect(stakes).toContainText('Если опоздать, обострится');
  await expect(stakes).toContainText('давка');
  await expect(card).not.toContainText('неверный маршрут после обновления сортировщика');
  await page.screenshot({ path: `test-results/screens/w10p2-card-${info.project.name}.png` });
});
