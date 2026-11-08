/**
 * Доменная модель W2 — подмножество ТЗ §5.2, необходимое для одной смены.
 * Деньги хранятся целым числом в сотых долях РЕ (cents), чтобы избежать ошибок округления.
 */
export const SCHEMA_VERSION = 5;

import type { Route } from './map/graph';

export type DistrictId = 'medical' | 'science' | 'admin' | 'industry' | 'gardens' | 'residential';
export type ShiftPhase = 'BRIEFING' | 'ACTIVE' | 'REVIEW_PENDING' | 'SHIFT_REPORT';
export type Speed = 1 | 2 | 4;

export type StaffRole = 'guard' | 'investigator' | 'lovchiy' | 'biocriminalist' | 'analyst';
/** ТЗ §7.4 */
export type HealthState =
  | 'healthy' | 'fatigued' | 'light_injury' | 'serious_injury' | 'critical' | 'recovering' | 'missing' | 'dead';
/** W3 §4: состояния отряда */
export type SquadStatus =
  | 'ready' | 'en_route' | 'on_scene' | 'returning' | 'resting' | 'treatment' | 'recovery' | 'unavailable';
/** ТЗ §4.5 и W3 §3 */
export type IncidentState =
  | 'new' | 'acknowledged' | 'assigned' | 'en_route' | 'on_scene'
  | 'resolved_success' | 'resolved_partial' | 'failed' | 'escalated' | 'expired';
export type Severity = 'critical' | 'high' | 'medium';
export type DeadlineType = 'escalate' | 'expire' | 'branch';
/** ТЗ §6.1: класс определяет формат разрешения, а не тяжесть */
export type IncidentClass = 'routine' | 'complex' | 'special';
/** ТЗ §6.4: минимальный набор тактик */
export type TacticId = 'recon' | 'arrest' | 'suppression' | 'quarantine';
/** ТЗ §6.2: состояния снаряжения */
export type EquipmentState = 'available' | 'reserved' | 'deployed' | 'damaged' | 'lost' | 'consumed';

/** Единица снаряжения со своим ID: учёт по штукам, а не счётчиком. */
export interface EquipmentUnit {
  id: string;
  typeId: string;
  state: EquipmentState;
  /** Отряд, за которым числится единица (reserved/deployed) */
  squadId: string | null;
}

/** Снимок прогноза на момент отправки. p — истинная вероятность ядра; игрок видит только low–high. */
export interface ForecastSnapshot { p: number; low: number; high: number; margin: number }

/** Параметры текущего выезда отряда (ТЗ §6.2). Исход считает W5. */
export type OperationPhase = 'travel' | 'scene' | 'decision' | 'returning';
export type Outcome = 'success' | 'partial' | 'failure';

export interface SquadOperation {
  incidentId: string;
  tactic: TacticId;
  commanderId: string;
  equipmentIds: string[];
  /** C из формулы ТЗ §6.3: 1 — штатный состав, 0 — собран вручную */
  cohesion: 0 | 1;
  forecast: ForecastSnapshot;
  /** Уровень риска для группы 0…4 на момент отправки */
  riskLevel: number;
  /** W5: ход операции на месте */
  phase: OperationPhase;
  /** Минут до следующего события операции (решение или развязка) */
  timer: number;
  /** Номер следующей развилки (content/operations_v1.json → stages) */
  stageIndex: number;
  /** Накопленные последствия решений */
  pDelta: number;
  riskDelta: number;
  civil: number;
  evidence: number;
  decisions: { stage: string; label: string; result: string }[];
}

/** ТЗ §12: отчёт после операции — необратимый снимок, записи о людях идут через журнал. */
export interface OperationReport {
  id: number;
  shift: number;
  minute: number;
  incidentId: string;
  incidentTitle: string;
  squadId: string;
  squadName: string;
  tactic: TacticId;
  outcome: Outcome;
  decisions: { stage: string; label: string; result: string }[];
  tasks: { label: string; result: 'done' | 'partial' | 'failed' }[];
  casualties: { staffId: string; name: string; before: HealthState; after: HealthState }[];
  xp: number;
  fatigue: number;
  equipment: { id: string; label: string; state: EquipmentState }[];
  district: { safety: number; trust: number };
  seen: boolean;
}

export interface Stats {
  reaction: number;
  analysis: number;
  control: number;
  resilience: number;
  authority: number;
}

export interface District {
  id: DistrictId;
  name: string;
  safety: number;
  threat: number;
  civilianTrust: number;
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  rank: number;
  xp: number;
  stats: Stats;
  health: HealthState;
  fatigue: number;
  /** РЕ за смену, в сотых */
  salary: number;
  /** W6: смен адаптации после найма (пока > 0 — не выезжает) */
  adaptation: number;
  /** W6: скрытая рекомендация/обязательство перед Домом (ТЗ §7.6), раскрывается проверкой */
  patron: string | null;
}

