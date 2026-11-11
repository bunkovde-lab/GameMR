import casesFile from '../../content/cases_v1.json';
import { INCIDENT_TEMPLATES, toCents } from './content';
import { hasFlag, setFlag } from './flags';
import { POLITICS, applyDelta, coalitionStrong, hasAccess, houseById, recentViolations } from './politics';
import { nextFloat } from './rng';
import { DEPLOYED, caseTaskOf } from './selectors';
import type {
  AnalysisResult, CaseEvidence, CaseFile, CaseTask, GameState, InterrogationMethod, OperationReport, Permit, StaffRole,
} from './types';

/**
 * W9: расследования (ТЗ §11, сценарий docs/story/W9_CASES_v1.md).
 * Доска (улика→версия и улика↔улика), следственные действия с разрешениями, анализ, реконструкция,
 * допросы по предметным вопросам, правовое заключение. Скрытая истина (grade, bears, forged) — только в ядре.
 */

export type Bearing = 'supports' | 'contradicts';
export type LinkStatus = 'proposed' | 'supported' | 'contradicted';
export interface EvidenceDef {
  id: string; type: string; origin: string; title: string; source: string; text: string;
  slot?: number; conflictsWith?: string[]; analysis: 'lab' | 'desk'; setsFlag?: string;
  bears: Record<string, Bearing>; forged?: boolean; fakeBears?: Record<string, Bearing>; resultText: string; fakeText?: string;
}
export interface LineDef {
  id: string; method: InterrogationMethod; text: string; needs?: string[]; reveals?: string; setsFlag?: string;
  standing?: Record<string, number>; violation?: boolean;
}
export interface PersonDef {
  id: string; name: string; role: string; portrait: string; houseId?: string; requires?: string[]; requiresFlag?: string; lines: LineDef[];
}
export interface ActionDef {
  id: string; label: string; kind: 'field' | 'desk' | 'lab'; minutes: number; permit?: 'judicial' | 'interagency'; houseId?: string;
  requires?: string[]; reveals: string[]; weak?: string; hint?: string; flagIfBy?: { shift: number; flag: string };
}
export interface EdgeDef { a: string; b: string; question: string; insight: string }
export interface Effect {
  trust?: number; safety?: number; standing?: Record<string, number>; coalition?: Record<string, number>; violation?: boolean; money?: number; text?: string;
}
export interface ConclusionDef {
  id: string; kind: 'charge' | 'final' | 'close'; label: string; hint: string; hypotheses?: string[]; needsEdges?: number; needsFlag?: string;
  money?: number; effects?: Effect; flags?: string[]; reveal?: Effect; strong?: boolean;
}
export interface CaseDef {
  id: string; number: number; title: string; templateId: string; houseId: string; fromShift: number; toShift: number; summary: string;
  slots: string[]; hypotheses: { id: string; title: string; text: string; grade: 'true' | 'partial' | 'false' }[];
  evidence: EvidenceDef[]; edges: EdgeDef[]; actions: ActionDef[]; persons: PersonDef[]; conclusions: ConclusionDef[];
}
interface Rules {
  shiftMinutes: number;
  analysis: Record<'lab' | 'desk', { label: string; minutes: number; reagents: number; roles: StaffRole[]; speedPerLabLevel: number }>;
  quality: { base: number; perAnalysis: number; repeatBonus: number };
  detect: { base: number; perAnalysis: number; repeatBonus: number };
  interrogation: { minutes: number; roles: StaffRole[]; skilledMinAnalysis: number };
  actionRoles: Record<ActionDef['kind'], StaffRole[]>;
  casePermit: { judicialBase: number; perAnalyzed: number; trustMin: number; trustBonus: number; violationPenalty: number; interagencyBase: number; standingFactor: number; min: number; max: number };
  chargeMin: number;
  court: { base: number; perExtra: number; perQuestionable: number; perEdge: number; min: number; max: number };
  expertise: { fee: number; bonus: number };
  revealAfterShifts: number;
  rightCharge: Effect;
  revealFalse: Effect;
  pressure: Effect;
}

export const CASE_RULES = casesFile.rules as unknown as Rules;
export const CASES = casesFile.cases as unknown as CaseDef[];
export const EVIDENCE_TYPES = casesFile.evidenceTypes as Record<string, string>;
export const METHOD_LABEL = casesFile.methods as Record<InterrogationMethod, string>;
export const caseDef = (id: string) => CASES.find((c) => c.id === id);
export const evidenceDef = (c: CaseDef, id: string) => c.evidence.find((e) => e.id === id);
export const personDef = (c: CaseDef, id: string) => c.persons.find((p) => p.id === id);
export const actionDef = (c: CaseDef, id: string) => c.actions.find((a) => a.id === id);
export const conclusionDef = (c: CaseDef, id: string) => c.conclusions.find((x) => x.id === id);
export const caseFile = (s: GameState, id: string) => s.investigations.cases.find((c) => c.id === id);

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const roll = (s: GameState) => {
  const [v, next] = nextFloat(s.rng);
  s.rng = next;
  return v;
};
/** Абсолютная игровая минута: задачи переживают конец смены. */
export const absMinute = (s: GameState) => (s.shift - 1) * CASE_RULES.shiftMinutes + s.minute;
export const initialInvestigations = (): GameState['investigations'] => ({ cases: [] });

type Log = (type: string, text: string, ids?: string[]) => void;
type Post = (amount: number, note: string) => void;

// ---------- Ссылки на улики (в т. ч. из других дел) ----------

/** «e05» — улика этого дела, «c1:e05» — улика другого дела. */
export function resolveRef(s: GameState, caseId: string, ref: string) {
  const [cid, eid] = ref.includes(':') ? ref.split(':') as [string, string] : [caseId, ref];
  const d = caseDef(cid);
  const f = caseFile(s, cid);
  const def = d && evidenceDef(d, eid);
  const ev = f?.evidence.find((e) => e.id === eid);
  return { caseId: cid, id: eid, def, ev, file: f, case: d };
}
export const refFound = (s: GameState, caseId: string, ref: string) => !!resolveRef(s, caseId, ref).ev;
export const refTitle = (s: GameState, caseId: string, ref: string) => {
  const r = resolveRef(s, caseId, ref);
  return r.caseId === caseId ? r.def?.title ?? ref : `№${r.case?.number}: ${r.def?.title ?? ref}`;
};
const checked = (ev: CaseEvidence | undefined) => !!ev && ev.analysis !== 'none' && ev.analysis !== 'inconclusive';

// ---------- Открытие дела ----------

/** Дело открывается по итогам операции на вызове своего типа в своём окне смен (сценарий §9: даже если прошлые улики потеряны). */
export function openCaseFromReport(s: GameState, report: Pick<OperationReport, 'incidentId' | 'memberIds' | 'tasks'>, templateId: string, log: Log): CaseFile | null {
  const incident = s.incidents.find((i) => i.id === report.incidentId);
  const def = s.mode === 'sandbox'
    ? CASES.find((c) => c.id === incident?.sandbox?.caseId && c.templateId === templateId)
    : CASES.find((c) => c.templateId === templateId && s.shift >= c.fromShift && s.shift <= c.toShift);
  if (!def || caseFile(s, def.id)) return null;
  const scene = def.evidence.filter((e) => e.origin === 'scene');
  const kept = report.tasks.find((t) => t.label === 'Сохранность улик')?.result ?? 'done';
  const n = kept === 'done' ? scene.length : kept === 'partial' ? Math.max(1, scene.length - 1) : Math.ceil(scene.length / 2);
  const file: CaseFile = {
    id: def.id, incidentId: report.incidentId, openedShift: s.shift, status: 'open',
    evidence: scene.slice(0, n).map((e) => ({
      id: e.id, foundShift: s.shift, analysis: 'none', checks: 0, questionable: kept === 'failed',
      ...(kept === 'failed' ? { custodyNote: 'Цепочка хранения нарушена на месте операции.' } : {}),
    })),
    links: [], pairs: [], timeline: {}, working: null, asked: [], actionsDone: [], tasks: [], expertiseBonus: 0,
  };
  s.investigations.cases.push(file);
  for (const e of scene.slice(0, n)) setFlag(s, e.setsFlag);
  const lost = scene.length - n;
  log('case_opened', `Открыто дело №${def.number} «${def.title}»: ${n} улик с места${lost ? `, ${lost} утрачено при операции` : ''}.`, report.memberIds);
  return file;
}

// ---------- Кто может работать ----------

export function workerBlocker(s: GameState, staffId: string, roles: StaffRole[]): string | null {
  const p = s.staff.find((x) => x.id === staffId);
  if (!p) return 'Нет такого сотрудника.';
  if (!roles.includes(p.role)) return 'Не подходит по должности.';
  if (p.health === 'dead') return 'В архиве.';
  if (['serious_injury', 'critical', 'missing'].includes(p.health)) return 'Не допущен(а) по состоянию.';
  if (p.training) return 'На курсе.';
  if (s.medical.patients.some((x) => x.staffId === p.id)) return 'В клинике.';
  if (s.research.some((r) => ['queued', 'active', 'blocked_inputs', 'blocked_staff'].includes(r.status) && r.researcherId === p.id)) return 'Ведёт исследование.';
  if (caseTaskOf(s, p.id)) return 'Занят(а) другим делом.';
  if (s.squads.some((q) => q.memberIds.includes(p.id) && DEPLOYED.includes(q.status))) return 'На задании.';
  return null;
}

const openBlocker = (s: GameState, caseId: string) => {
  const f = caseFile(s, caseId);
  if (!f || !caseDef(caseId)) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  if (s.phase !== 'ACTIVE') return 'Работа по делу идёт во время смены.';
  return null;
};
const found = (f: CaseFile, id: string) => f.evidence.find((e) => e.id === id);
const taskOn = (f: CaseFile, target: string) => f.tasks.find((t) => t.target === target);

