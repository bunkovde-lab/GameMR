import { describe, expect, it } from 'vitest';
import { createSandboxState, SANDBOX_GOAL_LABEL, SANDBOX_RULES, advanceSandboxMinute, checkSandboxDefeat, concludeSandboxCase, resolveSandboxOperation, sandboxGoalFor, spawnSandboxEvent } from '../../src/core/sandbox';
import { caseFile, openCaseFromReport } from '../../src/core/investigations';
import { reduce } from '../../src/core/reduce';
import { exportJson } from '../../src/persistence/saveStore';
import { parseSave } from '../../src/persistence/saveFormat';
import type { GameState, OperationReport } from '../../src/core/types';
import { ok, tick } from './helpers';

function report(s: GameState, incidentId: string, outcome: OperationReport['outcome'] = 'success'): OperationReport {
  const inc = s.incidents.find((i) => i.id === incidentId)!;
  return {
    id: s.nextIds.report++, shift: s.shift, minute: s.minute, incidentId, incidentTitle: inc.title,
    squadId: 'axon', squadName: 'Аксон', memberIds: ['p1', 'p2', 'p3'], tactic: 'recon', outcome,
    decisions: [], tasks: [{ label: 'Сохранность улик', result: outcome === 'failure' ? 'failed' : 'done' }],
    casualties: [], xp: 0, fatigue: 0, equipment: [], district: { safety: 0, trust: 0 }, seen: false,
  };
}

function openedCase(): GameState {
  const s = createSandboxState();
  const inc = s.incidents[0]!;
  openCaseFromReport(s, report(s, inc.id), inc.templateId, () => {});
  inc.state = 'resolved_success';
  return s;
}

function supportTrueVersion(s: GameState) {
  const f = caseFile(s, 'c1')!;
  for (const id of ['e02', 'e05', 'e06']) {
    if (!f.evidence.some((e) => e.id === id)) f.evidence.push({ id, foundShift: 1, analysis: 'confirmed', checks: 1, questionable: false });
    const ev = f.evidence.find((e) => e.id === id)!;
    ev.analysis = 'confirmed';
    ev.questionable = false;
    f.links.push({ evidenceId: id, hypothesisId: 'h1d' });
  }
  s.rng = { state: 0, cursor: 0 };
}

describe('Sandbox vertical slice: continuous play and case events', () => {
  it('starts with one district, one squad, four key heroes and only the active case event', () => {
    const s = createSandboxState();
    expect(s.phase).toBe('ACTIVE');
    expect(s.sandbox!.unlockedDistricts).toEqual(['admin']);
    expect(s.squads).toHaveLength(1);
    expect(s.squads[0]!.memberIds).toEqual(['p1', 'p2', 'p3']);
    expect(s.staff.slice(0, 4).map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(s.incidents).toHaveLength(1);
    expect(s.incidents[0]!.sandbox).toMatchObject({ caseId: 'c1', eventId: 'c1-open' });
    expect(s.incoming).toEqual([]);
  });

  it('manual pause is owned by the player and time never ends a sandbox shift', () => {
    let s = ok(createSandboxState(), { type: 'PAUSE' });
    expect(reduce(s, { type: 'TICK', minutes: 10 }).ok).toBe(false);
    s = ok(s, { type: 'RESUME' });
    s = ok(s, { type: 'TICK', minutes: 721 });
    expect(s.minute).toBe(721);
    expect(s.phase).toBe('ACTIVE');
    expect(reduce(s, { type: 'END_SHIFT' }).ok).toBe(false);
    expect(reduce(s, { type: 'ADVANCE_SHIFT' }).ok).toBe(false);
  });

  it('a field action creates a map event; failure opens a fallback instead of restarting the case', () => {
    let s = openedCase();
    const before = caseFile(s, 'c1')!;
    s = ok(s, { type: 'CASE_ACTION', caseId: 'c1', actionId: 'a_route' });
    const field = s.incidents.find((i) => i.sandbox?.actionId === 'a_route')!;
    expect(field.sandbox).toMatchObject({ eventId: 'c1-route', fallback: false });
    expect(caseFile(s, 'c1')).toEqual(before);
    field.state = 'resolved_success';
    resolveSandboxOperation(s, report(s, field.id, 'failure'));
    const fallback = s.incidents.find((i) => i.sandbox?.actionId === 'a_route' && i.sandbox.fallback)!;
    expect(fallback).toBeDefined();
    expect(caseFile(s, 'c1')!.actionsDone).not.toContain('a_route');
    expect(caseFile(s, 'c1')!.status).toBe('open');
    fallback.state = 'resolved_success';
    resolveSandboxOperation(s, report(s, fallback.id));
    expect(caseFile(s, 'c1')!.actionsDone).toContain('a_route');
    expect(caseFile(s, 'c1')!.evidence.find((e) => e.id === 'e06')!.questionable).toBe(true);
  });

  it('an expired case event also creates an alternative branch', () => {
    const s = openedCase();
    const withField = ok(s, { type: 'CASE_ACTION', caseId: 'c1', actionId: 'a_route' });
    const field = withField.incidents.find((i) => i.sandbox?.actionId === 'a_route')!;
    field.deadlineMinute = withField.minute + 1;
    const next = ok(withField, { type: 'TICK', minutes: 1 });
    expect(field.id).toBeTruthy();
    expect(next.incidents.find((i) => i.id === field.id)!.state).toBe('expired');
    expect(next.incidents.some((i) => i.sandbox?.eventId === 'c1-route' && i.sandbox.fallback)).toBe(true);
    expect(caseFile(next, 'c1')!.status).toBe('open');
  });

  it('the active case offers all six goal labels and a playable finale chain', () => {
    const s = openedCase();
    expect(Object.keys(SANDBOX_GOAL_LABEL).sort()).toEqual(['arrest', 'evidence', 'finale', 'prevention', 'surveillance', 'witness'].sort());
    const arrest = spawnSandboxEvent(s, 'c1-arrest');
    expect(sandboxGoalFor(arrest)).toBe('arrest');
    arrest.state = 'resolved_success';
    resolveSandboxOperation(s, report(s, arrest.id));
    const prevention = s.incidents.find((i) => i.sandbox?.eventId === 'c1-prevent')!;
    expect(sandboxGoalFor(prevention)).toBe('prevention');
    prevention.state = 'resolved_success';
    resolveSandboxOperation(s, report(s, prevention.id));
    const finale = s.incidents.find((i) => i.sandbox?.eventId === 'c1-finale')!;
    expect(sandboxGoalFor(finale)).toBe('finale');
    finale.state = 'resolved_success';
    resolveSandboxOperation(s, report(s, finale.id));
    expect(caseFile(s, 'c1')!.status).toBe('open');
    expect(s.sandbox!.result).toBeNull();
  });
});

describe('Sandbox vertical slice: outcomes, resources and recovery', () => {
  it('full disclosure controls the district, opens the next one and grants the reward only once', () => {
    const s = openedCase();
    supportTrueVersion(s);
    const before = s.economy.balance;
    concludeSandboxCase(s, 'c1', 'charge_noris', 'h1d');
    expect(s.sandbox!.result).toMatchObject({ outcome: 'full', episode: expect.any(String) });
    expect(s.sandbox!.controlledDistricts).toEqual(['admin']);
    expect(s.sandbox!.unlockedDistricts).toContain('residential');
    expect(s.sandbox!.activeCaseId).toBe('c2');
    expect(s.economy.balance - before).toBe(2000);
    expect(s.incidents.some((i) => i.sandbox?.eventId === 'c2-open')).toBe(true);
    const rewarded = s.economy.balance;
    concludeSandboxCase(s, 'c1', 'charge_noris', 'h1d');
    expect(s.economy.balance).toBe(rewarded);
    expect(s.sandbox!.rewardedCases).toEqual(['c1']);
  });

  it('partial closure opens the district with a complication and the smaller reward', () => {
    const s = openedCase();
    const trust = s.districts.find((d) => d.id === 'admin')!.civilianTrust;
    const before = s.economy.balance;
    concludeSandboxCase(s, 'c1', 'audit');
    expect(s.sandbox!.result).toMatchObject({ outcome: 'partial', complication: expect.any(String) });
    expect(s.sandbox!.unlockedDistricts).toContain('residential');
    expect(s.economy.balance - before).toBe(800);
    expect(s.districts.find((d) => d.id === 'admin')!.civilianTrust).toBe(trust - 10);
  });

  it('a wrong final conclusion resets only case materials and never reveals the right answer', () => {
    const s = openedCase();
    const f = caseFile(s, 'c1')!;
    f.asked.push('p1:l1');
    f.actionsDone.push('a_pay');
    s.staff[0]!.health = 'serious_injury';
    s.economy.balance -= 500;
    const balance = s.economy.balance;
    concludeSandboxCase(s, 'c1', 'discipline');
    expect(caseFile(s, 'c1')).toBeUndefined();
    expect(s.incidents.filter((i) => i.sandbox?.caseId === 'c1')).toHaveLength(1);
    expect(s.incidents[0]!.state).toBe('new');
    expect(s.staff[0]!.health).toBe('serious_injury');
    expect(s.economy.balance).toBe(balance);
    expect(s.sandbox!.caseRuns.c1!.attempts).toBe(1);
    expect(s.sandbox!.result!.title).toBe('Заключение опровергнуто');
    expect(JSON.stringify(s.sandbox!.result)).not.toContain('h1d');
  });

  it('the second squad is purchasable only after a second district and never exceeds district count', () => {
    let s = createSandboxState();
    expect(reduce(s, { type: 'BUY_SANDBOX_SQUAD' }).ok).toBe(false);
    s.sandbox!.unlockedDistricts.push('residential');
    const before = s.economy.balance;
    s = ok(s, { type: 'BUY_SANDBOX_SQUAD' });
    expect(s.squads).toHaveLength(2);
    expect(s.squads[1]!.memberIds).toEqual(['p4', 'p5', 'p6']);
    expect(before - s.economy.balance).toBe(SANDBOX_RULES.squadSlotCostRe * 100);
    expect(reduce(s, { type: 'BUY_SANDBOX_SQUAD' }).ok).toBe(false);
  });

  it('serious injuries recover in continuous time and story difficulty has no permanent death', () => {
    const s = openedCase();
    s.staff[0]!.health = 'serious_injury';
    const inc = s.incidents[0]!;
    const r = report(s, inc.id, 'partial');
    r.casualties.push({ staffId: 'p1', name: s.staff[0]!.name, before: 'healthy', after: 'serious_injury' });
    resolveSandboxOperation(s, r);
    expect(s.sandbox!.recovery.p1).toBe(s.minute + SANDBOX_RULES.recoveryMinutes);
    for (let i = 0; i < SANDBOX_RULES.recoveryMinutes; i++) {
      s.minute += 1;
      advanceSandboxMinute(s);
    }
    expect(s.staff[0]!.health).toBe('healthy');
    expect(s.sandbox!.recovery.p1).toBeUndefined();

    for (let seed = 1; seed <= 20; seed++) {
      let run = createSandboxState(seed);
      run = ok(run, { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: run.incidents[0]!.id });
      run.squads[0]!.operation!.riskLevel = 4;
      run.squads[0]!.operation!.forecast.p = 0;
      run = tick(run, 400);
      expect(run.staff.every((p) => p.health !== 'dead')).toBe(true);
    }
  });

  it('loss of order, legitimacy or readiness pauses the scenario and blocks further time', () => {
    for (const key of ['order', 'legitimacy', 'readiness'] as const) {
      const s = createSandboxState();
      s.sandbox![key] = 0;
      checkSandboxDefeat(s);
      expect(s.sandbox!.defeatReason).toBeTruthy();
      expect(s.paused).toBe(true);
      expect(reduce(s, { type: 'RESUME' }).ok).toBe(false);
      expect(reduce(s, { type: 'TICK', minutes: 1 }).ok).toBe(false);
    }
  });

  it('sandbox export/import is lossless and deterministic', () => {
    const s = openedCase();
    const loaded = parseSave(exportJson(s));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(s);
    expect(ok(loaded.state, { type: 'TICK', minutes: 30 })).toEqual(ok(s, { type: 'TICK', minutes: 30 }));
  });
});
