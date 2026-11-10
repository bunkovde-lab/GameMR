import { expect, test } from './fixtures';

// Карточки «Оперативные группы»: лица бойцов, полоса усталости и состояние здоровья из состояния игры.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await expect(page.getByTestId('briefing')).toHaveCount(0);
  await page.getByTestId('toggle-pause').click();
});

test('squad cards show member faces with fatigue bars and stay tappable', async ({ page }, info) => {
  const strip = page.getByTestId('squads');
  const cards = strip.locator('[data-testid^="squad-members-"]');
  await expect(cards).toHaveCount(6);
  const members = strip.locator('[data-testid^="squad-member-"]');
  expect(await members.count()).toBeGreaterThanOrEqual(6);
  const first = members.first();
  await expect(first.locator('.portrait img')).toBeVisible();
  await expect(first.locator('.sq-fatigue i')).toHaveAttribute('style', /width: \d+%/);
  await expect(first).toHaveAttribute('title', /—.*усталость \d+%/);
  // Описание состава доступно экранному диктору внутри кнопки отряда.
  await expect(page.getByTestId('squad-axon')).toContainText('Состав:');
  // Лица не выходят за карточку.
  const card = (await page.getByTestId('squad-axon').boundingBox())!;
  const face = (await page.getByTestId('squad-members-axon').locator('.sq-member').first().boundingBox())!;
  expect(face.y + face.height).toBeLessThanOrEqual(card.y + card.height);
  expect(card.height).toBeGreaterThanOrEqual(44);
  // Лица стоят на самой кнопке справа от названия, а не под ним; пустых рамок нет.
  const name = (await page.getByTestId('squad-axon').locator('b').boundingBox())!;
  expect(face.x).toBeGreaterThanOrEqual(name.x + name.width - 1);
  expect(face.x + face.width).toBeLessThanOrEqual(card.x + card.width);
  await expect(strip.locator('.sq-member.empty')).toHaveCount(0);
  // Касание по карточке (в т. ч. по лицу бойца) по-прежнему выбирает отряд.
  if (info.project.use.hasTouch) await page.getByTestId('squad-members-axon').locator('.sq-member').first().tap();
  else await page.getByTestId('squad-members-axon').locator('.sq-member').first().click();
  await expect(page.getByTestId('squad-axon')).toHaveAttribute('aria-pressed', 'true');
  await strip.screenshot({ path: `test-results/screens/squad-strip-${info.project.name}.png` });
});

test('dispatch window: ready squads show banner and member faces like the main screen', async ({ page }, info) => {
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId('incident-missing').locator('.incident-title').click();
  await page.getByTestId('open-dispatch').click();
  const pick = page.getByTestId('pick-axon');
  await expect(pick.locator('.monogram.banner-axon')).toBeVisible();
  const faces = page.getByTestId('pick-axon-members').locator('[data-testid^="pick-axon-member-"]');
  expect(await faces.count()).toBeGreaterThanOrEqual(1);
  await expect(faces.first().locator('.sq-fatigue i')).toHaveAttribute('style', /width: \d+%/);
  const box = (await pick.boundingBox())!;
  const face = (await faces.last().boundingBox())!;
  expect(face.x + face.width).toBeLessThanOrEqual(box.x + box.width);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await pick.click();
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `test-results/screens/dispatch-squads-${info.project.name}.png` });
});

test('ready squads expand to show squad status in the incident card and the dispatch window', async ({ page }) => {
  if (!(await page.getByTestId('left-panel').isVisible())) await page.getByRole('button', { name: /Вызовы/ }).click();
  await page.getByTestId('incident-missing').locator('.incident-title').click();
  // Карточка происшествия: вымпел и лица, раскрытие статуса.
  const row = page.getByTestId('dispatch-axon');
  await expect(row.locator('.monogram.banner-axon')).toBeVisible();
  await expect(page.getByTestId('dispatch-axon-members').locator('.sq-member').first()).toBeVisible();
  const toggle = page.getByTestId('dispatch-axon-status');
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  const sum = page.getByTestId('dispatch-axon-summary');
  await expect(sum).toContainText('годны к выезду');
  await expect(sum).toContainText('ждут лечения');
  await expect(sum.locator('.qs-stats li')).toHaveCount(5);
  await expect(sum).toContainText('Роли:');
  await toggle.click();
  await expect(sum).toHaveCount(0);
  // Окно отправки: раскрытие статуса не выбирает отряд.
  await page.getByTestId('open-dispatch').click();
  await page.getByTestId('pick-axon-status').click();
  await expect(page.getByTestId('pick-axon-summary')).toContainText('усталость');
  await expect(page.getByTestId('pick-axon')).not.toHaveAttribute('aria-pressed', 'true');
});
