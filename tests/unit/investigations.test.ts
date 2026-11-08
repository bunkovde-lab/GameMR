import { describe, expect, it } from 'vitest';
import {
  CASES, CASE_RULES, absMinute, admissibility, analysisView, caseDef, caseFile, caseForecast, concludeBlocker, evidenceDef, interrogationBlocker,
  linkStatus, openCaseFromReport, timelineView, workerBlocker,
} from '../../src/core/investigations';
import { memberBlocker } from '../../src/core/dispatch';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { parseSave, toSaveFile } from '../../src/persistence/saveFormat';
import type { CaseFile, GameState, OperationReport } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const report = (incidentId: string, evidence: 'done' | 'partial' | 'failed' = 'done') =>
  ({ incidentId, memberIds: [], tasks: [{ label: 'Сохранность улик', result: evidence }] }) as unknown as OperationReport;
/** Дело открыто так, как его открывает развязка операции. */
const withCase = (caseId = 'c1', evidence: 'done' | 'partial' | 'failed' = 'done', seed?: number) => {
  const s = structuredClone(started(seed));
  const d = caseDef(caseId)!;
  openCaseFromReport(s, report(d.templateId, evidence), d.templateId, () => {});
  return s;
};
const file = (s: GameState, id = 'c1') => caseFile(s, id)!;
/** Довести все задачи до конца, не трогая остальной мир. */
const finish = (s: GameState) => tick(s, 120);
/** Поставить результат анализа напрямую — для проверок правил, не зависящих от броска. */
const setAnalysis = (s: GameState, caseId: string, id: string, a: CaseFile['evidence'][number]['analysis']) => {
  const f = file(s, caseId);
  if (!f.evidence.some((e) => e.id === id)) f.evidence.push({ id, foundShift: 1, analysis: 'none', checks: 0, questionable: false });
  f.evidence.find((e) => e.id === id)!.analysis = a;
};

describe('W9 case content (ТЗ §11.1)', () => {
  it('three cases, each with 6–10 significant evidence plus traps, 3–5 hypotheses, two plausible readings and a forgery', () => {
    expect(CASES).toHaveLength(3);
    for (const c of CASES) {
      expect(c.evidence.length).toBeGreaterThanOrEqual(6);
      expect(c.evidence.length).toBeLessThanOrEqual(11);
      expect(c.hypotheses.length).toBeGreaterThanOrEqual(3);
      expect(c.hypotheses.length).toBeLessThanOrEqual(5);
      expect(c.hypotheses.map((h) => h.id)).toContain(c.truth);
      // Ложная версия тоже на что-то опирается: хотя бы одна улика её «поддерживает» (явно или подлогом).
      const supported = new Set(c.evidence.flatMap((e) => [...Object.entries(e.bears), ...Object.entries(e.fakeBears ?? {})].filter(([, b]) => b === 'supports').map(([h]) => h)));
      expect([...supported].filter((h) => h !== c.truth).length).toBeGreaterThanOrEqual(1);
      expect(c.evidence.some((e) => e.forged)).toBe(true);
      // Все ссылки в контенте ведут на существующие улики и людей.
      const ids = new Set(c.evidence.map((e) => e.id));
      for (const e of c.evidence) {
        for (const r of [...(e.reveals ?? []), ...(e.conflictsWith ?? [])]) expect(ids.has(r)).toBe(true);
        if (e.origin.startsWith('person:')) expect(c.persons.some((p) => `person:${p.id}` === e.origin)).toBe(true);
        if (e.slot !== undefined) expect(e.slot).toBeLessThan(c.slots.length);
      }
      for (const p of c.persons) for (const m of ['standard', 'present', 'skilled', 'pressure'] as const) {
        const line = p[m];
        if (line?.reveals) expect(ids.has(line.reveals)).toBe(true);
        if (line?.needs) expect(ids.has(line.needs)).toBe(true);
      }
    }
  });

  it('no dead end: the true version can reach the charge threshold without pressure', () => {
    for (const c of CASES) {
      const s = withCase(c.id);
      const f = file(s, c.id);
      // Всё, что достижимо без усиленного допроса: место, анализы, стандартные, предъявление, тактическая беседа.
      const reachable = c.evidence.filter((e) => e.origin === 'scene' || e.origin.startsWith('analysis:') ||
        c.persons.some((p) => (['standard', 'present', 'skilled'] as const).some((m) => p[m]?.reveals === e.id)));
      const good = reachable.filter((e) => e.bears[c.truth] === 'supports');
      expect(good.length).toBeGreaterThanOrEqual(CASE_RULES.chargeMin);
      for (const e of good) {
        setAnalysis(s, c.id, e.id, e.forged ? 'forgery' : 'confirmed');
        f.links.push({ evidenceId: e.id, hypothesisId: c.truth });
      }
      expect(concludeBlocker(s, c.id, 'charge', c.truth)).toBeNull();
    }
  });
});

