/**
 * Детерминированный PRNG mulberry32. Состояние хранится в GameState,
 * поэтому сохранение и загрузка продолжают ту же последовательность (ТЗ §5.4).
 * Вызывается только из ядра, никогда из рендера.
 */
export interface RngState {
  state: number;
  cursor: number;
}

export function seedRng(seed: number): RngState {
  return { state: seed >>> 0, cursor: 0 };
}

/** Возвращает число в [0, 1) и новое состояние. */
export function nextFloat(rng: RngState): [number, RngState] {
  let t = (rng.state + 0x6d2b79f5) >>> 0;
  const state = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { state, cursor: rng.cursor + 1 }];
}

/** Целое в [0, n). */
export function nextInt(rng: RngState, n: number): [number, RngState] {
  const [v, next] = nextFloat(rng);
  return [Math.floor(v * n), next];
}
