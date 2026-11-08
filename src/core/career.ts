import careerFile from '../../content/career_v1.json';
import { toCents } from './content';
import { STAFF_RULES, bedsUsed } from './staff';
import type { GameState, OperationReport, Relation, Staff, StaffRole, Stats, TacticId } from './types';

/**
 * W6 (часть 2): развитие и звания (ТЗ §7.1–7.2), биология и органы (§7.3), отношения (§7.5), история (§7.7).
 * Эффекты качественные и с потолками: они правят отдельные слагаемые формулы §6.3, а не «+N% ко всему».
 */

export type BranchId = 'command' | 'counterintel' | 'operations';
export interface NodeDef {
  id: string; tier: number; label: string; desc: string; effect: string; points: number; cost: number; shifts: number;
  rankMin: number; stat?: { key: keyof Stats; min: number }; branch: BranchId;
}
export interface OrganDef {
  id: string; label: string; ability: string; desc: string; effect: string; load: number; cost: number; shifts: number;
  removable: boolean; conflicts: string[]; conflictWhy: string;
}
export interface SystemDef { id: string; label: string; load: number; desc: string }

const C = careerFile as unknown as {
  skillPoints: { xpPerPoint: number };
  branches: Record<BranchId, { label: string; hint: string; nodes: Omit<NodeDef, 'branch'>[] }>;
  promotion: { xpToNext: Record<string, number>; opsToNext: Record<string, number>; slotsByRank: Record<string, number>; fee: Record<string, number>; salaryStep: number };
  bio: { capacityBase: number; capacityPerResilience: number; innate: Record<string, SystemDef[]>; organs: OrganDef[] };
  relations: {
    jointTeamwork: number; conflictTrust: number; squadmatesStart: { teamwork: number; trust: number };
    seed: { a: string; b: string; trust: number; teamwork: number; loyalty: number; why: string }[];
    allegianceStart: { state: number; house: number; directorate: number };
    deltas: { successTeamwork: number; failureTrust: number; survivedSeriousTrustInCommander: number; deathDirectorate: number };
  };
};
export const CAREER = C;
export const BRANCH_IDS = Object.keys(C.branches) as BranchId[];
export const NODES: NodeDef[] = BRANCH_IDS.flatMap((b) => C.branches[b].nodes.map((n) => ({ ...n, branch: b })));
export const nodeById = (id: string) => NODES.find((n) => n.id === id);
export const ORGANS = C.bio.organs;
export const organById = (id: string) => ORGANS.find((o) => o.id === id);
export const RANK_NAMES = ['I', 'II', 'III', 'IV', 'V'];
const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const DEPLOYED = ['en_route', 'on_scene', 'returning'];

// ---------- Развитие ----------

export function skillPoints(p: Staff) {
  const earned = Math.floor(p.xp / C.skillPoints.xpPerPoint);
  const spentIds = [...p.skills, ...(p.training ? [p.training.nodeId] : [])];
  const spent = spentIds.reduce((a, id) => a + (nodeById(id)?.points ?? 0), 0);
  return { earned, spent, free: earned - spent };
}

const onMission = (s: GameState, id: string) => s.squads.some((q) => q.memberIds.includes(id) && DEPLOYED.includes(q.status));

/** Почему нельзя начать курс; null — можно. Узлы выше требуют предыдущий узел ветки, ранг и качество. */
export function courseBlocker(s: GameState, staffId: string, nodeId: string): string | null {
  const p = s.staff.find((x) => x.id === staffId);
  const n = nodeById(nodeId);
  if (!p || !n) return 'Нет такого сотрудника или навыка.';
  if (p.health === 'dead') return 'Сотрудник в архиве.';
  if (p.skills.includes(n.id)) return 'Уже изучено.';
  if (p.training) return `Уже идёт курс «${nodeById(p.training.nodeId)?.label}».`;
  const prev = NODES.find((x) => x.branch === n.branch && x.tier === n.tier - 1);
  if (prev && !p.skills.includes(prev.id)) return `Сначала «${prev.label}».`;
  if (p.rank < n.rankMin) return `Нужен ранг ${RANK_NAMES[n.rankMin - 1]}.`;
  if (n.stat && p.stats[n.stat.key] < n.stat.min) return `Нужно: ${STAT_WORD[n.stat.key]} ${n.stat.min}+.`;
  if (skillPoints(p).free < n.points) return `Не хватает очков навыка (нужно ${n.points}).`;
  if (onMission(s, p.id)) return 'Сотрудник на задании.';
  if (s.medical.patients.some((x) => x.staffId === p.id)) return 'Сотрудник в клинике.';
  if (s.economy.balance < toCents(n.cost)) return 'Недостаточно средств на курс.';
  return null;
}
export const STAT_WORD: Record<keyof Stats, string> = { reaction: 'реакция', analysis: 'анализ', control: 'контроль', resilience: 'стойкость', authority: 'авторитет' };

/** Между сменами: курсы идут, по окончании навык изучен. */
export function advanceTraining(s: GameState, log: (type: string, text: string, ids: string[]) => void) {
  for (const p of s.staff) {
    if (!p.training || p.health === 'dead') continue;
    p.training.shiftsLeft -= 1;
    if (p.training.shiftsLeft > 0) continue;
    const n = nodeById(p.training.nodeId)!;
    p.skills.push(n.id);
    p.training = null;
    log('course_finished', `${p.name} окончил(а) курс «${n.label}».`, [p.id]);
  }
}

/** Операции, в которых участвовал сотрудник: считаются по журналу, а не отдельным счётчиком. */
export const operationsOf = (s: GameState, id: string) =>
  s.log.filter((e) => e.type === 'operation_completed' && e.staffIds?.includes(id)).length;

export interface PromotionStatus { next: number; xp: number; xpNeed: number; ops: number; opsNeed: number; slots: number; holders: number; fee: number; blocker: string | null }
export function promotionStatus(s: GameState, staffId: string): PromotionStatus | null {
  const p = s.staff.find((x) => x.id === staffId);
  if (!p || p.rank >= 5) return null;
  const next = p.rank + 1;
  const P = C.promotion;
  const xpNeed = P.xpToNext[String(p.rank)] ?? 999;
  const opsNeed = P.opsToNext[String(p.rank)] ?? 99;
  const ops = operationsOf(s, p.id);
  const slots = P.slotsByRank[String(next)] ?? 0;
  const holders = s.staff.filter((x) => x.health !== 'dead' && x.rank >= next).length;
  const fee = toCents(P.fee[String(p.rank)] ?? 0);
  let blocker: string | null = null;
  if (p.health === 'dead') blocker = 'Сотрудник в архиве.';
  else if (p.xp < xpNeed) blocker = `Нужно опыта: ${xpNeed} (сейчас ${p.xp}).`;
  else if (ops < opsNeed) blocker = `Нужно операций: ${opsNeed} (сейчас ${ops}).`;
  else if (holders >= slots) blocker = slots === 0 ? `Должностей ранга ${RANK_NAMES[next - 1]} в штате нет.` : `Нет свободной должности ранга ${RANK_NAMES[next - 1]} (${holders} из ${slots}).`;
  else if (onMission(s, p.id)) blocker = 'Сотрудник на задании.';
  else if (s.economy.balance < fee) blocker = 'Недостаточно средств на аттестацию.';
  return { next, xp: p.xp, xpNeed, ops, opsNeed, slots, holders, fee, blocker };
}
export const salaryStep = () => toCents(C.promotion.salaryStep);

// ---------- Биология и органы ----------

export function innateSystems(role: StaffRole): SystemDef[] {
  return [...(C.bio.innate.all ?? []), ...(C.bio.innate[role] ?? [])];
}
export function metabolic(p: Staff) {
  const capacity = C.bio.capacityBase + C.bio.capacityPerResilience * p.stats.resilience;
  const used = innateSystems(p.role).reduce((a, x) => a + x.load, 0) + p.implants.reduce((a, id) => a + (organById(id)?.load ?? 0), 0);
  return { capacity, used };
}

