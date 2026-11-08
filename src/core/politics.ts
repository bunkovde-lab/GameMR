import politicsFile from '../../content/politics_v1.json';
import { INCIDENT_TEMPLATES, toCents } from './content';
import { nextFloat } from './rng';
import { isOpen } from './selectors';
import type { Deal, DealOffer, GameState, Incident, Permit, PermitKind, Politics, Severity, TacticId } from './types';

/**
 * W8: полномочия, политика Домов и договоры (ТЗ §10). Чистые функции поверх GameState;
 * деньги и журнал передаются вызывающим (reduce), чтобы все проводки шли через одну точку.
 */

export type CoalitionId = 'continuity' | 'open' | 'hard';
type Delta = { money?: number; reagents?: number; standing?: Record<string, number>; coalition?: Partial<Record<CoalitionId, number>> };
export interface HouseDef { id: string; label: string; controls: string; standing: number; currents: { label: string; coalition: CoalitionId; share: number }[] }
export interface Condition {
  type: 'districtSafetyMin' | 'noTactic' | 'payPerShift' | 'noEmergency' | 'payBy';
  text: string; districtId?: string; min?: number; templateId?: string; tactic?: TacticId; amount?: number; dueAfterShifts?: number;
}
export interface DealDef {
  id: string; houseId: string; title: string; benefit: string; cost: string; durationShifts: number; conditions: Condition[];
  verification: string; breachText: string; onAccept?: Delta; onBreach?: Delta;
  grants?: { access?: string; reagentsPerShift?: number; beds?: number };
  delayed?: { afterShifts: number; kind: 'payout'; money: number; chanceBase: number; chanceStanding: number; chanceContinuity: number; text: string; failText: string }[];
  reprisal?: Delta & { afterShifts: number; text: string };
}
export interface LegalRequirement { templateId: string; tactics: TacticId[]; permit: 'judicial' | 'interagency'; houseId?: string; why: string }
interface PermitRules {
  judicial: { legalBasis: string; requirements: string[]; reviewMinutes: number; fee: number; base: number; trustBonus: number; trustMin: number; openBonus: number; violationPenalty: number; validShifts: number };
  interagency: { legalBasis: string; requirements: string[]; reviewMinutes: number; fee: number; base: number; standingFactor: number; min: number; max: number; validShifts: number };
  emergency: {
    legalBasis: string; requirements: string[]; auditBase: number; bySeverity: Record<Severity, number>; hardBonus: number; openPenalty: number;
    perViolation: number; outcome: Record<'success' | 'partial' | 'failure', number>; fine: number; min: number; max: number;
  };
}

export const POLITICS = politicsFile as unknown as {
  houses: HouseDef[];
  coalitions: { id: CoalitionId; label: string; start: number; desc: string; effect: string }[];
  threshold: number;
  standingWords: { min: number; word: string }[];
  standingOffersMin: number;
  levels: { id: string; label: string; group: string; issuer: string; examples: string; how: string }[];
  permits: PermitRules;
  legalRequirements: LegalRequirement[];
  violationWindowShifts: number;
  offersMax: number;
  deals: DealDef[];
  startOffers: string[];
  declineStanding: number;
};
export const HOUSES = POLITICS.houses;
export const COALITIONS = POLITICS.coalitions;
export const PERMIT_NAME: Record<'judicial' | 'interagency', string> = { judicial: 'судебное разрешение (ордер)', interagency: 'межведомственное разрешение (допуск Дома)' };
export const houseById = (id: string) => HOUSES.find((h) => h.id === id);
export const dealDef = (id: string) => POLITICS.deals.find((d) => d.id === id);
const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

export function initialPolitics(): Politics {
  return {
    standing: Object.fromEntries(HOUSES.map((h) => [h.id, h.standing])),
    coalitions: Object.fromEntries(COALITIONS.map((c) => [c.id, c.start])),
    offers: POLITICS.startOffers.map((t, i) => ({ id: i + 1, templateId: t, expiresShift: 2 })),
    deals: [],
    permits: [],
    scheduled: [],
    violations: [],
    nextId: POLITICS.startOffers.length + 1,
  };
}

export const standingWord = (v: number) => POLITICS.standingWords.find((w) => v >= w.min)?.word ?? 'враждебен';
export const coalitionStrong = (s: GameState, id: CoalitionId) => (s.politics.coalitions[id] ?? 0) >= POLITICS.threshold;
export const riskWord = (r: number) => (r >= 0.5 ? 'высокий' : r >= 0.25 ? 'средний' : 'низкий');
export const recentViolations = (s: GameState) => s.politics.violations.filter((v) => v > s.shift - POLITICS.violationWindowShifts).length;

// ---------- Действующие договоры ----------

export const activeDeals = (s: GameState) => s.politics.deals.filter((d) => d.status === 'active');
const grantsOf = (s: GameState) => activeDeals(s).map((d) => dealDef(d.templateId)?.grants ?? {});
export const dealBeds = (s: GameState) => grantsOf(s).reduce((a, g) => a + (g.beds ?? 0), 0);
export const dealReagents = (s: GameState) => grantsOf(s).reduce((a, g) => a + (g.reagentsPerShift ?? 0), 0);
export const hasAccess = (s: GameState, houseId: string) => grantsOf(s).some((g) => g.access === houseId);
/** Платежи по договорам в конце смены (для прогноза обязательств). */
export function dealPaymentsDue(s: GameState): number {
  let sum = 0;
  for (const d of activeDeals(s)) {
    for (const c of dealDef(d.templateId)?.conditions ?? []) {
      if (c.type === 'payPerShift') sum += toCents(c.amount ?? 0);
      if (c.type === 'payBy' && !d.paidBy) sum += toCents(c.amount ?? 0);
    }
  }
  return sum;
}

// ---------- Правовые требования к тактике ----------

export function legalRequirement(inc: Incident | undefined, tactic: TacticId): LegalRequirement | null {
  if (!inc) return null;
  return POLITICS.legalRequirements.find((r) => r.templateId === inc.templateId && r.tactics.includes(tactic)) ?? null;
}
const usable = (p: Permit, s: GameState) => p.status === 'granted' && p.expiresShift >= s.shift;
export const permitFor = (s: GameState, incidentId: string, kind: PermitKind) =>
  s.politics.permits.find((p) => p.incidentId === incidentId && p.kind === kind && usable(p, s));
export const pendingPermit = (s: GameState, incidentId: string, kind: PermitKind) =>
  s.politics.permits.find((p) => p.incidentId === incidentId && p.kind === kind && p.status === 'pending');

/** Нужен ли для тактики документ, которого нет. emergency снимает блок, но создаёт чрезвычайное основание. */
export function permitBlocker(s: GameState, incidentId: string, tactic: TacticId, emergency = false): string | null {
  const inc = s.incidents.find((i) => i.id === incidentId);
  const req = legalRequirement(inc, tactic);
  if (!req || emergency) return null;
  if (permitFor(s, incidentId, req.permit)) return null;
  if (req.permit === 'interagency' && req.houseId && hasAccess(s, req.houseId)) return null;
  const wait = pendingPermit(s, incidentId, req.permit) ? ' Запрос уже рассматривается.' : '';
  return `нужно ${PERMIT_NAME[req.permit]}. ${req.why}${wait}`;
}
/** Требуется ли чрезвычайное основание для этой отправки (документа нет). */
export const needsEmergency = (s: GameState, incidentId: string, tactic: TacticId) => !!permitBlocker(s, incidentId, tactic, false);

// ---------- Запрос разрешения ----------

export function requestBlocker(s: GameState, incidentId: string, kind: 'judicial' | 'interagency'): string | null {
  const inc = s.incidents.find((i) => i.id === incidentId);
  if (!inc || !isOpen(inc)) return 'Вызов закрыт или не найден.';
  if (s.phase !== 'ACTIVE') return 'Запросы рассматриваются во время смены.';
  const req = POLITICS.legalRequirements.find((r) => r.templateId === inc.templateId && r.permit === kind);
  if (!req) return 'Для этого вызова такое разрешение не требуется.';
  if (permitFor(s, incidentId, kind)) return 'Разрешение уже выдано.';
  if (pendingPermit(s, incidentId, kind)) return 'Запрос уже рассматривается.';
  if (kind === 'interagency' && req.houseId && hasAccess(s, req.houseId)) return 'Допуск уже есть по договору с Домом.';
  if (s.economy.balance < toCents(POLITICS.permits[kind].fee)) return 'Недостаточно средств на пошлину.';
  return null;
}

