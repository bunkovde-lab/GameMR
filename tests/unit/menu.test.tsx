import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App';
import { createInitialState } from '../../src/core/state';
import { getGame, replaceGame } from '../../src/store';
import { continueState } from '../../src/ui/menu/MainMenu';
import {
  FX_KEY,
  LIGHTNING_GAP_S,
  SCENE,
  flashLevel,
  fxRandom,
  inPolygon,
  lightningPulses,
  loadFxPrefs,
  nextLightningDelay,
  stormLength,
} from '../../src/ui/menu/menuScene';
import { missingMenuArt } from '../../src/ui/menu/menuAssets';

const withMenu = (fn: () => void) => () => {
  const g = globalThis as { __GAMEMR_SKIP_MENU__?: boolean };
  g.__GAMEMR_SKIP_MENU__ = false;
  try { fn(); } finally { g.__GAMEMR_SKIP_MENU__ = true; }
};

afterEach(() => {
  cleanup();
  replaceGame(createInitialState());
});

describe('M00-B: гроза без стробоскопа', () => {
  it('между молниями 12–30 секунд, нерегулярно', () => {
    const r = fxRandom(7);
    const gaps = Array.from({ length: 500 }, () => nextLightningDelay(r));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(LIGHTNING_GAP_S[0]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(LIGHTNING_GAP_S[1]);
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBeGreaterThan(10);
  });

  it('одна гроза — 1 или 2 короткие вспышки, яркость не выше 1, к концу гаснет', () => {
    const r = fxRandom(11);
    const counts = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const p = lightningPulses(r);
      counts.add(p.length);
      expect(p.length).toBeGreaterThanOrEqual(1);
      expect(p.length).toBeLessThanOrEqual(2);
      for (const x of p) expect(x.dur).toBeLessThanOrEqual(150);
      const len = stormLength(p);
      expect(len).toBeLessThan(1200);
      for (let t = 0; t <= len; t += 5) expect(flashLevel(p, t)).toBeLessThanOrEqual(1);
      expect(flashLevel(p, len + 1)).toBe(0);
    }
    expect([...counts].sort()).toEqual([1, 2]);
  });

  it('«Снизить движение» — одна мягкая вспышка', () => {
    const r = fxRandom(3);
    for (let i = 0; i < 50; i++) {
      const p = lightningPulses(r, true);
      expect(p).toHaveLength(1);
      expect(p[0]!.peak).toBeLessThanOrEqual(0.5);
    }
  });

  it('зоны эффектов внутри кадра: дождь в окне, лампа и пыль — в интерьере слева', () => {
    for (const [x, y] of [...SCENE.window, ...SCENE.desk]) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
    }
    expect(inPolygon([SCENE.lamp.x, SCENE.lamp.y], SCENE.window)).toBe(false);
    expect(inPolygon([0.1, 0.3], SCENE.window)).toBe(false); // левая зона логотипа и меню — без дождя
    expect(inPolygon([0.7, 0.3], SCENE.window)).toBe(true);
  });
});

describe('M00-B: настройки эффектов', () => {
  it('по умолчанию берутся из prefers-reduced-motion, сохранённый выбор важнее', () => {
    expect(loadFxPrefs(null, true)).toEqual({ noFlashes: false, reduceMotion: true });
    const store = { getItem: (k: string) => (k === FX_KEY ? JSON.stringify({ noFlashes: true, reduceMotion: false }) : null) };
    expect(loadFxPrefs(store, true)).toEqual({ noFlashes: true, reduceMotion: false });
    expect(loadFxPrefs({ getItem: () => '{oops' }, false)).toEqual({ noFlashes: false, reduceMotion: false });
  });
});

