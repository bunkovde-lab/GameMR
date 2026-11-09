/**
 * Геометрия сцены M00-B и настройки эффектов. Все координаты — доли кадра 1672×941 (0…1),
 * так что слои эффектов совпадают с фоном при любом размере экрана (фон кадрируется как cover).
 *
 * ВНИМАНИЕ: точные контуры окна, стола и лампы снимаются с настоящего чистого фона из арт-пакета.
 * Пока фон не импортирован, здесь стоят ориентиры по ТЗ (окно — центр и справа, стол — низ кадра).
 */
export const SCENE_W = 1672;
export const SCENE_H = 941;

export type Pt = readonly [number, number];

export interface SceneGeometry {
  /** Остекление: дождь и вспышки рисуются только внутри этого контура */
  window: readonly Pt[];
  /** Импосты (вертикальные стойки рамы) — дождь их не «мочит», при вспышке у них холодная кромка */
  mullions: readonly { x: number; w: number }[];
  /** Столешница: здесь появляются отражения окна и вспышек */
  desk: readonly Pt[];
  /** Тёплая лампа в помещении: центр и радиус свечения (радиус — доля ширины кадра) */
  lamp: { x: number; y: number; r: number };
  /** Где летает пыль (левая и центральная часть интерьера) */
  dust: { x0: number; y0: number; x1: number; y1: number };
}

export const SCENE: SceneGeometry = {
  window: [[0.335, 0.04], [0.985, 0.04], [0.985, 0.66], [0.335, 0.66]],
  mullions: [{ x: 0.5, w: 0.008 }, { x: 0.665, w: 0.008 }, { x: 0.83, w: 0.008 }],
  desk: [[0.3, 0.74], [0.95, 0.74], [1, 1], [0.24, 1]],
  lamp: { x: 0.215, y: 0.47, r: 0.16 },
  dust: { x0: 0.04, y0: 0.18, x1: 0.62, y1: 0.86 },
};

// ——— настройки эффектов (сохраняются в браузере) ———

export interface FxPrefs {
  /** Отключить вспышки молний (светочувствительность) */
  noFlashes: boolean;
  /** Снизить движение: меньше дождя, без пыли, мерцания и параллакса */
  reduceMotion: boolean;
}

export const FX_KEY = 'gamemr-menu-fx';

export function systemReducedMotion(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; }
}

export function loadFxPrefs(storage: Pick<Storage, 'getItem'> | null = safeStorage(), reducedBySystem = systemReducedMotion()): FxPrefs {
  const base: FxPrefs = { noFlashes: false, reduceMotion: reducedBySystem };
  try {
    const raw = storage?.getItem(FX_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<FxPrefs>;
    return {
      noFlashes: typeof p.noFlashes === 'boolean' ? p.noFlashes : base.noFlashes,
      reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : base.reduceMotion,
    };
  } catch {
    return base;
  }
}

export function saveFxPrefs(p: FxPrefs, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try { storage?.setItem(FX_KEY, JSON.stringify(p)); } catch { /* не критично */ }
}

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

// ——— расписание грозы ———

/** Между молниями 12–30 секунд, нерегулярно (ТЗ §4.2). Первая — раньше, чтобы гроза читалась сразу. */
export const LIGHTNING_GAP_S: readonly [number, number] = [12, 30];
export const FIRST_LIGHTNING_S: readonly [number, number] = [3, 7];

export function nextLightningDelay(rand: () => number, first = false): number {
  const [a, b] = first ? FIRST_LIGHTNING_S : LIGHTNING_GAP_S;
  return a + (b - a) * rand();
}

export interface Pulse { at: number; dur: number; peak: number }

/**
 * Одна гроза = 1–2 короткие вспышки (без ритмичного стробирования): 70–150 мс каждая,
 * пауза между ними 140–320 мс, пиковая яркость 0.55–1. При «Снизить движение» — одна мягкая вспышка.
 */
export function lightningPulses(rand: () => number, gentle = false): Pulse[] {
  const first: Pulse = { at: 0, dur: 70 + 80 * rand(), peak: gentle ? 0.45 : 0.55 + 0.45 * rand() };
  if (gentle || rand() < 0.4) return [first];
  const gap = 140 + 180 * rand();
  return [first, { at: first.dur + gap, dur: 60 + 70 * rand(), peak: first.peak * (0.5 + 0.4 * rand()) }];
}

/** Яркость вспышки (0…1) в момент t мс от начала грозы: быстрый подъём, плавный спад. */
export function flashLevel(pulses: readonly Pulse[], t: number): number {
  let v = 0;
  for (const p of pulses) {
    const dt = t - p.at;
    if (dt < 0 || dt > p.dur * 3) continue;
    const rise = p.dur * 0.25;
    const lvl = dt < rise ? dt / rise : Math.exp(-(dt - rise) / (p.dur * 0.6));
    v = Math.max(v, p.peak * lvl);
  }
  return v;
}

export function stormLength(pulses: readonly Pulse[]): number {
  return Math.max(...pulses.map((p) => p.at + p.dur * 3));
}

/** Точка внутри многоугольника (для проверок, что эффекты не выходят за окно). */
export function inPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Детерминированный ГСЧ для эффектов (mulberry32). Игровой ГСЧ ядра эффекты не трогают. */
export function fxRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
