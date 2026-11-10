import balance from '../../content/balance_v1_re.json';
import districtsFile from '../../content/districts.json';
import staffFile from '../../content/staff_start.json';
import squadsDemo from '../../content/squads_demo.json';
import incidentsDemo from '../../content/incidents_demo.json';
import incidentsW10 from '../../content/incidents_w10.json';
import type { DeadlineType, DistrictId, Severity, SquadStatus, StaffRole, Stats } from './types';

export const BALANCE = balance;
export const toCents = (re: number) => Math.round(re * 100);
/** ТЗ §8.1: средняя отправка 1,25 РЕ (baseline v1.0) */
export const DISPATCH_COST = toCents(1.25);

export interface StaffSeed {
  id: string; name: string; role: StaffRole; rank: number; xp: number; salary: number; fatigue: number; stats: Stats;
}
export interface IncidentTemplate {
  id: string; title: string; districtId: DistrictId; spawnId: string; severity: Severity; deadlineMinutes: number;
  /** W10 (сценарий W10_EVENTS_v1): номер EV, что будет при опоздании, «на кону», скрытая правда (только Core), сцена ART-015, флаги, сюжетная смена */
  num?: number; deadlineType?: DeadlineType; lateText?: string; aftermath?: string; hidden?: string; scene?: string | null;
  coreFlags?: string[]; story?: { shift: number; caseId: string };
}

export const DISTRICTS = districtsFile.districts as { id: DistrictId; name: string; civilianTrust: number }[];
export const STAFF_START = staffFile.staff as StaffSeed[];
export const SQUAD_MEMBERS = staffFile.squadMembers as Record<string, string[]>;
export const SQUADS_DEMO = squadsDemo as { id: string; name: string; status: SquadStatus; currentNodeId: string; assignedIncidentId: string | null }[];
/** Пять вызовов первой смены (демо W3). */
export const START_INCIDENTS = incidentsDemo as IncidentTemplate[];
/**
 * W10: 36 шаблонов происшествий (по 6 на район). Пять демо-вызовов входят в их число: их профиль берётся из demo,
 * сценарные поля — из incidents_w10.json. Новые получают точку появления в своём районе.
 */
export const INCIDENT_TEMPLATES: IncidentTemplate[] = (incidentsW10.templates as unknown as Partial<IncidentTemplate>[]).map((w) => {
  const demo = START_INCIDENTS.find((d) => d.id === w.id);
  return { ...(demo ?? { spawnId: `${w.districtId}:spawn:01`, state: 'new', flags: [] }), ...w } as IncidentTemplate;
});

export const ROLE_LABEL: Record<StaffRole, string> = {
  guard: 'Страж',
  investigator: 'Следователь',
  lovchiy: 'Ловчий',
  biocriminalist: 'Биокриминалист',
  analyst: 'Аналитик / техник',
};