/** Шанс одобрения (только ядро; игроку — словами «вероятно / неясно / маловероятно»). */
export function approvalChance(s: GameState, inc: Incident, kind: 'judicial' | 'interagency'): number {
  if (kind === 'judicial') {
    const R = POLITICS.permits.judicial;
    const d = s.districts.find((x) => x.id === inc.districtId);
    return clamp(0.05, 0.95, R.base + ((d?.civilianTrust ?? 0) >= R.trustMin ? R.trustBonus : 0) + (coalitionStrong(s, 'open') ? R.openBonus : 0) - R.violationPenalty * recentViolations(s));
  }
  const R = POLITICS.permits.interagency;
  const req = POLITICS.legalRequirements.find((r) => r.templateId === inc.templateId && r.permit === 'interagency');
  const st = req?.houseId ? s.politics.standing[req.houseId] ?? 0 : 0;
  return clamp(R.min, R.max, R.base + st * R.standingFactor);
}
export const chanceWord = (p: number) => (p >= 0.65 ? 'вероятно одобрят' : p >= 0.35 ? 'исход неясен' : 'скорее откажут');

export function makePermit(s: GameState, inc: Incident, kind: PermitKind, tactic?: TacticId): Permit {
  const req = POLITICS.legalRequirements.find((r) => r.templateId === inc.templateId && (kind === 'emergency' ? r.tactics.includes(tactic!) : r.permit === kind));
  const district = s.districts.find((d) => d.id === inc.districtId);
  const base = {
    id: s.politics.nextId++, kind, incidentId: inc.id, target: `${inc.title}, ${district?.name ?? inc.districtId}`,
    scope: kind === 'emergency' ? [tactic!] : req?.tactics ?? [], houseId: req?.houseId ?? null, requestedShift: s.shift,
    legalBasis: POLITICS.permits[kind].legalBasis, requirements: [...POLITICS.permits[kind].requirements], note: '',
  };
  if (kind === 'emergency') {
    return { ...base, issuer: POLITICS.levels.find((l) => l.id === 'emergency')!.issuer, decideMinute: null, expiresShift: s.shift, reviewShift: s.shift + 1, auditRisk: emergencyRisk(s, inc), status: 'used' };
  }
  const R = POLITICS.permits[kind];
  const issuer = kind === 'interagency' && req?.houseId ? houseById(req.houseId)!.label : POLITICS.levels.find((l) => l.id === kind)!.issuer;
  return { ...base, issuer, decideMinute: s.minute + R.reviewMinutes, expiresShift: s.shift + R.validShifts - 1, reviewShift: null, auditRisk: 0, status: 'pending' };
}

/** Риск признания чрезвычайного действия нарушением (до исхода операции). */
export function emergencyRisk(s: GameState, inc: Incident): number {
  const R = POLITICS.permits.emergency;
  return clamp(R.min, R.max, R.auditBase + (R.bySeverity[inc.severity] ?? 0) + (coalitionStrong(s, 'hard') ? R.hardBonus : 0)
    + (coalitionStrong(s, 'open') ? R.openPenalty : 0) + R.perViolation * recentViolations(s));
}

type Post = (amount: number, note: string) => void;
type Log = (type: string, text: string) => void;

/** Решения по запросам, срок которых наступил (каждую минуту смены и при переходе смены). */
export function decidePermits(s: GameState, log: Log, all = false) {
  for (const p of s.politics.permits) {
    if (p.status !== 'pending' || (!all && (p.decideMinute ?? 0) > s.minute)) continue;
    const inc = s.incidents.find((i) => i.id === p.incidentId);
    if (!inc || !isOpen(inc)) { p.status = 'expired'; p.note = 'Вызов закрыт до решения.'; continue; }
    const [v, n] = nextFloat(s.rng); s.rng = n;
    const ok = v < approvalChance(s, inc, p.kind as 'judicial' | 'interagency');
    p.status = ok ? 'granted' : 'denied';
    p.note = ok ? `Выдано: ${p.issuer}.` : p.kind === 'judicial' ? 'Суд счёл основания недостаточными.' : `${p.issuer} отказал в допуске.`;
    log(ok ? 'permit_granted' : 'permit_denied', `${p.kind === 'judicial' ? 'Ордер' : 'Межведомственный допуск'} по вызову «${inc.title}»: ${ok ? 'выдан' : 'отказано'}.`);
  }
}

// ---------- Коалиции и отношения ----------

export function applyDelta(s: GameState, d: Delta | undefined, post: Post, note: string) {
  if (!d) return;
  if (d.money) post(toCents(d.money), note);
  if (d.reagents) s.resources.reagents = Math.max(0, s.resources.reagents + d.reagents);
  for (const [h, v] of Object.entries(d.standing ?? {})) s.politics.standing[h] = clamp(-100, 100, (s.politics.standing[h] ?? 0) + v);
  for (const [c, v] of Object.entries(d.coalition ?? {})) s.politics.coalitions[c] = clamp(0, 100, (s.politics.coalitions[c] ?? 0) + (v ?? 0));
}

