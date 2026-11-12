import sandboxFile from '../../content/sandbox_v1.json';
import { createInitialState, DEFAULT_SEED } from './state';
import { SQUADS_DEMO, toCents } from './content';
import { actionDef, caseDef, caseFile, completeFieldAction, courtChance } from './investigations';
import { districtById } from './map/mapConfig';
import { nextFloat, nextInt } from './rng';
import { isOpen } from './selectors';
import { setFlag } from './flags';
import type {
  DistrictId, DutyKind, GameState, Incident, OperationReport, SandboxGoal, SandboxOutcome, SandboxState, Severity, Squad,
} from './types';

interface DutyTemplateDef {
  kind: DutyKind;
  label: string;
  templateId: string;
  title: string;
  districtId: DistrictId;
  rewardRe: number;
  description: string;
  successText: string;
  failureText: string;
}

interface SandboxEventDef {
  caseId: string;
  actionId?: string;
  templateId: string;
  title: string;
  districtId: DistrictId;
  spawnId: string;
  severity: Severity;
  goal: SandboxGoal;
  purpose: string;
  successText: string;
  failureText: string;
  fallbackTitle?: string;
  fallbackGoal?: SandboxGoal;
  fallbackPurpose?: string;
  nextEventId?: string;
  branchOnFailure?: boolean;
}

interface SandboxCaseDef {
  districtId: DistrictId;
  nextCaseId?: string;
  nextEventId?: string;
  conclusions: Record<string, SandboxOutcome>;
  full: { title: string; text: string; episode?: string };
  partial: { title: string; text: string; complication?: string };
  error: { title: string; text: string };
}

const DATA = sandboxFile as unknown as {
  rules: {
    startingBalanceRe: number;
    squadSlotCostRe: number;
    maxSquads: number;
    eventDeadlineMinutes: number;
    fallbackDeadlineMinutes: number;
    recoveryMinutes: number;
    lightRecoveryMinutes: number;
    passivePressureEveryMinutes: number;
  };
  districtOrder: DistrictId[];
  cases: Record<string, SandboxCaseDef>;
  events: Record<string, SandboxEventDef>;
  duty: {
    firstDelayMinutes: number;
    minIntervalMinutes: number;
    maxIntervalMinutes: number;
    retryMinutes: number;
    maxActive: number;
    deadlineMinutes: number;
    urgentDeadlineMinutes: number;
    urgentChancePercent: number;
    templates: DutyTemplateDef[];
  };
};

export const SANDBOX_RULES = DATA.rules;
export const SANDBOX_GOAL_LABEL: Record<SandboxGoal, string> = {
  evidence: 'Улика',
  arrest: 'Задержание',
  witness: 'Свидетель',
  surveillance: 'Слежка',
  prevention: 'Предотвращение',
  finale: 'Финал дела',
};

export const DUTY_KIND_LABEL: Record<DutyKind, string> = {
  conflict: 'Бытовой конфликт',
  theft: 'Кража / ограбление',
  brawl: 'Массовая драка',
  missing: 'Поиск пропавшего',
  hazard: 'Авария / угроза жителям',
};

export const isSandbox = (s: GameState) => s.mode === 'sandbox' && !!s.sandbox;
export const dutyTemplateFor = (inc: Incident) => inc.duty
  ? DATA.duty.templates.find((d) => d.kind === inc.duty!.kind && d.districtId === inc.districtId)
  : undefined;
