import { describe, expect, it } from 'vitest';
import {
  CASES, CASE_RULES, actionBlocker, actionPermitState, analysisView, caseDef, caseFile, caseForecast, concludeBlocker, evidenceDef,
  interrogationBlocker, linkStatus, openCaseFromReport, pairStatus, resolveRef, timelineComplete, timelineView,
} from '../../src/core/investigations';
import { CAMPAIGN, computeEnding } from '../../src/core/campaign';
import { SPECIAL_OPS, activeOp, opAvailability, opState, optionBlocker } from '../../src/core/specialOps';
import { hasFlag, setFlag } from '../../src/core/flags';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { parseSave, toSaveFile } from '../../src/persistence/saveFormat';
import type { CaseFile, GameState, OperationReport } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const report = (incidentId: string, evidence: 'done' | 'partial' | 'failed' = 'done') =>
  ({ incidentId, memberIds: [], tasks: [{ label: 'Сохранность улик', result: evidence }] }) as unknown as OperationReport;
/** Дело открыто так, как его открывает развязка операции (смена переставлена в окно дела). */
const withCase = (caseId = 'c1', evidence: 'done' | 'partial' | 'failed' = 'done', seed?: number, s0?: GameState) => {
  const s = structuredClone(s0 ?? started(seed));
  const d = caseDef(caseId)!;
  if (s.shift < d.fromShift) s.shift = d.fromShift;
  openCaseFromReport(s, report(d.templateId, evidence), d.templateId, () => {});
  return s;
};
const file = (s: GameState, id = 'c1') => caseFile(s, id)!;
const finish = (s: GameState) => tick(s, 200);
/** Положить улику в дело и выставить результат проверки — для правил, не зависящих от броска. */
const put = (s: GameState, caseId: string, id: string, a: CaseFile['evidence'][number]['analysis'] = 'confirmed') => {
  const f = file(s, caseId);
  if (!f.evidence.some((e) => e.id === id)) f.evidence.push({ id, foundShift: s.shift, analysis: 'none', checks: 0, questionable: false });
  f.evidence.find((e) => e.id === id)!.analysis = a;
};
const grant = (s: GameState, caseId: string, actionId: string) => {
  s = ok(s, { type: 'REQUEST_CASE_PERMIT', caseId, actionId });
  const p = s.politics.permits.find((x) => x.caseId === caseId && x.actionId === actionId)!;
  p.status = 'granted';
  return s;
};
const nextShift = (s: GameState) => ok(ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });

describe('W9 content: «Неисполненный жребий» (сценарий PR #27)', () => {
  it('three linked cases with 3–5 hypotheses, exactly one true version, a forgery and only resolvable references', () => {
    expect(CASES.map((c) => c.number)).toEqual([418, 431, 447]);
    for (const c of CASES) {
      expect(c.hypotheses.length).toBeGreaterThanOrEqual(3);
      expect(c.hypotheses.length).toBeLessThanOrEqual(5);
      expect(c.hypotheses.filter((h) => h.grade === 'true')).toHaveLength(1);
      expect(c.evidence.some((e) => e.forged)).toBe(true);
      const known = (r: string) => {
        const [cid, eid] = r.includes(':') ? r.split(':') : [c.id, r];
        return !!evidenceDef(caseDef(cid!)!, eid!);
      };
      for (const e of c.edges) expect(known(e.a) && known(e.b), `${c.id} edge ${e.a}-${e.b}`).toBe(true);
      for (const a of c.actions) for (const r of [...(a.requires ?? []), ...a.reveals]) expect(known(r), `${c.id} ${a.id} ${r}`).toBe(true);
      for (const p of c.persons) for (const l of p.lines) for (const r of [...(l.needs ?? []), ...(l.reveals ? [l.reveals] : [])]) expect(known(r), `${c.id} ${p.id} ${r}`).toBe(true);
      // Каждая не-сценная улика откуда-то добывается.
      for (const e of c.evidence.filter((x) => x.origin !== 'scene')) {
        const [kind, id] = e.origin.split(':');
        if (kind === 'action') expect(c.actions.find((a) => a.id === id)?.reveals, e.id).toContain(e.id);
        else expect(c.persons.find((p) => p.id === id)?.lines.some((l) => l.reveals === e.id), e.id).toBe(true);
      }
    }
  });

  it('the cases are linked: case №431 and №447 compare evidence from earlier cases', () => {
    expect(caseDef('c2')!.edges.some((e) => e.b.startsWith('c1:'))).toBe(true);
    expect(caseDef('c3')!.edges.some((e) => e.b.startsWith('c2:'))).toBe(true);
    expect(caseDef('c2')!.actions.find((a) => a.id === 'a_crosscheck')!.requires).toEqual(['c1:e03', 'c1:e08']);
  });

  it('campaign has 12 shifts, two special operations with 4 phases × 3 options and three endings', () => {
    expect(CAMPAIGN.nodes.map((n) => n.shift)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Object.keys(CAMPAIGN.endings).sort()).toEqual(['collapse', 'cost', 'order']);
    expect(SPECIAL_OPS).toHaveLength(2);
    for (const o of SPECIAL_OPS) {
      expect(o.phases).toHaveLength(4);
      for (const p of o.phases) expect(p.options).toHaveLength(3);
      expect(o.objectives.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('W9 opening a case', () => {
  it('the matching call opens the case with scene evidence; lost custody means fewer, questionable items', () => {
    const scene = caseDef('c1')!.evidence.filter((e) => e.origin === 'scene').length;
    expect(file(withCase('c1', 'done')).evidence).toHaveLength(scene);
    const bad = file(withCase('c1', 'failed'));
    expect(bad.evidence.every((e) => e.questionable)).toBe(true);
  });

  it('cases open only in their shift window: the shift-1 «Нелегальная модификация» call does not open №431', () => {
    const s = structuredClone(started());
    expect(openCaseFromReport(s, report('illegal'), 'illegal', () => {})).toBeNull();
    expect(openCaseFromReport(s, report('missing'), 'missing', () => {})).not.toBeNull();
  });

  it('a real dispatch to «Пропажа регистратора» opens case №418 after the operation', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    s = tick(s, 400);
    expect(file(s)).toBeDefined();
    expect(s.log.some((e) => e.type === 'case_opened' && e.text.includes('№418'))).toBe(true);
  });
});

describe('W9 evidence board: links and comparisons', () => {
  it('a link is proposed until the evidence is checked; an undetected forgery supports the wrong version', () => {
    const s = withCase();
    const d = caseDef('c1')!;
    expect(linkStatus(file(s), d, 'e02', 'h1d').status).toBe('proposed');
    put(s, 'c1', 'e02');
    expect(linkStatus(file(s), d, 'e02', 'h1d').status).toBe('supported');
    expect(linkStatus(file(s), d, 'e02', 'h1c').status).toBe('contradicted');
    put(s, 'c1', 'e03', 'misled');
    expect(linkStatus(file(s), d, 'e03', 'h1c').status).toBe('supported');
    expect(analysisView(file(s).evidence.find((e) => e.id === 'e03')!, evidenceDef(d, 'e03')!).word).toBe('проверено');
    put(s, 'c1', 'e03', 'forgery');
    expect(linkStatus(file(s), d, 'e03', 'h1c').status).toBe('contradicted');
  });

  it('comparing two checked items confirms a real connection and rejects a false one', () => {
    let s = withCase();
    s = ok(s, { type: 'LINK_PAIR', caseId: 'c1', a: 'e01', b: 'e02' });
    expect(pairStatus(s, file(s), 'e01', 'e02').status).toBe('proposed');
    put(s, 'c1', 'e01');
    put(s, 'c1', 'e02');
    const st = pairStatus(s, file(s), 'e01', 'e02');
    expect(st.status).toBe('supported');
    expect(st.edge?.insight).toBeTruthy();
    put(s, 'c1', 'e05');
    expect(pairStatus(s, file(s), 'e01', 'e05').status).toBe('contradicted');
    expect(reduce(s, { type: 'LINK_PAIR', caseId: 'c1', a: 'e01', b: 'e02' }).ok).toBe(false);
    s = ok(s, { type: 'UNLINK_PAIR', caseId: 'c1', a: 'e02', b: 'e01' });
    expect(file(s).pairs).toEqual([]);
  });

  it('evidence from an earlier case can be pinned to the new board', () => {
    let s = withCase('c1');
    put(s, 'c1', 'e05');
    s = withCase('c2', 'done', undefined, s);
    put(s, 'c2', 'e04');
    expect(reduce(s, { type: 'LINK_PAIR', caseId: 'c2', a: 'e04', b: 'c1:e06' }).ok).toBe(false);
    s = ok(s, { type: 'LINK_PAIR', caseId: 'c2', a: 'e04', b: 'c1:e05' });
    expect(pairStatus(s, file(s, 'c2'), 'e04', 'c1:e05').status).toBe('supported');
  });
});

describe('W9 investigative actions and permits', () => {
  it('closed House records need an interagency permit: request, fee, wait, then the action reveals evidence', () => {
    let s = withCase();
    expect(actionBlocker(s, 'c1', 'a_list')).toMatch(/допуск/);
    const before = s.economy.balance;
    s = ok(s, { type: 'REQUEST_CASE_PERMIT', caseId: 'c1', actionId: 'a_list' });
    expect(s.economy.balance).toBeLessThanOrEqual(before);
    expect(actionPermitState(s, file(s), caseDef('c1')!.actions[0]!)).toBe('pending');
    expect(reduce(s, { type: 'REQUEST_CASE_PERMIT', caseId: 'c1', actionId: 'a_list' }).ok).toBe(false);
    s = tick(s, 240);
    const p = s.politics.permits.find((x) => x.caseId === 'c1')!;
    expect(['granted', 'denied']).toContain(p.status);
    if (p.status === 'denied') p.status = 'granted';
    s = ok(s, { type: 'CASE_ACTION', caseId: 'c1', actionId: 'a_list', staffId: 'p8' });
    expect(s.politics.permits.find((x) => x.caseId === 'c1')!.status).toBe('used');
    s = finish(s);
    expect(file(s).evidence.some((e) => e.id === 'e03')).toBe(true);
  });

  it('actions need prerequisite evidence and the right role; the worker is busy meanwhile', () => {
    let s = withCase();
    expect(actionBlocker(s, 'c1', 'a_search')).toMatch(/Маршрут контейнера/);
    expect(actionBlocker(s, 'c1', 'a_pay', 'p2')).toMatch(/должности/);
    s = ok(s, { type: 'CASE_ACTION', caseId: 'c1', actionId: 'a_pay', staffId: 'p8' });
    expect(reduce(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e01', staffId: 'p8' }).ok).toBe(false);
    s = finish(s);
    expect(file(s).evidence.some((e) => e.id === 'e05')).toBe(true);
  });

  it('finding Idan by the end of shift 3 lets him be questioned in person', () => {
    let s = withCase();
    put(s, 'c1', 'e06');
    s = ok(s, { type: 'CASE_ACTION', caseId: 'c1', actionId: 'a_search', staffId: 'p9' });
    s = finish(s);
    expect(hasFlag(s, 'c1_idan_found')).toBe(true);
    expect(interrogationBlocker(s, 'c1', 'p3', 'l1')).toBeNull();
  });
});

describe('W9 interrogation: present specific evidence', () => {
  it('a question opens only with the evidence it refers to, and presenting needs a checked item', () => {
    let s = withCase();
    put(s, 'c1', 'e03');
    expect(interrogationBlocker(s, 'c1', 'p1', 'l2')).toMatch(/улики/);
    put(s, 'c1', 'e08', 'none');
    expect(interrogationBlocker(s, 'c1', 'p1', 'l2')).toMatch(/Сначала проверьте/);
    put(s, 'c1', 'e08');
    expect(interrogationBlocker(s, 'c1', 'p1', 'l2', 'p9')).toBeNull();
    s = ok(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p1', lineId: 'l2', staffId: 'p9' });
    s = finish(s);
    expect(file(s).asked).toContain('p1:l2');
    expect(reduce(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p1', lineId: 'l2', staffId: 'p9' }).ok).toBe(false);
  });

  it('protection unlocks testimony that pressure cannot; pressure taints and closes the trust lines', () => {
    let s = withCase();
    s = ok(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p2', lineId: 'l1', staffId: 'p9' });
    s = finish(s);
    expect(file(s).evidence.some((e) => e.id === 'e04')).toBe(true);
    s = ok(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p2', lineId: 'l3', staffId: 'p9' });
    s = finish(s);
    put(s, 'c1', 'e02');
    put(s, 'c1', 'e04');
    expect(interrogationBlocker(s, 'c1', 'p2', 'l2')).toMatch(/не доверяет/);
    expect(file(s).evidence.find((e) => e.id === 'e04')!.questionable).toBe(true);
  });
});

describe('W9 reconstruction', () => {
  it('a wrong slot is flagged; the sequence is complete when every timed item is in place', () => {
    let s = withCase();
    const d = caseDef('c1')!;
    for (const id of ['e04', 'e06', 'e07']) put(s, 'c1', id, 'none');
    s = ok(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e01', slot: 3 });
    expect(timelineView(file(s), d).placed.find((p) => p.evidenceId === 'e01')!.fits).toBe(false);
    const order: Record<string, number> = { e01: 1, e02: 1, e04: 0, e06: 2, e07: 3 };
    for (const [id, slot] of Object.entries(order)) s = ok(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: id, slot });
    expect(timelineComplete(file(s), d)).toBe(true);
    expect(reduce(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e05', slot: 0 }).ok).toBe(false);
  });
});

describe('W9 conclusion per case', () => {
  it('a charge needs enough admissible supported links; the audit needs two confirmed comparisons', () => {
    let s = withCase();
    expect(concludeBlocker(s, 'c1', 'charge_noris', 'h1d')).toMatch(/Мало оснований/);
    for (const id of ['e02', 'e05', 'e06']) {
      put(s, 'c1', id);
      s = ok(s, { type: 'LINK_EVIDENCE', caseId: 'c1', evidenceId: id, hypothesisId: 'h1d' });
    }
    expect(caseForecast(s, file(s), 'h1d').admissibleSupported).toBe(3);
    expect(concludeBlocker(s, 'c1', 'charge_noris', 'h1d')).toBeNull();
    expect(concludeBlocker(s, 'c1', 'charge_noris', 'h1a')).toMatch(/Выберите версию/);
    expect(concludeBlocker(s, 'c1', 'audit')).toMatch(/сопоставлений/);
    put(s, 'c1', 'e01');
    s = ok(s, { type: 'LINK_PAIR', caseId: 'c1', a: 'e01', b: 'e02' });
    s = ok(s, { type: 'LINK_PAIR', caseId: 'c1', a: 'e05', b: 'e06' });
    expect(concludeBlocker(s, 'c1', 'audit')).toBeNull();
    s = ok(s, { type: 'CONCLUDE_CASE', caseId: 'c1', conclusionId: 'audit' });
    expect(file(s).status).toBe('concluded');
    expect(hasFlag(s, 'c1_evidence_lawful')).toBe(true);
  });

  it('closing as a disciplinary case gives money now and resurfaces later', () => {
    let s = withCase();
    const before = s.economy.balance;
    s = ok(s, { type: 'CONCLUDE_CASE', caseId: 'c1', conclusionId: 'discipline' });
    expect(s.economy.balance).toBeGreaterThan(before);
    expect(file(s).revealShift).toBe(s.shift + CASE_RULES.revealAfterShifts);
  });

  it('cooperation with the surgeon is possible only after she agreed under protection', () => {
    const s = withCase('c2');
    expect(concludeBlocker(s, 'c2', 'cooperate')).toMatch(/Ашер/);
    setFlag(s, 'c2_surgeon_cooperates');
    expect(concludeBlocker(s, 'c2', 'cooperate')).toBeNull();
  });
});

describe('W9 campaign: story decisions and shifts', () => {
  it('story incidents arrive at shifts 5 and 9; an unanswered offer counts as refused', () => {
    let s = started();
    for (let i = 1; i < 3; i++) s = nextShift(s);
    expect(s.shift).toBe(3);
    const h2 = s.politics.standing.h2!;
    s = ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' });
    expect(s.campaign.choices['3']).toBe('refuse');
    expect(s.politics.standing.h2).toBeLessThan(h2);
    s = ok(s, { type: 'START_SHIFT' });
    s = nextShift(s);
    expect(s.shift).toBe(5);
    expect(s.incidents.filter((i) => i.templateId === 'illegal' && i.createdShift === 5)).toHaveLength(1);
  });

  it('accepting Noris’s offer closes case №418 as a disciplinary matter', () => {
    let s = withCase();
    s.shift = 3;
    s = ok(s, { type: 'STORY_CHOICE', shift: 3, optionId: 'accept' });
    expect(file(s).decision?.conclusionId).toBe('discipline');
    expect(hasFlag(s, 'c1_hushed')).toBe(true);
    expect(reduce(s, { type: 'STORY_CHOICE', shift: 3, optionId: 'refuse' }).ok).toBe(false);
  });
});

describe('W9 special operations', () => {
  const opReady = (seed?: number) => {
    const s = withCase('c2', 'done', seed);
    s.shift = 6;
    s.squads.find((q) => q.id === 'axon')!.status = 'ready';
    return s;
  };

  it('opens in its window only when the case is open; time stops while the operation runs', () => {
    expect(opAvailability(started(), 'op1').open).toBe(false);
    let s = opReady();
    expect(opAvailability(s, 'op1').open).toBe(true);
    s = ok(s, { type: 'START_SPECIAL_OP', opId: 'op1', squadId: 'axon' });
    expect(activeOp(s)?.id).toBe('op1');
    expect(reduce(s, { type: 'TICK', minutes: 10 }).ok).toBe(false);
    expect(reduce(s, { type: 'END_SHIFT' }).ok).toBe(false);
  });

  it('a lawful option needs the case warrant; emergency entry creates a review; the report scores each objective', () => {
    let s = opReady(3);
    s = ok(s, { type: 'START_SPECIAL_OP', opId: 'op1', squadId: 'axon' });
    expect(optionBlocker(s, activeOp(s)!, 'cordon')).toMatch(/ордер/);
    const permits = s.politics.permits.length;
    s = ok(s, { type: 'SPECIAL_OP_CHOICE', opId: 'op1', optionId: 'breach' });
    expect(s.politics.permits.length).toBe(permits + 1);
    expect(s.politics.permits.at(-1)!.kind).toBe('emergency');
    for (const o of ['talk', 'evacuate', 'leave']) s = ok(s, { type: 'SPECIAL_OP_CHOICE', opId: 'op1', optionId: o });
    const op = opState(s, 'op1')!;
    expect(op.status).toBe('done');
    expect(op.report!.objectives).toHaveLength(5);
    expect(hasFlag(s, 'c2_patients_saved')).toBe(true);
    expect(s.squads.find((q) => q.id === 'axon')!.status).toBe('resting');
    s = ok(s, { type: 'ACK_SPECIAL_OP', opId: 'op1' });
    expect(opState(s, 'op1')!.report!.seen).toBe(true);
  });

  it('with a granted warrant the lawful options open', () => {
    let s = opReady();
    put(s, 'c2', 'e02');
    s = grant(s, 'c2', 'a_protocols');
    s = ok(s, { type: 'START_SPECIAL_OP', opId: 'op1', squadId: 'axon' });
    expect(optionBlocker(s, activeOp(s)!, 'cordon')).toBeNull();
  });

  it('a missed window is a consequence too', () => {
    let s = started();
    s.shift = 12;
    s = ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' });
    expect(hasFlag(s, 'op2_missed')).toBe(true);
    expect(hasFlag(s, 'c3_crisis_failed')).toBe(true);
  });
});

describe('W9 endings', () => {
  it('the end of shift 12 picks an ending from what happened, not from points', () => {
    let s = started();
    s.shift = 12;
    s = ok(tick(s, 720), { type: 'END_SHIFT' });
    expect(s.campaign.ending).toBe('collapse'); // кризис в лаборатории без Дирекции, ни одного решения по делам
    s = ok(s, { type: 'ACK_ENDING' });
    expect(s.campaign.endingSeen).toBe(true);
  });

  it('strong lawful decisions plus admissible lab proof give «Порядок удержан»; closed deals give «Порядок ценой людей»', () => {
    const s = structuredClone(started());
    s.campaign.ops.push({ id: 'op2', squadId: 'axon', memberIds: [], startedShift: 11, phase: 4, choices: [], risk: 0, status: 'done', scores: {}, report: { outcome: 'success', objectives: [], casualties: [], notes: [], seen: true } });
    for (const id of ['c1', 'c2'] as const) {
      const d = caseDef(id)!;
      s.investigations.cases.push({ id, incidentId: d.templateId, openedShift: 1, status: 'concluded', evidence: [], links: [], pairs: [], timeline: {}, working: null, asked: [], actionsDone: [], tasks: [], expertiseBonus: 0, decision: { conclusionId: id === 'c1' ? 'audit' : 'cooperate', shift: 2 } });
    }
    setFlag(s, 'c3_sample_admissible');
    expect(computeEnding(s).id).toBe('order');
    setFlag(s, 'campaign_closed_compact');
    expect(computeEnding(s).id).toBe('cost');
  });
});

describe('W9 saves', () => {
  it('v9 saves migrate with an empty campaign; a case in progress round-trips deterministically', () => {
    let s = withCase();
    s = ok(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e01', staffId: 'p8' });
    const back = parseSave(JSON.parse(JSON.stringify(toSaveFile(s, 'тест', new Date(0)))));
    expect(back.ok && back.state.investigations.cases[0]!.tasks).toHaveLength(1);
    if (back.ok) expect(finish(back.state).rng).toEqual(finish(s).rng);
    const old = structuredClone(s) as unknown as Record<string, unknown>;
    delete old.investigations;
    delete old.campaign;
    const legacy = parseSave({ format: 'gamemr-save', schemaVersion: 9, savedAt: '', label: '', state: { ...old, schemaVersion: 9 } });
    expect(legacy.ok && legacy.state.investigations.cases).toEqual([]);
    expect(legacy.ok && legacy.state.campaign.flags).toEqual([]);
  });

  it('cross-case references resolve through the saved state', () => {
    const s = withCase('c2', 'done', undefined, withCase('c1'));
    expect(resolveRef(s, 'c2', 'c1:e01').ev).toBeDefined();
  });
});
