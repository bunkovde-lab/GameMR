import { houseText, templateOf } from './events';
import {
  CASES, CASE_RULES, actionBlocker, actionPermitState, analysisBlocker, caseDef, caseFile, caseForecast, casePermitBlocker, refFound, evidenceDef, interrogationBlocker,
  lineVisible, personAvailable, type CaseDef,
} from './investigations';
import type { CaseFile, GameState, Incident } from './types';

/**
 * Подсказки по расследованиям: связь вызова с делом, предыстория, «следующий шаг» и учебные шаги первого дела.
 * Только чтение состояния: скрытая истина (какая версия верна, какая улика подложна) сюда не попадает.
 */

export type CaseLinkMode = 'opens' | 'feeds' | 'pending' | 'decided';
export interface CaseLink { caseId: string; number: number; title: string; mode: CaseLinkMode; backstory: string }

/** Связан ли вызов с делом кампании и как именно. */
export function incidentCaseLink(s: GameState, inc: Incident): CaseLink | null {
  const t = templateOf(inc);
  const opener = CASES.find((c) => c.templateId === inc.templateId && inc.createdShift >= c.fromShift && inc.createdShift <= c.toShift);
  // Сюжетные вызовы связаны с делом, только если пришли по сценарию (стартовые учебные вызовы того же типа — нет).
  const story = t?.story ? caseDef(t.story.caseId) : undefined;
  const d = opener ?? (story && inc.createdShift >= story.fromShift ? story : undefined);
  if (!d) return null;
  const f = caseFile(s, d.id);
  const mode: CaseLinkMode = !f ? (opener ? 'opens' : 'pending') : f.status === 'open' ? 'feeds' : 'decided';
  return { caseId: d.id, number: d.number, title: d.title, mode, backstory: houseText(d.summary) };
}

export const CASE_LINK_TEXT: Record<CaseLinkMode, string> = {
  opens: 'После выезда откроется дело. Сколько улик дойдёт до дела, решает задача операции «Сохранность улик».',
  feeds: 'Вызов связан с открытым делом: исход войдёт в материалы и повлияет на развитие истории.',
  pending: 'Вызов связан с делом, которое ещё не открыто: исход повлияет на развитие истории.',
  decided: 'Вызов связан с делом, по которому уже вынесено решение.',
};

// ---------- Следующий шаг ----------

export type CaseTab = 'board' | 'actions' | 'timeline' | 'interviews' | 'conclusion';
export interface NextStep { tab: CaseTab; text: string; target?: string }

const linked = (f: CaseFile, id: string) => f.links.some((l) => l.evidenceId === id);
const busy = (f: CaseFile, target: string) => f.tasks.some((t) => t.target === target);

/** Что разумно сделать сейчас. Не подсказывает, какая версия верна: только какой инструмент ещё не использован. */
export function caseNextStep(s: GameState, f: CaseFile): NextStep | null {
  const d = caseDef(f.id);
  if (!d || f.status !== 'open') return null;
  const title = (id: string) => evidenceDef(d, id)?.title ?? id;

  const fresh = f.evidence.find((e) => e.analysis === 'none' && !busy(f, e.id) && !analysisBlocker(s, f.id, e.id));
  if (fresh) return { tab: 'board', target: fresh.id, text: `Проверьте улику «${title(fresh.id)}»: на доске нажмите на неё и выберите сотрудника. Пока улика не проверена, на неё нельзя опереться.` };

  const unlinked = f.evidence.find((e) => e.analysis !== 'none' && e.analysis !== 'inconclusive' && !linked(f, e.id));
  if (unlinked) return { tab: 'board', target: unlinked.id, text: `Улика «${title(unlinked.id)}» проверена. Откройте её на доске и свяжите с версией, которую она подтверждает или опровергает.` };

  const ready = d.hypotheses.find((h) => caseForecast(s, f, h.id).admissibleSupported >= CASE_RULES.chargeMin);
  if (ready) return { tab: 'conclusion', text: `По версии «${ready.title}» уже ${CASE_RULES.chargeMin}+ подтверждённых допустимых связей. Можно выносить заключение или ещё усилить дело.` };

  const action = d.actions.find((a) => !f.actionsDone.includes(a.id) && !busy(f, a.id) && !actionBlocker(s, f.id, a.id));
  if (action) return { tab: 'actions', target: action.id, text: `Следственное действие «${action.label}» даст новые сведения. Откройте «Действия» и назначьте сотрудника.` };

  const permit = d.actions.find((a) => !f.actionsDone.includes(a.id) && actionPermitState(s, f, a) === 'missing'
    && (a.requires ?? []).every((r) => refFound(s, f.id, r)) && !casePermitBlocker(s, f.id, a.id));
  if (permit) return { tab: 'actions', target: permit.id, text: `Для действия «${permit.label}» нужно разрешение. Запросите его в «Действиях»: решение придёт через какое-то время и может быть отказом.` };

  for (const p of d.persons) {
    if (!personAvailable(s, f, p) || busy(f, p.id)) continue;
    const line = p.lines.find((l) => l.method !== 'pressure' && lineVisible(s, f, l) && !interrogationBlocker(s, f.id, p.id, l.id));
    if (line) return { tab: 'interviews', target: p.id, text: `Можно поговорить с человеком: ${p.name}. Показания становятся новыми уликами; усиленный допрос быстрее, но суд может их исключить.` };
  }

  const inconclusive = f.evidence.find((e) => e.analysis === 'inconclusive' && !busy(f, e.id) && !analysisBlocker(s, f.id, e.id));
  if (inconclusive) return { tab: 'board', target: inconclusive.id, text: `Проверка улики «${title(inconclusive.id)}» оказалась неубедительной. Повторите её: повторная проверка точнее.` };

  if (f.tasks.length) return { tab: 'board', text: `Идёт работа по делу (задач: ${f.tasks.length}). Ускорьте время или займитесь вызовами: результаты придут сами, а то, что не успеет, доделается к следующей смене.` };

  return { tab: 'conclusion', text: 'Доступные шаги пройдены. Новые сведения могут прийти с вызовов следующих смен или после разрешений. Если оснований хватает, выносите заключение.' };
}

// ---------- Учебные шаги ----------

export interface TrainingStep { id: string; label: string; hint: string; tab: CaseTab; done: boolean }

/** Шесть шагов первого дела. Отмечаются по настоящим действиям игрока. */
export function caseTraining(f: CaseFile): TrainingStep[] {
  return [
    { id: 'open', label: 'Съездить на вызов', hint: 'Дело открывается после выезда отряда на связанный вызов.', tab: 'board', done: true },
    { id: 'check', label: 'Проверить улику', hint: 'Доска → улика → сотрудник → «Проверить».', tab: 'board', done: f.evidence.some((e) => e.analysis !== 'none') },
    { id: 'link', label: 'Связать улику с версией', hint: 'Доска → улика → «Связать с версией».', tab: 'board', done: f.links.length > 0 },
    { id: 'action', label: 'Выполнить следственное действие', hint: '«Действия» → сотрудник → «Начать».', tab: 'actions', done: f.actionsDone.length > 0 || f.tasks.some((t) => t.kind === 'action') },
    { id: 'ask', label: 'Допросить человека', hint: '«Допросы» → человек → вопрос.', tab: 'interviews', done: f.asked.length > 0 || f.tasks.some((t) => t.kind === 'interrogate') },
    { id: 'conclude', label: 'Вынести заключение', hint: '«Заключение» → решение. Для обвинения нужно 3 подтверждённые связи.', tab: 'conclusion', done: !!f.decision },
  ];
}

/** Короткое имя дела для меток: «№418». */
export const caseLabel = (d: CaseDef) => `№${d.number}`;