// ---------- Договоры ----------

export function acceptBlocker(s: GameState, offerId: number): string | null {
  const o = s.politics.offers.find((x) => x.id === offerId);
  if (!o) return 'Предложение не найдено или истекло.';
  if (activeDeals(s).some((d) => d.templateId === o.templateId)) return 'Такой договор уже действует.';
  return null;
}

export function acceptDeal(s: GameState, offer: DealOffer, post: Post, log: Log): Deal {
  const def = dealDef(offer.templateId)!;
  const deal: Deal = { id: s.politics.nextId++, templateId: def.id, acceptedShift: s.shift, endShift: s.shift + def.durationShifts - 1, status: 'active' };
  s.politics.deals.push(deal);
  s.politics.offers = s.politics.offers.filter((x) => x.id !== offer.id);
  applyDelta(s, def.onAccept, post, `Договор: ${def.title}`);
  for (const d of def.delayed ?? []) s.politics.scheduled.push({ id: s.politics.nextId++, atShift: s.shift + d.afterShifts, dealId: deal.id, kind: 'payout' });
  log('deal_accepted', `Заключён договор с ${houseById(def.houseId)!.label}: «${def.title}» до смены ${deal.endShift}.`);
  return deal;
}

export function breakDeal(s: GameState, deal: Deal, reason: string, post: Post, log: Log) {
  const def = dealDef(deal.templateId)!;
  deal.status = 'broken';
  applyDelta(s, def.onBreach, post, `Нарушение договора: ${def.title}`);
  s.politics.scheduled = s.politics.scheduled.filter((x) => !(x.dealId === deal.id && x.kind === 'payout'));
  if (def.reprisal) s.politics.scheduled.push({ id: s.politics.nextId++, atShift: s.shift + def.reprisal.afterShifts, dealId: deal.id, kind: 'reprisal' });
  log('deal_broken', `Договор «${def.title}» нарушен: ${reason} ${def.breachText}`);
}

/** Конец смены: проверка условий, платежи, окончание срока. */
export function checkDeals(s: GameState, post: Post, log: Log) {
  for (const deal of activeDeals(s)) {
    const def = dealDef(deal.templateId)!;
    let breach: string | null = null;
    for (const c of def.conditions) {
      if (breach) break;
      if (c.type === 'districtSafetyMin') {
        const d = s.districts.find((x) => x.id === c.districtId);
        if (d && d.safety < (c.min ?? 0)) breach = `безопасность района ${d.safety}% ниже ${c.min}%.`;
      } else if (c.type === 'noTactic') {
        const hit = s.operationReports.some((r) => r.shift === s.shift && r.tactic === c.tactic && s.incidents.find((i) => i.id === r.incidentId)?.templateId === c.templateId);
        const sent = s.squads.some((q) => q.operation && q.operation.tactic === c.tactic && s.incidents.find((i) => i.id === q.operation!.incidentId)?.templateId === c.templateId);
        if (hit || sent) breach = 'на объекте Дома применён арест.';
      } else if (c.type === 'noEmergency') {
        if (s.politics.permits.some((p) => p.kind === 'emergency' && p.requestedShift >= deal.acceptedShift && p.requestedShift <= s.shift)) breach = 'дирекция действовала по чрезвычайному основанию.';
      } else if (c.type === 'payPerShift') {
        const amt = toCents(c.amount ?? 0);
        if (s.economy.balance >= amt) post(-amt, `Платёж по договору: ${def.title}`);
        else breach = 'не хватило средств на платёж.';
      } else if (c.type === 'payBy' && !deal.paidBy) {
        const amt = toCents(c.amount ?? 0);
        if (s.economy.balance >= amt) { post(-amt, `Взнос по договору: ${def.title}`); deal.paidBy = true; }
        else if (s.shift >= deal.acceptedShift + (c.dueAfterShifts ?? 0)) breach = 'взнос не внесён в срок.';
      }
    }
    if (breach) { breakDeal(s, deal, breach, post, log); continue; }
    if (s.shift >= deal.endShift) {
      deal.status = 'completed';
      log('deal_completed', `Договор «${def.title}» исполнен.`);
    }
  }
}

