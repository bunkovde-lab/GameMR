/**
 * «Живой город» на карте ART-019: свет суток, погода и вид районов.
 * Всё здесь — только оформление. Ядро игры эти значения не читает, сохранения не меняются,
 * генератор случайных чисел игры не расходуется (погода — хэш от seed и номера смены).
 * Пороги и часы — визуальные настройки, не баланс (см. docs/DECISIONS_AND_CONFLICTS.md, VIS-01).
 */

/** Часы света (минуты от полуночи). Смена идёт 08:00–20:00: утро в сумерках, вечер уходит в ночь. */
export const LIGHT = {
  dawnEnd: 9 * 60 + 30, // к 09:30 полностью светло
  dawnStartLevel: 0.4, // в 08:00 ещё полутемно
  duskStart: 15 * 60 + 30, // с 15:30 начинает темнеть
  nightFull: 18 * 60 + 30, // к 18:30 — ночь
} as const;

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** Уровень ночи 0 (день) … 1 (ночь) по часам суток, с плавными переходами. */
export function nightLevel(clockMinutes: number): number {
  const m = ((clockMinutes % 1440) + 1440) % 1440;
  if (m >= LIGHT.nightFull || m < 6 * 60) return 1;
  if (m < 8 * 60) return 1 - (1 - LIGHT.dawnStartLevel) * smooth((m - 6 * 60) / 120);
  if (m < LIGHT.dawnEnd) return LIGHT.dawnStartLevel * (1 - smooth((m - 8 * 60) / (LIGHT.dawnEnd - 8 * 60)));
  if (m < LIGHT.duskStart) return 0;
  return smooth((m - LIGHT.duskStart) / (LIGHT.nightFull - LIGHT.duskStart));
}

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog';
export interface Weather { kind: WeatherKind; /** минута смены, когда начинается */ from: number; /** когда кончается */ to: number }

export const WEATHER_LABEL: Record<WeatherKind, string> = { clear: 'Ясно', rain: 'Дождь', storm: 'Гроза', fog: 'Туман' };

/** Детерминированный хэш (mulberry-подобный), не трогает rng игры. */
export function hash32(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Погода смены: одна и та же для одного сохранения. Первая смена — ясно, чтобы город был виден. */
export function weatherForShift(seed: number, shift: number, shiftLength = 720): Weather {
  if (shift <= 1) return { kind: 'clear', from: 0, to: 0 };
  const h = hash32(seed, shift);
  const r = (h % 1000) / 1000;
  const kind: WeatherKind = r < 0.4 ? 'clear' : r < 0.68 ? 'rain' : r < 0.86 ? 'storm' : 'fog';
  if (kind === 'clear') return { kind, from: 0, to: 0 };
  const from = ((h >>> 10) % 6) * 60; // начало: 0…5 ч от начала смены
  const len = 180 + ((h >>> 14) % 5) * 60; // 3…7 часов
  return { kind, from, to: Math.min(shiftLength, from + len) };
}

/** Сила погоды 0…1 в данную минуту смены: нарастает и стихает за полчаса. */
export function weatherIntensity(w: Weather, minute: number): number {
  if (w.kind === 'clear' || minute < w.from || minute > w.to) return 0;
  return smooth(Math.min(minute - w.from, w.to - minute) / 30);
}

export type DistrictMood = 'calm' | 'tense' | 'unrest' | 'riot';
/** Пороги безопасности района (%): ниже — дым, огонь, беспорядки. Визуальные, не баланс. */
export const MOOD_THRESHOLDS = { tense: 55, unrest: 40, riot: 28 } as const;

export function districtMood(safety: number): DistrictMood {
  if (safety < MOOD_THRESHOLDS.riot) return 'riot';
  if (safety < MOOD_THRESHOLDS.unrest) return 'unrest';
  if (safety < MOOD_THRESHOLDS.tense) return 'tense';
  return 'calm';
}

export const MOOD_LABEL: Record<DistrictMood, string> = { calm: 'спокойно', tense: 'напряжённо', unrest: 'поджоги', riot: 'беспорядки' };

export type EffectsLevel = 'full' | 'lite' | 'off';
const KEY = 'gamemr.mapEffects';
export function loadEffectsLevel(): EffectsLevel {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'full' || v === 'lite' || v === 'off') return v;
  } catch { /* нет хранилища — значение по умолчанию */ }
  try { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'lite'; } catch { /* нет matchMedia */ }
  return 'full';
}
export function saveEffectsLevel(v: EffectsLevel) {
  try { localStorage.setItem(KEY, v); } catch { /* приватный режим */ }
  window.dispatchEvent(new CustomEvent('gamemr:effects', { detail: v }));
}
