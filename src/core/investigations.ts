import casesFile from '../../content/cases_v1.json';
import { INCIDENT_TEMPLATES, toCents } from './content';
import { applyDelta, houseById } from './politics';
import { nextFloat } from './rng';
import { DEPLOYED, caseTaskOf } from './selectors';
import type {
  AnalysisResult, CaseDecisionKind, CaseEvidence, CaseFile, CaseTask, GameState, InterrogationMethod, OperationReport, StaffRole,
} from './types';

/**
 * W9: расследования (ТЗ §11). Доска, связи, анализ, реконструкция, допросы, правовое заключение.
 * Скрытая истина (truth, bears, forged) хранится только в контенте и никогда не показывается до решения.
 */

export type Bearing = 'supports' | 'contradicts';
export type LinkStatus = 'proposed' | 'supported' | 'contradicted';
export interface EvidenceDef {
  id: string; type: string; origin: string; title: string; source: string; text: string;
  slot?: number; conflictsWith?: string[]; analysis: 'lab' | 'desk'; reveals?: string[];
  bears: Record<string, Bearing>; forged?: boolean; fakeBears?: Record<string, Bearing>; resultText: string; fakeText?: string;
}
interface Line { text: string; reveals?: string; needs?: string }
export interface PersonDef {
  id: string; name: string; role: string; portrait: string; requires?: string;
  standard: Line; present?: Line; skilled?: Line; pressure?: Line;
}
export interface CaseDef {
  id: string; number: number; title: string; templateId: string; houseId: string; summary: string; truth: string;
  slots: string[]; hypotheses: { id: string; title: string; text: string }[]; evidence: EvidenceDef[]; persons: PersonDef[];
}
interface Effect { trust?: number; safety?: number; house?: number; violation?: boolean; coalition?: Record<string, number>; text: string }
interface Rules {
  shiftMinutes: number;
  analysis: Record<'lab' | 'desk', { label: string; minutes: number; reagents: number; roles: StaffRole[]; speedPerLabLevel: number }>;
  quality: { base: number; perAnalysis: number; repeatBonus: number };
  detect: { base: number; perAnalysis: number; repeatBonus: number };
  interrogation: { minutes: number; roles: StaffRole[]; skilledMinAnalysis: number };
  chargeMin: number;
  court: { base: number; perExtra: number; perQuestionable: number; min: number; max: number };
  expertise: { fee: number; bonus: number };
  revealAfterShifts: number;
  effects: Record<'chargeTrue' | 'chargeFalse' | 'revealFalse' | 'transfer' | 'closeUnsolved' | 'pressure', Effect>;
}

export const CASE_RULES = casesFile.rules as unknown as Rules;
export const CASES = casesFile.cases as unknown as CaseDef[];
export const EVIDENCE_TYPES = casesFile.evidenceTypes as Record<string, string>;
export const caseDef = (id: string) => CASES.find((c) => c.id === id);
export const evidenceDef = (c: CaseDef, id: string) => c.evidence.find((e) => e.id === id);
export const personDef = (c: CaseDef, id: string) => c.persons.find((p) => p.id === id);
export const caseFile = (s: GameState, id: string) => s.investigations.cases.find((c) => c.id === id);
export const METHOD_LABEL: Record<InterrogationMethod, string> = {
  standard: 'Стандартный допрос',
  present: 'Предъявить улику',
  skilled: 'Тактическая беседа',
  pressure: 'Усиленный допрос',
};
export const DECISION_LABEL: Record<CaseDecisionKind, string> = { charge: 'Обвинение', transfer: 'Материалы переданы Дому', close: 'Дело закрыто' };

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

// ---------- Открытие дела ----------

