import { describe, expect, it } from 'vitest';
import { CASE_LINK_TEXT, caseNextStep, caseTraining, incidentCaseLink } from '../../src/core/caseGuide';
import { caseDef, caseFile, openCaseFromReport } from '../../src/core/investigations';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import type { GameState, OperationReport } from '../../src/core/types';
import { ok } from './helpers';

const started = () => ok(createInitialState(), { type: 'START_SHIFT' });
const report = (incidentId: string) =>
  ({ incidentId, memberIds: [], tasks: [{ label: 'Сохранность улик', result: 'done' }] }) as unknown as OperationReport;
const open = (s: GameState, caseId = 'c1') => {
  const d = caseDef(caseId)!;
  openCaseFromReport(s, report(d.templateId), d.templateId, () => {});
  return caseFile(s, caseId)!;
};

describe('Расследования: подсказки', () => {
  it('сюжетный вызов первой смены отмечен как открывающий дело №418, с предысторией', () => {
    const s = started();
    const inc = s.incidents.find((i) => i.templateId === 'missing');
    expect(inc, 'вызов «Пропажа регистратора» приходит в смену 1').toBeTruthy();
    const link = incidentCaseLink(s, inc!)!;
    expect(link).toMatchObject({ caseId: 'c1', number: 418, mode: 'opens' });
    expect(link.backstory).toContain('Идан Кер');
    expect(CASE_LINK_TEXT.opens).toContain('Сохранность улик');
  });

  it('после открытия дела связанный вызов «подпитывает» дело; обычные вызовы не отмечены', () => {
    const s = started();
    const inc = s.incidents.find((i) => i.templateId === 'missing')!;
    open(s);
    expect(incidentCaseLink(s, inc)?.mode).toBe('feeds');
    for (const i of s.incidents.filter((x) => x.templateId !== 'missing')) expect(incidentCaseLink(s, i), i.templateId).toBeNull();
  });

  it('следующий шаг ведёт по делу: проверить → связать → и не раскрывает верную версию', () => {
    let s = started();
    const f = open(s);
    const first = caseNextStep(s, f)!;
    expect(first.tab).toBe('board');
    expect(first.target).toBe('e01');
    expect(first.text).toContain('Проверьте');
    f.evidence.forEach((e) => { e.analysis = 'confirmed'; });
    const second = caseNextStep(s, f)!;
    expect(second.text).toContain('свяжите');
    for (const h of caseDef('c1')!.hypotheses) expect(second.text).not.toContain(h.title);
    s = reduce(s, { type: 'LINK_EVIDENCE', caseId: 'c1', evidenceId: 'e01', hypothesisId: 'h1b' }).state;
    s = reduce(s, { type: 'LINK_EVIDENCE', caseId: 'c1', evidenceId: 'e02', hypothesisId: 'h1d' }).state;
    const third = caseNextStep(s, caseFile(s, 'c1')!)!;
    expect(['actions', 'interviews']).toContain(third.tab);
  });

  it('учебные шаги отмечаются по настоящим действиям; у решённого дела подсказки нет', () => {
    const s = started();
    const f = open(s);
    expect(caseTraining(f).filter((x) => x.done).map((x) => x.id)).toEqual(['open']);
    f.evidence[0]!.analysis = 'inconclusive';
    f.links.push({ evidenceId: 'e01', hypothesisId: 'h1a' });
    f.asked.push('p2:l1');
    expect(caseTraining(f).filter((x) => x.done).map((x) => x.id)).toEqual(['open', 'check', 'link', 'ask']);
    f.status = 'closed';
    expect(caseNextStep(s, f)).toBeNull();
  });
});


describe('Расследования: дежурный вызов', () => {
  it('не наследует сюжетную связь переиспользованного шаблона кампании', () => {
    const s = started();
    const inc = { ...s.incidents[0]!, templateId: 'convoy', duty: { kind: 'brawl' as const, urgent: false, rewardRe: 4 } };
    expect(incidentCaseLink(s, inc)).toBeNull();
  });
});