/** ТЗ §7.4: медицинские планы */
export type MedicalPlanId = 'standard' | 'accelerated' | 'regenerative';
export interface Patient {
  staffId: string;
  plan: MedicalPlanId;
  status: 'queued' | 'treating';
  /** Смен до выписки (у очереди — полный срок плана) */
  shiftsLeft: number;
  injury: HealthState;
  since: number;
}

/** ТЗ §7.6: статусы сведений досье */
export type DossierStatus = 'verified' | 'reported' | 'unverified' | 'contested';
export interface Candidate {
  id: string;
  name: string;
  role: StaffRole;
  rank: number;
  /** Истинные качества — только для ядра */
  stats: Stats;
  /** Что сказано в досье */
  reported: Stats;
  dossier: Record<keyof Stats, DossierStatus>;
  hireCost: number;
  salary: number;
  adaptation: number;
  patron: string | null;
  patronKnown: boolean;
  check: 'none' | 'pending' | 'done';
}

/** Движение отряда по графу дорог (W3 §4). Позиция выводится из route + elapsed, а не хранится в пикселях. */
export interface SquadMovement {
  route: Route;
  /** Игровых минут с момента выезда */
  elapsed: number;
  destinationIncidentId: string;
  /** true, если дальше пути нет: отряд остановится на последнем узле маршрута */
  aborted: boolean;
}

export interface Squad {
  id: string;
  name: string;
  memberIds: string[];
  status: SquadStatus;
  /** Узел базирования или последний достигнутый узел */
  currentNodeId: string;
  assignedIncidentId: string | null;
  movement: SquadMovement | null;
  operation: SquadOperation | null;
  /** W6: постоянный командир отряда (null — выбирается по рангу) */
  commanderId: string | null;
}

export interface Incident {
  id: string;
  templateId: string;
  title: string;
  districtId: DistrictId;
  spawnId: string;
  severity: Severity;
  state: IncidentState;
  deadlineType: DeadlineType;
  /** Игровая минута смены, когда наступает ухудшение */
  deadlineMinute: number;
  createdShift: number;
}

export type TransactionKind = 'funding' | 'salary' | 'dispatch' | 'treatment' | 'hiring' | 'check';

export interface Transaction {
  id: number;
  shift: number;
  minute: number;
  kind: TransactionKind;
  /** Положительное — поступление, отрицательное — списание. В сотых РЕ. */
  amount: number;
  note: string;
}

export interface Economy {
  balance: number;
  /** Невыплаченные обязательства (сотые РЕ). Долг без отдельной механики не допускается (ТЗ §8.2). */
  unpaidObligations: number;
  ledger: Transaction[];
}

export interface WorldEvent {
  id: number;
  shift: number;
  minute: number;
  type: string;
  text: string;
}

export interface ShiftReport {
  shift: number;
  openingBalance: number;
  closingBalance: number;
  income: number;
  expenses: number;
  unpaid: number;
  openIncidents: number;
  escalatedIncidents: number;
  /** W5: итоги операций смены (из операционных отчётов) */
  operations: { success: number; partial: number; failure: number };
  injured: number;
  killed: number;
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  rng: { state: number; cursor: number };
  shift: number;
  /** Минута от начала смены */
  minute: number;
  phase: ShiftPhase;
  paused: boolean;
  speed: Speed;
  economy: Economy;
  districts: District[];
  staff: Staff[];
  squads: Squad[];
  incidents: Incident[];
  /** Закрытые рёбра дорожного графа (дорожные ограничения) */
  roadClosures: string[];
  equipment: EquipmentUnit[];
  log: WorldEvent[];
  reports: ShiftReport[];
  operationReports: OperationReport[];
  medical: { patients: Patient[] };
  candidates: Candidate[];
  nextIds: { event: number; transaction: number; incident: number; report: number; staff: number; candidate: number };
}

export type Command =
  | { type: 'START_SHIFT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SET_SPEED'; speed: Speed }
  | { type: 'TICK'; minutes: number }
  | { type: 'ACKNOWLEDGE_INCIDENT'; incidentId: string }
  | { type: 'ASSIGN_STAFF'; staffId: string; squadId: string }
  | {
      type: 'DISPATCH_SQUAD';
      squadId: string;
      incidentId: string;
      /** Не указанное берётся из быстрой отправки (defaultDraft) */
      tactic?: TacticId;
      memberIds?: string[];
      commanderId?: string;
      equipmentIds?: string[];
    }
  | { type: 'SET_ROAD_ENABLED'; edgeId: string; enabled: boolean }
  | { type: 'CHOOSE_OPTION'; squadId: string; optionId: string }
  | { type: 'UNASSIGN_STAFF'; staffId: string }
  | { type: 'SET_COMMANDER'; squadId: string; staffId: string }
  | { type: 'START_TREATMENT'; staffId: string; plan: MedicalPlanId }
  | { type: 'DEEP_CHECK'; candidateId: string }
  | { type: 'HIRE'; candidateId: string }
  | { type: 'ACK_OPERATION_REPORT'; reportId: number }
  | { type: 'END_SHIFT' }
  | { type: 'ADVANCE_SHIFT' };

export type CommandResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };
