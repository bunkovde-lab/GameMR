import balance from '../../content/balance_v1_re.json';
import districtsFile from '../../content/districts.json';
import staffFile from '../../content/staff_start.json';
import squadsDemo from '../../content/squads_demo.json';
import incidentsDemo from '../../content/incidents_demo.json';
import type { DistrictId, Severity, SquadStatus, StaffRole, Stats } from './types';

export const BALANCE = balance;
export const toCents = (re: number) => Math.round(re * 100);
/** ТЗ §8.1: средняя отправка 1,25 РЕ (baseline v1.0) */
export const DISPATCH_COST = toCents(1.25);

export interface StaffSeed {
  id: string; name: string; role: StaffRole; rank: number; xp: number; salary: number; fatigue: number; stats: Stats;
}
export interface IncidentTemplate {
  id: string; title: string; districtId: DistrictId; spawnId: string; severity: Severity; deadlineMinutes: number;
}

export const DISTRICTS = districtsFile.districts as { id: DistrictId; name: string; civilianTrust: number }[];
export const STAFF_START = staffFile.staff as StaffSeed[];
export const SQUAD_MEMBERS = staffFile.squadMembers as Record<string, string[]>;
export const SQUADS_DEMO = squadsDemo as { id: string; name: string; status: SquadStatus; currentNodeId: string; assignedIncidentId: string | null }[];
/** Демо-вызовы W3 используются и как шаблоны для новых смен (пока нет контента событий W4). */
export const INCIDENT_TEMPLATES = incidentsDemo as IncidentTemplate[];

export const ROLE_LABEL: Record<StaffRole, string> = {
  guard: 'Страж',
  investigator: 'Следователь',
  lovchiy: 'Ловчий',
  biocriminalist: 'Биокриминалист',
  analyst: 'Аналитик / техник',
};
