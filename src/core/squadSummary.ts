import { DISPATCH_RULES, memberBlocker } from './dispatch';
import { DEPLOYED } from './selectors';
import { TREATABLE, patientOf, reserve, squadCommander } from './staff';
import type { GameState, Squad, Staff, StaffRole, Stats } from './types';

/**
 * Сводка отряда для быстрой настройки на карте (карточка «Отряд»).
 * Только чтение состояния: никаких новых балансных чисел, пороги берутся из content/dispatch_v1.json.
 */
export const STAT_KEYS: (keyof Stats)[] = ['reaction', 'analysis', 'control', 'resilience', 'authority'];

export interface SquadSummary {
  total: number;
  max: number;
  /** Годных к выезду прямо сейчас (memberBlocker = null) */
  fit: number;
  commander: Staff | undefined;
  /** Средние характеристики годных (если годных нет — всех), шкала 1…5, один знак после запятой */
  stats: Stats;
  avgFatigue: number;
  roles: StaffRole[];
  /** Ранены и ещё не в клинике */
  needTreatment: number;
  /** Отряд на задании: составом управлять нельзя */
  locked: boolean;
  warnings: string[];
}

export function squadSummary(s: GameState, sq: Squad): SquadSummary {
  const members = sq.memberIds.map((id) => s.staff.find((p) => p.id === id)).filter((p): p is Staff => !!p);
  const fitMembers = members.filter((p) => !memberBlocker(s, p.id, sq.id));
  const base = fitMembers.length ? fitMembers : members;
  const stats = {} as Stats;
  for (const k of STAT_KEYS) stats[k] = base.length ? Math.round((base.reduce((a, p) => a + p.stats[k], 0) / base.length) * 10) / 10 : 0;
  const avgFatigue = members.length ? Math.round(members.reduce((a, p) => a + p.fatigue, 0) / members.length) : 0;
  const needTreatment = members.filter((p) => TREATABLE.includes(p.health) && !patientOf(s, p.id)).length;
  const max = DISPATCH_RULES.squad.maxMembers;
  const locked = DEPLOYED.includes(sq.status);
  const warnings: string[] = [];
  if (!members.length) warnings.push('В отряде никого нет.');
  else if (!fitMembers.length) warnings.push('Нет годных к выезду.');
  if (members.length < max) warnings.push(`Свободных мест: ${max - members.length}.`);
  if (needTreatment) warnings.push(`Нуждаются в лечении: ${needTreatment}.`);
  const tired = members.filter((p) => p.fatigue >= DISPATCH_RULES.squad.exhaustedFatigue);
  if (tired.length) warnings.push(`Переутомлены: ${tired.map((p) => p.name).join(', ')}.`);
  return {
    total: members.length, max, fit: fitMembers.length, commander: squadCommander(s, sq), stats, avgFatigue,
    roles: [...new Set(members.map((p) => p.role))], needTreatment, locked, warnings,
  };
}

/** Кого из резерва можно поставить в отряд (живые, допущенные по состоянию); годные к выезду — первыми. */
export function reserveOptions(s: GameState): { person: Staff; blocker: string | null }[] {
  return reserve(s)
    .filter((p) => !['dead', 'missing', 'critical', 'serious_injury'].includes(p.health))
    .map((p) => ({ person: p, blocker: memberBlocker(s, p.id, '') }))
    .sort((a, b) => Number(!!a.blocker) - Number(!!b.blocker) || a.person.fatigue - b.person.fatigue || a.person.id.localeCompare(b.person.id));
}