function reveal(s: GameState, f: CaseFile, d: CaseDef, ids: (string | undefined)[], log: Log, opts: { questionable?: boolean; note?: string } = {}) {
  for (const id of ids) {
    if (!id || found(f, id)) continue;
    const e = evidenceDef(d, id);
    if (!e) continue;
    f.evidence.push({ id, foundShift: s.shift, analysis: 'none', checks: 0, questionable: !!opts.questionable, ...(opts.note ? { custodyNote: opts.note } : {}) });
    setFlag(s, e.setsFlag);
    log('evidence_found', `Дело №${d.number}: новая улика — «${e.title}».`);
  }
}

// ---------- Следственные действия и разрешения по делу ----------

/** Есть ли законное основание для действия: штатное, выданный документ, договор с Домом или решение кампании. */
export function actionPermitState(s: GameState, f: CaseFile, a: ActionDef): 'none' | 'granted' | 'pending' | 'missing' {
  if (!a.permit) return 'none';
  if (a.permit === 'interagency' && a.houseId && (hasAccess(s, a.houseId) || hasFlag(s, `access_${a.houseId}`))) return 'granted';
  const mine = s.politics.permits.filter((p) => p.caseId === f.id && p.actionId === a.id);
  if (mine.some((p) => p.status === 'granted' && p.expiresShift >= s.shift)) return 'granted';
  if (mine.some((p) => p.status === 'pending')) return 'pending';
  return 'missing';
}

export function caseApproval(s: GameState, f: CaseFile, a: ActionDef): number {
  const R = CASE_RULES.casePermit;
  if (a.permit === 'interagency') return clamp(R.min, R.max, R.interagencyBase + (s.politics.standing[a.houseId ?? ''] ?? 0) * R.standingFactor);
  const d = caseDef(f.id)!;
  const district = s.districts.find((x) => x.id === INCIDENT_TEMPLATES.find((t) => t.id === d.templateId)?.districtId);
  const analyzed = f.evidence.filter((e) => checked(e)).length;
  return clamp(R.min, R.max, R.judicialBase + R.perAnalyzed * analyzed + ((district?.civilianTrust ?? 0) >= R.trustMin ? R.trustBonus : 0)
    + (coalitionStrong(s, 'open') ? POLITICS.permits.judicial.openBonus : 0) - R.violationPenalty * recentViolations(s));
}

export function casePermitBlocker(s: GameState, caseId: string, actionId: string): string | null {
  const why = openBlocker(s, caseId);
  if (why) return why;
  const f = caseFile(s, caseId)!;
  const a = actionDef(caseDef(caseId)!, actionId);
  if (!a || !a.permit) return 'Этому действию разрешение не нужно.';
  const st = actionPermitState(s, f, a);
  if (st === 'granted') return 'Разрешение уже есть.';
  if (st === 'pending') return 'Запрос уже рассматривается.';
  if (s.economy.balance < toCents(POLITICS.permits[a.permit].fee)) return 'Недостаточно средств на пошлину.';
  return null;
}

export function makeCasePermit(s: GameState, f: CaseFile, a: ActionDef): Permit {
  const d = caseDef(f.id)!;
  const R = POLITICS.permits[a.permit!];
  const issuer = a.permit === 'interagency' ? houseById(a.houseId!)!.label : POLITICS.levels.find((l) => l.id === 'judicial')!.issuer;
  return {
    id: s.politics.nextId++, kind: a.permit!, incidentId: f.incidentId, caseId: f.id, actionId: a.id,
    target: `Дело №${d.number}: ${a.label.toLowerCase()}`, scope: [], issuer, legalBasis: R.legalBasis, requirements: [...R.requirements],
    houseId: a.houseId ?? null, requestedShift: s.shift, decideMinute: s.minute + R.reviewMinutes, expiresShift: s.shift + R.validShifts - 1,
    reviewShift: null, auditRisk: 0, status: 'pending', note: '',
  };
}

/** Решение по запросам дела (вызывается из decidePermits-цикла ядра). */
export function decideCasePermits(s: GameState, log: Log, all = false) {
  for (const p of s.politics.permits) {
    if (!p.caseId || p.status !== 'pending' || (!all && (p.decideMinute ?? 0) > s.minute)) continue;
    const f = caseFile(s, p.caseId);
    const a = f && actionDef(caseDef(f.id)!, p.actionId ?? '');
    if (!f || !a || f.status !== 'open') { p.status = 'expired'; p.note = 'Дело закрыто до решения.'; continue; }
    const ok = roll(s) < caseApproval(s, f, a);
    p.status = ok ? 'granted' : 'denied';
    p.note = ok ? `Выдано: ${p.issuer}.` : p.kind === 'judicial' ? 'Суд счёл основания недостаточными.' : `${p.issuer} отказал в допуске.`;
    log(ok ? 'permit_granted' : 'permit_denied', `${p.target}: ${p.kind === 'judicial' ? 'ордер' : 'допуск'} ${ok ? 'выдан' : '— отказ'}.`);
  }
}