describe('W9 opening a case', () => {
  it('first operation on the matching call opens the case with scene evidence; lost custody means fewer, questionable items', () => {
    const full = file(withCase('c1', 'done'));
    const scene = caseDef('c1')!.evidence.filter((e) => e.origin === 'scene').length;
    expect(full.evidence).toHaveLength(scene);
    expect(file(withCase('c1', 'partial')).evidence).toHaveLength(scene - 1);
    const bad = file(withCase('c1', 'failed'));
    expect(bad.evidence.length).toBeLessThan(scene);
    expect(bad.evidence.every((e) => e.questionable)).toBe(true);
  });

  it('a real dispatch to «Пропажа регистратора» opens case №418 after the operation', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    s = tick(s, 400);
    expect(file(s)).toBeDefined();
    expect(s.log.some((e) => e.type === 'case_opened' && e.text.includes('№418'))).toBe(true);
  });
});

describe('W9 board: links and analysis (ТЗ §11.2)', () => {
  it('a link is proposed until the evidence is checked, then supported or contradicted — no truth percentage', () => {
    let s = withCase();
    s = ok(s, { type: 'LINK_EVIDENCE', caseId: 'c1', evidenceId: 'e1', hypothesisId: 'h1' });
    const d = caseDef('c1')!;
    expect(linkStatus(file(s), d, 'e1', 'h1').status).toBe('proposed');
    expect(reduce(s, { type: 'LINK_EVIDENCE', caseId: 'c1', evidenceId: 'e1', hypothesisId: 'h1' }).ok).toBe(false);
    setAnalysis(s, 'c1', 'e1', 'confirmed');
    expect(linkStatus(file(s), d, 'e1', 'h1').status).toBe('contradicted');
    s = ok(s, { type: 'UNLINK_EVIDENCE', caseId: 'c1', evidenceId: 'e1', hypothesisId: 'h1' });
    expect(file(s).links).toHaveLength(0);
  });

  it('analysis needs a free specialist, takes time and reagents for lab work, and frees the person after', () => {
    let s = withCase();
    expect(reduce(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e5', staffId: 'p2' }).ok).toBe(false); // страж — не по должности
    const reagents = s.resources.reagents;
    s = ok(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e5', staffId: 'p7' });
    expect(s.resources.reagents).toBe(reagents - 1);
    expect(workerBlocker(s, 'p7', ['biocriminalist'])).toMatch(/делом/);
    expect(memberBlocker(s, 'p7', 'axon')).toBe('работает по делу');
    expect(file(s).tasks[0]!.doneAt).toBe(absMinute(s) + 90);
    s = finish(s);
    expect(file(s).tasks).toHaveLength(0);
    expect(file(s).evidence.find((e) => e.id === 'e5')!.analysis).not.toBe('none');
    expect(workerBlocker(s, 'p7', ['biocriminalist'])).toBeNull();
  });

  it('an undetected forgery looks exactly like a checked item and supports the false version', () => {
    const s = withCase();
    const d = caseDef('c1')!;
    const def = evidenceDef(d, 'e2')!;
    setAnalysis(s, 'c1', 'e2', 'misled');
    const ev = file(s).evidence.find((e) => e.id === 'e2')!;
    expect(analysisView(ev, def).word).toBe(analysisView({ ...ev, analysis: 'confirmed' }, { ...def, forged: false }).word);
    expect(linkStatus(file(s), d, 'e2', 'h1').status).toBe('supported');
    setAnalysis(s, 'c1', 'e2', 'forgery');
    expect(linkStatus(file(s), d, 'e2', 'h1').status).toBe('contradicted');
  });

  it('a better analyst detects forgeries more often (deterministic over seeds)', () => {
    const detect = (staffId: string) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        let s = withCase('c1', 'done', seed);
        s = finish(ok(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e2', staffId }));
        if (file(s).evidence.find((e) => e.id === 'e2')!.analysis === 'forgery') n++;
      }
      return n;
    };
    expect(detect('p9')).toBeGreaterThan(detect('p11')); // анализ 5 против 3
  });

  it('confirmed analysis reveals follow-up evidence', () => {
    const s = withCase();
    s.investigations.cases[0]!.evidence.find((e) => e.id === 'e1')!.checks = 5; // повторные проверки почти всегда успешны
    const r = finish(ok(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e1', staffId: 'p9' }));
    expect(file(r).evidence.map((e) => e.id)).toContain('e7');
  });
});

describe('W9 reconstruction (ТЗ §11.3)', () => {
  it('player places evidence; a wrong slot is flagged, two sources in their own slots reveal a contradiction', () => {
    let s = withCase();
    const d = caseDef('c1')!;
    s = ok(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e2', slot: 0 });
    expect(timelineView(file(s), d).placed[0]!.fits).toBe(false);
    s = ok(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e2', slot: 1 });
    s = ok(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e4', slot: 3 });
    expect(timelineView(file(s), d).conflicts).toEqual([['e2', 'e4']]);
    expect(reduce(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e1', slot: 1 }).ok).toBe(false); // без времени
    s = ok(s, { type: 'PLACE_EVIDENCE', caseId: 'c1', evidenceId: 'e4', slot: null });
    expect(timelineView(file(s), d).conflicts).toEqual([]);
  });
});

describe('W9 interrogation (ТЗ §11.4)', () => {
  it('presenting needs a checked piece of evidence; skilled talk needs analysis 4+', () => {
    const s = withCase();
    expect(interrogationBlocker(s, 'c1', 'p2', 'standard', 'p9')).toMatch(/оснований/); // посредник ещё неизвестен
    expect(interrogationBlocker(s, 'c1', 'p1', 'present', 'p9')).toMatch(/проверьте/);
    expect(interrogationBlocker(s, 'c1', 'p3', 'skilled', 'p11')).toMatch(/анализ/);
    expect(interrogationBlocker(s, 'c1', 'p3', 'skilled', 'p9')).toBeNull();
    expect(interrogationBlocker(s, 'c1', 'p1', 'standard', 'p2')).toMatch(/должности/);
  });

  it('pressure gives low-reliability testimony, taints the person, and costs Open Circuit standing', () => {
    let s = withCase();
    setAnalysis(s, 'c1', 'e7', 'confirmed');
    s = ok(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p2', method: 'present', staffId: 'p9' });
    s = finish(s);
    expect(file(s).evidence.find((e) => e.id === 'e8')!.questionable).toBe(false);
    const open = s.politics.coalitions.open!;
    s = finish(ok(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p2', method: 'pressure', staffId: 'p9' }));
    const f = file(s);
    expect(f.evidence.find((e) => e.id === 'e10')!.questionable).toBe(true);
    expect(f.evidence.find((e) => e.id === 'e8')!.questionable).toBe(true); // всё сказанное этим человеком — под сомнением
    expect(admissibility(s, f, f.evidence.find((e) => e.id === 'e8')!, evidenceDef(caseDef('c1')!, 'e8')!).ok).toBe(false);
    expect(s.politics.coalitions.open).toBe(open - 2);
    expect(reduce(s, { type: 'INTERROGATE', caseId: 'c1', personId: 'p2', method: 'pressure', staffId: 'p9' }).ok).toBe(false);
  });
});

describe('W9 conclusion (ТЗ §11.5)', () => {
  const ready = (hyp: string, ids: string[], seed?: number) => {
    const s = withCase('c1', 'done', seed);
    for (const id of ids) {
      setAnalysis(s, 'c1', id, evidenceDef(caseDef('c1')!, id)!.forged ? 'forgery' : 'confirmed');
      file(s).links.push({ evidenceId: id, hypothesisId: hyp });
    }
    return s;
  };

  it('charging needs enough admissible supported links; the forecast is about evidence, not truth', () => {
    const s = ready('h2', ['e1', 'e3']);
    expect(concludeBlocker(s, 'c1', 'charge', 'h2')).toMatch(/Мало оснований/);
    expect(concludeBlocker(s, 'c1', 'close')).toBeNull();
    const fc = caseForecast(s, file(s), 'h2');
    expect(fc).toMatchObject({ supported: 2, admissibleSupported: 2, contradicted: 0 });
    expect(Object.keys(fc)).not.toContain('truth');
  });

  it('a right charge improves the district; a false version cannot be charged on thin evidence', () => {
    const right = ready('h2', ['e1', 'e3', 'e4', 'e7']);
    const trust = right.districts.find((d) => d.id === 'admin')!.civilianTrust;
    let r = right;
    for (let seed = 0; seed < 5 && file(r).status === 'open'; seed++) r = ok(r, { type: 'CONCLUDE_CASE', caseId: 'c1', decision: 'charge', hypothesisId: 'h2' });
    expect(file(r).status).toBe('charged');
    expect(r.districts.find((d) => d.id === 'admin')!.civilianTrust).toBeGreaterThan(trust);
    expect(file(r).revealShift).toBeUndefined();

    // Ложная версия «Палата» на седативе и показаниях дежурной: двух связей мало.
    const wrong = withCase();
    setAnalysis(wrong, 'c1', 'e5', 'confirmed');
    setAnalysis(wrong, 'c1', 'e6', 'confirmed');
    setAnalysis(wrong, 'c1', 'e2', 'misled');
    file(wrong).links.push({ evidenceId: 'e5', hypothesisId: 'h3' }, { evidenceId: 'e6', hypothesisId: 'h3' });
    expect(concludeBlocker(wrong, 'c1', 'charge', 'h3')).toMatch(/Мало/);
    // Подлог без выявления «подтверждает» побег: три связи — и суд может принять неверную версию.
    const fled = withCase();
    setAnalysis(fled, 'c1', 'e2', 'misled');
    file(fled).links.push({ evidenceId: 'e2', hypothesisId: 'h1' });
    expect(concludeBlocker(fled, 'c1', 'charge', 'h1')).toMatch(/Мало/);
  });

  it('a wrongly accepted charge is revealed later with a legal violation', () => {
    const s = withCase();
    file(s).status = 'charged';
    file(s).decision = { kind: 'charge', hypothesisId: 'h1', shift: 1, court: 'accepted' };
    file(s).revealShift = 3;
    let r = ok(tick(s, 720), { type: 'END_SHIFT' });
    r = ok(r, { type: 'ADVANCE_SHIFT' });
    expect(file(r).revealed).toBeFalsy();
    r = ok(ok(tick(ok(r, { type: 'START_SHIFT' }), 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' });
    expect(file(r).revealed).toBe(true);
    expect(r.politics.violations).toContain(3);
    expect(r.log.some((e) => e.type === 'case_revealed')).toBe(true);
  });

  it('expertise costs money, rechecks once, and blocks while tasks run', () => {
    let s = withCase();
    expect(reduce(s, { type: 'REQUEST_EXPERTISE', caseId: 'c1' }).ok).toBe(false); // нечего перепроверять
    setAnalysis(s, 'c1', 'e2', 'misled');
    const bal = s.economy.balance;
    s = ok(s, { type: 'REQUEST_EXPERTISE', caseId: 'c1' });
    expect(s.economy.balance).toBe(bal - CASE_RULES.expertise.fee * 100);
    expect(reduce(s, { type: 'REQUEST_EXPERTISE', caseId: 'c1' }).ok).toBe(false);
    s = ok(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e3', staffId: 'p9' });
    expect(concludeBlocker(s, 'c1', 'close')).toMatch(/Дождитесь/);
  });

  it('transfer and close end the case; closing an unsolved case surfaces later', () => {
    const t = ok(withCase(), { type: 'CONCLUDE_CASE', caseId: 'c1', decision: 'transfer' });
    expect(file(t).status).toBe('transferred');
    expect(t.politics.standing.h2).toBe(5);
    const c = ok(withCase(), { type: 'CONCLUDE_CASE', caseId: 'c1', decision: 'close' });
    expect(file(c).revealShift).toBe(3);
    expect(reduce(c, { type: 'LINK_EVIDENCE', caseId: 'c1', evidenceId: 'e1', hypothesisId: 'h1' }).ok).toBe(false);
  });
});

describe('W9 saves', () => {
  it('v9 saves migrate; a case in progress round-trips and keeps determinism', () => {
    let s = withCase();
    s = ok(s, { type: 'ANALYZE_EVIDENCE', caseId: 'c1', evidenceId: 'e5', staffId: 'p7' });
    const back = parseSave(JSON.parse(JSON.stringify(toSaveFile(s, 'тест', new Date(0)))));
    expect(back.ok && back.state.investigations.cases[0]!.tasks).toHaveLength(1);
    if (back.ok) expect(finish(back.state).rng).toEqual(finish(s).rng);
    const old = structuredClone(s) as unknown as Record<string, unknown>;
    delete old.investigations;
    const legacy = parseSave({ format: 'gamemr-save', schemaVersion: 9, savedAt: '', label: '', state: { ...old, schemaVersion: 9 } });
    expect(legacy.ok && legacy.state.investigations.cases).toEqual([]);
  });
});
