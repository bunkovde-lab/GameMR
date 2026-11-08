import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * Для проверок, не связанных с операциями (W5): развилки и отчёты операций появляются по игровому времени
 * и перекрывают экран. Здесь они закрываются «как игрок»: первый приказ, затем «Принято».
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addLocatorHandler(page.getByTestId('decision-dialog'), async () => {
      await page.locator('[data-testid^="option-"]').first().click();
    });
    await page.addLocatorHandler(page.getByTestId('operation-report'), async () => {
      await page.getByTestId('ack-report').click();
    });
    await provide(page);
  },
});
