/**
 * Доменная модель W2 — подмножество ТЗ §5.2, необходимое для одной смены.
 * Деньги хранятся целым числом в сотых долях РЕ (cents), чтобы избежать ошибок округления.
 */
export const SCHEMA_VERSION = 11;

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
export type Severity = 'critical' | 'high' | 'medium' | 'low';
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
  /** W6.2: состав на момент развязки (для истории и отношений) */
  memberIds: string[];
  tactic: TacticId;
  outcome: Outcome;
  decisions: { stage: string; label: string; result: string }[];
  tasks: { label: string; result: 'done' | 'partial' | 'failed' }[];
  casualties: { staffId: string; name: string; before: HealthState; after: HealthState }[];
  xp: number;
  fatigue: number;
  equipment: { id: string; label: string; state: EquipmentState }[];
  district: { safety: number; trust: number };
  /** W10: что выяснилось на месте (скрытая правда процедурного события после успеха, передача в дело) */
  findings?: string[];
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
  /** W6.2: изученные узлы развития (ТЗ §7.2) */
  skills: string[];
  /** W6.2: идущий курс — сотрудник вне активного состава */
  training: { nodeId: string; shiftsLeft: number } | null;
  /** W6.2: установленные органы (ТЗ §7.3); врождённые системы выводятся из роли и не хранятся */
  implants: string[];
  /** W6.2: преданность государству / Дому / дирекции, 0…100 (ТЗ §7.5) */
  allegiance: { state: number; house: number; directorate: number };
  /** Постоянное место в отряде, пока сотрудник временно выбыл (лечение, курс, орган, исследование). */
  home?: StaffHome | null;
}

/** Куда вернуть сотрудника: отряд, позиция в составе, был ли командиром, кто подменяет. */
export interface StaffHome { squadId: string; slot: number; commander: boolean; standInId: string | null }

/** ТЗ §7.5: связь двух сотрудников, шкалы −5…+5 */
export interface Relation { a: string; b: string; trust: number; teamwork: number; loyalty: number }

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
  /** W6.2: 'implant' — установка органа с реабилитацией, занимает место клиники */
  kind?: 'injury' | 'implant';
  organId?: string;
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

export type TransactionKind =
  | 'funding' | 'salary' | 'dispatch' | 'treatment' | 'hiring' | 'check' | 'training' | 'promotion' | 'implant'
  | 'upkeep' | 'construction' | 'subsidy' | 'research' | 'fabrication' | 'permit_fee' | 'sanction' | 'deal' | 'expertise';

/** W9: расследования (ТЗ §11). Статусы связей выводятся из анализа улик и не хранятся. */
export type AnalysisResult = 'none' | 'confirmed' | 'inconclusive' | 'forgery' | 'misled';
export type InterrogationMethod = 'standard' | 'present' | 'protect' | 'negotiate' | 'pressure';
export interface CaseEvidence {
  id: string;
  foundShift: number;
  analysis: AnalysisResult;
  /** Сколько раз проверяли: повторная проверка точнее */
  checks: number;
  /** Сомнительная допустимость: усиленный допрос, нарушенная цепочка хранения, неполный источник */
  questionable: boolean;
  custodyNote?: string;
}
export interface CaseTask {
  kind: 'analyze' | 'interrogate' | 'action';
  /** Улика, человек или следственное действие */
  target: string;
  lineId?: string;
  staffId: string;
  doneAt: number;
}
export interface CaseFile {
  id: string;
  incidentId: string;
  openedShift: number;
  status: 'open' | 'charged' | 'concluded' | 'closed';
  evidence: CaseEvidence[];
  /** Улика → версия */
  links: { evidenceId: string; hypothesisId: string }[];
  /** Улика ↔ улика (b может ссылаться на другое дело: «c1:e05») */
  pairs: { a: string; b: string }[];
  /** Реконструкция: улика → индекс временного слота */
  timeline: Record<string, number>;
  working: string | null;
  /** Заданные вопросы: personId:lineId */
  asked: string[];
  actionsDone: string[];
  tasks: CaseTask[];
  expertiseBonus: number;
  decision?: { conclusionId: string; hypothesisId?: string; shift: number; court?: 'accepted' | 'returned' };
  revealShift?: number;
  revealed?: boolean;
}

/** W9: особые операции (ТЗ §12) и кампания (ТЗ §13). */
export interface SpecialOpState {
  id: string;
  squadId: string;
  memberIds: string[];
  startedShift: number;
  phase: number;
  choices: string[];
  scores: Record<string, number>;
  risk: number;
  status: 'active' | 'done';
  report?: SpecialOpReport;
}
export interface SpecialOpReport {
  outcome: Outcome;
  objectives: { id: string; label: string; result: 'done' | 'partial' | 'failed' }[];
  casualties: { staffId: string; name: string; before: HealthState; after: HealthState }[];
  notes: string[];
  seen: boolean;
}
export interface Campaign {
  flags: string[];
  /** Выбор в сюжетных узлах: shift → optionId */
  choices: Record<string, string>;
  ops: SpecialOpState[];
  ending: 'order' | 'cost' | 'collapse' | null;
  endingSeen: boolean;
}

/** W8: разрешения (ТЗ §10.1). Постоянные полномочия не хранятся — они действуют всегда. */
export type PermitKind = 'judicial' | 'interagency' | 'emergency';
export type PermitStatus = 'pending' | 'granted' | 'denied' | 'used' | 'expired' | 'justified' | 'violation';
export interface Permit {
  id: number;
  kind: PermitKind;
  /** Вызов-основание; для разрешений по делу — вызов, с которого дело открыто */
  incidentId: string;
  /** W9: разрешение на следственное действие по делу */
  caseId?: string;
  actionId?: string;
  target: string;
  scope: TacticId[];
  issuer: string;
  legalBasis: string;
  requirements: string[];
  houseId: string | null;
  requestedShift: number;
  /** Минута смены, когда придёт решение (pending) */
  decideMinute: number | null;
  /** Действует до конца этой смены включительно */
  expiresShift: number;
  /** Чрезвычайное: смена обязательной проверки */
  reviewShift: number | null;
  /** Риск признания нарушением на проверке, 0…1 (игроку — словом) */
  auditRisk: number;
  status: PermitStatus;
  note: string;
}
/** W8: предложение и договор с Домом (ТЗ §10.2). Условия и последствия — в content/politics_v1.json. */
export interface DealOffer { id: number; templateId: string; expiresShift: number }
export interface Deal { id: number; templateId: string; acceptedShift: number; endShift: number; status: 'active' | 'completed' | 'broken'; paidBy?: boolean }
export interface ScheduledEvent { id: number; atShift: number; dealId: number; kind: 'payout' | 'reprisal' }
export interface Politics {
  standing: Record<string, number>;
  coalitions: Record<string, number>;
  offers: DealOffer[];
  deals: Deal[];
  permits: Permit[];
  scheduled: ScheduledEvent[];
  /** Смены, в которых проверка признала нарушение */
  violations: number[];
  nextId: number;
}

/** W7.2: протоколы и стадии проекта (ТЗ §9.2). locked/available выводятся из правил и не хранятся. */
export type ResearchProtocol = 'conservative' | 'accelerated' | 'experimental';
export type ProjectStatus = 'queued' | 'active' | 'blocked_inputs' | 'blocked_staff' | 'completed' | 'failed';
export interface Project {
  id: string;
  protocol: ResearchProtocol;
  researcherId: string;
  status: ProjectStatus;
  stagesDone: number;
  stagesTotal: number;
  /** Потрачено денег (сотые РЕ) и реагентов */
  spent: number;
  reagentsSpent: number;
  startedShift: number;
}