export function actionBlocker(s: GameState, caseId: string, actionId: string, staffId?: string): string | null {
  const why = openBlocker(s, caseId);
  if (why) return why;
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  const a = actionDef(d, actionId);
  if (!a) return 'Нет такого действия.';
  if (f.actionsDone.includes(a.id)) return 'Уже выполнено.';
  if (a.reveals.every((id) => found(f, id))) return 'Эти сведения уже есть в деле.';
  if (taskOn(f, a.id)) return 'Уже выполняется.';
  const missing = (a.requires ?? []).filter((r) => !refFound(s, caseId, r));
  if (missing.length) return `Нужно: ${missing.map((r) => `«${refTitle(s, caseId, r)}»`).join(', ')}.`;
  const st = actionPermitState(s, f, a);
  if (st === 'pending') return 'Ждём решения по разрешению.';
  if (st === 'missing') return a.permit === 'judicial' ? 'Нужен ордер суда.' : `Нужен допуск: ${houseById(a.houseId!)?.label}.`;
  return staffId ? workerBlocker(s, staffId, CASE_RULES.actionRoles[a.kind]) : null;
}

export function startAction(s: GameState, caseId: string, actionId: string, staffId: string) {
  const f = caseFile(s, caseId)!;
  const a = actionDef(caseDef(caseId)!, actionId)!;
  const permit = s.politics.permits.find((p) => p.caseId === caseId && p.actionId === actionId && p.status === 'granted');
  if (permit) permit.status = 'used';
  f.tasks.push({ kind: 'action', target: a.id, staffId, doneAt: absMinute(s) + a.minutes });
}

/** Завершение полевого действия после реального выезда в песочнице; использует общие улики и флаги дела. */
export function completeFieldAction(s: GameState, caseId: string, actionId: string, log: Log, questionable = false) {
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  const a = actionDef(d, actionId)!;
  if (!f.actionsDone.includes(a.id)) f.actionsDone.push(a.id);
  reveal(s, f, d, a.reveals, log, questionable ? { questionable: true, note: 'Получено по альтернативному каналу или с неполной цепочкой хранения.' } : {});
  if (a.flagIfBy && s.shift <= a.flagIfBy.shift) setFlag(s, a.flagIfBy.flag);
  log('case_action', `Дело №${d.number}: ${a.label.toLowerCase()} — выполнено после выезда.`);
}

// ---------- Анализ ----------

export function analysisMinutes(s: GameState, def: EvidenceDef): number {
  const A = CASE_RULES.analysis[def.analysis];
  return Math.round(A.minutes / (1 + A.speedPerLabLevel * ((s.facilities.lab ?? 1) - 1)));
}

export function analysisBlocker(s: GameState, caseId: string, evidenceId: string, staffId?: string): string | null {
  const why = openBlocker(s, caseId);
  if (why) return why;
  const f = caseFile(s, caseId)!;
  const def = evidenceDef(caseDef(caseId)!, evidenceId);
  if (!found(f, evidenceId) || !def) return 'Улика не найдена.';
  if (taskOn(f, evidenceId)) return 'Улика уже в работе.';
  const A = CASE_RULES.analysis[def.analysis];
  if (s.resources.reagents < A.reagents) return `Нужно реагентов: ${A.reagents}.`;
  return staffId ? workerBlocker(s, staffId, A.roles) : null;
}

export function startAnalysis(s: GameState, caseId: string, evidenceId: string, staffId: string): CaseTask {
  const f = caseFile(s, caseId)!;
  const def = evidenceDef(caseDef(caseId)!, evidenceId)!;
  s.resources.reagents -= CASE_RULES.analysis[def.analysis].reagents;
  const t: CaseTask = { kind: 'analyze', target: evidenceId, staffId, doneAt: absMinute(s) + analysisMinutes(s, def) };
  f.tasks.push(t);
  return t;
}

/** Результат зависит от сотрудника, повторных проверок и внешней экспертизы. Подлог без выявления выглядит как обычная проверка. */
function analyze(s: GameState, f: CaseFile, ev: CaseEvidence, def: EvidenceDef, analysisStat: number): AnalysisResult {
  const extra = ev.checks * CASE_RULES.quality.repeatBonus + f.expertiseBonus;
  ev.checks += 1;
  if (def.forged) {
    if (ev.analysis === 'forgery') return 'forgery';
    const p = CASE_RULES.detect.base + CASE_RULES.detect.perAnalysis * analysisStat + extra;
    return roll(s) < p ? 'forgery' : 'misled';
  }
  if (ev.analysis === 'confirmed') return 'confirmed';
  const p = CASE_RULES.quality.base + CASE_RULES.quality.perAnalysis * analysisStat + extra;
  return roll(s) < p ? 'confirmed' : 'inconclusive';
}

// ---------- Допросы ----------

export const personAvailable = (s: GameState, f: CaseFile, p: PersonDef) =>
  (p.requires ?? []).every((r) => refFound(s, f.id, r)) && (!p.requiresFlag || hasFlag(s, p.requiresFlag));
