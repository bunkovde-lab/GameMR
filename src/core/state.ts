import { allegianceStart, initialRelations } from './career';
import { initialFacilities } from './facilities';
import { RESEARCH } from './research';
import { BALANCE, DISTRICTS, INCIDENT_TEMPLATES, SQUAD_MEMBERS, SQUADS_DEMO, STAFF_START, toCents } from './content';
import { bestCommander, computeForecast, initialEquipment, riskLevel } from './dispatch';
import { seedRng } from './rng';
import { refreshCandidates } from './staff';
import { SCHEMA_VERSION, type GameState, type Incident, type IncidentState } from './types';

export const DEFAULT_SEED = 2864;

/** Начальное состояние кампании: смена 1, фаза брифинга. */
export function createInitialState(seed: number = DEFAULT_SEED): GameState {
  const incidents: Incident[] = INCIDENT_TEMPLATES.map((t) => {
    const onScene = SQUADS_DEMO.some((s) => s.assignedIncidentId === t.id && s.status === 'on_scene');
    const state: IncidentState = onScene ? 'on_scene' : 'new';
    return {
      id: t.id,
      templateId: t.id,
      title: t.title,
      districtId: t.districtId,
      spawnId: t.spawnId,
      severity: t.severity,
      state,
      deadlineType: 'escalate',
      deadlineMinute: t.deadlineMinutes,
      createdShift: 1,
    };
  });

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rng: seedRng(seed),
    shift: 1,
    minute: 0,
    phase: 'BRIEFING',
    paused: true,
    speed: 1,
    economy: { balance: toCents(BALANCE.startingBalance), unpaidObligations: 0, ledger: [] },
    districts: DISTRICTS.map((d) => ({
      id: d.id,
      name: d.name,
      safety: BALANCE.district.startingSafety,
      threat: 0,
      civilianTrust: d.civilianTrust,
    })),
    staff: STAFF_START.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      rank: s.rank,
      xp: s.xp,
      stats: { ...s.stats },
      health: 'healthy',
      fatigue: s.fatigue,
      salary: toCents(s.salary),
      adaptation: 0,
      patron: null,
      skills: [],
      training: null,
      implants: [],
      allegiance: allegianceStart(),
    })),
    squads: SQUADS_DEMO.map((s) => ({
      id: s.id,
      name: s.name,
      memberIds: [...(SQUAD_MEMBERS[s.id] ?? [])],
      status: s.status,
      currentNodeId: s.currentNodeId,
      assignedIncidentId: s.assignedIncidentId,
      movement: null,
      operation: null,
      commanderId: null,
    })),
    incidents,
    roadClosures: [],
    equipment: initialEquipment(),
    log: [{ id: 1, shift: 1, minute: 0, type: 'campaign_started', text: 'Вы приняли руководство Городской дирекцией безопасности.' }],
    reports: [],
    operationReports: [],
    medical: { patients: [] },
    candidates: [],
    relations: [],
    facilities: initialFacilities(),
    construction: [],
    research: [],
    resources: { reagents: RESEARCH.reagents.start },
    nextIds: { event: 2, transaction: 1, incident: 1, report: 1, staff: 13, candidate: 1 },
  };
  seedOperationsInProgress(state);
  refreshCandidates(state);
  initialRelations(state);
  return state;
}

/**
 * Демо-старт: «Вектор» уже на месте вооружённой вылазки (особое событие). Параметры его выезда
 * считаются той же формулой, что и обычная отправка, чтобы развязка шла по общим правилам.
 */
function seedOperationsInProgress(s: GameState) {
  for (const sq of s.squads) {
    if (sq.status !== 'on_scene' || !sq.assignedIncidentId) continue;
    const inc = s.incidents.find((i) => i.id === sq.assignedIncidentId);
    if (!inc) continue;
    const draft = { squadId: sq.id, incidentId: inc.id, tactic: 'arrest' as const, memberIds: [...sq.memberIds], commanderId: bestCommander(s, sq.memberIds), equipmentIds: [] };
    sq.operation = {
      incidentId: inc.id, tactic: draft.tactic, commanderId: draft.commanderId, equipmentIds: [], cohesion: 1,
      forecast: computeForecast(s, draft), riskLevel: riskLevel(s, draft),
      phase: 'scene', timer: 5, stageIndex: 0, pDelta: 0, riskDelta: 0, civil: 0, evidence: 0, decisions: [],
    };
  }
}
