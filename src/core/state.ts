import { BALANCE, DISTRICTS, INCIDENT_TEMPLATES, SQUAD_MEMBERS, SQUADS_DEMO, STAFF_START, toCents } from './content';
import { seedRng } from './rng';
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

  return {
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
    })),
    squads: SQUADS_DEMO.map((s) => ({
      id: s.id,
      name: s.name,
      memberIds: [...(SQUAD_MEMBERS[s.id] ?? [])],
      status: s.status,
      currentNodeId: s.currentNodeId,
      assignedIncidentId: s.assignedIncidentId,
      movement: null,
    })),
    incidents,
    roadClosures: [],
    log: [{ id: 1, shift: 1, minute: 0, type: 'campaign_started', text: 'Вы приняли руководство Городской дирекцией безопасности.' }],
    reports: [],
    nextIds: { event: 2, transaction: 1, incident: 1 },
  };
}
