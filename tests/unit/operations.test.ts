import { describe, expect, it } from 'vitest';
import { pendingDecision } from '../../src/core/operations';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { parseSave, toSaveFile } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const squad = (s: GameState, id: string) => s.squads.find((q) => q.id === id)!;
const incident = (s: GameState, id: string) => s.incidents.find((i) => i.id === id)!;
const staff = (s: GameState, id: string) => s.staff.find((p) => p.id === id)!;

/** Рядовой вызов: «Аксон» на пропажу регистратора, без развилок. */
const routine = (seed: number) => tick(ok(started(seed), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' }), 40);

describe('W5 special operation (ТЗ §12): «Вектор» на вооружённой вылазке', () => {
  it('DECISION_PAUSE: three phases, time stands still while deciding, shift cannot end', () => {
    let s = ok(started(), { type: 'TICK', minutes: 10 });
    expect(s.minute).toBe(5);
    const p = pendingDecision(s)!;
    expect([p.squad.id, p.stage.phase, p.index, p.total]).toEqual(['vector', 'Подход', 0, 3]);
    expect(reduce(s, { type: 'TICK', minutes: 1 }).ok).toBe(false);
    expect(reduce(s, { type: 'END_SHIFT' }).ok).toBe(false);
    expect(reduce(s, { type: 'CHOOSE_OPTION', squadId: 'axon', optionId: 'observe' }).ok).toBe(false);
    s = ok(s, { type: 'CHOOSE_OPTION', squadId: 'vector', optionId: 'observe' });
    expect(pendingDecision(s)).toBeNull();
    s = ok(s, { type: 'TICK', minutes: 10 });
    expect([s.minute, pendingDecision(s)!.stage.phase]).toEqual([9, 'Контакт']);
    s = ok(s, { type: 'CHOOSE_OPTION', squadId: 'vector', optionId: 'hold' });
    s = ok(s, { type: 'TICK', minutes: 10 });
    expect(pendingDecision(s)!.stage.phase).toBe('Кризис');
    s = ok(s, { type: 'CHOOSE_OPTION', squadId: 'vector', optionId: 'secure' });
    s = ok(s, { type: 'TICK', minutes: 2 });
    const r = s.operationReports[0]!;
    expect(r.decisions.map((d) => d.stage)).toEqual(['Подход', 'Контакт', 'Кризис']);
    expect(['resolved_success', 'resolved_partial', 'failed']).toContain(incident(s, 'raid').state);
    expect(r.tasks.map((t) => t.label)).toEqual(['Цель операции', 'Безопасность горожан', 'Сохранность улик']);
    expect(s.log.some((e) => e.type === 'operation_completed')).toBe(true);
    expect(['returning', 'ready', 'resting', 'unavailable']).toContain(squad(s, 'vector').status);
  });

  it('different decisions lead to different consequences (civilians, evidence)', () => {
    const play = (choices: string[]) => {
      let s = started();
      for (const c of choices) {
        s = ok(s, { type: 'TICK', minutes: 10 });
        s = ok(s, { type: 'CHOOSE_OPTION', squadId: 'vector', optionId: c });
      }
      return ok(s, { type: 'TICK', minutes: 5 }).operationReports[0]!;
    };
    const careful = play(['observe', 'hold', 'container']);
    const rough = play(['enter', 'suppress', 'chase']);
    expect(careful.tasks.find((t) => t.label === 'Безопасность горожан')!.result).toBe('done');
    expect(rough.tasks.find((t) => t.label === 'Безопасность горожан')!.result).toBe('failed');
    expect(careful.tasks.find((t) => t.label === 'Сохранность улик')!.result).toBe('done');
  });

  it('save during a decision and load → the same decision and identical continuation', () => {
    const s = ok(started(), { type: 'TICK', minutes: 10 });
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(s, 'x', new Date(0)))));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(pendingDecision(loaded.state)!.stage.title).toBe(pendingDecision(s)!.stage.title);
    expect(JSON.stringify(tick(loaded.state, 60))).toBe(JSON.stringify(tick(s, 60)));
  });
});

describe('W5 routine operation and outcome', () => {
  it('a routine call resolves on its own after arrival + work on scene, the squad drives back and gear returns', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    const gear = squad(s, 'axon').operation!.equipmentIds;
    const eta = Math.ceil(squad(s, 'axon').movement!.route.totalMinutes);
    s = tick(s, eta);
    expect(squad(s, 'axon').status).toBe('on_scene');
    expect(squad(s, 'axon').operation!.timer).toBe(4 + 6); // рядовое 4 мин + разведка 6 мин
    s = tick(s, 60);
    const r = s.operationReports.find((x) => x.incidentId === 'missing')!;
    expect(r.decisions).toEqual([]);
    expect(['resolved_success', 'resolved_partial', 'failed']).toContain(incident(s, 'missing').state);
    expect(['ready', 'resting']).toContain(squad(s, 'axon').status);
    expect(squad(s, 'axon').operation).toBeNull();
    for (const id of gear) expect(['available', 'damaged', 'consumed']).toContain(s.equipment.find((e) => e.id === id)!.state);
    expect(staff(s, 'p1').fatigue).toBeGreaterThan(20);
  });

  it('CORE-01: the same seed and decisions give the same outcome and wounds', () => {
    expect(JSON.stringify(routine(11).operationReports)).toBe(JSON.stringify(routine(11).operationReports));
  });

  it('over many seeds the success rate follows the forecast, and success does not exclude wounds (ТЗ §6.3)', () => {
    const p = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' }).squads.find((q) => q.id === 'axon')!.operation!.forecast.p;
    let success = 0, partial = 0, failure = 0, woundedOnSuccess = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const r = routine(seed).operationReports.find((x) => x.incidentId === 'missing')!;
      if (r.outcome === 'success') { success++; if (r.casualties.length) woundedOnSuccess++; }
      else if (r.outcome === 'partial') partial++;
      else failure++;
    }
    expect(success / N).toBeGreaterThan(p - 0.1 - 0.07);
    expect(success / N).toBeLessThan(p - 0.1 + 0.07);
    expect(partial).toBeGreaterThan(0);
    expect(woundedOnSuccess).toBeGreaterThan(0);
    expect(failure + partial + success).toBe(N);
  });

  it('death is permanent: the fallen leave the squad, stay dead after save/load and in the next shift', () => {
    let found: GameState | null = null;
    for (let seed = 1; seed <= 3000 && !found; seed++) {
      const s = ok(ok(started(seed), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot', tactic: 'suppression' }), { type: 'PAUSE' });
      const done = tick(ok(s, { type: 'RESUME' }), 40, (o) => (o.includes('breach') ? 'breach' : o[0]!));
      if (done.staff.some((p) => p.health === 'dead')) found = done;
    }
    expect(found).not.toBeNull();
    const s = found!;
    const dead = s.staff.filter((p) => p.health === 'dead').map((p) => p.id);
    for (const q of s.squads) for (const id of dead) expect(q.memberIds).not.toContain(id);
    expect(s.log.some((e) => e.type === 'staff_killed')).toBe(true);
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(s, 'x', new Date(0)))));
    expect(loaded.ok && loaded.state.staff.filter((p) => p.health === 'dead').map((p) => p.id)).toEqual(dead);
    const next = ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' });
    for (const id of dead) expect(staff(next, id).health).toBe('dead');
    expect(next.reports[0]!.killed).toBe(dead.length);
  });

  it('light wounds heal between shifts, serious ones stay until treatment (W6)', () => {
    let s = started();
    staff(s, 'p5').health = 'light_injury';
    staff(s, 'p7').health = 'serious_injury';
    s = ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' });
    expect(staff(s, 'p5').health).toBe('healthy');
    expect(staff(s, 'p7').health).toBe('serious_injury');
  });

  it('the shift report counts operations from the operation reports', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    s = ok(tick(s, 720), { type: 'END_SHIFT' });
    const ops = s.reports[0]!.operations;
    expect(ops.success + ops.partial + ops.failure).toBe(s.operationReports.length);
    expect(s.operationReports.length).toBe(2); // «Вектор» на вылазке и «Аксон» на пропаже
  });

  it('acknowledging an operation report marks it seen once', () => {
    let s = routine(3);
    const id = s.operationReports[0]!.id;
    s = ok(s, { type: 'ACK_OPERATION_REPORT', reportId: id });
    expect(s.operationReports[0]!.seen).toBe(true);
    expect(reduce(s, { type: 'ACK_OPERATION_REPORT', reportId: 999 }).ok).toBe(false);
  });

  it('save v3 → v4: operations in progress keep going', () => {
    const v4 = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    const v3 = structuredClone(v4) as unknown as Record<string, unknown>;
    delete v3.operationReports;
    delete (v3.nextIds as Record<string, unknown>).report;
    for (const q of v3.squads as Record<string, Record<string, unknown> | null>[]) {
      const op = q.operation as Record<string, unknown> | null;
      if (op) for (const k of ['riskLevel', 'phase', 'timer', 'stageIndex', 'pDelta', 'riskDelta', 'civil', 'evidence', 'decisions']) delete op[k];
    }
    v3.schemaVersion = 3;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 3, savedAt: '', label: '', state: v3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = tick(r.state, 60);
    expect(after.operationReports.some((x) => x.incidentId === 'missing')).toBe(true);
  });
});
