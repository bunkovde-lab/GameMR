import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * Для проверок, не связанных с операциями (W5): развилки и отчёты операций появляются по игровому времени
 * и перекрывают экран. Здесь они закрываются «как игрок»: первый приказ, затем «Принято».
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    // Проверки игровых экранов начинают сразу с игры; главное меню проверяется в menu.spec.ts (testWithMenu).
    await page.addInitScript(() => { (window as unknown as { __GAMEMR_SKIP_MENU__: boolean }).__GAMEMR_SKIP_MENU__ = true; });
    await page.addLocatorHandler(page.getByTestId('decision-dialog'), async () => {
      await page.locator('[data-testid^="option-"]').first().click();
    });
    await page.addLocatorHandler(page.getByTestId('operation-report'), async () => {
      await page.getByTestId('ack-report').click();
    });
    // Страница «Как вести дело» открывается сама при первом деле; в проверках других сценариев закрываем её «как игрок».
    await page.addLocatorHandler(page.getByTestId('case-help'), async () => {
      await page.getByTestId('case-help-close').click();
    });
    await provide(page);
  },
});

/** Запуск как у игрока: с главного меню. */
export const testWithMenu = base;

/**
 * Открыть карточку вызова «как игрок»: списка вызовов нет (2026-11-10), вызов открывается только меткой на карте.
 * Если метка собрана в кластер — сначала раскрываем кластер.
 */
export async function openIncident(page: import('@playwright/test').Page, id: string) {
  const marker = page.getByTestId(`marker-incident-${id}`);
  // Открытая карточка справа может лечь краем на метку — игрок сначала закрывает её.
  if (await page.getByTestId('right-panel').count()) {
    await page.getByTestId('right-panel').getByRole('button', { name: /Закрыть/ }).first().click();
    await page.getByTestId('right-panel').waitFor({ state: 'detached' });
  }
  if (!(await marker.count())) {
    const cluster = page.locator(`[data-testid="marker-cluster"][data-ids~="${id}"]`);
    if (await cluster.count()) await cluster.click();
  }
  await marker.click();
  await page.getByTestId('incident-card').waitFor();
}
