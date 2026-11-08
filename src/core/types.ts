/**
 * Доменная модель W2 — подмножество ТЗ §5.2, необходимое для одной смены.
 * Деньги хранятся целым числом в сотых долях РЕ (cents), чтобы избежать ошибок округления.
 */
export const SCHEMA_VERSION = 1;

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
}

export interface Squad {
  id: string;
  name: string;
  memberIds: string[];
  status: SquadStatus;
  currentNodeId: string;
  assignedIncidentId: string | null;
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

export type TransactionKind = 'funding' | 'salary';

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
  log: WorldEvent[];
  reports: ShiftReport[];
  nextIds: { event: number; transaction: number; incident: number };
}

export type Command =
  | { type: 'START_SHIFT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SET_SPEED'; speed: Speed }
  | { type: 'TICK'; minutes: number }
  | { type: 'ACKNOWLEDGE_INCIDENT'; incidentId: string }
  | { type: 'ASSIGN_STAFF'; staffId: string; squadId: string }
  | { type: 'END_SHIFT' }
  | { type: 'ADVANCE_SHIFT' };

export type CommandResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };
