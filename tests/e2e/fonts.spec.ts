import { expect, test } from './fixtures';

// Шрифты игры лежат в сборке: заголовки — Old Standard TT Bold, текст и цифры — Golos Text.
test('title and UI fonts load from the build and cover Cyrillic', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-shift').click();
  const result = await page.evaluate(async () => {
    await document.fonts.load('400 20px "GameMR Title"', 'Вызовы Карточка');
    await document.fonts.load('400 14px "Golos Text"', 'Принять вызов');
    await document.fonts.ready;
    const title = getComputedStyle(document.querySelector('.panel-header h2, .brand strong')!).fontFamily;
    return {
      title,
      titleOk: document.fonts.check('400 20px "GameMR Title"', 'ЖЩЁ'),
      uiOk: document.fonts.check('400 14px "Golos Text"', 'ЖЩЁ'),
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
    };
  });
  expect(result.title).toContain('GameMR Title');
  expect(result.titleOk).toBe(true);
  expect(result.uiOk).toBe(true);
  expect(result.loaded).toContain('GameMR Title');
  expect(result.loaded).toContain('Golos Text');
});
