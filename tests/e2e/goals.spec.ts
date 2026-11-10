import { expect, test } from './fixtures';

// Кнопка «Цели» слева сверху над картой: раскрывает содержимое вкладки «Обзор» Дирекции.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
});

test('goals dock: collapsed by default, expands with the Directorate overview, does not cover map buttons', async ({ page }, info) => {
  const toggle = page.getByTestId('goals-toggle');
  await expect(toggle).toBeVisible();
  await expect(page.getByTestId('goals-panel')).toHaveCount(0);
  const box = (await toggle.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const stage = (await page.getByTestId('map-stage').boundingBox())!;
  // Слева сверху карты; если открыт список вызовов — сразу справа от него.
  const left = page.getByTestId('left-panel');
  const leftEdge = (await left.count()) ? (await left.boundingBox())!.x + (await left.boundingBox())!.width : stage.x;
  expect(box.x).toBeGreaterThanOrEqual(leftEdge);
  expect(box.x - leftEdge).toBeLessThan(40);
  expect(box.y - stage.y).toBeLessThan(40);
  // Кнопка «Вызовы» (когда список свёрнут) стоит рядом и не перекрывается.
  const callsBtn = page.locator('.map-tools .btn').first();
  if (await callsBtn.count()) expect((await callsBtn.boundingBox())!.x).toBeGreaterThanOrEqual(box.x + box.width);
  await page.screenshot({ path: `test-results/screens/goals-closed-${info.project.name}.png` });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByTestId('goals-overview');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Приоритеты');
  await expect(panel).toContainText('Безопасность города');
  // Панель помещается в экран и не закрывает нижнюю навигацию.
  const pb = (await page.getByTestId('goals-panel').boundingBox())!;
  const nav = (await page.getByTestId('nav-directorate').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(pb.y + pb.height).toBeLessThanOrEqual(nav.y);
  expect(pb.x + pb.width).toBeLessThanOrEqual(vp.width);
  await expect(page.getByTestId('goals-open-directorate')).toBeInViewport();
  await page.screenshot({ path: `test-results/screens/goals-open-${info.project.name}.png` });

  // Тот же текст, что во вкладке «Обзор» Дирекции.
  const text = await panel.textContent();
  await page.getByTestId('goals-open-directorate').click();
  await expect(page.getByTestId('dir-overview')).toHaveText(text!);
  await page.getByRole('button', { name: 'Вернуться к карте' }).click();
  await expect(page.getByTestId('goals-panel')).toHaveCount(0);

  await toggle.click();
  await page.getByTestId('goals-close').click();
  await expect(page.getByTestId('goals-panel')).toHaveCount(0);
});
