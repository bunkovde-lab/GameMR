import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { reserveOptions, squadSummary } from '../../src/core/squadSummary';
import { reserve } from '../../src/core/staff';
import type { GameState } from '../../src/core/types';
import { ok } from './helpers';

const started = () => ok(createInitialState(), { type: 'START_SHIFT' });
const squad = (s: GameState, id: string) => s.squads.find((q) => q.id === id)!;
const person = (s: GameState, id: string) => s.staff.find((p) => p.id === id)!;

describe('Быстрое управление отрядом (карточка «Отряд»)', () => {
  it('сводка: годные, средние характеристики годных, средняя усталость', () => {
    const s = started();
    const q = s.squads.find((x) => x.status === 'ready' && x.memberIds.length >= 2)!;
    const sum = squadSummary(s, q);
    const ms = q.memberIds.map((id) => person(s, id));
    expect(sum.total).toBe(ms.length);
    expect(sum.max).toBe(3);
    expect(sum.avgFatigue).toBe(Math.round(ms.reduce((a, p) => a + p.fatigue, 0) / ms.length));
    expect(sum.stats.reaction).toBeGreaterThan(0);
    expect(sum.locked).toBe(false);
  });

  it('раненый не считается годным, предупреждение о лечении; характеристики — по годным', () => {
    const s = started();
    const q = s.squads.find((x) => x.status === 'ready' && x.memberIds.length >= 2)!;
    const [a, b] = q.memberIds;
    person(s, a!).health = 'serious_injury';
    const sum = squadSummary(s, q);
    expect(sum.fit).toBe(q.memberIds.length - 1);
    expect(sum.needTreatment).toBe(1);
    expect(sum.warnings.join(' ')).toMatch(/лечении: 1/);
    const fit = q.memberIds.filter((id) => id !== a).map((id) => person(s, id));
    expect(sum.stats.analysis).toBe(Math.round((fit.reduce((x, p) => x + p.stats.analysis, 0) / fit.length) * 10) / 10);
    expect(b).toBeDefined();
  });

  it('SWAP_STAFF: боец уходит в резерв, резервист встаёт на его место, командирство снимается', () => {
    let s = started();
    const q = s.squads.find((x) => x.status === 'ready' && x.memberIds.length >= 1)!;
    const out = q.memberIds[0]!;
    s = ok(s, { type: 'SET_COMMANDER', squadId: q.id, staffId: out });
    const inn = reserveOptions(s)[0]?.person.id ?? (() => { s = ok(s, { type: 'UNASSIGN_STAFF', staffId: s.squads.find((x) => x.id !== q.id && x.status === 'ready' && x.memberIds.length)!.memberIds[0]! }); return reserve(s)[0]!.id; })();
    const before = [...squad(s, q.id).memberIds];
    s = ok(s, { type: 'SWAP_STAFF', staffId: out, withId: inn });
    expect(squad(s, q.id).memberIds).toEqual(before.map((id) => (id === out ? inn : id)));
    expect(squad(s, q.id).commanderId).toBeNull();
    expect(reserve(s).map((p) => p.id)).toContain(out);
  });

  it('SWAP_STAFF отклоняется для тяжелораненого резервиста и для отряда на задании', () => {
    let s = started();
    const q = s.squads.find((x) => x.status === 'ready' && x.memberIds.length >= 1)!;
    const other = s.squads.find((x) => x.id !== q.id && x.status === 'ready' && x.memberIds.length)!;
    const inn = other.memberIds[0]!;
    s = ok(s, { type: 'UNASSIGN_STAFF', staffId: inn });
    person(s, inn).health = 'serious_injury';
    expect(reserveOptions(s).some((o) => o.person.id === inn)).toBe(false);
    const r = reduce(s, { type: 'SWAP_STAFF', staffId: q.memberIds[0]!, withId: inn });
    expect(r.ok).toBe(false);
    person(s, inn).health = 'healthy';
    squad(s, q.id).status = 'en_route';
    const r2 = reduce(s, { type: 'SWAP_STAFF', staffId: q.memberIds[0]!, withId: inn });
    expect(r2.ok).toBe(false);
    expect(squadSummary(s, squad(s, q.id)).locked).toBe(true);
  });
});
