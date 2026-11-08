import { dealBeds, dealPaymentsDue } from './politics';
import facilitiesFile from '../../content/facilities_v1.json';
import { toCents } from './content';
import type { Build, FacilityId, GameState } from './types';

/**
 * W7 (часть 1): объекты дирекции (ТЗ §9.1), строительная очередь, финансовые показатели (§8.2).
 * Мощности объектов — единственный источник для клиники, найма, ремонта и курсов.
 */

export interface LevelDef {
  level: number; upkeep: number; cost?: number; shifts?: number; gives: string;
  effect?: Partial<Record<'earlyWarning' | 'researchCells' | 'beds' | 'capsules' | 'candidates' | 'repairs' | 'buildSlots' | 'courseShiftsCut', number>>;
}
export interface FacilityDef { id: FacilityId; label: string; levels: LevelDef[]; lockedNote?: string }

const F = facilitiesFile as unknown as {
  buildSlots: { base: number };
  subsidy: { shifts: number[]; amount: number; minSafety: number };
  facilities: FacilityDef[];
};
export const FACILITIES = F.facilities;
export const SUBSIDY = F.subsidy;
export const facilityDef = (id: FacilityId) => FACILITIES.find((f) => f.id === id)!;
export const initialFacilities = () => Object.fromEntries(FACILITIES.map((f) => [f.id, 1])) as Record<FacilityId, number>;

export const levelDef = (s: GameState, id: FacilityId): LevelDef => {
  const def = facilityDef(id);
  return def.levels.find((l) => l.level === s.facilities[id]) ?? def.levels[0]!;
};
export const nextLevelDef = (s: GameState, id: FacilityId): LevelDef | undefined =>
  facilityDef(id).levels.find((l) => l.level === s.facilities[id] + 1);

/** Значение мощности: из текущего уровня, а если там не задано — из ближайшего ниже. */
function cap(s: GameState, id: FacilityId, key: keyof NonNullable<LevelDef['effect']>, fallback = 0): number {
  const lv = s.facilities[id] ?? 1;
  const defs = facilityDef(id).levels.filter((l) => l.level <= lv && l.effect?.[key] !== undefined);
  return defs.at(-1)?.effect?.[key] ?? fallback;
}
export const medicalCapacity = (s: GameState) => ({ beds: cap(s, 'medical', 'beds', 2) + dealBeds(s), capsules: cap(s, 'medical', 'capsules', 1) });
export const candidatesPerVacancy = (s: GameState) => cap(s, 'analytics', 'candidates', 3);
export const repairsPerShift = (s: GameState) => cap(s, 'tech', 'repairs', 1);
export const earlyWarning = (s: GameState) => cap(s, 'ops', 'earlyWarning', 0);
export const researchCells = (s: GameState) => cap(s, 'lab', 'researchCells', 1);
export const courseShiftsCut = (s: GameState) => cap(s, 'training', 'courseShiftsCut', 0);
export const buildSlots = (s: GameState) => F.buildSlots.base + cap(s, 'tech', 'buildSlots', 0);

// ---------- Финансы ----------

export const upkeepPerShift = (s: GameState) => FACILITIES.reduce((a, f) => a + toCents(levelDef(s, f.id).upkeep), 0);
export const salaryPerShift = (s: GameState) => s.staff.filter((p) => p.health !== 'dead').reduce((a, p) => a + p.salary, 0);
/** Зарезервировано под начатые и стоящие в очереди работы (ещё не оплачено). */
export const reserved = (s: GameState) => s.construction.reduce((a, b) => a + (b.cost - b.paid), 0);
/** ТЗ §8.2: распределяемый фонд = касса − резервы − защищённые обязательства ближайшей смены. */
export function financeSummary(s: GameState) {
  const salary = salaryPerShift(s);
  const upkeep = upkeepPerShift(s);
  const deals = dealPaymentsDue(s);
  const obligations = salary + upkeep + deals + s.economy.unpaidObligations;
  const res = reserved(s);
  return { balance: s.economy.balance, reserved: res, salary, upkeep, deals, unpaid: s.economy.unpaidObligations, obligations, free: s.economy.balance - res - obligations };
}

// ---------- Строительная очередь ----------

export function upgradeBlocker(s: GameState, id: FacilityId): string | null {
  const def = facilityDef(id);
  if (!def) return 'Нет такого объекта.';
  if (s.construction.some((b) => b.facilityId === id)) return 'Улучшение уже в очереди.';
  const next = nextLevelDef(s, id);
  if (!next) return def.lockedNote ?? 'Достигнут предельный уровень.';
  const cost = toCents(next.cost ?? 0);
  if (financeSummary(s).free < cost) return 'Не хватает свободных средств с учётом резервов и обязательств смены.';
  return null;
}

export function makeBuild(s: GameState, id: FacilityId): Build {
  const next = nextLevelDef(s, id)!;
  return { facilityId: id, toLevel: next.level, cost: toCents(next.cost ?? 0), paid: 0, shiftsTotal: next.shifts ?? 1, shiftsDone: 0, status: 'queued' };
}

/** Первые N работ идут (N = монтажные мощности), остальные ждут. Заблокированные по деньгам занимают мощность. */
export function refreshQueue(s: GameState) {
  const slots = buildSlots(s);
  s.construction.forEach((b, i) => { if (b.status !== 'blocked') b.status = i < slots ? 'active' : 'queued'; else if (i >= slots) b.status = 'queued'; });
}

/** Между сменами: оплата этапа и продвижение работ. Не хватило денег — работа стоит, резерв остаётся. */
export function advanceConstruction(
  s: GameState, pay: (amount: number, note: string) => boolean, log: (type: string, text: string) => void,
) {
  const slots = buildSlots(s);
  const working = s.construction.slice(0, slots);
  for (const b of working) {
    const def = facilityDef(b.facilityId);
    const left = b.shiftsTotal - b.shiftsDone;
    const part = Math.ceil((b.cost - b.paid) / left);
    if (!pay(-part, `Строительство: ${def.label}, этап ${b.shiftsDone + 1} из ${b.shiftsTotal}`)) {
      if (b.status !== 'blocked') log('construction_blocked', `${def.label}: работы остановлены — нет средств на этап.`);
      b.status = 'blocked';
      continue;
    }
    b.paid += part;
    b.shiftsDone += 1;
    b.status = 'active';
    if (b.shiftsDone >= b.shiftsTotal) {
      s.facilities[b.facilityId] = b.toLevel;
      log('construction_done', `${def.label}: введён уровень ${b.toLevel}. ${facilityDef(b.facilityId).levels.find((l) => l.level === b.toLevel)?.gives ?? ''}`);
    }
  }
  s.construction = s.construction.filter((b) => b.shiftsDone < b.shiftsTotal);
  refreshQueue(s);
}

/** Техсектор чинит повреждённое снаряжение (по ID, детерминированно). */
export function repairEquipment(s: GameState, log: (type: string, text: string) => void) {
  const damaged = s.equipment.filter((u) => u.state === 'damaged').sort((a, b) => a.id.localeCompare(b.id));
  const n = Math.min(damaged.length, repairsPerShift(s));
  for (const u of damaged.slice(0, n)) u.state = 'available';
  if (n) log('equipment_repaired', `Технический сектор отремонтировал снаряжение: ${n} ед.`);
}
