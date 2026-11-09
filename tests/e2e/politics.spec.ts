import { expect, test } from './fixtures';

// W8: полномочия (UI-19), политика Домов (UI-20), документ или чрезвычайное основание в окне отправки.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
});

test('authorities: four levels, a case that needs a court order, a request goes to the court', async ({ page }, info) => {
  await page.getByTestId('nav-directorate').click();
  await page.getByTestId('dir-tab-authority').click();
  await expect(page.getByTestId('authority-levels').locator('tbody tr')).toHaveCount(4);
  const card = page.getByTestId('case-illegal');
  await expect(card).toContainText('Нелегальная модификация');
  await page.screenshot({ path: `test-results/screens/w8-authority-${info.project.name}.png` });
  const req = page.getByTestId('request-judicial-illegal');
  expect((await req.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await req.click();
  await expect(card).toContainText('на рассмотрении');
  await expect(page.getByTestId('permits-table')).toContainText('Суд продолжения');
});

test('dispatch: arrest without an order is blocked until the director takes emergency responsibility', async ({ page }, info) => {
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId('incident-illegal').locator('.incident-title').click();
  await page.getByTestId('open-dispatch').click();
  await page.getByTestId('pick-resonance').click();
  await page.getByTestId('tactic-arrest').click();
  await expect(page.getByTestId('legal-box')).toContainText('судебное разрешение');
  await expect(page.getByTestId('confirm-dispatch')).toBeDisabled();
  await page.getByTestId('legal-box').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/w8-dispatch-legal-${info.project.name}.png` });
  await page.getByTestId('toggle-emergency').click();
  await expect(page.getByTestId('confirm-dispatch')).toBeEnabled();
  await page.getByTestId('confirm-dispatch').click();
  await page.getByTestId('nav-directorate').click();
  await page.getByTestId('dir-tab-authority').click();
  await expect(page.getByTestId('permits-table')).toContainText('Чрезвычайное');
  await expect(page.getByTestId('permits-table')).toContainText('проверка: смена 2');
});

test('politics: six Houses, three coalitions, a deal with full terms changes access', async ({ page }, info) => {
  await page.getByTestId('nav-directorate').click();
  await page.getByTestId('dir-tab-politics').click();
  await expect(page.locator('[data-testid^="house-"]')).toHaveCount(6);
  await expect(page.locator('[data-testid^="coalition-"]')).toHaveCount(3);
  // ART-017: у каждого Дома свой герб, картинка реально загружена.
  for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const crest = page.getByTestId(`house-${h}`).getByTestId(`crest-${h}`);
    await expect(crest).toBeVisible();
    expect(await crest.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(256);
  }
  await expect(page.getByTestId('offer-lab_access').getByTestId('crest-h1')).toBeVisible();
  const offer = page.getByTestId('offer-lab_access');
  for (const t of ['Выгода', 'Политическая цена', 'Срок', 'Условия', 'Проверка', 'При нарушении']) await expect(offer).toContainText(t);
  await page.screenshot({ path: `test-results/screens/w8-politics-${info.project.name}.png` });
  await page.getByTestId('accept-lab_access').click();
  await expect(page.getByTestId('deal-lab_access')).toBeVisible();
  await expect(page.getByTestId('coalition-hard')).toContainText('25 из 100');
  await page.getByTestId('dir-tab-authority').click();
  await expect(page.getByTestId('case-bioleak')).toContainText('допуск по договору');
  await page.getByTestId('dir-tab-politics').click();
  await page.getByTestId('deal-lab_access').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/screens/w8-deal-${info.project.name}.png` });
});
