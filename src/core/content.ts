import balance from '../../content/balance_v1_re.json';
import districtsFile from '../../content/districts.json';
import staffFile from '../../content/staff_start.json';
import squadsDemo from '../../content/squads_demo.json';
import incidentsDemo from '../../content/incidents_demo.json';
import incidentsW10 from '../../content/incidents_w10.json';
import sandboxFile from '../../content/sandbox_v1.json';
import type { DeadlineType, DistrictId, DutyKind, Incident, Severity, SquadStatus, StaffRole, Stats, TacticId } from './types';

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

export interface DutyTemplateDef {
  kind: DutyKind;
  label: string;
  templateId: string;
  title: string;
  districtId: DistrictId;
  rewardRe: number;
  description: string;
  threat: string;
  objective: string;
  successText: string;
  failureText: string;
}

export type DutyResponseFit = 'recommended' | 'acceptable' | 'excessive';
export interface DutyTacticGuidance { label: string; fit: DutyResponseFit; reason: string }
interface DutyProfileDef {
  difficulty: number;
  requirements: (keyof Stats)[];
  intel: number;
  tacticFit: Record<TacticId, number>;
  tags: string[];
  responses: Record<TacticId, DutyTacticGuidance>;
}
export interface DutyOperationalProfile {
  incidentClass: 'routine';
  difficulty: number;
  requirements: (keyof Stats)[];
  requiredRoles: StaffRole[];
  intel: number;
  tacticFit: Record<TacticId, number>;
  tags: string[];
  known: string;
}

const DUTY_CONTENT = sandboxFile.duty as unknown as {
  templates: DutyTemplateDef[];
  profiles: Record<DutyKind, DutyProfileDef>;
};

export const DUTY_RESPONSE_LABEL: Record<DutyResponseFit, string> = {
  recommended: 'Соразмерно',
  acceptable: 'Допустимо',
  excessive: 'Избыточно',
};

/** Обычный вызов берёт собственное описание, а не сюжетный текст боевого шаблона. */
export function dutyTemplateFor(inc: Incident): DutyTemplateDef | undefined {
  if (!inc.duty) return undefined;
  const sameKind = DUTY_CONTENT.templates.filter((d) => d.kind === inc.duty!.kind && d.districtId === inc.districtId);
  return sameKind.find((d) => d.title === inc.title && d.templateId === inc.templateId) ?? sameKind[0];
}

/** Профиль влияет на реальный прогноз; срочность немного усложняет тот же вызов. */
export function dutyProfileFor(inc: Incident): DutyOperationalProfile | null {
  if (!inc.duty) return null;
  const profile = DUTY_CONTENT.profiles[inc.duty.kind];
  if (!profile) return null;
  return {
    incidentClass: 'routine',
    difficulty: profile.difficulty + (inc.duty.urgent ? 1 : 0),
    requirements: [...profile.requirements],
    requiredRoles: [],
    intel: profile.intel,
    tacticFit: { ...profile.tacticFit },
    tags: [...profile.tags],
    known: '',
  };
}

export function dutyTacticGuidance(inc: Incident, tactic: TacticId): DutyTacticGuidance | null {
  return inc.duty ? DUTY_CONTENT.profiles[inc.duty.kind]?.responses[tactic] ?? null : null;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  guard: 'Страж',
  investigator: 'Следователь',
  lovchiy: 'Ловчий',
  biocriminalist: 'Биокриминалист',
  analyst: 'Аналитик / техник',
};