/** Начало новой смены: отложенные события, проверки чрезвычайных действий, новые предложения. */
export function advancePolitics(s: GameState, post: Post, log: Log) {
  decidePermits(s, log, true);
  for (const p of s.politics.permits) if ((p.status === 'granted' || p.status === 'pending') && p.expiresShift < s.shift) { p.status = 'expired'; p.note = 'Срок действия истёк.'; }
  // Отложенные события договоров.
  for (const ev of s.politics.scheduled.filter((x) => x.atShift <= s.shift)) {
    const deal = s.politics.deals.find((d) => d.id === ev.dealId);
    const def = deal && dealDef(deal.templateId);
    if (!deal || !def) continue;
    if (ev.kind === 'payout') {
      const d = def.delayed?.[0];
      if (!d) continue;
      const chance = clamp(0, 1, d.chanceBase + d.chanceStanding * (s.politics.standing[def.houseId] ?? 0) + (coalitionStrong(s, 'continuity') ? d.chanceContinuity : 0));
      const [v, n] = nextFloat(s.rng); s.rng = n;
      if (v < chance) { post(toCents(d.money), `Выплата Дома: ${def.title}`); log('deal_payout', d.text); }
      else log('deal_payout_failed', d.failText);
    } else if (def.reprisal) {
      applyDelta(s, def.reprisal, post, `Последствия разрыва: ${def.title}`);
      log('deal_reprisal', def.reprisal.text);
    }
  }
  s.politics.scheduled = s.politics.scheduled.filter((x) => x.atShift > s.shift);
  // Проверка чрезвычайных действий (ТЗ §10.1: обязательная проверка).
  for (const p of s.politics.permits.filter((x) => x.kind === 'emergency' && x.status === 'used' && (x.reviewShift ?? Infinity) <= s.shift)) {
    const R = POLITICS.permits.emergency;
    const rep = s.operationReports.find((r) => r.incidentId === p.incidentId);
    const risk = clamp(R.min, R.max, p.auditRisk + (rep ? R.outcome[rep.outcome] : 0));
    const [v, n] = nextFloat(s.rng); s.rng = n;
    if (v < risk) {
      p.status = 'violation';
      p.note = `Проверка признала нарушение: штраф ${R.fine} РЕ.`;
      s.politics.violations.push(s.shift);
      post(-Math.min(toCents(R.fine), Math.max(0, s.economy.balance)), `Санкция по проверке: ${p.target}`);
      applyDelta(s, { coalition: { open: 5, hard: -3 } }, post, '');
      log('audit_violation', `Проверка чрезвычайных действий («${p.target}»): нарушение. Штраф ${R.fine} РЕ, суд строже к следующим запросам.`);
    } else {
      p.status = 'justified';
      p.note = 'Проверка признала действия обоснованными.';
      applyDelta(s, { coalition: { hard: 3 } }, post, '');
      log('audit_justified', `Проверка чрезвычайных действий («${p.target}»): действия обоснованы.`);
    }
  }
  // Предложения: старые истекают, хозяева с отношениями не ниже порога предлагают новые.
  s.politics.offers = s.politics.offers.filter((o) => o.expiresShift >= s.shift);
  const taken = new Set([...s.politics.offers.map((o) => o.templateId), ...activeDeals(s).map((d) => d.templateId)]);
  const pool = POLITICS.deals.filter((d) => !taken.has(d.id) && (s.politics.standing[d.houseId] ?? 0) >= POLITICS.standingOffersMin
    && !s.politics.deals.some((x) => x.templateId === d.id && x.status === 'broken'));
  while (s.politics.offers.length < POLITICS.offersMax && pool.length) {
    const [v, n] = nextFloat(s.rng); s.rng = n;
    const [d] = pool.splice(Math.floor(v * pool.length), 1);
    s.politics.offers.push({ id: s.politics.nextId++, templateId: d!.id, expiresShift: s.shift + 1 });
    log('deal_offered', `${houseById(d!.houseId)!.label} предлагает договор: «${d!.title}».`);
  }
}

/** Коротко для обзора дирекции. */
export function politicsSummary(s: GameState) {
  return {
    deals: activeDeals(s).length,
    offers: s.politics.offers.length,
    pending: s.politics.permits.filter((p) => p.status === 'pending').length,
    reviews: s.politics.permits.filter((p) => p.kind === 'emergency' && p.status === 'used').length,
    violations: recentViolations(s),
  };
}

export const requirementsFor = (inc: Incident) => POLITICS.legalRequirements.filter((r) => r.templateId === inc.templateId);
export const templateTitle = (id: string) => INCIDENT_TEMPLATES.find((t) => t.id === id)?.title ?? id;
