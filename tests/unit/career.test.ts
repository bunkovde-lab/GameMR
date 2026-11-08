import { describe, expect, it } from 'vitest';
import { courseBlocker, groupMods, metabolic, organBlocker, promotionStatus, relation, relationsOf, skillPoints } from '../../src/core/career';
import { computeForecast, defaultDraft, forecastTerms, memberBlocker, riskLevel } from '../../src/core/dispatch';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { parseSave } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const person = (s: GameState, id: string) => s.staff.find((p) => p.id === id)!;
const nextShift = (s: GameState) => ok(ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });

describe('W6.2 development (ТЗ §7.1–7.2)', () => {
  it('a course costs money and time, takes the person out of the squad and gives the skill after the shifts', () => {
    let s = started();
    expect(skillPoints(person(s, 'p1'))).toEqual({ earned: 2, spent: 0, free: 2 });
    s = ok(s, { type: 'START_COURSE', staffId: 'p1', nodeId: 'cmd1' });
    expect(s.economy.ledger.at(-1)).toMatchObject({ kind: 'training', amount: -300 });
    expect(s.squads.find((q) => q.id === 'axon')!.memberIds).not.toContain('p1');
    expect(memberBlocker(s, 'p1', '')).toBe('на обучении');
    expect(courseBlocker(s, 'p1', 'op1')).toMatch(/Уже идёт курс/);
    s = nextShift(s);
    expect(person(s, 'p1').skills).toEqual(['cmd1']);
    expect(person(s, 'p1').training).toBeNull();
    expect(s.log.find((e) => e.type === 'course_finished')?.staffIds).toEqual(['p1']);
  });

  it('nodes need the previous node, rank, quality and points; no free reset', () => {
    const s = started();
    expect(courseBlocker(s, 'p1', 'cmd2')).toBe('Сначала «Координация группы».');
    expect(courseBlocker(s, 'p8', 'ci1')).toMatch(/очков навыка/); // 5 XP → 0 очков
    person(s, 'p1').skills = ['cmd1'];
    expect(courseBlocker(s, 'p1', 'cmd2')).toMatch(/очков навыка/); // 2 очка, 1 потрачено, нужно 2
  });

  it('promotion needs XP, operations from the journal and a free post of the next rank', () => {
    const s = started();
    const st = promotionStatus(s, 'p11')!;
    expect(st.next).toBe(3);
    expect(st.blocker).toMatch(/опыта/);
    person(s, 'p11').xp = 30;
    expect(promotionStatus(s, 'p11')!.blocker).toMatch(/операций/);
    const op = (id: number, who: string) => ({ id, shift: 1, minute: 1, type: 'operation_completed', text: 'x', staffIds: [who] });
    s.log.push(op(900, 'p11'), op(901, 'p11'));
    expect(promotionStatus(s, 'p11')!.blocker).toBeNull();
    const after = ok(s, { type: 'PROMOTE', staffId: 'p11' });
    expect(person(after, 'p11').rank).toBe(3);
    expect(person(after, 'p11').salary).toBe(person(s, 'p11').salary + 100);
    // Должностей ранга III — 4: заняты Марой, Кордом, Сели и теперь Ликой.
    person(after, 'p6').xp = 30;
    after.log.push(op(902, 'p6'), op(903, 'p6'));
    expect(promotionStatus(after, 'p6')!.blocker).toMatch(/Нет свободной должности ранга III/);
  });

  it('skills change separate terms of the formula with caps', () => {
    const s = started();
    const d = { ...defaultDraft(s, 'axon', 'missing'), tactic: 'arrest' as const };
    const before = forecastTerms(s, d);
    person(s, 'p1').skills = ['op1'];
    person(s, 'p2').skills = ['ci1'];
    const after = forecastTerms(s, d);
    expect(after.T).toBe(Math.min(2, before.T + 1));
    expect(after.I).toBe(Math.min(2, before.I + 1));
    expect(computeForecast(s, d).p).toBeGreaterThanOrEqual(computeForecast(started(), d).p);
  });
});