/** Вопрос открывается только после нужных улик (сценарий §9: не после нескольких нажатий). Предъявлять можно только проверенное. */
export const lineVisible = (s: GameState, f: CaseFile, line: LineDef) => (line.needs ?? []).every((r) => refFound(s, f.id, r));

export function interrogationBlocker(s: GameState, caseId: string, personId: string, lineId: string, staffId?: string): string | null {
  const why = openBlocker(s, caseId);
  if (why) return why;
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  const p = personDef(d, personId);
  if (!p) return 'Человек не найден.';
  if (!personAvailable(s, f, p)) return 'Пока нет оснований для встречи.';
  const line = p.lines.find((l) => l.id === lineId);
  if (!line) return 'Нет такого вопроса.';
  if (!lineVisible(s, f, line)) return 'Нужны улики, на которые можно сослаться.';
  if (f.asked.includes(`${p.id}:${line.id}`)) return 'Уже спрошено.';
  if (taskOn(f, p.id)) return 'Допрос уже идёт.';
  const raw = (line.needs ?? []).find((r) => !checked(resolveRef(s, caseId, r).ev));
  if (raw && line.method !== 'standard') return `Сначала проверьте: «${refTitle(s, caseId, raw)}».`;
  if (line.method !== 'pressure' && line.method !== 'standard' && f.asked.some((x) => x.startsWith(`${p.id}:`) && p.lines.find((l) => `${p.id}:${l.id}` === x)?.method === 'pressure'))
    return 'После усиленного допроса человек больше не доверяет дирекции.';
  return staffId ? workerBlocker(s, staffId, CASE_RULES.interrogation.roles) : null;
}

export function startInterrogation(s: GameState, caseId: string, personId: string, lineId: string, staffId: string): CaseTask {
  const f = caseFile(s, caseId)!;
  const t: CaseTask = { kind: 'interrogate', target: personId, lineId, staffId, doneAt: absMinute(s) + CASE_RULES.interrogation.minutes };
  f.tasks.push(t);
  return t;
}

function completeTask(s: GameState, f: CaseFile, t: CaseTask, log: Log) {
  const d = caseDef(f.id)!;
  const p = s.staff.find((x) => x.id === t.staffId);
  const ids = p ? [p.id] : undefined;
  f.tasks = f.tasks.filter((x) => x !== t);
  if (t.kind === 'analyze') {
    const ev = found(f, t.target);
    const def = evidenceDef(d, t.target);
    if (!ev || !def) return;
    ev.analysis = analyze(s, f, ev, def, p?.stats.analysis ?? 1);
    const word = ev.analysis === 'inconclusive' ? 'результат неубедителен' : ev.analysis === 'forgery' ? 'выявлен подлог' : 'проверено';
    log('evidence_analyzed', `${p?.name ?? 'Сотрудник'}: «${def.title}» — ${word}.`, ids);
    return;
  }
  if (t.kind === 'action') {
    const a = actionDef(d, t.target)!;
    f.actionsDone.push(a.id);
    log('case_action', `Дело №${d.number}: ${a.label.toLowerCase()} — выполнено.`, ids);
    reveal(s, f, d, a.reveals, log, a.weak ? { questionable: true, note: a.weak } : {});
    if (a.flagIfBy && s.shift <= a.flagIfBy.shift) setFlag(s, a.flagIfBy.flag);
    return;
  }
  const person = personDef(d, t.target);
  const line = person?.lines.find((l) => l.id === t.lineId);
  if (!person || !line) return;
  f.asked.push(`${person.id}:${line.id}`);
  log('interrogation', `${p?.name ?? 'Сотрудник'}: ${METHOD_LABEL[line.method].toLowerCase()} — ${person.name}.`, ids);
  setFlag(s, line.setsFlag);
  applyDelta(s, { standing: line.standing }, () => {}, '');
  if (line.violation) s.politics.violations.push(s.shift);
  if (line.method === 'pressure') {
    // Усиленный метод: показания низкой надёжности, всё сказанное этим человеком — под сомнением.
    reveal(s, f, d, [line.reveals], log, { questionable: true, note: 'Получено усиленным допросом: суд может исключить.' });
    for (const ev of f.evidence) {
      if (evidenceDef(d, ev.id)?.origin === `person:${person.id}`) {
        ev.questionable = true;
        ev.custodyNote ??= 'Человек допрошен с давлением: его показания оспариваются.';
      }
    }
    applyDelta(s, { coalition: CASE_RULES.pressure.coalition }, () => {}, '');
    log('interrogation_pressure', `Дело №${d.number}: ${CASE_RULES.pressure.text}`);
  } else reveal(s, f, d, [line.reveals], log);
}

/** Завершает задачи, срок которых наступил (all — между сменами доделывается всё). */
export function advanceInvestigations(s: GameState, log: Log, all = false) {
  const now = absMinute(s);
  for (const f of s.investigations.cases) {
    for (const t of [...f.tasks].sort((a, b) => a.doneAt - b.doneAt)) if (all || t.doneAt <= now) completeTask(s, f, t, log);
  }
}

// ---------- Доска ----------

export function linkStatus(f: CaseFile, d: CaseDef, evidenceId: string, hypothesisId: string): { status: LinkStatus; note: string } {
  const ev = found(f, evidenceId);
  const def = evidenceDef(d, evidenceId);
  if (!ev || !def) return { status: 'proposed', note: '' };
  if (ev.analysis === 'none') return { status: 'proposed', note: 'улика не проверена' };
  if (ev.analysis === 'inconclusive') return { status: 'proposed', note: 'проверка неубедительна' };
  const map = ev.analysis === 'misled' ? def.fakeBears ?? {} : def.bears;
  const b = map[hypothesisId];
  if (!b) return { status: 'proposed', note: 'проверка не связывает улику с версией' };
  return { status: b === 'supports' ? 'supported' : 'contradicted', note: '' };
}

const sameEdge = (caseId: string, e: EdgeDef, a: string, b: string) => {
  const norm = (r: string) => (r.startsWith(`${caseId}:`) ? r.slice(caseId.length + 1) : r);
  return (norm(e.a) === norm(a) && norm(e.b) === norm(b)) || (norm(e.a) === norm(b) && norm(e.b) === norm(a));
};
/** Сопоставление двух улик: подтверждается, только если обе проверены и между ними есть реальная связь. */
export function pairStatus(s: GameState, f: CaseFile, a: string, b: string): { status: LinkStatus; edge: EdgeDef | null } {
  const d = caseDef(f.id)!;
  const edge = d.edges.find((e) => sameEdge(f.id, e, a, b)) ?? null;
  if (!checked(resolveRef(s, f.id, a).ev) || !checked(resolveRef(s, f.id, b).ev)) return { status: 'proposed', edge: null };
  return edge ? { status: 'supported', edge } : { status: 'contradicted', edge: null };
}
export const supportedEdges = (s: GameState, f: CaseFile) => f.pairs.filter((p) => pairStatus(s, f, p.a, p.b).status === 'supported').length;

/** Что видит игрок о проверке улики: подлог без выявления неотличим от подлинной. */
export function analysisView(ev: CaseEvidence, def: EvidenceDef): { word: string; tone: string; text: string | null } {
  switch (ev.analysis) {
    case 'none': return { word: 'не проверена', tone: '', text: null };
    case 'inconclusive': return { word: 'неубедительно', tone: 'mid', text: 'Проверка не дала ясного ответа. Можно повторить: повторная проверка точнее.' };
    case 'forgery': return { word: 'подлог выявлен', tone: 'bad', text: def.resultText };
    case 'misled': return { word: 'проверено', tone: 'good', text: def.fakeText ?? def.resultText };
    default: return { word: 'проверено', tone: 'good', text: def.resultText };
  }
}

export function admissibility(s: GameState, f: CaseFile, ev: CaseEvidence, def: EvidenceDef): { ok: boolean; why: string | null } {
  if (ev.questionable) return { ok: false, why: ev.custodyNote ?? 'Допустимость под сомнением.' };
  if (def.origin === 'scene' && s.politics.permits.some((p) => p.incidentId === f.incidentId && p.kind === 'emergency' && p.status === 'violation'))
    return { ok: false, why: 'Изъято при действии, которое проверка признала нарушением.' };
  return { ok: true, why: null };
}

export function linkBlocker(s: GameState, caseId: string, evidenceId: string, hypothesisId: string): string | null {
  const f = caseFile(s, caseId);
  const d = caseDef(caseId);
  if (!f || !d) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  if (!found(f, evidenceId)) return 'Улика не найдена.';
  if (!d.hypotheses.some((h) => h.id === hypothesisId)) return 'Версия не найдена.';
  return null;
}
export function pairBlocker(s: GameState, caseId: string, a: string, b: string): string | null {
  const f = caseFile(s, caseId);
  if (!f) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  if (a.includes(':') || !found(f, a)) return 'Первая улика должна быть из этого дела.';
  if (a === b || b === `${caseId}:${a}`) return 'Нельзя сопоставить улику саму с собой.';
  if (!refFound(s, caseId, b)) return 'Улика не найдена.';
  return null;
}
export const hasPair = (f: CaseFile, a: string, b: string) => f.pairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

// ---------- Реконструкция ----------

export interface TimelineView {
  placed: { evidenceId: string; slot: number; fits: boolean }[];
  conflicts: [string, string][];
}

