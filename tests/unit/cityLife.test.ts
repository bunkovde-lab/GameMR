import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/core/state';
import { reduce } from '../../src/core/reduce';
import { districtMood, nightLevel, weatherForShift, weatherIntensity } from '../../src/ui/map/cityLife';
import { squadPoint } from '../../src/ui/map/entities';
import { tick } from './helpers';

describe('ART-019 living city (visual only)', () => {
  it('light: dim morning at 08:00, day at noon, night by 18:30, smooth in between', () => {
    expect(nightLevel(8 * 60)).toBeCloseTo(0.4, 2);
    expect(nightLevel(12 * 60)).toBe(0);
    expect(nightLevel(18 * 60 + 30)).toBe(1);
    expect(nightLevel(20 * 60)).toBe(1);
    let prev = nightLevel(15 * 60 + 30);
    for (let m = 15 * 60 + 31; m <= 18 * 60 + 30; m++) {
      const v = nightLevel(m);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v - prev).toBeLessThan(0.02); // нет скачков между минутами
      prev = v;
    }
  });
  it('weather is deterministic per seed and shift, first shift is clear, intensity ramps in and out', () => {
    expect(weatherForShift(7, 1).kind).toBe('clear');
    for (let n = 2; n < 30; n++) expect(weatherForShift(7, n)).toEqual(weatherForShift(7, n));
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => weatherForShift(11, i + 2).kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    const w = { kind: 'rain' as const, from: 100, to: 300 };
    expect(weatherIntensity(w, 99)).toBe(0);
    expect(weatherIntensity(w, 115)).toBeGreaterThan(0);
    expect(weatherIntensity(w, 115)).toBeLessThan(1);
    expect(weatherIntensity(w, 200)).toBe(1);
  });
  it('weather and the effects never touch the game state', () => {
    const s = createInitialState(7);
    const before = JSON.stringify(s);
    weatherForShift(s.seed, 5);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('district mood follows safety thresholds', () => {
    expect([72, 50, 35, 20].map(districtMood)).toEqual(['calm', 'tense', 'unrest', 'riot']);
  });
  it('smooth movement: a moving squad is drawn between its minute positions; returning squads move too', () => {
    const s = reduce(createInitialState(), { type: 'START_SHIFT' });
    if (!s.ok) throw new Error(s.reason);
    const r = reduce(s.state, { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    if (!r.ok) throw new Error(r.reason);
    const g = tick(r.state, 2);
    const q = g.squads.find((x) => x.id === 'axon')!;
    const a = squadPoint(g, q, 0), half = squadPoint(g, q, 0.5), b = squadPoint(tick(g, 1), tick(g, 1).squads.find((x) => x.id === 'axon')!, 0);
    expect(half).not.toEqual(a);
    const d = (p: number[], o: number[]) => Math.hypot(p[0]! - o[0]!, p[1]! - o[1]!);
    expect(d(a, half) + d(half, b)).toBeCloseTo(d(a, b), 2);
    // Возвращение: цели-вызова нет, но отряд едет по маршруту, а не стоит на узле.
    const ret = structuredClone(g);
    const rq = ret.squads.find((x) => x.id === 'axon')!;
    rq.status = 'returning';
    rq.assignedIncidentId = null;
    expect(squadPoint(ret, rq, 0.5)).not.toEqual(squadPoint(ret, rq, 0));
    void s;
  });
});