export const sandboxEventDef = (eventId: string) => DATA.events[eventId];
export const sandboxCaseDef = (caseId: string) => DATA.cases[caseId];
export const sandboxEventFor = (inc: Incident) => inc.sandbox ? sandboxEventDef(inc.sandbox.eventId) : undefined;
export const sandboxGoalFor = (inc: Incident) => {
  const def = sandboxEventFor(inc);
  if (!def) return undefined;
  return inc.sandbox?.fallback ? def.fallbackGoal ?? def.goal : def.goal;
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const addUnique = <T,>(xs: T[], value: T) => { if (!xs.includes(value)) xs.push(value); };

function log(s: GameState, type: string, text: string, staffIds?: string[]) {
  s.log.push({ id: s.nextIds.event++, shift: s.shift, minute: s.minute, type, text, ...(staffIds?.length ? { staffIds: [...new Set(staffIds)] } : {}) });
}

function post(s: GameState, amount: number, note: string) {
  s.economy.ledger.push({ id: s.nextIds.transaction++, shift: s.shift, minute: s.minute, kind: amount < 0 ? 'upkeep' : 'funding', amount, note });
  s.economy.balance += amount;
}

/** Отдельная фабрика: демонстрационные вызовы, особые операции и шесть отрядов кампании сюда не попадают. */
export function createSandboxState(seed: number = DEFAULT_SEED): GameState {
  const s = createInitialState(seed);
  const staffIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const base = SQUADS_DEMO.find((q) => q.id === 'axon')!;
  const squad: Squad = {
    id: base.id,
    name: base.name,
    memberIds: ['p1', 'p2', 'p3'],
    status: 'ready',
    currentNodeId: base.currentNodeId,
    assignedIncidentId: null,
    movement: null,
    operation: null,
    commanderId: 'p1',
  };
  const sandbox: SandboxState = {
    unlockedDistricts: ['admin'],
    controlledDistricts: [],
    squadSlots: 1,
    order: 72,
    legitimacy: 68,
    readiness: 100,
    activeCaseId: 'c1',
    caseRuns: { c1: { attempts: 0, failures: 0 }, c2: { attempts: 0, failures: 0 } },
    rewardedCases: [],
    recovery: {},
    duty: { nextAt: null, generated: 0 },
    result: null,
    defeatReason: null,
    sliceComplete: false,
  };
  Object.assign(s, {
    mode: 'sandbox' as const,
    sandbox,
    phase: 'ACTIVE' as const,
    paused: false,
    minute: 0,
    shift: 1,
    staff: s.staff.filter((p) => staffIds.includes(p.id)),
    squads: [squad],
    incidents: [],
    incoming: [],
    operationReports: [],
    reports: [],
    candidates: [],
    investigations: { cases: [] },
    relations: s.relations.filter((r) => staffIds.includes(r.a) && staffIds.includes(r.b)),
    log: [],
    nextIds: { event: 1, transaction: 1, incident: 1, report: 1, staff: 7, candidate: 1 },
  });
  s.economy.balance = toCents(SANDBOX_RULES.startingBalanceRe);
  s.economy.ledger = [];
  s.economy.unpaidObligations = 0;
  s.campaign.flags = [];
  s.campaign.ops = [];
  s.campaign.ending = null;
  s.campaign.endingSeen = false;
  log(s, 'sandbox_started', 'Песочница: доступен Административный центр. Первый вызов связан с делом №418.');
  spawnSandboxEvent(s, 'c1-open');
  return s;
}

/** Создать событие активного дела. ID уникален, поэтому повторные ветки не затирают историю отчётов. */
export function spawnSandboxEvent(s: GameState, eventId: string, fallback = false): Incident {
  const def = sandboxEventDef(eventId);
  if (!def || !s.sandbox) throw new Error(`Неизвестное событие песочницы: ${eventId}`);
  const run = s.sandbox.caseRuns[def.caseId] ?? { attempts: 0, failures: 0 };
  s.sandbox.caseRuns[def.caseId] = run;
  const ready = s.squads.some((q) => q.status === 'ready' && q.memberIds.length > 0);
  const deadline = fallback ? SANDBOX_RULES.fallbackDeadlineMinutes : SANDBOX_RULES.eventDeadlineMinutes;
  const inc: Incident = {
    id: `sandbox-${s.nextIds.incident++}`,
    templateId: def.templateId,
    title: fallback && def.fallbackTitle ? def.fallbackTitle : def.title,
    districtId: def.districtId,
    spawnId: def.spawnId,
    severity: def.severity,
    state: 'new',
    deadlineType: 'branch',
    deadlineMinute: s.minute + deadline + (ready ? 0 : 60),
    createdShift: s.shift,
    sandbox: { eventId, caseId: def.caseId, ...(def.actionId ? { actionId: def.actionId } : {}), attempt: run.attempts, fallback },
  };
  s.incidents.push(inc);
  log(s, 'sandbox_event', `${inc.title}: ${fallback && def.fallbackPurpose ? def.fallbackPurpose : def.purpose}`);
  return inc;
}

/** Полевое следственное действие в песочнице — не таймер в кабинете, а понятный вызов на карте. */
export function startSandboxFieldAction(s: GameState, caseId: string, actionId: string): Incident | null {
  if (!s.sandbox) return null;
  const a = actionDef(caseDef(caseId)!, actionId);
  if (!a || a.kind !== 'field') return null;
  const eventId = Object.keys(DATA.events).find((id) => {
    const e = DATA.events[id]!;
    return e.caseId === caseId && e.actionId === actionId;
  });
  if (!eventId) return null;
  const existing = s.incidents.find((i) => isOpen(i) && i.sandbox?.caseId === caseId && i.sandbox.actionId === actionId);
  if (existing) return existing;
  const permit = s.politics.permits.find((p) => p.caseId === caseId && p.actionId === actionId && p.status === 'granted');
  if (permit) permit.status = 'used';
  return spawnSandboxEvent(s, eventId);
}

export function buySandboxSquad(s: GameState): string | null {
  const sb = s.sandbox;
  if (!sb) return 'Покупка доступна только в песочнице.';
  if (sb.defeatReason) return 'Этот сценарий уже завершён.';
  const cost = toCents(SANDBOX_RULES.squadSlotCostRe);
  if (s.squads.length >= SANDBOX_RULES.maxSquads) return `В этом срезе максимум ${SANDBOX_RULES.maxSquads} отряда.`;
  if (s.squads.length >= sb.unlockedDistricts.length) return 'Число отрядов не может превышать число открытых районов.';
  if (s.economy.balance < cost) return `Нужно ${SANDBOX_RULES.squadSlotCostRe} РЕ.`;
  const def = SQUADS_DEMO.find((q) => q.id === 'resonance')!;
  const memberIds = ['p4', 'p5', 'p6'].filter((id) => s.staff.some((p) => p.id === id && p.health !== 'dead'));
  if (!memberIds.length) return 'Нет сотрудников для нового отряда.';
  post(s, -cost, 'Покупка слота второго отряда');
  s.squads.push({
    id: def.id,
    name: def.name,
    memberIds,
    status: 'ready',
    currentNodeId: districtById('residential')!.serviceNode,
    assignedIncidentId: null,
    movement: null,
    operation: null,
    commanderId: memberIds[0]!,
  });
  sb.squadSlots = s.squads.length;
  sb.readiness = clamp(sb.readiness + 8);
  log(s, 'sandbox_squad_bought', `Куплен слот отряда «${def.name}»: ${memberIds.length} сотрудника, база — Жилые кварталы.`);
  return null;
}

export type DutyDecision = 'success' | 'partial' | 'failure' | 'patrol' | 'ignore';
export interface DutyEffect { rewardRe: number; order: number; legitimacy: number; readiness: number }

/** Все последствия видны интерфейсу заранее и этой же функцией применяются ядром. */
export function dutyEffect(inc: Incident, decision: DutyDecision): DutyEffect {
  const urgent = inc.duty?.urgent ?? false;
  const rewardRe = inc.duty?.rewardRe ?? 0;
  if (decision === 'patrol') return { rewardRe: 0, order: 1, legitimacy: 0, readiness: 0 };
  if (decision === 'ignore') return { rewardRe: 0, order: urgent ? -8 : -4, legitimacy: urgent ? -3 : -1, readiness: 0 };
  if (decision === 'success') return { rewardRe, order: urgent ? 6 : 4, legitimacy: urgent ? 2 : 1, readiness: 1 };
  if (decision === 'partial') return { rewardRe: Math.floor(rewardRe / 2), order: urgent ? -1 : 1, legitimacy: 0, readiness: -2 };
  return { rewardRe: 0, order: urgent ? -6 : -3, legitimacy: urgent ? -3 : -1, readiness: urgent ? -6 : -4 };
}

function applyDutyEffect(s: GameState, effect: DutyEffect, note: string) {
  if (effect.rewardRe) post(s, toCents(effect.rewardRe), note);
  changeVitals(s, { order: effect.order, legitimacy: effect.legitimacy, readiness: effect.readiness });
}

function scheduleNextDuty(s: GameState) {
  const sb = s.sandbox!;
  const rules = DATA.duty;
  const span = Math.max(0, rules.maxIntervalMinutes - rules.minIntervalMinutes);
  let jitter = 0;
  if (span) [jitter, s.rng] = nextInt(s.rng, span + 1);
  const singleRecovering = s.squads.length === 1 && s.squads[0]!.status !== 'ready';
  sb.duty.nextAt = s.minute + (rules.minIntervalMinutes + jitter) * (singleRecovering ? 2 : 1);
}

/** Городской фон живёт отдельно от очереди кампании incoming и не затрагивает её. */
function advanceDuty(s: GameState) {
  const sb = s.sandbox!;
  if (sb.duty.nextAt === null || s.minute < sb.duty.nextAt) return;
  const active = s.incidents.filter((i) => i.duty && isOpen(i));
  const finale = s.incidents.some((i) => isOpen(i) && sandboxGoalFor(i) === 'finale');
  if (active.length >= DATA.duty.maxActive || finale) {
    sb.duty.nextAt = s.minute + DATA.duty.retryMinutes;
    return;
  }
  const pool = DATA.duty.templates.filter((d) => sb.unlockedDistricts.includes(d.districtId));
  if (!pool.length) {
    sb.duty.nextAt = s.minute + DATA.duty.retryMinutes;
    return;
  }
  let pick: number, spawn: number, urgentRoll: number;
  [pick, s.rng] = nextInt(s.rng, pool.length);
  [spawn, s.rng] = nextInt(s.rng, 3);
  [urgentRoll, s.rng] = nextInt(s.rng, 100);
  const def = pool[pick]!;
  const ready = s.squads.some((q) => q.status === 'ready' && q.memberIds.length > 0);
  const urgentAllowed = sb.unlockedDistricts.length >= 2 && ready && sb.order >= 35
    && !active.some((i) => i.duty?.urgent);
  const urgent = urgentAllowed && urgentRoll < DATA.duty.urgentChancePercent;
  const baseDeadline = urgent ? DATA.duty.urgentDeadlineMinutes : DATA.duty.deadlineMinutes;
  const inc: Incident = {
    id: `duty-${s.nextIds.incident++}`,
    templateId: def.templateId,
    title: def.title,
    districtId: def.districtId,
    spawnId: `${def.districtId}:spawn:0${spawn + 1}`,
    severity: urgent ? 'high' : def.kind === 'brawl' || def.kind === 'hazard' ? 'medium' : 'low',
    state: 'new',
    deadlineType: 'expire',
    deadlineMinute: s.minute + baseDeadline + (ready ? 0 : 60),
    createdShift: s.shift,
    duty: { kind: def.kind, urgent, rewardRe: def.rewardRe + (urgent ? 2 : 0) },
  };
  s.incidents.push(inc);
  sb.duty.generated += 1;
  log(s, 'duty_incident_created', `${urgent ? 'Срочный дежурный вызов' : 'Дежурный вызов'}: ${inc.title}. К расследованию не относится.`);
  s.paused = true;
  scheduleNextDuty(s);
}

function dutyCommandBlocker(s: GameState, incidentId: string): Incident | string {
  const inc = s.incidents.find((i) => i.id === incidentId);
  if (!inc?.duty || !s.sandbox) return 'Это не обычный дежурный вызов.';
  if (!['new', 'acknowledged', 'escalated'].includes(inc.state)) return 'Решение по этому вызову уже принято.';
  return inc;
}

export function delegateDutyIncident(s: GameState, incidentId: string): string | null {
  const found = dutyCommandBlocker(s, incidentId);
  if (typeof found === 'string') return found;
  applyDutyEffect(s, dutyEffect(found, 'patrol'), 'Дежурный наряд принял вызов');
  found.state = 'resolved_partial';
  log(s, 'duty_delegated', `${found.title}: передано дежурному наряду. Отряд не занят, награда и опыт не начисляются.`);
  return null;
}

function ignoreDuty(s: GameState, inc: Incident, expired: boolean) {
  const effect = dutyEffect(inc, 'ignore');
  const sb = s.sandbox!;
  // Отказ никогда сам по себе не завершает сценарий: остаётся шанс исправить обстановку.
  sb.order = Math.max(1, clamp(sb.order + effect.order));
  sb.legitimacy = Math.max(1, clamp(sb.legitimacy + effect.legitimacy));
  inc.state = 'expired';
  log(s, expired ? 'duty_expired' : 'duty_ignored', `${inc.title}: ${expired ? 'срок вышел' : 'дирекция не вмешалась'}; порядок ${effect.order}, легитимность ${effect.legitimacy}. Немедленного поражения нет.`);
}

export function ignoreDutyIncident(s: GameState, incidentId: string): string | null {
  const found = dutyCommandBlocker(s, incidentId);
  if (typeof found === 'string') return found;
  ignoreDuty(s, found, false);
  return null;
}

function changeVitals(s: GameState, delta: Partial<Pick<SandboxState, 'order' | 'legitimacy' | 'readiness'>>) {
  const sb = s.sandbox!;
  sb.order = clamp(sb.order + (delta.order ?? 0));
  sb.legitimacy = clamp(sb.legitimacy + (delta.legitimacy ?? 0));
  sb.readiness = clamp(sb.readiness + (delta.readiness ?? 0));
  checkSandboxDefeat(s);
}

export function checkSandboxDefeat(s: GameState) {
  const sb = s.sandbox;
  if (!sb || sb.defeatReason) return;
  if (sb.order <= 0) sb.defeatReason = 'Порядок города потерян: дирекция больше не контролирует улицы.';
  else if (sb.legitimacy <= 0) sb.defeatReason = 'Легитимность дирекции исчерпана: полномочия отозваны.';
  else if (sb.readiness <= 0) sb.defeatReason = 'Дирекция потеряла боеспособность: некому продолжать операции.';
  if (sb.defeatReason) {
    s.paused = true;
    log(s, 'sandbox_defeat', sb.defeatReason);
  }
}

function spawnFailureBranch(s: GameState, inc: Incident) {
  const link = inc.sandbox!;
  const run = s.sandbox!.caseRuns[link.caseId]!;
  run.failures += 1;
  const next = spawnSandboxEvent(s, link.eventId, true);
  log(s, 'sandbox_branch', `Альтернативная ветвь дела: ${next.title}. Дело не перезапускается.`);
}

/** Последствия уже разрешённой общей операции: улики, альтернативная ветвь, восстановление и шкалы песочницы. */
export function resolveSandboxOperation(s: GameState, report: OperationReport) {
  const sb = s.sandbox;
  const inc = s.incidents.find((i) => i.id === report.incidentId);
  if (!sb || !inc) return;

  for (const c of report.casualties) {
    if (c.after === 'dead') continue;
    const light = c.after === 'light_injury' || c.after === 'fatigued';
    sb.recovery[c.staffId] = s.minute + (light ? SANDBOX_RULES.lightRecoveryMinutes : SANDBOX_RULES.recoveryMinutes);
  }

  if (inc.duty) {
    const def = dutyTemplateFor(inc)!;
    const effect = dutyEffect(inc, report.outcome);
    applyDutyEffect(s, effect, `Дежурный вызов: ${inc.title}`);
    report.findings = [...(report.findings ?? []), report.outcome === 'failure' ? def.failureText : def.successText];
    log(s, 'duty_resolved', `${inc.title}: ${report.outcome === 'success' ? 'успех' : report.outcome === 'partial' ? 'частичный результат' : 'неудача'}; награда ${effect.rewardRe} РЕ. Следственные материалы не изменены.`);
    return;
  }

  const link = inc.sandbox;
  if (!link) return;
  const def = sandboxEventDef(link.eventId)!;
  const success = report.outcome !== 'failure';
  report.findings = [...(report.findings ?? []), success ? def.successText : def.failureText];
  if (report.outcome === 'success') changeVitals(s, { order: 2, readiness: 2 });
  else if (report.outcome === 'partial') changeVitals(s, { order: -3, legitimacy: -1, readiness: -4 });
  else changeVitals(s, { order: -8, legitimacy: -4, readiness: -12 });
  if (sb.duty.nextAt === null) sb.duty.nextAt = s.minute + DATA.duty.firstDelayMinutes;

  if (success && def.nextEventId && !s.incidents.some((i) => i.sandbox?.eventId === def.nextEventId && isOpen(i))) {
    spawnSandboxEvent(s, def.nextEventId);
  }
  if (!link.actionId) {
    if (!success && def.branchOnFailure) spawnFailureBranch(s, inc);
    return;
  }
  const f = caseFile(s, link.caseId);
  if (!f || f.status !== 'open') return;
  if (success) {
    completeFieldAction(s, link.caseId, link.actionId, (type, text, ids) => log(s, type, text, ids), report.outcome === 'partial' || link.fallback);
    if (link.fallback) log(s, 'sandbox_branch', 'Альтернативный источник сработал: сведения получены, но суд может счесть их менее надёжными.');
  } else {
    spawnFailureBranch(s, inc);
  }
}

/** Просроченный дежурный вызов закрывается без следственной альтернативы и мгновенного поражения. */
export function expireDutyIncident(s: GameState, inc: Incident) {
  if (!inc.duty || !s.sandbox) return;
  ignoreDuty(s, inc, true);
}

/** Просроченный вызов дела ведёт в другую ветвь, а не к перезапуску. */
export function expireSandboxIncident(s: GameState, inc: Incident) {
  if (!inc.sandbox || !s.sandbox) return;
  inc.state = 'expired';
  changeVitals(s, { order: -10, legitimacy: -3, readiness: -5 });
  log(s, 'sandbox_expired', `${inc.title}: исходная возможность упущена, открывается обходной путь.`);
  spawnFailureBranch(s, inc);
}

/** Непрерывное восстановление и давление. Без готового отряда давление вдвое ниже — нет неразрешимой ловушки. */
export function advanceSandboxMinute(s: GameState) {
  const sb = s.sandbox;
  if (!sb || sb.defeatReason) return;
  const ready = s.squads.some((q) => q.status === 'ready' && q.memberIds.length > 0);
  for (const [staffId, at] of Object.entries(sb.recovery)) {
    if (s.minute < at) continue;
    const p = s.staff.find((x) => x.id === staffId);
    const deployed = s.squads.some((q) => q.memberIds.includes(staffId) && ['en_route', 'on_scene'].includes(q.status));
    if (!p || deployed) {
      sb.recovery[staffId] = s.minute + 30;
      continue;
    }
    if (p.health !== 'dead') p.health = 'healthy';
    p.fatigue = Math.max(0, p.fatigue - 20);
    delete sb.recovery[staffId];
    log(s, 'staff_recovered', `${p.name}: восстановление завершено, сотрудник возвращён в резерв.`, [p.id]);
  }
  if (s.minute % 30 === 0) {
    for (const p of s.staff) if (p.health !== 'dead') p.fatigue = Math.max(0, p.fatigue - 3);
    for (const q of s.squads) {
      if (q.status !== 'resting') continue;
      const fit = q.memberIds.some((id) => {
        const p = s.staff.find((x) => x.id === id);
        return p && !['serious_injury', 'critical', 'dead', 'missing'].includes(p.health);
      });
      if (fit) q.status = 'ready';
    }
  }
  const every = SANDBOX_RULES.passivePressureEveryMinutes * (ready ? 1 : 2);
  if (every > 0 && s.minute % every === 0) {
    const waiting = s.incidents.filter((i) => ['new', 'acknowledged', 'escalated'].includes(i.state)).length;
    if (waiting) changeVitals(s, { order: -waiting, readiness: ready ? 0 : 1 });
    else if (!s.squads.some((q) => q.operation)) changeVitals(s, { readiness: 1 });
  }
  if (!sb.defeatReason) advanceDuty(s);
}

function resetSandboxCase(s: GameState, caseId: string) {
  const sb = s.sandbox!;
  sb.caseRuns[caseId]!.attempts += 1;
  s.investigations.cases = s.investigations.cases.filter((f) => f.id !== caseId);
  s.incidents = s.incidents.filter((i) => i.sandbox?.caseId !== caseId);
  s.politics.permits = s.politics.permits.filter((p) => p.caseId !== caseId);
  s.campaign.flags = s.campaign.flags.filter((f) => !f.startsWith(`${caseId}_`));
  sb.result = null;
  const opener = Object.keys(DATA.events).find((id) => DATA.events[id]!.caseId === caseId && !DATA.events[id]!.actionId);
  if (opener) spawnSandboxEvent(s, opener);
  log(s, 'sandbox_case_restart', `Дело №${caseDef(caseId)!.number}: материалы и события сформированы заново; последствия для людей и города сохранены.`);
}

/** Отдельный итог вместо кампанских отложенных разоблачений: верный/частичный ответ открывает район, ошибочный перезапускает дело. */
export function concludeSandboxCase(s: GameState, caseId: string, conclusionId: string, hypothesisId?: string) {
  const sb = s.sandbox!;
  const f = caseFile(s, caseId)!;
  const d = caseDef(caseId)!;
  const c = d.conclusions.find((x) => x.id === conclusionId)!;
  let outcome: SandboxOutcome;
  if (c.kind === 'charge') {
    const h = d.hypotheses.find((x) => x.id === hypothesisId)!;
    const [value, next] = nextFloat(s.rng);
    s.rng = next;
    if (value >= courtChance(s, f, h.id)) {
      f.decision = { conclusionId, hypothesisId: h.id, shift: s.shift, court: 'returned' };
      log(s, 'case_returned', `Дело №${d.number}: суд вернул обвинение. Дело остаётся открытым, район не открывается.`);
      return;
    }
    f.status = 'charged';
    f.decision = { conclusionId, hypothesisId: h.id, shift: s.shift, court: 'accepted' };
    outcome = h.grade === 'true' ? 'full' : h.grade === 'partial' ? 'partial' : 'error';
  } else {
    f.status = c.kind === 'final' ? 'concluded' : 'closed';
    f.decision = { conclusionId, shift: s.shift };
    outcome = sandboxCaseDef(caseId)!.conclusions[conclusionId] ?? 'error';
  }

  if (outcome === 'error') {
    changeVitals(s, { order: -2, legitimacy: -8, readiness: -4 });
    resetSandboxCase(s, caseId);
    const text = sandboxCaseDef(caseId)!.error;
    sb.result = { caseId, outcome, title: text.title, text: text.text };
    s.paused = true;
    log(s, 'sandbox_case_error', `Дело №${d.number}: заключение опровергнуто. Правильная версия не раскрывается.`);
    return;
  }

  // Награда и открытие района выполняются один раз; кампанские деньги/эффекты заключения здесь не применяются.
  if (!sb.rewardedCases.includes(caseId)) {
    sb.rewardedCases.push(caseId);
    for (const flag of c.flags ?? []) setFlag(s, flag);
    const cd = sandboxCaseDef(caseId)!;
    addUnique(sb.controlledDistricts, cd.districtId);
    if (outcome === 'full') {
      post(s, toCents(20), `Дело №${d.number}: полная награда`);
      changeVitals(s, { order: 12, legitimacy: 8, readiness: 5 });
    } else {
      post(s, toCents(8), `Дело №${d.number}: частичная награда`);
      const district = s.districts.find((x) => x.id === cd.districtId);
      if (district) district.civilianTrust = Math.max(0, district.civilianTrust - 10);
      changeVitals(s, { legitimacy: -10 });
    }
    if (cd.nextCaseId) {
      sb.activeCaseId = cd.nextCaseId;
      const next = sandboxCaseDef(cd.nextCaseId)!;
      addUnique(sb.unlockedDistricts, next.districtId);
      if (cd.nextEventId && !s.incidents.some((i) => i.sandbox?.eventId === cd.nextEventId && isOpen(i))) spawnSandboxEvent(s, cd.nextEventId);
      log(s, 'sandbox_district_unlocked', `Открыт район: ${districtById(next.districtId)!.name}. Активно дело №${caseDef(cd.nextCaseId)!.number}.`);
    }
  }
  const text = sandboxCaseDef(caseId)![outcome];
  sb.result = {
    caseId,
    outcome,
    title: text.title,
    text: text.text,
    ...(outcome === 'full' && 'episode' in text && text.episode ? { episode: text.episode } : {}),
    ...(outcome === 'partial' && 'complication' in text && text.complication ? { complication: text.complication } : {}),
  };
  s.paused = true;
  log(s, 'sandbox_case_resolved', `Дело №${d.number}: ${text.title}.`);
}

export function acknowledgeSandboxResult(s: GameState): string | null {
  const sb = s.sandbox;
  if (!sb?.result) return 'Нет итога для подтверждения.';
  if (sb.result.outcome !== 'error') sb.sliceComplete = true;
  sb.result = null;
  return null;
}