/** Улика «не на месте», если источник называет другое время. Противоречие — две улики на своих местах, которые не могут быть правдой вместе. */
export function timelineView(f: CaseFile, d: CaseDef): TimelineView {
  const placed = Object.entries(f.timeline).map(([evidenceId, slot]) => ({ evidenceId, slot, fits: evidenceDef(d, evidenceId)?.slot === slot }));
  const ok = new Set(placed.filter((p) => p.fits).map((p) => p.evidenceId));
  const conflicts: [string, string][] = [];
  for (const id of [...ok].sort()) {
    for (const other of evidenceDef(d, id)?.conflictsWith ?? []) if (ok.has(other) && id < other) conflicts.push([id, other]);
  }
  return { placed, conflicts };
}
export const timedEvidence = (f: CaseFile, d: CaseDef) => f.evidence.filter((e) => evidenceDef(d, e.id)?.slot !== undefined);
/** Восстановлена ли последовательность: все улики со временем на своих местах. */
export const timelineComplete = (f: CaseFile, d: CaseDef) => {
  const timed = timedEvidence(f, d);
  return timed.length >= 3 && timed.every((e) => f.timeline[e.id] === evidenceDef(d, e.id)!.slot);
};

// ---------- Заключение ----------

/** Пригодность доказательств для версии. Не говорит, верна ли версия (ТЗ §11.2). */
export function caseForecast(s: GameState, f: CaseFile, hypothesisId: string) {
  const d = caseDef(f.id)!;
  let supported = 0, admissibleSupported = 0, questionable = 0, contradicted = 0;
  for (const l of f.links.filter((x) => x.hypothesisId === hypothesisId)) {
    const st = linkStatus(f, d, l.evidenceId, hypothesisId).status;
    const ev = found(f, l.evidenceId)!;
    const ok = admissibility(s, f, ev, evidenceDef(d, l.evidenceId)!).ok;
    if (st === 'supported') {
      supported++;
      if (ok) admissibleSupported++;
      else questionable++;
    }
    if (st === 'contradicted') contradicted++;
  }
  return { supported, admissibleSupported, questionable, contradicted, conflicts: timelineView(f, d).conflicts.length, edges: supportedEdges(s, f) };
}

export function courtChance(s: GameState, f: CaseFile, hypothesisId: string): number {
  const fc = caseForecast(s, f, hypothesisId);
  const C = CASE_RULES.court;
  return clamp(C.min, C.max, C.base + C.perExtra * (fc.admissibleSupported - CASE_RULES.chargeMin) - C.perQuestionable * fc.questionable + C.perEdge * fc.edges);
}

export function concludeBlocker(s: GameState, caseId: string, conclusionId: string, hypothesisId?: string): string | null {
  const f = caseFile(s, caseId);
  const d = caseDef(caseId);
  if (!f || !d) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  if (f.tasks.length) return 'Дождитесь окончания текущей работы по делу.';
  if (s.mode === 'sandbox' && s.incidents.some((i) => i.sandbox?.caseId === caseId && ['new', 'acknowledged', 'assigned', 'en_route', 'on_scene', 'escalated'].includes(i.state)))
    return 'Сначала завершите все связанные с делом выезды.';
  const c = conclusionDef(d, conclusionId);
  if (!c) return 'Нет такого решения.';
  if (c.needsFlag && !hasFlag(s, c.needsFlag)) return conclusionNeedText(c.needsFlag);
  if (c.needsEdges && supportedEdges(s, f) < c.needsEdges) return `Нужно подтверждённых сопоставлений улик: ${c.needsEdges}.`;
  if (c.money && c.money < 0 && s.economy.balance < toCents(-c.money)) return 'Недостаточно средств.';
  if (c.kind !== 'charge') return null;
  if (!hypothesisId || !(c.hypotheses ?? []).includes(hypothesisId)) return `Выберите версию: ${(c.hypotheses ?? []).map((h) => `«${d.hypotheses.find((x) => x.id === h)?.title}»`).join(' или ')}.`;
  const fc = caseForecast(s, f, hypothesisId);
  if (fc.admissibleSupported < CASE_RULES.chargeMin)
    return `Мало оснований: подтверждённых допустимых связей ${fc.admissibleSupported} из ${CASE_RULES.chargeMin}.`;
  if (fc.contradicted >= fc.supported) return 'Опровергающих связей не меньше, чем подтверждающих.';
  return null;
}
const conclusionNeedText = (flag: string) =>
  ({
    c2_surgeon_cooperates: 'Нужно согласие Ашер на сотрудничество (защита свидетеля).',
    c3_e07_found: 'Нужна межведомственная сверка реестров.',
  })[flag] ?? 'Условие не выполнено.';

export function applyEffect(s: GameState, d: CaseDef, e: Effect | undefined, post: Post, note: string) {
  if (!e) return;
  const districtId = INCIDENT_TEMPLATES.find((t) => t.id === d.templateId)?.districtId;
  const dist = s.districts.find((x) => x.id === districtId);
  if (dist) {
    dist.civilianTrust = clamp(0, 100, dist.civilianTrust + (e.trust ?? 0));
    dist.safety = clamp(0, 100, dist.safety + (e.safety ?? 0));
  }
  applyDelta(s, { standing: e.standing, coalition: e.coalition, money: e.money }, post, note);
  if (e.violation) s.politics.violations.push(s.shift);
}

