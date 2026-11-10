import { describe, expect, it } from 'vitest';
import { defaultDraft, memberBlocker } from '../../src/core/dispatch';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { reserve, suitability, treatmentForecast, vacancies } from '../../src/core/staff';
import { parseSave } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const person = (s: GameState, id: string) => s.staff.find((p) => p.id === id)!;
const squad = (s: GameState, id: string) => s.squads.find((q) => q.id === id)!;
const nextShift = (s: GameState) => ok(ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
const wound = (s: GameState, ...ids: string[]) => { for (const id of ids) person(s, id).health = 'serious_injury'; return s; };

describe('W6 medicine (ТЗ §7.4, §15.1)', () => {
  it('standard treatment of a serious wound: 2 РЕ, 3 shifts, prognosis never says 0% risk', () => {
    const s = wound(started(), 'p5');
    const f = treatmentForecast(s, 'p5', 'standard');
    expect([f.cost, f.shifts, f.returnShift, f.queued, f.blocker]).toEqual([200, 3, 4, false, null]);
    expect(f.complication).not.toMatch(/нет|0/);
    expect(treatmentForecast(s, 'p5', 'accelerated').cost).toBe(400);
    const after = ok(s, { type: 'START_TREATMENT', staffId: 'p5', plan: 'standard' });
    expect(after.economy.ledger.at(-1)).toMatchObject({ kind: 'treatment', amount: -200 });
    expect(memberBlocker(after, 'p5', 'sigma')).toBe('тяжёлое ранение');
  });

  it('beds limit the number of patients; the next one waits in a queue and is admitted when a bed frees', () => {
    let s = wound(started(), 'p5', 'p6', 'p11');
    s = ok(s, { type: 'START_TREATMENT', staffId: 'p5', plan: 'accelerated' });
    s = ok(s, { type: 'START_TREATMENT', staffId: 'p6', plan: 'standard' });
    expect(treatmentForecast(s, 'p11', 'standard').queued).toBe(true);
    s = ok(s, { type: 'START_TREATMENT', staffId: 'p11', plan: 'standard' });
    expect(s.medical.patients.map((p) => [p.staffId, p.status])).toEqual([['p5', 'treating'], ['p6', 'treating'], ['p11', 'queued']]);
    expect(s.economy.ledger.filter((t) => t.kind === 'treatment')).toHaveLength(2); // очередь платит при поступлении
    for (let i = 0; i < 4 && s.medical.patients.find((p) => p.staffId === 'p11')!.status === 'queued'; i++) s = nextShift(s);
    expect(s.medical.patients.find((p) => p.staffId === 'p11')?.status).toBe('treating');
  });

  it('regeneration needs a free capsule; without one the plan is blocked with a reason', () => {
    let s = wound(started(), 'p5', 'p6');
    s = ok(s, { type: 'START_TREATMENT', staffId: 'p5', plan: 'regenerative' });
    const r = reduce(s, { type: 'START_TREATMENT', staffId: 'p6', plan: 'regenerative' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Нет свободной регенерационной капсулы.');
    expect(treatmentForecast(s, 'p6', 'standard').blocker).toBeNull();
    expect(reduce(started(), { type: 'START_TREATMENT', staffId: 'p1', plan: 'standard' }).ok).toBe(false); // здоров
  });

  it('after treatment the person returns to service; complications happen on some seeds', () => {
    let complications = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let s = ok(wound(started(seed), 'p5'), { type: 'START_TREATMENT', staffId: 'p5', plan: 'accelerated' });
      for (let i = 0; i < 5 && person(s, 'p5').health !== 'healthy'; i++) s = nextShift(s);
      expect(person(s, 'p5').health).toBe('healthy');
      expect(s.medical.patients).toHaveLength(0);
      if (s.log.some((e) => e.type === 'treatment_complication')) complications++;
    }
    expect(complications).toBeGreaterThan(0);
    expect(complications).toBeLessThan(60);
  });

  it('a squad that was in treatment is ready for the next shift', () => {
    expect(squad(nextShift(started()), 'cortex').status).toBe('ready');
  });
});

describe('W6 staff and assignments (UI-14)', () => {
  it('reserve, transfer and a permanent commander used by quick dispatch', () => {
    let s = ok(started(), { type: 'UNASSIGN_STAFF', staffId: 'p2' });
    expect(reserve(s).map((p) => p.id)).toEqual(['p2']);
    s = ok(s, { type: 'ASSIGN_STAFF', staffId: 'p2', squadId: 'resonance' });
    s = ok(s, { type: 'SET_COMMANDER', squadId: 'resonance', staffId: 'p10' });
    expect(defaultDraft(s, 'resonance', 'bioleak').commanderId).toBe('p10');
    expect(reduce(s, { type: 'SET_COMMANDER', squadId: 'axon', staffId: 'p10' }).ok).toBe(false);
    expect(reduce(s, { type: 'UNASSIGN_STAFF', staffId: 'p3' }).ok).toBe(false); // «Вектор» на задании
  });
});

describe('W6 hiring (ТЗ §7.6, UI-13)', () => {
  it('one open biocriminalist vacancy at start with three candidates; suitability uses the dossier, not hidden stats', () => {
    const s = started();
    expect(vacancies(s)).toEqual({ guard: 0, investigator: 0, lovchiy: 0, biocriminalist: 1, analyst: 0 });
    expect(s.candidates).toHaveLength(3);
    expect(s.candidates.every((c) => c.role === 'biocriminalist')).toBe(true);
    const c = structuredClone(s.candidates[0]!);
    const before = suitability(c).score;
    c.stats.analysis = 1; // скрытое качество не влияет на оценку
    expect(suitability(c).score).toBe(before);
    expect(JSON.stringify(createInitialState(5).candidates)).toBe(JSON.stringify(createInitialState(5).candidates));
  });

  it('deep check costs money and time, then verifies the dossier and reveals obligations', () => {
    let s = started();
    const id = s.candidates[0]!.id;
    s = ok(s, { type: 'DEEP_CHECK', candidateId: id });
    expect(s.economy.ledger.at(-1)).toMatchObject({ kind: 'check', amount: -100 });
    expect(reduce(s, { type: 'DEEP_CHECK', candidateId: id }).ok).toBe(false);
    s = nextShift(s);
    const c = s.candidates.find((x) => x.id === id)!;
    expect(c.check).toBe('done');
    expect(Object.values(c.dossier).every((d) => d === 'verified')).toBe(true);
    expect(c.reported).toEqual(c.stats);
    expect(c.patronKnown).toBe(true);
  });

  it('hiring needs a vacancy and money; the new hire goes to reserve, adapts, and is paid from the next shift', () => {
    let s = started();
    const c = s.candidates[0]!;
    s = ok(s, { type: 'HIRE', candidateId: c.id });
    expect(s.economy.ledger.at(-1)).toMatchObject({ kind: 'hiring', amount: -1500 });
    const hired = s.staff.at(-1)!;
    expect([hired.id, hired.role, hired.name]).toEqual(['p13', 'biocriminalist', c.name]);
    expect(reserve(s).map((p) => p.id)).toContain('p13');
    expect(s.candidates).toHaveLength(0);
    if (hired.adaptation > 0) expect(memberBlocker(s, 'p13', 'axon')).toBe('адаптация после найма');
    s = ok(s, { type: 'END_SHIFT' });
    expect(s.economy.ledger.at(-1)).toMatchObject({ kind: 'salary', amount: -(3400 + hired.salary) });
  });

  it('a death opens a vacancy and candidates appear in the next shift', () => {
    let s = started();
    s.candidates = [];
    person(s, 'p10').health = 'dead';
    squad(s, 'resonance').memberIds = ['p9'];
    expect(vacancies(s).guard).toBe(1);
    s = nextShift(s);
    expect(s.candidates.filter((c) => c.role === 'guard')).toHaveLength(3);
  });

  it('save v4 → v5: clinic, candidates and commanders appear', () => {
    const v5 = started();
    const v4 = structuredClone(v5) as unknown as Record<string, unknown>;
    delete v4.medical;
    delete v4.candidates;
    for (const p of v4.staff as Record<string, unknown>[]) { delete p.adaptation; delete p.patron; }
    for (const q of v4.squads as Record<string, unknown>[]) delete q.commanderId;
    v4.schemaVersion = 4;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 4, savedAt: '', label: '', state: v4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.medical.patients).toEqual([]);
    expect(r.state.staff.every((p) => p.adaptation === 0)).toBe(true);
    expect(nextShift(r.state).candidates.length).toBeGreaterThan(0);
  });
});

describe('squad strip: fatigue and health tones', () => {
  it('uses the dispatch exhaustion threshold for red and marks wounds', async () => {
    const { fatigueTone, healthTone } = await import('../../src/ui/shell/SquadStrip');
    expect(fatigueTone(0)).toBe('green');
    expect(fatigueTone(40)).toBe('amber');
    expect(fatigueTone(79)).toBe('amber');
    expect(fatigueTone(80)).toBe('red');
    expect(healthTone('healthy')).toBe('ok');
    expect(healthTone('fatigued')).toBe('ok');
    expect(healthTone('light_injury')).toBe('wounded');
    expect(healthTone('critical')).toBe('wounded');
    expect(healthTone('recovering')).toBe('recovering');
    expect(healthTone('dead')).toBe('lost');
  });
});
