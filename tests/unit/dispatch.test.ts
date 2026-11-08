import { describe, expect, it } from 'vitest';
import {
  computeForecast, defaultDraft, forecastTerms, forecastWord, memberBlocker, planDispatch, tacticBlocker,
} from '../../src/core/dispatch';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { parseSave } from '../../src/persistence/saveFormat';
import type { Command, GameState } from '../../src/core/types';

const ok = (s: GameState, c: Command) => {
  const r = reduce(s, c);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const started = () => ok(createInitialState(), { type: 'START_SHIFT' });
const squad = (s: GameState, id: string) => s.squads.find((q) => q.id === id)!;

describe('W4 forecast — ТЗ §6.3 formula', () => {
  it('quick dispatch «Аксон» → riot: A = 4 + 3 + 0.55×4 + I1 + C1 + T1 + G2 − F0 − R0 = 14.2; D14; P = 0.55 + 0.065×0.2', () => {
    const s = started();
    const d = defaultDraft(s, 'axon', 'medriot');
    expect(d.memberIds).toEqual(['p1', 'p2']);
    expect(d.tactic).toBe('arrest');
    expect(d.equipmentIds).toEqual(['riot_kit-1', 'sedative-1']);
    const t = forecastTerms(s, d);
    expect(t.S).toEqual([4, 3, 4]);
    expect({ I: t.I, C: t.C, T: t.T, G: t.G, F: t.F, R: t.R, D: t.D }).toEqual({ I: 1, C: 1, T: 1, G: 2, F: 0, R: 0, D: 14 });
    expect(t.A).toBeCloseTo(14.2, 6);
    const f = computeForecast(s, d);
    expect(f.p).toBeCloseTo(0.563, 3);
    expect([f.low, f.high]).toEqual([0.45, 0.65]);
    expect(forecastWord(f)).toBe('Вероятный успех');
  });

  it('probability is clamped to 0.95 and better intel narrows the shown range', () => {
    const s = started();
    const easy = computeForecast(s, { ...defaultDraft(s, 'resonance', 'missing'), tactic: 'recon' });
    expect(easy.p).toBe(0.95);
    const base = defaultDraft(s, 'resonance', 'illegal');
    const blind = computeForecast(s, { ...base, tactic: 'arrest' }); // разведка 0
    const scouted = computeForecast(s, { ...base, tactic: 'recon' }); // разведка 1
    expect(scouted.high - scouted.low).toBeLessThan(blind.high - blind.low);
  });

  it('no tactic is unconditionally best: the recommended tactic depends on the incident', () => {
    const s = started();
    expect(defaultDraft(s, 'resonance', 'bioleak').tactic).toBe('quarantine');
    expect(defaultDraft(s, 'resonance', 'illegal').tactic).toBe('recon');
    expect(defaultDraft(s, 'axon', 'medriot').tactic).toBe('arrest');
  });

  it('forecast never touches the RNG (CORE-02)', () => {
    const s = started();
    const before = s.rng;
    for (let i = 0; i < 50; i++) planDispatch(s, defaultDraft(s, 'axon', 'bioleak'));
    expect(s.rng).toEqual(before);
  });
});

describe('W4 availability reasons — ТЗ §6.2', () => {
  it('members: busy squad, exhaustion and injury give a reason', () => {
    const s = started();
    expect(memberBlocker(s, 'p3', 'axon')).toBe('занят: отряд «Вектор»');
    s.staff.find((p) => p.id === 'p9')!.fatigue = 85;
    expect(memberBlocker(s, 'p9', 'axon')).toBe('переутомление');
    s.staff.find((p) => p.id === 'p10')!.health = 'serious_injury';
    expect(memberBlocker(s, 'p10', 'axon')).toBe('тяжёлое ранение');
    expect(memberBlocker(s, 'p2', 'axon')).toBeNull();
  });

  it('tactics: suppression needs a guard or Ловчий, quarantine a biocriminalist or a biosuit', () => {
    const s = started();
    expect(tacticBlocker(s, 'suppression', ['p9'], [])).toBe('нужен страж или Ловчий');
    expect(tacticBlocker(s, 'suppression', ['p9', 'p10'], [])).toBeNull();
    expect(tacticBlocker(s, 'quarantine', ['p9'], [])).toBe('нужен биокриминалист или биозащитный костюм');
    expect(tacticBlocker(s, 'quarantine', ['p9'], ['biosuit-1'])).toBeNull();
  });

  it('plan lists every blocker; the core rejects with the first one', () => {
    const s = started();
    const d = { ...defaultDraft(s, 'axon', 'medriot'), memberIds: ['p1', 'p2', 'p9', 'p10'], equipmentIds: ['riot_kit-1', 'riot_kit-2', 'sedative-1'] };
    const plan = planDispatch(s, d);
    expect(plan.blockers).toContain('В группе не больше 3 человек.');
    expect(plan.blockers).toContain('Транспорт вмещает не больше 2 единиц снаряжения.');
    const r = reduce(s, { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot', memberIds: d.memberIds });
    expect(r.ok).toBe(false);
    const r2 = reduce(s, { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot', commanderId: 'p9' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('Командир должен входить в группу.');
  });
});

describe('W4 dispatch command', () => {
  it('quick dispatch stores tactic, commander, gear and forecast; gear becomes deployed', () => {
    const s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    const op = squad(s, 'axon').operation!;
    expect(op).toMatchObject({ incidentId: 'medriot', tactic: 'arrest', commanderId: 'p1', cohesion: 1, equipmentIds: ['riot_kit-1', 'sedative-1'] });
    expect(op.forecast.low).toBe(0.45);
    expect(s.equipment.filter((e) => e.state === 'deployed').map((e) => [e.id, e.squadId])).toEqual([['riot_kit-1', 'axon'], ['sedative-1', 'axon']]);
    // занятое снаряжение не уходит со вторым отрядом
    const r = reduce(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'bioleak', equipmentIds: ['riot_kit-1'] });
    expect(r.ok).toBe(false);
    expect(defaultDraft(s, 'resonance', 'raid').equipmentIds).not.toContain('riot_kit-1');
  });

  it('manual composition moves people between squads and loses cohesion (C = 0)', () => {
    const s = ok(started(), {
      type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'bioleak', memberIds: ['p1', 'p9'], commanderId: 'p9', tactic: 'recon', equipmentIds: [],
    });
    expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p9']);
    expect(squad(s, 'resonance').memberIds).toEqual(['p10']);
    expect(s.squads.some((q) => q.memberIds.includes('p2'))).toBe(false);
    expect(squad(s, 'axon').operation).toMatchObject({ commanderId: 'p9', tactic: 'recon', cohesion: 0, equipmentIds: [] });
    expect(s.log.at(-1)!.text).toContain('разведка');
  });

  it('save v2 → v3: equipment store appears, squads get no operation', () => {
    const v3 = createInitialState();
    const v2 = structuredClone(v3) as unknown as Record<string, unknown>;
    delete v2.equipment;
    (v2.squads as Record<string, unknown>[]).forEach((q) => delete q.operation);
    v2.schemaVersion = 2;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 2, savedAt: '', label: '', state: v2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.equipment).toHaveLength(11);
      expect(r.state.squads.every((q) => q.operation === null)).toBe(true);
    }
  });
});
