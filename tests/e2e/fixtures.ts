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
    await provide(page);
  },
});

/** Запуск как у игрока: с главного меню. */
export const testWithMenu = base;