/** W7: восемь объектов дирекции (ТЗ §9.1) */
export type FacilityId = 'ops' | 'lab' | 'medical' | 'analytics' | 'detention' | 'tech' | 'training' | 'archive';
/** W7: работа строительной очереди. Деньги списываются поэтапно, остаток — зарезервирован (ТЗ §8.2). */
export interface Build {
  facilityId: FacilityId;
  toLevel: number;
  /** Полная стоимость и уже оплачено, в сотых РЕ */
  cost: number;
  paid: number;
  shiftsTotal: number;
  shiftsDone: number;
  status: 'active' | 'queued' | 'blocked';
}

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
  /** W6.2: к кому относится запись — из этого строится история службы (ТЗ §7.7) */
  staffIds?: string[];
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
  /** Вызовы смены, которые ещё не поступили: приходят в течение дня в минуту `at` (срок отсчитывается от поступления) */
  incoming: { at: number; incident: Incident }[];
  /** Закрытые рёбра дорожного графа (дорожные ограничения) */
  roadClosures: string[];
  equipment: EquipmentUnit[];
  log: WorldEvent[];
  reports: ShiftReport[];
  operationReports: OperationReport[];
  medical: { patients: Patient[] };
  candidates: Candidate[];
  relations: Relation[];
  facilities: Record<FacilityId, number>;
  construction: Build[];
  research: Project[];
  resources: { reagents: number };
  politics: Politics;
  /** W9: дела (ТЗ §11) */
  investigations: { cases: CaseFile[] };
  campaign: Campaign;
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
      /** W8: действовать по чрезвычайному основанию, если для тактики нет разрешения */
      emergency?: boolean;
    }
  | { type: 'SET_ROAD_ENABLED'; edgeId: string; enabled: boolean }
  | { type: 'CHOOSE_OPTION'; squadId: string; optionId: string }
  | { type: 'UNASSIGN_STAFF'; staffId: string }
  /** Быстрая замена в карточке отряда: staffId уходит в резерв, withId из резерва занимает его место */
  | { type: 'SWAP_STAFF'; staffId: string; withId: string }
  | { type: 'SET_COMMANDER'; squadId: string; staffId: string }
  | { type: 'START_TREATMENT'; staffId: string; plan: MedicalPlanId }
  | { type: 'DEEP_CHECK'; candidateId: string }
  | { type: 'HIRE'; candidateId: string }
  | { type: 'START_COURSE'; staffId: string; nodeId: string }
  | { type: 'PROMOTE'; staffId: string }
  | { type: 'INSTALL_ORGAN'; staffId: string; organId: string }
  | { type: 'REMOVE_ORGAN'; staffId: string; organId: string }
  | { type: 'ACK_OPERATION_REPORT'; reportId: number }
  | { type: 'QUEUE_UPGRADE'; facilityId: FacilityId }
  | { type: 'CANCEL_UPGRADE'; facilityId: FacilityId }
  | { type: 'PRIORITIZE_UPGRADE'; facilityId: FacilityId }
  | { type: 'START_PROJECT'; projectId: string; protocol: ResearchProtocol; researcherId: string }
  | { type: 'CANCEL_PROJECT'; projectId: string }
  | { type: 'FABRICATE'; projectId: string }
  | { type: 'REQUEST_PERMIT'; incidentId: string; kind: 'judicial' | 'interagency' }
  | { type: 'ACCEPT_DEAL'; offerId: number }
  | { type: 'DECLINE_DEAL'; offerId: number }
  | { type: 'BREAK_DEAL'; dealId: number }
  | { type: 'ANALYZE_EVIDENCE'; caseId: string; evidenceId: string; staffId: string }
  | { type: 'LINK_EVIDENCE'; caseId: string; evidenceId: string; hypothesisId: string }
  | { type: 'UNLINK_EVIDENCE'; caseId: string; evidenceId: string; hypothesisId: string }
  | { type: 'SET_WORKING_HYPOTHESIS'; caseId: string; hypothesisId: string | null }
  | { type: 'PLACE_EVIDENCE'; caseId: string; evidenceId: string; slot: number | null }
  | { type: 'LINK_PAIR'; caseId: string; a: string; b: string }
  | { type: 'UNLINK_PAIR'; caseId: string; a: string; b: string }
  | { type: 'INTERROGATE'; caseId: string; personId: string; lineId: string; staffId: string }
  | { type: 'CASE_ACTION'; caseId: string; actionId: string; staffId: string }
  | { type: 'REQUEST_CASE_PERMIT'; caseId: string; actionId: string }
  | { type: 'REQUEST_EXPERTISE'; caseId: string }
  | { type: 'CONCLUDE_CASE'; caseId: string; conclusionId: string; hypothesisId?: string }
  | { type: 'STORY_CHOICE'; shift: number; optionId: string }
  | { type: 'START_SPECIAL_OP'; opId: string; squadId: string }
  | { type: 'SPECIAL_OP_CHOICE'; opId: string; optionId: string }
  | { type: 'ACK_SPECIAL_OP'; opId: string }
  | { type: 'ACK_ENDING' }
  | { type: 'END_SHIFT' }
  | { type: 'ADVANCE_SHIFT' };

export type CommandResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };
