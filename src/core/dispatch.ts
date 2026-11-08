import dispatchFile from '../../content/dispatch_v1.json';
import { DISPATCH_COST, INCIDENT_TEMPLATES, ROLE_LABEL } from './content';
import { buildRoute, etaMinutes, type Route } from './map/graph';
import { districtById } from './map/mapConfig';
import type {
  EquipmentUnit, ForecastSnapshot, GameState, Incident, IncidentClass, Staff, StaffRole, Stats, TacticId,
} from './types';

/**
 * W4: подготовка выезда (ТЗ §6.2–6.4). Чистые функции: UI показывает тот же расчёт, что применит ядро.
 * Формула §6.3 и все коэффициенты — из content/dispatch_v1.json (заменяемы конфигом).
 */

export interface TacticDef {
  id: TacticId; label: string; intelBonus: number; sceneMinutes: number; squadRisk: number; civilianRisk: number;
  evidence: string; escape: string; needsRoles: StaffRole[]; needsEquipment?: string[]; needsText: string;
}
export interface EquipmentType { id: string; label: string; tags: string[]; consumable: boolean; count: number }
export interface IncidentProfile {
  incidentClass: IncidentClass; difficulty: number; requirements: (keyof Stats)[]; requiredRoles: StaffRole[];
  intel: number; tacticFit: Record<TacticId, number>; tags: string[]; known: string;
}

export const DISPATCH_RULES = dispatchFile as unknown as {
  forecast: {
    base: number; perMargin: number; min: number; max: number; weights: number[]; fatiguePerPoint: number;
    fatigueMax: number; roleDeficitMax: number; intelMax: number; gearMax: number; uncertaintyByIntel: number[];
  };
  squad: { maxMembers: number; maxEquipment: number; exhaustedFatigue: number };
  classes: Record<IncidentClass, { label: string; hint: string }>;
  tactics: TacticDef[];
  equipmentTypes: EquipmentType[];
};
export const TACTICS = DISPATCH_RULES.tactics;
export const EQUIPMENT_TYPES = DISPATCH_RULES.equipmentTypes;
export const tacticById = (id: TacticId) => TACTICS.find((t) => t.id === id)!;
export const equipmentType = (id: string) => EQUIPMENT_TYPES.find((t) => t.id === id);

const PROFILES = new Map(INCIDENT_TEMPLATES.map((t) => [t.id, t as unknown as IncidentProfile]));
export function incidentProfile(inc: Incident): IncidentProfile {
  return PROFILES.get(inc.templateId) ?? {
    incidentClass: 'routine', difficulty: 11, requirements: ['reaction', 'analysis', 'control'], requiredRoles: [],
    intel: 0, tacticFit: { recon: 0, arrest: 0, suppression: 0, quarantine: 0 }, tags: [], known: '',
  };
}

/** Начальный склад: по одной записи на каждую единицу. */
export function initialEquipment(): EquipmentUnit[] {
  return EQUIPMENT_TYPES.flatMap((t) =>
    Array.from({ length: t.count }, (_, i) => ({ id: `${t.id}-${i + 1}`, typeId: t.id, state: 'available' as const, squadId: null })),
  );
}

export interface DispatchDraft {
  squadId: string;
  incidentId: string;
  tactic: TacticId;
  memberIds: string[];
  commanderId: string;
  equipmentIds: string[];
}

const UNFIT: Partial<Record<Staff['health'], string>> = {
  serious_injury: 'тяжёлое ранение', critical: 'критическое состояние', dead: 'погиб', missing: 'пропал без вести',
  recovering: 'восстанавливается',
};

/** Почему сотрудник не может поехать этим отрядом (null — может). */
export function memberBlocker(s: GameState, staffId: string, squadId: string): string | null {
  const p = s.staff.find((x) => x.id === staffId);
  if (!p) return 'нет в штате';
  const h = UNFIT[p.health];
  if (h) return h;
  if (p.fatigue >= DISPATCH_RULES.squad.exhaustedFatigue) return 'переутомление';
  if (s.medical.patients.some((x) => x.staffId === staffId)) return 'на лечении';
  if (p.adaptation > 0) return 'адаптация после найма';
  const other = s.squads.find((q) => q.id !== squadId && q.memberIds.includes(staffId));
  if (other && other.status !== 'ready') return `занят: отряд «${other.name}»`;
  const own = s.squads.find((q) => q.id === squadId);
  if (own && own.status !== 'ready' && own.memberIds.includes(staffId)) return 'отряд не готов';
  return null;
}

/** Рекомендованный командир: высший ранг, при равенстве — авторитет. */
export function bestCommander(s: GameState, memberIds: string[]): string {
  const ms = memberIds.map((id) => s.staff.find((p) => p.id === id)!).filter(Boolean);
  ms.sort((a, b) => b.rank - a.rank || b.stats.authority - a.stats.authority || a.id.localeCompare(b.id));
  return ms[0]?.id ?? '';
}

export function tacticBlocker(s: GameState, tactic: TacticId, memberIds: string[], equipmentIds: string[]): string | null {
  const t = tacticById(tactic);
  if (!t.needsRoles.length) return null;
  const roles = new Set(memberIds.map((id) => s.staff.find((p) => p.id === id)?.role));
  if (t.needsRoles.some((r) => roles.has(r))) return null;
  const types = new Set(equipmentIds.map((id) => s.equipment.find((e) => e.id === id)?.typeId));
  if (t.needsEquipment?.some((e) => types.has(e))) return null;
  return t.needsText;
}

/** Подбор снаряжения для быстрой отправки: подходящие по меткам вызова, многоразовые раньше расходников. */
export function suggestEquipment(s: GameState, inc: Incident): string[] {
  const tags = new Set(incidentProfile(inc).tags);
  const picked: string[] = [];
  const types = [...EQUIPMENT_TYPES].filter((t) => t.tags.some((x) => tags.has(x))).sort((a, b) => Number(a.consumable) - Number(b.consumable));
  for (const t of types) {
    const unit = s.equipment.find((e) => e.typeId === t.id && e.state === 'available' && !picked.includes(e.id));
    if (unit && picked.length < DISPATCH_RULES.squad.maxEquipment) picked.push(unit.id);
  }
  return picked;
}

/** Быстрая отправка: штатный состав, рекомендованные командир, тактика и снаряжение. */
export function defaultDraft(s: GameState, squadId: string, incidentId: string): DispatchDraft {
  const sq = s.squads.find((q) => q.id === squadId);
  const inc = s.incidents.find((i) => i.id === incidentId);
  const memberIds = (sq?.memberIds ?? []).filter((id) => !memberBlocker(s, id, squadId));
  const equipmentIds = inc ? suggestEquipment(s, inc) : [];
  const fixed = sq?.commanderId && memberIds.includes(sq.commanderId) ? sq.commanderId : null;
  const draft: DispatchDraft = { squadId, incidentId, tactic: 'arrest', memberIds, commanderId: fixed ?? bestCommander(s, memberIds), equipmentIds };
  if (inc) draft.tactic = recommendedTactic(s, draft);
  return draft;
}

/** Тактика с наибольшим прогнозом среди доступных (при равенстве — меньший риск для группы). */
export function recommendedTactic(s: GameState, d: DispatchDraft): TacticId {
  let best: TacticId = 'arrest';
  let bestKey = -Infinity;
  for (const t of TACTICS) {
    if (tacticBlocker(s, t.id, d.memberIds, d.equipmentIds)) continue;
    const f = computeForecast(s, { ...d, tactic: t.id });
    const key = f.p * 10 - t.squadRisk * 0.01;
    if (key > bestKey) { bestKey = key; best = t.id; }
  }
  return best;
}

export interface ForecastTerms { S: number[]; I: number; C: 0 | 1; T: number; G: number; F: number; R: number; A: number; D: number; M: number }

export function forecastTerms(s: GameState, d: DispatchDraft): ForecastTerms {
  const R_ = DISPATCH_RULES.forecast;
  const inc = s.incidents.find((i) => i.id === d.incidentId)!;
  const prof = incidentProfile(inc);
  const members = d.memberIds.map((id) => s.staff.find((p) => p.id === id)).filter((p): p is Staff => !!p);
  const S = prof.requirements.map((k) => Math.max(0, ...members.map((m) => m.stats[k])));
  const I = Math.min(R_.intelMax, prof.intel + tacticById(d.tactic).intelBonus);
  const sq = s.squads.find((q) => q.id === d.squadId);
  const standing = sq ? [...sq.memberIds].sort().join() : '';
  const C: 0 | 1 = members.length > 0 && standing === [...d.memberIds].sort().join() ? 1 : 0;
  const T = prof.tacticFit[d.tactic] ?? 0;
  const tags = new Set(prof.tags);
  const G = Math.min(R_.gearMax, d.equipmentIds.filter((id) => {
    const u = s.equipment.find((e) => e.id === id);
    return u && equipmentType(u.typeId)?.tags.some((t) => tags.has(t));
  }).length);
  const avgFatigue = members.length ? members.reduce((a, m) => a + m.fatigue, 0) / members.length : 0;
  const F = Math.min(R_.fatigueMax, Math.floor(avgFatigue / R_.fatiguePerPoint));
  const roles = new Set(members.map((m) => m.role));
  const R = Math.min(R_.roleDeficitMax, prof.requiredRoles.filter((r) => !roles.has(r)).length);
  const w = R_.weights;
  const A = S.reduce((a, v, i) => a + v * (w[i] ?? 0), 0) + I + C + T + G - F - R;
  const D = prof.difficulty;
  return { S, I, C, T, G, F, R, A, D, M: A - D };
}

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const round5 = (v: number) => Math.round(v * 20) / 20;

/** P_success = clamp(0.10, 0.95, 0.55 + 0.065×M); игроку — диапазон, ширина зависит от разведки. */
export function computeForecast(s: GameState, d: DispatchDraft): ForecastSnapshot {
  const R_ = DISPATCH_RULES.forecast;
  const t = forecastTerms(s, d);
  const p = clamp(R_.min, R_.max, R_.base + R_.perMargin * t.M);
  const u = R_.uncertaintyByIntel[t.I] ?? R_.uncertaintyByIntel[0]!;
  return { p: Math.round(p * 1000) / 1000, low: clamp(0.05, 0.95, round5(p - u)), high: clamp(0.1, 0.95, round5(p + u)), margin: Math.round(t.M * 100) / 100 };
}

export function forecastWord(f: ForecastSnapshot): string {
  const mid = (f.low + f.high) / 2;
  if (mid < 0.35) return 'Низкие шансы';
  if (mid < 0.55) return 'Рискованно';
  if (mid < 0.75) return 'Вероятный успех';
  return 'Высокие шансы';
}

const RISK_WORD = ['низкий', 'низкий', 'средний', 'высокий', 'очень высокий'];
/** Словесный риск для группы: тактика, усталость и нехватка ролей (ТЗ §6.3: потери — отдельные проверки W5). */
export function riskLevel(s: GameState, d: DispatchDraft): number {
  const t = forecastTerms(s, d);
  return Math.min(4, tacticById(d.tactic).squadRisk + (t.F >= 2 ? 1 : 0) + (t.R > 0 ? 1 : 0));
}
export const riskWord = (level: number) => RISK_WORD[Math.max(0, Math.min(4, level))]!;
export function squadRisk(s: GameState, d: DispatchDraft): string {
  return riskWord(riskLevel(s, d));
}
export const civilianRiskWord = (tactic: TacticId) => RISK_WORD[tacticById(tactic).civilianRisk]!;

export interface DispatchPlan {
  draft: DispatchDraft;
  blockers: string[];
  forecast: ForecastSnapshot;
  route: Route | null;
  eta: number | null;
  risk: string;
  missingRoles: string[];
}

/** Полная проверка черновика выезда — ей пользуются и окно отправки, и ядро. */
export function planDispatch(s: GameState, d: DispatchDraft): DispatchPlan {
  const blockers: string[] = [];
  const sq = s.squads.find((q) => q.id === d.squadId);
  const inc = s.incidents.find((i) => i.id === d.incidentId);
  if (!sq || !inc) {
    return { draft: d, blockers: ['Отряд или вызов не найден.'], forecast: { p: 0, low: 0, high: 0, margin: 0 }, route: null, eta: null, risk: '', missingRoles: [] };
  }
  if (sq.status !== 'ready') blockers.push(`Отряд «${sq.name}» недоступен.`);
  if (!['new', 'acknowledged', 'escalated'].includes(inc.state)) blockers.push('На этот вызов уже назначен отряд или он закрыт.');
  if (s.economy.balance < DISPATCH_COST) blockers.push('Недостаточно средств на выезд.');
  if (!d.memberIds.length) blockers.push('В группе нет годных к выезду сотрудников.');
  if (d.memberIds.length > DISPATCH_RULES.squad.maxMembers) blockers.push(`В группе не больше ${DISPATCH_RULES.squad.maxMembers} человек.`);
  if (new Set(d.memberIds).size !== d.memberIds.length) blockers.push('Сотрудник указан дважды.');
  for (const id of d.memberIds) {
    const why = memberBlocker(s, id, sq.id);
    if (why) blockers.push(`${s.staff.find((p) => p.id === id)?.name ?? id}: ${why}.`);
  }
  if (d.memberIds.length && !d.memberIds.includes(d.commanderId)) blockers.push('Командир должен входить в группу.');
  if (d.equipmentIds.length > DISPATCH_RULES.squad.maxEquipment) blockers.push(`Транспорт вмещает не больше ${DISPATCH_RULES.squad.maxEquipment} единиц снаряжения.`);
  if (new Set(d.equipmentIds).size !== d.equipmentIds.length) blockers.push('Единица снаряжения указана дважды.');
  for (const id of d.equipmentIds) {
    const u = s.equipment.find((e) => e.id === id);
    if (!u || u.state !== 'available') blockers.push(`Снаряжение ${equipmentType(u?.typeId ?? '')?.label ?? id} недоступно.`);
  }
  const tb = tacticBlocker(s, d.tactic, d.memberIds, d.equipmentIds);
  if (tb) blockers.push(`Тактика «${tacticById(d.tactic).label}»: ${tb}.`);
  const target = districtById(inc.districtId);
  const route = target ? buildRoute(sq.currentNodeId, target.serviceNode, s.roadClosures) : null;
  if (!route) blockers.push('Маршрут недоступен: дороги перекрыты.');
  const prof = incidentProfile(inc);
  const roles = new Set(d.memberIds.map((id) => s.staff.find((p) => p.id === id)?.role));
  return {
    draft: d,
    blockers,
    forecast: computeForecast(s, d),
    route,
    eta: route ? etaMinutes(route, 0) : null,
    risk: squadRisk(s, d),
    missingRoles: prof.requiredRoles.filter((r) => !roles.has(r)).map((r) => ROLE_LABEL[r]),
  };
}