/** Совместимость считается между конкретными системами (ТЗ §7.3), а не общим лимитом «3/5». */
export function organBlocker(s: GameState, staffId: string, organId: string): string | null {
  const p = s.staff.find((x) => x.id === staffId);
  const o = organById(organId);
  if (!p || !o) return 'Нет такого сотрудника или органа.';
  if (p.health === 'dead') return 'Сотрудник в архиве.';
  if (p.implants.includes(o.id)) return 'Уже установлен.';
  const systems = [...innateSystems(p.role).map((x) => x.id), ...p.implants];
  const clash = o.conflicts.find((c) => systems.includes(c));
  if (clash) return `Несовместимо: ${o.conflictWhy}.`;
  const m = metabolic(p);
  if (m.used + o.load > m.capacity) return `Метаболическая нагрузка: ${m.used + o.load} из ${m.capacity}.`;
  if (p.health !== 'healthy' && p.health !== 'fatigued') return 'Установка только здоровому сотруднику.';
  if (onMission(s, p.id)) return 'Сотрудник на задании.';
  if (p.training) return 'Сотрудник на курсе.';
  if (s.medical.patients.some((x) => x.staffId === p.id)) return 'Сотрудник уже в клинике.';
  if (bedsUsed(s) >= STAFF_RULES.medical.beds) return 'Нет свободного места в клинике для реабилитации.';
  if (s.economy.balance < toCents(o.cost)) return 'Недостаточно средств на установку.';
  return null;
}

// ---------- Эффекты в формуле §6.3 ----------

const effectsOf = (p: Staff) => [
  ...p.skills.map((id) => ({ effect: nodeById(id)?.effect ?? '', label: nodeById(id)?.label ?? id })),
  ...p.implants.map((id) => ({ effect: organById(id)?.effect ?? '', label: organById(id)?.ability ?? id })),
];
export const hasEffect = (p: Staff | undefined, effect: string) => !!p && effectsOf(p).some((e) => e.effect === effect);

export interface GroupMods { dI: number; dT: number; dG: number; cohesion: boolean; dRisk: number; notes: string[] }

/** Навыки, органы и связи группы. Потолки: I и T — пределы формулы, риск — не ниже −1 и не выше +1. */
export function groupMods(s: GameState, memberIds: string[], commanderId: string, tactic: TacticId, tags: string[]): GroupMods {
  const members = memberIds.map((id) => s.staff.find((x) => x.id === id)).filter((x): x is Staff => !!x);
  const cmd = members.find((m) => m.id === commanderId);
  const m: GroupMods = { dI: 0, dT: 0, dG: 0, cohesion: false, dRisk: 0, notes: [] };
  const find = (effect: string) => members.flatMap((p) => effectsOf(p).filter((e) => e.effect === effect).map((e) => ({ p, ...e })))[0];
  if (cmd && hasEffect(cmd, 'risk_down_cmd')) { m.dRisk = -1; m.notes.push(`${cmd.name}: координация группы — риск ниже`); }
  const derm = find('risk_down_any');
  if (derm && m.dRisk === 0) { m.dRisk = -1; m.notes.push(`${derm.p.name}: ${derm.label.toLowerCase()} — риск ниже`); }
  if (cmd && hasEffect(cmd, 'cohesion_cmd')) { m.cohesion = true; m.notes.push(`${cmd.name}: сборная группа действует как штатная`); }
  const intel = find('intel_any');
  if (intel) { m.dI = 1; m.notes.push(`${intel.p.name}: ${intel.label.toLowerCase()} — разведка +1`); }
  const tac = find(`tactic:${tactic}`);
  if (tac) { m.dT = 1; m.notes.push(`${tac.p.name}: ${tac.label.toLowerCase()} — тактика +1`); }
  const bio = find('gear_bio');
  if (bio && (tags.includes('bio') || tags.includes('trace'))) { m.dG = 1; m.notes.push(`${bio.p.name}: ${bio.label.toLowerCase()} — снаряжение +1`); }
  // Отношения: одно контекстное совместное действие и один конфликт, без складывания.
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const r = relation(s, members[i]!.id, members[j]!.id);
    if (!r) continue;
    if (r.teamwork >= C.relations.jointTeamwork && !m.cohesion) {
      m.cohesion = true;
      m.notes.push(`${members[i]!.name} и ${members[j]!.name}: отработанное взаимодействие`);
    }
    if (r.trust <= C.relations.conflictTrust && m.dRisk < 1) {
      m.dRisk += 1;
      m.notes.push(`${members[i]!.name} и ${members[j]!.name}: конфликт — риск выше`);
    }
  }
  m.dRisk = clamp(-1, 1, m.dRisk);
  return m;
}

