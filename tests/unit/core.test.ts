import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { isOpen } from '../../src/core/selectors';
import { nextFloat, seedRng } from '../../src/core/rng';
import type { Command, GameState } from '../../src/core/types';
import { runAuto, tick } from './helpers';

const run = (s: GameState, cmds: Command[]) => cmds.reduce((acc, c) => reduce(acc, c).state, s);
const ok = (s: GameState, c: Command) => {
  const r = reduce(s, c);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const fullShift = (s: GameState) => runAuto(s, [{ type: 'START_SHIFT' }, { type: 'TICK', minutes: 720 }, { type: 'END_SHIFT' }]);

/** Детерминированный генератор случайных последовательностей команд для property-тестов. */
function randomCommands(seed: number, n: number, staffIds: string[], squadIds: string[], incIds: string[]): Command[] {
  let rng = seedRng(seed);
  const pick = <T,>(xs: T[]): T => { const [v, r] = nextFloat(rng); rng = r; return xs[Math.floor(v * xs.length)]!; };
  const gen: (() => Command)[] = [
    () => ({ type: 'START_SHIFT' }),
    () => ({ type: 'PAUSE' }),
    () => ({ type: 'RESUME' }),
    () => ({ type: 'SET_SPEED', speed: pick([1, 2, 4] as const) }),
    () => ({ type: 'TICK', minutes: pick([1, 5, 30, 120]) }),
    () => ({ type: 'ACKNOWLEDGE_INCIDENT', incidentId: pick(incIds) }),
    () => ({ type: 'ASSIGN_STAFF', staffId: pick(staffIds), squadId: pick(squadIds) }),
    () => ({ type: 'END_SHIFT' }),
    () => ({ type: 'ADVANCE_SHIFT' }),
    () => ({ type: 'DISPATCH_SQUAD', squadId: pick(squadIds), incidentId: pick(incIds) }),
    () => ({ type: 'CHOOSE_OPTION', squadId: pick(squadIds), optionId: pick(['observe', 'cut', 'enter', 'hold', 'flank', 'chase', 'talk', 'seal', 'nope']) }),
  ];
  return Array.from({ length: n }, () => pick(gen)());
}

describe('initial state (ТЗ §7.1, §8.1)', () => {
  const s = createInitialState();
  it('has 12 staff with the ТЗ role mix and 34 РЕ total salary', () => {
    expect(s.staff).toHaveLength(12);
    const count = (r: string) => s.staff.filter((p) => p.role === r).length;
    expect([count('guard'), count('investigator'), count('lovchiy'), count('biocriminalist'), count('analyst')]).toEqual([4, 3, 2, 2, 1]);
    expect(s.staff.reduce((a, p) => a + p.salary, 0)).toBe(3400);
  });
  it('starts with 105 РЕ, six districts, no owner/capture fields', () => {
    expect(s.economy.balance).toBe(10500);
    expect(s.districts.map((d) => d.id).sort()).toEqual(['admin', 'gardens', 'industry', 'medical', 'residential', 'science']);
    for (const d of s.districts) expect(Object.keys(d)).not.toContain('owner');
  });
});

describe('CORE-01 determinism', () => {
  it('same seed and same commands give identical state and log (1000 random sequences)', () => {
    const base = createInitialState(7);
    const staffIds = base.staff.map((p) => p.id);
    const squadIds = base.squads.map((q) => q.id);
    const incIds = [...base.incidents.map((i) => i.id), 'inc-1', 'inc-2', 'missing-id'];
    for (let k = 0; k < 1000; k++) {
      const cmds = randomCommands(k, 40, staffIds, squadIds, incIds);
      const a = run(createInitialState(7), cmds);
      const b = run(createInitialState(7), cmds);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  }, 60_000); // 1000 прогонов × 40 команд: ~4 с локально, на CI-раннере дольше стандартных 5 с
  it('different seeds produce different new-shift incidents', () => {
    const a = ok(fullShift(createInitialState(1)), { type: 'ADVANCE_SHIFT' });
    const b = ok(fullShift(createInitialState(2)), { type: 'ADVANCE_SHIFT' });
    const sig = (s: GameState) => s.incidents.filter((i) => i.createdShift === 2).map((i) => i.templateId + i.spawnId + i.deadlineMinute).join();
    expect(sig(a)).not.toBe(sig(b));
  });
});

describe('CORE-02 no randomness outside commands', () => {
  it('rejected and read-only commands leave the RNG cursor untouched', () => {
    const s = createInitialState();
    for (let i = 0; i < 100; i++) {
      expect(reduce(s, { type: 'TICK', minutes: 1 }).state.rng).toEqual(s.rng); // на брифинге время стоит
      expect(reduce(s, { type: 'SET_SPEED', speed: 2 }).state.rng).toEqual(s.rng);
    }
  });
});

describe('CORE-03 staff assignment validation', () => {
  it('rejects moving someone out of a squad that is on a mission', () => {
    const s = createInitialState();
    const r = reduce(s, { type: 'ASSIGN_STAFF', staffId: 'p3', squadId: 'axon' }); // p3 в «Векторе», который на месте
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
    if (!r.ok) expect(r.reason).toMatch(/на задании/);
  });
  it('moves a free person and never lists them in two squads', () => {
    const s = ok(createInitialState(), { type: 'ASSIGN_STAFF', staffId: 'p1', squadId: 'resonance' });
    const holders = s.squads.filter((q) => q.memberIds.includes('p1')).map((q) => q.id);
    expect(holders).toEqual(['resonance']);
  });
  it('rejects a full squad and a dead person', () => {
    let s = ok(createInitialState(), { type: 'ASSIGN_STAFF', staffId: 'p1', squadId: 'resonance' });
    expect(reduce(s, { type: 'ASSIGN_STAFF', staffId: 'p2', squadId: 'resonance' }).ok).toBe(false);
    s = structuredClone(s);
    s.staff.find((p) => p.id === 'p5')!.health = 'dead';
    expect(reduce(s, { type: 'ASSIGN_STAFF', staffId: 'p5', squadId: 'axon' }).ok).toBe(false);
  });
});

describe('shift cycle (ТЗ §2.2)', () => {
  it('BRIEFING → ACTIVE → REVIEW_PENDING at shift end → SHIFT_REPORT → BRIEFING', () => {
    let s = createInitialState();
    expect(s.phase).toBe('BRIEFING');
    s = ok(s, { type: 'START_SHIFT' });
    expect(s.phase).toBe('ACTIVE');
    s = tick(s, 800);
    expect([s.phase, s.minute, s.paused]).toEqual(['REVIEW_PENDING', 720, true]);
    s = ok(s, { type: 'END_SHIFT' });
    expect(s.phase).toBe('SHIFT_REPORT');
    s = ok(s, { type: 'ADVANCE_SHIFT' });
    expect([s.phase, s.shift, s.minute]).toEqual(['BRIEFING', 2, 0]);
  });
  it('time does not move while paused', () => {
    const s = ok(ok(createInitialState(), { type: 'START_SHIFT' }), { type: 'PAUSE' });
    const r = reduce(s, { type: 'TICK', minutes: 10 });
    expect(r.ok).toBe(false);
    expect(r.state.minute).toBe(0);
  });
  it('pays funding and salary exactly once per shift; balance follows the ledger', () => {
    let s = fullShift(createInitialState());
    expect(reduce(s, { type: 'END_SHIFT' }).ok).toBe(false);
    expect(s.economy.ledger.map((t) => [t.kind, t.amount])).toEqual([['funding', 4600], ['salary', -3400]]);
    expect(s.economy.balance).toBe(10500 + 4600 - 3400);
    const r = s.reports[0]!;
    expect([r.openingBalance, r.income, r.expenses, r.closingBalance]).toEqual([10500, 4600, 3400, 11700]);
    s = ok(s, { type: 'ADVANCE_SHIFT' });
    s = fullShift(s);
    const sum = s.economy.ledger.reduce((a, t) => a + t.amount, 10500);
    expect(s.economy.balance).toBe(sum);
  });
  it('never goes negative without a debt mechanism: unpaid wages become obligations', () => {
    let s = structuredClone(createInitialState());
    s.economy.balance = 0;
    s.staff.forEach((p) => (p.salary = 5000));
    s = fullShift(s);
    expect(s.economy.balance).toBe(0);
    expect(s.economy.unpaidObligations).toBe(12 * 5000 - 4600);
  });
  it('SHIFT-01: unresolved incidents carry over to the next shift, escalated ones keep their state', () => {
    let s = fullShift(createInitialState());
    const openBefore = s.incidents.filter(isOpen).map((i) => i.id);
    expect(s.incidents.filter((i) => i.state === 'escalated').length).toBeGreaterThan(0);
    s = ok(s, { type: 'ADVANCE_SHIFT' });
    for (const id of openBefore) expect(isOpen(s.incidents.find((i) => i.id === id)!)).toBe(true);
    // Вызовы смены 2: один к брифингу, остальные приходят в течение дня.
    expect(s.incidents.filter((i) => i.createdShift === 2)).toHaveLength(1);
    expect(s.incoming.map((c) => c.incident.createdShift)).toEqual([2, 2]);
  });
  it('calls arrive during the shift: a new call pauses the game, its deadline counts from arrival', () => {
    let s = ok(fullShift(createInitialState()), { type: 'ADVANCE_SHIFT' });
    const [first, second] = s.incoming;
    expect(first!.at).toBeGreaterThanOrEqual(60);
    expect(second!.at).toBeLessThanOrEqual(540);
    expect(first!.at).toBeLessThanOrEqual(second!.at);
    expect(first!.incident.deadlineMinute).toBeGreaterThan(first!.at);
    s = ok(s, { type: 'START_SHIFT' });
    s = ok(s, { type: 'TICK', minutes: 600 });
    // Время остановилось ровно в минуту поступления, вызов на карте, игра на паузе.
    expect(s.minute).toBe(first!.at);
    expect(s.paused).toBe(true);
    expect(s.incidents.some((i) => i.id === first!.incident.id)).toBe(true);
    expect(s.log.at(-1)!.text).toBe(`Новый вызов: ${first!.incident.title}.`);
    expect(reduce(s, { type: 'TICK', minutes: 1 }).ok).toBe(false);
    s = ok(s, { type: 'RESUME' });
    expect(ok(s, { type: 'TICK', minutes: 1 }).minute).toBe(first!.at + 1);
  });
  it('ending the shift early does not dodge calls: the rest arrive and carry over', () => {
    let s = ok(fullShift(createInitialState()), { type: 'ADVANCE_SHIFT' });
    const pending = s.incoming.map((c) => c.incident.id);
    s = ok(ok(s, { type: 'START_SHIFT' }), { type: 'END_SHIFT' });
    expect(s.incoming).toHaveLength(0);
    for (const id of pending) expect(isOpen(s.incidents.find((i) => i.id === id)!)).toBe(true);
  });
  it('escalation lowers district safety and is written to the log', () => {
    let s = ok(createInitialState(), { type: 'START_SHIFT' });
    s = tick(s, 12); // medriot: срок 12 минут
    expect(s.incidents.find((i) => i.id === 'medriot')!.state).toBe('escalated');
    expect(s.districts.find((d) => d.id === 'medical')!.safety).toBe(70);
    expect(s.log.at(-1)!.type).toBe('incident_escalated');
  });
  it('acknowledging is a game action distinct from selection and only works once', () => {
    const s = ok(createInitialState(), { type: 'ACKNOWLEDGE_INCIDENT', incidentId: 'bioleak' });
    expect(s.incidents.find((i) => i.id === 'bioleak')!.state).toBe('acknowledged');
    expect(reduce(s, { type: 'ACKNOWLEDGE_INCIDENT', incidentId: 'bioleak' }).ok).toBe(false);
  });
  it('every successful state-changing command adds at least one log entry', () => {
    const s = createInitialState();
    for (const c of [{ type: 'START_SHIFT' }, { type: 'ACKNOWLEDGE_INCIDENT', incidentId: 'raid' }] as Command[]) {
      // raid «на месте» → отказ; проверяем только успешные
      const r = reduce(s, c);
      if (r.ok) expect(r.state.log.length).toBeGreaterThan(s.log.length);
    }
  });
});