describe('M00-B: пункт «Продолжить»', () => {
  it('активен при восстановленной кампании, иначе объясняет причину', () => {
    expect(continueState(false, { restored: true }).enabled).toBe(true);
    expect(continueState(true, { restored: false, empty: true, reason: '' }).enabled).toBe(true);
    expect(continueState(false, { restored: false, empty: true, reason: 'Слот пуст.' })).toEqual({ enabled: false, note: 'Сохранённой игры нет' });
    expect(continueState(false, { restored: false, empty: false, reason: 'Файл повреждён' })).toEqual({ enabled: false, note: 'Автосохранение повреждено' });
    expect(continueState(false, { restored: false, empty: false, reason: 'Хранилище браузера недоступно: x' }).note).toBe('Хранилище браузера недоступно');
  });
});

describe('M00-B: меню в приложении', () => {
  it('при запуске — меню с шестью живыми кнопками, игровой HUD не показан', withMenu(() => {
    render(<App />);
    expect(screen.getByTestId('main-menu')).toBeTruthy();
    expect(screen.queryByTestId('hud')).toBeNull();
    const labels = screen.getAllByRole('button').filter((b) => b.className.includes('m00b-btn')).map((b) => b.querySelector('.m00b-label')!.textContent);
    expect(labels).toEqual(['Продолжить', 'Новая игра', 'Песочница', 'Настройки', 'Авторы', 'Выход']);
    expect((screen.getByTestId('menu-continue') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('menu-continue').textContent).toContain('Сохранённой игры нет');
  }));

  it('«Новая игра» без сохранения сразу открывает брифинг; из игры — назад в меню на паузе и «Продолжить»', async () => {
    const g = globalThis as { __GAMEMR_SKIP_MENU__?: boolean };
    g.__GAMEMR_SKIP_MENU__ = false;
    try {
      render(<App />);
      act(() => { fireEvent.click(screen.getByTestId('menu-new')); });
      await screen.findByTestId('briefing');
      act(() => { fireEvent.click(screen.getByTestId('start-shift')); });
      expect(getGame().phase).toBe('ACTIVE');
      expect(getGame().paused).toBe(false);
      act(() => { fireEvent.click(screen.getByTestId('open-settings')); });
      act(() => { fireEvent.click(screen.getByTestId('to-main-menu')); });
      expect(screen.getByTestId('main-menu')).toBeTruthy();
      expect(getGame().paused).toBe(true);
      const cont = screen.getByTestId('menu-continue') as HTMLButtonElement;
      expect(cont.disabled).toBe(false);
      expect(cont.textContent).toContain('Смена 1');
      act(() => { fireEvent.click(cont); });
      expect(screen.getByTestId('hud')).toBeTruthy();
      expect(getGame().phase).toBe('ACTIVE');
      expect(getGame().paused).toBe(true);
    } finally {
      g.__GAMEMR_SKIP_MENU__ = true;
    }
  });

  it('настройки (вспышки сохраняются) и «Авторы» открываются, состояние игры не меняется', withMenu(() => {
    const g = createInitialState();
    replaceGame(g);
    render(<App />);
    act(() => { fireEvent.click(screen.getByTestId('menu-settings')); });
    expect(screen.getByTestId('menu-settings-dialog')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('menu-tab-video')); });
    act(() => { fireEvent.click(screen.getByTestId('fx-no-flashes')); });
    expect(JSON.parse(localStorage.getItem(FX_KEY)!).noFlashes).toBe(true);
    act(() => { fireEvent.click(screen.getByLabelText('Закрыть')); });
    act(() => { fireEvent.click(screen.getByTestId('menu-credits')); });
    expect(screen.getByTestId('menu-credits-dialog').textContent).toContain('github.com/bunkovde-lab/GameMR');
    expect(getGame()).toBe(g);
  }));

  it('без художественного пакета меню честно помечает, чего не хватает', withMenu(() => {
    render(<App />);
    const miss = missingMenuArt();
    if (miss.length) expect(screen.getByTestId('menu-art-missing').textContent).toContain(miss[0]!);
    else expect(screen.queryByTestId('menu-art-missing')).toBeNull();
  }));
});
