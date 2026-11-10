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
