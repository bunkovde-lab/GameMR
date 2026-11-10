import type { Page } from '@playwright/test';
import { expect, test, openIncident } from './fixtures';

// W4: быстрая отправка и ручная настройка (ТЗ §6.2–6.4, UI-03/UI-04).

async function openBioleak(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await openIncident(page, 'bioleak');
  await expect(page.getByTestId('card-class')).toHaveText('Сложное');
  await page.getByTestId('open-dispatch').click();
  await expect(page.getByTestId('dispatch-dialog')).toBeVisible();
}

test('quick dispatch: pick a ready squad, see forecast, ETA and risk, send', async ({ page }) => {
  await openBioleak(page);
  await expect(page.getByTestId('confirm-dispatch')).toBeDisabled();
  await expect(page.getByTestId('pick-vector')).toBeDisabled();
  await page.getByTestId('pick-resonance').click();
  await expect(page.getByTestId('tactic-quarantine')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('forecast')).toContainText('Высокие шансы');
  await expect(page.getByTestId('forecast')).toContainText('75–90%');
  await expect(page.getByTestId('missing-roles')).toContainText('Биокриминалист');
  await expect(page.getByTestId('route-preview')).toHaveCount(1);
  await page.getByTestId('confirm-dispatch').click();
  await expect(page.getByTestId('dispatch-dialog')).toHaveCount(0);
  await expect(page.getByTestId('card-tactic')).toHaveText('Карантин и изоляция');
  await expect(page.getByTestId('card-forecast')).toContainText('75–90%');
  await expect(page.getByTestId('stat-budget')).toContainText('103,75');
});

test('manual setup: blocked tactic shows a reason, gear and members change the forecast, mode switch keeps the draft', async ({ page }, info) => {
  await openBioleak(page);
  await page.getByTestId('pick-axon').click();
  await page.getByTestId('mode-manual').click();
  // Аксон без биокриминалиста: карантин возможен только с биозащитой
  await page.getByTestId('gear-remove-biosuit').click();
  await expect(page.getByTestId('tactic-quarantine')).toBeDisabled();
  await expect(page.getByTestId('tactic-quarantine')).toContainText('нужен биокриминалист');
  await expect(page.getByTestId('dispatch-blockers')).toContainText('Карантин');
  await expect(page.getByTestId('confirm-dispatch')).toBeDisabled();
  await page.getByTestId('gear-add-biosuit').click();
  await expect(page.getByTestId('tactic-quarantine')).toBeEnabled();
  const before = await page.getByTestId('forecast').textContent();
  await page.getByTestId('member-p2').click(); // убрать стража
  await page.getByTestId('member-p9').click(); // взять следователя из «Резонанса»
  await expect(page.getByTestId('forecast')).not.toHaveText(before!);
  await expect(page.getByTestId('member-p3')).toBeDisabled();
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('mode-manual').click();
  await expect(page.getByTestId('dispatch-members')).toHaveText('Мара Касс, Сели Ренн');
  await page.screenshot({ path: `test-results/screens/w4-manual-${info.project.name}.png` });
  await page.getByTestId('confirm-dispatch').click();
  await expect(page.getByTestId('card-state')).toContainText('в пути');
  // на ПК карточка вызова лежит поверх колонки групп — закрываем её, чтобы выбрать группу
  await page.keyboard.press('Escape');
  await page.getByTestId('squad-resonance').click();
  await expect(page.getByTestId('squad-card')).toBeVisible();
});

test('dialog fits the screen, the send button is reachable without page scroll, Escape closes it', async ({ page }, info) => {
  await openBioleak(page);
  await page.getByTestId('pick-resonance').click();
  await page.screenshot({ path: `test-results/screens/w4-quick-${info.project.name}.png` });
  const box = (await page.getByTestId('confirm-dispatch').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dispatch-dialog')).toHaveCount(0);
  await expect(page.getByTestId('incident-card')).toBeVisible();
});

test('dispatch window shows the incident (art, text, stakes, state, timer) and pauses the game while open', async ({ page }, info) => {
  await openBioleak(page);
  const brief = page.getByTestId('dispatch-incident');
  await expect(brief.getByTestId('inc-hero')).toBeVisible();
  await expect(page.getByTestId('dispatch-known')).not.toBeEmpty();
  await expect(page.getByTestId('dispatch-stakes')).toBeVisible();
  await expect(page.getByTestId('dispatch-state')).not.toBeEmpty();
  await expect(page.getByTestId('dispatch-timer')).toContainText('мин');
  // Окно поставило паузу: часы стоят.
  await expect(page.getByTestId('dispatch-paused')).toBeVisible();
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Продолжить');
  const clock = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('clock')).toHaveText(clock!);
  await page.screenshot({ path: `test-results/screens/dispatch-incident-${info.project.name}.png` });
  // Закрыли — время снова идёт.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dispatch-dialog')).toHaveCount(0);
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Пауза');
});

test('dispatch window keeps the pause the player set before opening it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  await page.getByTestId('toggle-pause').click();
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Продолжить');
  await openIncident(page, 'bioleak');
  await page.getByTestId('open-dispatch').click();
  await expect(page.getByTestId('dispatch-dialog')).toBeVisible();
  await page.getByTestId('pick-resonance').click();
  await page.getByTestId('confirm-dispatch').click();
  await expect(page.getByTestId('dispatch-dialog')).toHaveCount(0);
  await expect(page.getByTestId('toggle-pause')).toHaveAttribute('aria-label', 'Продолжить');
});