describe('W6.2 biology (ТЗ §7.3)', () => {
  it('compatibility is between specific systems; metabolic load limits integration', () => {
    const s = started();
    expect(organBlocker(s, 'p1', 'org_scent')).toBe('Несовместимо: дублирует сенсорную линию Ловчих.');
    expect(organBlocker(s, 'p2', 'org_scent')).toBeNull();
    expect(metabolic(person(s, 'p5'))).toEqual({ capacity: 4, used: 2 });
    expect(organBlocker(s, 'p5', 'org_dermal')).toMatch(/Метаболическая нагрузка: 5 из 4/);
  });

  it('installation occupies a clinic bed for rehabilitation, then opens an ability; complex organs cannot be removed', () => {
    let s = ok(started(), { type: 'INSTALL_ORGAN', staffId: 'p2', organId: 'org_dermal' });
    expect(s.medical.patients[0]).toMatchObject({ staffId: 'p2', kind: 'implant', status: 'treating' });
    expect(memberBlocker(s, 'p2', '')).toBe('реабилитация после установки органа');
    for (let i = 0; i < 6 && !person(s, 'p2').implants.length; i++) s = nextShift(s);
    expect(person(s, 'p2').implants).toEqual(['org_dermal']);
    expect(person(s, 'p2').health).not.toBe('dead');
    const r = reduce(s, { type: 'REMOVE_ORGAN', staffId: 'p2', organId: 'org_dermal' });
    expect(r.ok ? '' : r.reason).toMatch(/нельзя безопасно извлечь/);
  });
});

describe('W6.2 relationships (ТЗ §7.5)', () => {
  it('start: squadmates are worked-in; seeded conflict and joint action come from content', () => {
    const s = started();
    expect(relation(s, 'p3', 'p11')).toMatchObject({ trust: -3 });
    expect(relation(s, 'p9', 'p10')).toMatchObject({ teamwork: 3 });
    expect(relationsOf(s, 'p1').map((r) => r.other)).toContain('p2');
  });

  it('a joint action and a conflict each count once, not stacking', () => {
    const s = started();
    const m = groupMods(s, ['p3', 'p11', 'p9', 'p10'], 'p9', 'arrest', []);
    expect(m.cohesion).toBe(true);
    expect(m.dRisk).toBe(1);
    expect(m.notes.join(' ')).toMatch(/конфликт/);
    const d = { ...defaultDraft(s, 'resonance', 'missing'), memberIds: ['p9', 'p10'], commanderId: 'p9' };
    const conflict = { ...d, memberIds: ['p9', 'p10', 'p11'] };
    s.squads.find((q) => q.id === 'omega')!.memberIds = [];
    s.relations.push({ a: 'p10', b: 'p11', trust: -4, teamwork: 0, loyalty: 0 });
    expect(riskLevel(s, conflict)).toBe(Math.min(4, riskLevel(s, d) + 1));
  });

  it('operations change relations only through journal entries naming the people', () => {
    let s = started(7);
    s = ok(s, { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    s = tick(s, 400);
    const rep = s.operationReports.find((r) => r.squadId === 'axon');
    expect(rep?.memberIds.length).toBeGreaterThan(0);
    const opLog = s.log.find((e) => e.type === 'operation_completed' && e.text.includes('Аксон'))!;
    expect(opLog.staffIds).toEqual(rep!.memberIds);
    if (rep!.outcome === 'success') expect(s.log.some((e) => e.type === 'relation_changed' && e.staffIds?.includes('p1'))).toBe(true);
  });
});

describe('W6.2 history and saves (ТЗ §7.7)', () => {
  it('service history is the journal filtered by person; v5 saves migrate', () => {
    let s = ok(started(), { type: 'UNASSIGN_STAFF', staffId: 'p6' });
    s = ok(s, { type: 'ASSIGN_STAFF', staffId: 'p6', squadId: 'sigma' });
    expect(s.log.filter((e) => e.staffIds?.includes('p6')).map((e) => e.type)).toEqual(['staff_transferred', 'staff_transferred']);
    const old = structuredClone(createInitialState()) as unknown as Record<string, unknown>;
    old.schemaVersion = 5;
    delete old.relations;
    old.staff = (old.staff as Record<string, unknown>[]).map((p) => {
      const rest = { ...p };
      for (const k of ['skills', 'training', 'implants', 'allegiance']) delete rest[k];
      return rest;
    });
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 5, savedAt: '', label: '', state: old });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.staff[0]).toMatchObject({ skills: [], training: null, implants: [] });
      expect(r.state.relations.length).toBeGreaterThan(5);
    }
  });
});