// ---------- Отношения ----------

const key = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];
export function relation(s: GameState, a: string, b: string): Relation | undefined {
  const [x, y] = key(a, b);
  return s.relations.find((r) => r.a === x && r.b === y);
}
function ensure(s: GameState, a: string, b: string): Relation {
  const [x, y] = key(a, b);
  let r = s.relations.find((q) => q.a === x && q.b === y);
  if (!r) { r = { a: x, b: y, trust: 0, teamwork: 0, loyalty: 0 }; s.relations.push(r); }
  return r;
}
export function relationsOf(s: GameState, id: string) {
  return s.relations.filter((r) => r.a === id || r.b === id).map((r) => ({ other: r.a === id ? r.b : r.a, ...r }));
}
const bump = (r: Relation, f: 'trust' | 'teamwork' | 'loyalty', d: number) => { r[f] = clamp(-5, 5, r[f] + d); };

export function initialRelations(s: GameState) {
  const R = C.relations;
  for (const q of s.squads) for (let i = 0; i < q.memberIds.length; i++) for (let j = i + 1; j < q.memberIds.length; j++) {
    const r = ensure(s, q.memberIds[i]!, q.memberIds[j]!);
    r.teamwork = R.squadmatesStart.teamwork;
    r.trust = R.squadmatesStart.trust;
  }
  for (const x of R.seed) {
    if (!s.staff.some((p) => p.id === x.a) || !s.staff.some((p) => p.id === x.b)) continue;
    const r = ensure(s, x.a, x.b);
    r.trust = x.trust; r.teamwork = x.teamwork; r.loyalty = x.loyalty;
  }
}
export const seedReasons = () => C.relations.seed;

/** Последствия операции для связей (ТЗ §7.5): каждое изменение — запись журнала с участниками. */
export function applyOperationToRelations(s: GameState, report: OperationReport, commanderId: string, log: (type: string, text: string, ids: string[]) => void) {
  const D = C.relations.deltas;
  const ids = report.memberIds;
  const name = (id: string) => s.staff.find((p) => p.id === id)?.name ?? id;
  const alive = ids.filter((id) => s.staff.find((p) => p.id === id)?.health !== 'dead');
  if (report.outcome === 'success' && alive.length > 1) {
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) bump(ensure(s, alive[i]!, alive[j]!), 'teamwork', D.successTeamwork);
    log('relation_changed', `Сработанность выросла: ${alive.map(name).join(', ')} (успешная операция).`, alive);
  }
  if (report.outcome === 'failure' && commanderId && alive.includes(commanderId)) {
    const others = alive.filter((id) => id !== commanderId);
    for (const id of others) bump(ensure(s, id, commanderId), 'trust', D.failureTrust);
    if (others.length) log('relation_changed', `Доверие к командиру ${name(commanderId)} снизилось после провала.`, [commanderId, ...others]);
  }
  for (const c of report.casualties) {
    if ((c.after === 'serious_injury' || c.after === 'critical') && commanderId && c.staffId !== commanderId && alive.includes(commanderId)) {
      bump(ensure(s, c.staffId, commanderId), 'loyalty', D.survivedSeriousTrustInCommander);
      log('relation_changed', `${c.name} обязан(а) жизнью командиру ${name(commanderId)}: личная лояльность выросла.`, [c.staffId, commanderId]);
    }
    if (c.after === 'dead') {
      for (const id of alive) {
        const p = s.staff.find((x) => x.id === id)!;
        p.allegiance.directorate = clamp(0, 100, p.allegiance.directorate + D.deathDirectorate);
      }
      if (alive.length) log('relation_changed', `Гибель ${c.name}: преданность дирекции у сослуживцев снизилась.`, [c.staffId, ...alive]);
    }
  }
}
export const allegianceStart = () => ({ ...C.relations.allegianceStart });