/** Дело открывается по итогам первой операции на вызове нужного типа. Сколько улик с места дошло, зависит от задачи «Сохранность улик». */
export function openCaseFromReport(s: GameState, report: OperationReport, templateId: string, log: Log): CaseFile | null {
  const def = CASES.find((c) => c.templateId === templateId);
  if (!def || caseFile(s, def.id)) return null;
  const scene = def.evidence.filter((e) => e.origin === 'scene');
  const kept = report.tasks.find((t) => t.label === 'Сохранность улик')?.result ?? 'done';
  const n = kept === 'done' ? scene.length : kept === 'partial' ? scene.length - 1 : Math.ceil(scene.length / 2);
  const file: CaseFile = {
    id: def.id,
    incidentId: report.incidentId,
    openedShift: s.shift,
    status: 'open',
    evidence: scene.slice(0, n).map((e) => ({
      id: e.id, foundShift: s.shift, analysis: 'none', checks: 0, questionable: kept === 'failed',
      ...(kept === 'failed' ? { custodyNote: 'Цепочка хранения нарушена на месте операции.' } : {}),
    })),
    links: [],
    timeline: {},
    working: null,
    interviews: [],
    tasks: [],
    expertiseBonus: 0,
  };
  s.investigations.cases.push(file);
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

// ---------- Анализ ----------

const found = (f: CaseFile, id: string) => f.evidence.find((e) => e.id === id);
const taskOn = (f: CaseFile, target: string) => f.tasks.find((t) => t.target === target);

export function analysisMinutes(s: GameState, def: EvidenceDef): number {
  const A = CASE_RULES.analysis[def.analysis];
  return Math.round(A.minutes / (1 + A.speedPerLabLevel * ((s.facilities.lab ?? 1) - 1)));
}

export function analysisBlocker(s: GameState, caseId: string, evidenceId: string, staffId?: string): string | null {
  const f = caseFile(s, caseId);
  const d = caseDef(caseId);
  if (!f || !d) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  const ev = found(f, evidenceId);
  const def = evidenceDef(d, evidenceId);
  if (!ev || !def) return 'Улика не найдена.';
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
    const p = CASE_RULES.detect.base + CASE_RULES.detect.perAnalysis * analysisStat + extra;
    return roll(s) < p ? 'forgery' : 'misled';
  }
  // Подтверждённое уже не «разподтверждается» повторной проверкой.
  if (ev.analysis === 'confirmed') return 'confirmed';
  const p = CASE_RULES.quality.base + CASE_RULES.quality.perAnalysis * analysisStat + extra;
  return roll(s) < p ? 'confirmed' : 'inconclusive';
}

function reveal(s: GameState, f: CaseFile, d: CaseDef, ids: string[] | undefined, log: Log, questionable = false) {
  for (const id of ids ?? []) {
    if (found(f, id)) continue;
    const e = evidenceDef(d, id);
    if (!e) continue;
    f.evidence.push({ id, foundShift: s.shift, analysis: 'none', checks: 0, questionable });
    log('evidence_found', `Дело №${d.number}: новая улика — «${e.title}».`);
  }
}

function completeTask(s: GameState, f: CaseFile, t: CaseTask, log: Log) {
  const d = caseDef(f.id)!;
  const p = s.staff.find((x) => x.id === t.staffId);
  f.tasks = f.tasks.filter((x) => x !== t);
  if (t.kind === 'analyze') {
    const ev = found(f, t.target);
    const def = evidenceDef(d, t.target);
    if (!ev || !def) return;
    ev.analysis = analyze(s, f, ev, def, p?.stats.analysis ?? 1);
    const word = ev.analysis === 'inconclusive' ? 'результат неубедителен' : ev.analysis === 'forgery' ? 'выявлен подлог' : 'проверено';
    log('evidence_analyzed', `${p?.name ?? 'Сотрудник'}: «${def.title}» — ${word}.`, p ? [p.id] : undefined);
    if (ev.analysis === 'confirmed' || ev.analysis === 'forgery') reveal(s, f, d, def.reveals, log);
    return;
  }
  const person = personDef(d, t.target);
  const line = person?.[t.method!];
  if (!person || !line) return;
  f.interviews.push({ personId: person.id, method: t.method!, shift: s.shift, staffId: t.staffId });
  log('interrogation', `${p?.name ?? 'Сотрудник'} допросил(а): ${person.name}. ${METHOD_LABEL[t.method!]}.`, p ? [p.id] : undefined);
  if (t.method === 'pressure') {
    // Усиленный метод: показания низкой надёжности, всё сказанное этим человеком — под сомнением.
    reveal(s, f, d, line.reveals ? [line.reveals] : undefined, log, true);
    for (const ev of f.evidence) if (evidenceDef(d, ev.id)?.origin === `person:${person.id}`) ev.questionable = true;
    applyDelta(s, { coalition: CASE_RULES.effects.pressure.coalition }, () => {}, '');
    log('interrogation_pressure', `Дело №${d.number}: ${CASE_RULES.effects.pressure.text} Показания ${person.name} — сомнительной допустимости.`);
  } else reveal(s, f, d, line.reveals ? [line.reveals] : undefined, log);
}

