// Тесты игровых экранов начинают сразу с игры, минуя главное меню (меню проверяется отдельно: menu*.test.tsx).
(globalThis as { __GAMEMR_SKIP_MENU__?: boolean }).__GAMEMR_SKIP_MENU__ = true;