/** Правовое решение — не флаг «раскрыто». Ошибка может вскрыться позже (ТЗ §11.5). */
export function concludeCase(s: GameState, caseId: string, conclusionId: string, hypothesisId: string | undefined, post: Post, log: Log) {
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  const c = conclusionDef(d, conclusionId)!;
  if (c.kind === 'charge') {
    const h = d.hypotheses.find((x) => x.id === hypothesisId)!;
    if (roll(s) >= courtChance(s, f, h.id)) {
      f.decision = { conclusionId, hypothesisId: h.id, shift: s.shift, court: 'returned' };
      log('case_returned', `Дело №${d.number}: Суд продолжения вернул обвинение («${c.label}», версия «${h.title}»): доказательств недостаточно или они сомнительны. Дело остаётся открытым.`);
      return;
    }
    f.status = 'charged';
    f.decision = { conclusionId, hypothesisId: h.id, shift: s.shift, court: 'accepted' };
    applyEffect(s, d, c.effects, post, `Дело №${d.number}`);
    if (h.grade !== 'false') applyEffect(s, d, CASE_RULES.rightCharge, post, '');
    else f.revealShift = s.shift + CASE_RULES.revealAfterShifts;
    for (const fl of c.flags ?? []) setFlag(s, fl);
    log('case_charged', `Дело №${d.number}: суд принял решение «${c.label}» по версии «${h.title}».`);
    return;
  }
  f.status = c.kind === 'final' ? 'concluded' : 'closed';
  f.decision = { conclusionId, shift: s.shift };
  if (c.money) post(toCents(c.money), `Дело №${d.number}: ${c.label.toLowerCase()}`);
  applyEffect(s, d, c.effects, post, `Дело №${d.number}`);
  for (const fl of c.flags ?? []) setFlag(s, fl);
  if (c.reveal) f.revealShift = s.shift + CASE_RULES.revealAfterShifts;
  log('case_concluded', `Дело №${d.number}: ${c.label}.`);
}

export function expertiseBlocker(s: GameState, caseId: string): string | null {
  const f = caseFile(s, caseId);
  if (!f) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  if (f.expertiseBonus > 0) return 'Внешняя экспертиза уже проведена.';
  if (!f.evidence.some((e) => e.analysis !== 'none')) return 'Нечего перепроверять: проверенных улик нет.';
  if (s.economy.balance < toCents(CASE_RULES.expertise.fee)) return 'Недостаточно средств.';
  return null;
}

/** Внешняя экспертиза: все проверенные улики перепроверяются точнее (без занятых сотрудников). */
export function requestExpertise(s: GameState, caseId: string, post: Post, log: Log) {
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  post(-toCents(CASE_RULES.expertise.fee), `Внешняя экспертиза по делу №${d.number}`);
  f.expertiseBonus = CASE_RULES.expertise.bonus;
  let changed = 0;
  for (const ev of [...f.evidence].sort((a, b) => a.id.localeCompare(b.id))) {
    if (ev.analysis === 'none') continue;
    const before = ev.analysis;
    ev.analysis = analyze(s, f, ev, evidenceDef(d, ev.id)!, 3);
    if (ev.analysis !== before) changed++;
  }
  log('case_expertise', `Дело №${d.number}: внешняя экспертиза перепроверила улики, изменились выводы по ${changed}.`);
}

/** Между сменами: доделать задачи и вскрыть ошибочные решения, когда пришёл их срок. */
export function advanceInvestigationsShift(s: GameState, post: Post, log: Log) {
  advanceInvestigations(s, log, true);
  decideCasePermits(s, log, true);
  for (const f of s.investigations.cases) {
    if (f.revealed || f.revealShift === undefined || s.shift < f.revealShift) continue;
    f.revealed = true;
    const d = caseDef(f.id)!;
    const e = f.status === 'charged' ? CASE_RULES.revealFalse : conclusionDef(d, f.decision?.conclusionId ?? '')?.reveal;
    applyEffect(s, d, e, post, `Дело №${d.number}`);
    log('case_revealed', `Дело №${d.number} «${d.title}»: ${e?.text ?? 'решение пересмотрено.'}`);
  }
}

/** Сильное ли решение по делу (для финала): обвинение по верной/частично верной версии или решение, требующее доказательной базы. */
export function caseStrong(f: CaseFile): boolean {
  const d = caseDef(f.id)!;
  if (!f.decision || f.revealed) return false;
  const c = conclusionDef(d, f.decision.conclusionId);
  if (f.status === 'charged') return d.hypotheses.find((h) => h.id === f.decision!.hypothesisId)?.grade !== 'false';
  return !!c?.strong;
}

export function caseStatusWord(f: CaseFile): string {
  const d = caseDef(f.id)!;
  const c = f.decision ? conclusionDef(d, f.decision.conclusionId) : undefined;
  if (f.status === 'open') return f.decision?.court === 'returned' ? 'открыто · суд вернул обвинение' : 'открыто';
  if (f.revealed) return `${c?.label ?? 'решено'} · пересмотрено`;
  return c?.label ?? 'решено';
}