/** Завершает задачи, срок которых наступил (all — между сменами доделывается всё). */
export function advanceInvestigations(s: GameState, log: Log, all = false) {
  const now = absMinute(s);
  for (const f of s.investigations.cases) {
    for (const t of [...f.tasks].sort((a, b) => a.doneAt - b.doneAt)) if (all || t.doneAt <= now) completeTask(s, f, t, log);
  }
}

// ---------- Доска ----------

/** Статус связи выводится из анализа: «предложена», пока улика не проверена или результат неубедителен. */
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
  if (ev.questionable) return { ok: false, why: ev.custodyNote ?? 'Получено усиленным допросом: суд может исключить.' };
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

// ---------- Реконструкция ----------

export interface TimelineView {
  placed: { evidenceId: string; slot: number; fits: boolean }[];
  conflicts: [string, string][];
}

/** Улика стоит «не на своём месте», если источник называет другое время. Противоречие — две улики на своих местах, которые не могут быть правдой вместе. */
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

// ---------- Допросы ----------

export const personAvailable = (f: CaseFile, p: PersonDef) => !p.requires || !!found(f, p.requires);
export const methodsOf = (p: PersonDef): InterrogationMethod[] => (['standard', 'present', 'skilled', 'pressure'] as const).filter((m) => !!p[m]);

export function interrogationBlocker(s: GameState, caseId: string, personId: string, method: InterrogationMethod, staffId?: string): string | null {
  const f = caseFile(s, caseId);
  const d = caseDef(caseId);
  if (!f || !d) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  const p = personDef(d, personId);
  if (!p) return 'Человек не найден.';
  if (!personAvailable(f, p)) return 'Пока нет оснований вызвать на допрос.';
  const line = p[method];
  if (!line) return 'Этот метод здесь ничего не даст.';
  if (taskOn(f, personId)) return 'Допрос уже идёт.';
  if (f.interviews.some((i) => i.personId === personId && i.method === method)) return 'Уже проведено.';
  if (method === 'present' && line.needs && !found(f, line.needs)) return `Нужна улика: «${evidenceDef(d, line.needs)?.title}».`;
  if (method === 'present' && line.needs && found(f, line.needs)!.analysis === 'none') return 'Сначала проверьте улику, которую предъявляете.';
  if (!staffId) return null;
  const w = workerBlocker(s, staffId, CASE_RULES.interrogation.roles);
  if (w) return w;
  if (method === 'skilled' && (s.staff.find((x) => x.id === staffId)?.stats.analysis ?? 0) < CASE_RULES.interrogation.skilledMinAnalysis)
    return `Нужен анализ не ниже ${CASE_RULES.interrogation.skilledMinAnalysis}.`;
  return null;
}

export function startInterrogation(s: GameState, caseId: string, personId: string, method: InterrogationMethod, staffId: string): CaseTask {
  const f = caseFile(s, caseId)!;
  const t: CaseTask = { kind: 'interrogate', target: personId, method, staffId, doneAt: absMinute(s) + CASE_RULES.interrogation.minutes };
  f.tasks.push(t);
  return t;
}

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
  const conflicts = timelineView(f, d).conflicts.length;
  return { supported, admissibleSupported, questionable, contradicted, conflicts };
}

export function courtChance(s: GameState, f: CaseFile, hypothesisId: string): number {
  const fc = caseForecast(s, f, hypothesisId);
  const C = CASE_RULES.court;
  return clamp(C.min, C.max, C.base + C.perExtra * (fc.admissibleSupported - CASE_RULES.chargeMin) - C.perQuestionable * fc.questionable);
}

export function concludeBlocker(s: GameState, caseId: string, decision: CaseDecisionKind, hypothesisId?: string): string | null {
  const f = caseFile(s, caseId);
  const d = caseDef(caseId);
  if (!f || !d) return 'Дело не найдено.';
  if (f.status !== 'open') return 'Дело уже решено.';
  if (f.tasks.length) return 'Дождитесь окончания анализов и допросов.';
  if (decision !== 'charge') return null;
  if (!hypothesisId || !d.hypotheses.some((h) => h.id === hypothesisId)) return 'Выберите версию для обвинения.';
  const fc = caseForecast(s, f, hypothesisId);
  if (fc.admissibleSupported < CASE_RULES.chargeMin)
    return `Мало оснований: подтверждённых допустимых связей ${fc.admissibleSupported} из ${CASE_RULES.chargeMin} нужных.`;
  if (fc.contradicted >= fc.supported) return 'Опровергающих связей не меньше, чем подтверждающих.';
  return null;
}

function applyEffect(s: GameState, d: CaseDef, e: Effect, post: Post) {
  const districtId = INCIDENT_TEMPLATES.find((t) => t.id === d.templateId)?.districtId;
  const dist = s.districts.find((x) => x.id === districtId);
  if (dist) {
    dist.civilianTrust = clamp(0, 100, dist.civilianTrust + (e.trust ?? 0));
    dist.safety = clamp(0, 100, dist.safety + (e.safety ?? 0));
  }
  applyDelta(s, { standing: e.house ? { [d.houseId]: e.house } : undefined, coalition: e.coalition }, post, '');
  if (e.violation) s.politics.violations.push(s.shift);
}

/** Правовое решение — не флаг «раскрыто». Ошибка может вскрыться позже (ТЗ §11.5). */
export function concludeCase(s: GameState, caseId: string, decision: CaseDecisionKind, hypothesisId: string | undefined, post: Post, log: Log) {
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  const E = CASE_RULES.effects;
  const house = houseById(d.houseId)!.label;
  if (decision === 'charge') {
    const h = d.hypotheses.find((x) => x.id === hypothesisId)!;
    if (roll(s) >= courtChance(s, f, h.id)) {
      f.decision = { kind: 'charge', hypothesisId: h.id, shift: s.shift, court: 'returned' };
      log('case_returned', `Дело №${d.number}: Суд продолжения вернул обвинение по версии «${h.title}» — доказательств недостаточно или они сомнительны. Дело остаётся открытым.`);
      return;
    }
    f.status = 'charged';
    f.decision = { kind: 'charge', hypothesisId: h.id, shift: s.shift, court: 'accepted' };
    const right = h.id === d.truth;
    applyEffect(s, d, right ? E.chargeTrue : E.chargeFalse, post);
    if (!right) f.revealShift = s.shift + CASE_RULES.revealAfterShifts;
    log('case_charged', `Дело №${d.number}: суд принял обвинение по версии «${h.title}». ${right ? E.chargeTrue.text : E.chargeFalse.text}`);
    return;
  }
  f.status = decision === 'transfer' ? 'transferred' : 'closed';
  f.decision = { kind: decision, shift: s.shift };
  if (decision === 'transfer') {
    applyEffect(s, d, E.transfer, post);
    log('case_transferred', `Дело №${d.number}: материалы переданы (${house}). ${E.transfer.text}`);
  } else {
    f.revealShift = s.shift + CASE_RULES.revealAfterShifts;
    log('case_closed', `Дело №${d.number} закрыто без обвинения.`);
  }
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
    if (ev.analysis === 'confirmed' || ev.analysis === 'forgery') reveal(s, f, d, evidenceDef(d, ev.id)!.reveals, log);
  }
  log('case_expertise', `Дело №${d.number}: внешняя экспертиза перепроверила улики, изменились выводы по ${changed}.`);
}

/** Между сменами: доделать задачи и вскрыть ошибочные решения, когда пришёл их срок. */
export function advanceInvestigationsShift(s: GameState, post: Post, log: Log) {
  advanceInvestigations(s, log, true);
  for (const f of s.investigations.cases) {
    if (f.revealed || f.revealShift === undefined || s.shift < f.revealShift) continue;
    f.revealed = true;
    const d = caseDef(f.id)!;
    const e = f.status === 'charged' ? CASE_RULES.effects.revealFalse : CASE_RULES.effects.closeUnsolved;
    applyEffect(s, d, e, post);
    log('case_revealed', `Дело №${d.number} «${d.title}»: ${e.text}`);
  }
}

export function caseStatusWord(f: CaseFile): string {
  if (f.status === 'open') return f.decision?.court === 'returned' ? 'открыто · суд вернул обвинение' : 'открыто';
  if (f.status === 'charged') return f.revealed ? 'обвинение оказалось ошибочным' : 'обвинение принято';
  if (f.status === 'transferred') return 'материалы переданы Дому';
  return f.revealed ? 'закрыто · всплыло снова' : 'закрыто';
}
