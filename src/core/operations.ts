import opsFile from '../../content/operations_v1.json';
import { SQUADS_DEMO } from './content';
import { DISPATCH_RULES, equipmentType, incidentProfile, tacticById } from './dispatch';
import { buildRoute } from './map/graph';
import { districtById } from './map/mapConfig';
import { nextFloat } from './rng';
import type {
  GameState, HealthState, Incident, OperationReport, Outcome, Squad, SquadOperation, Staff,
} from './types';

/**
 * W5: ход операции на месте и её исход (ТЗ §6.1, §6.3, §12).
 * Все случайные броски — через RNG из состояния, в фиксированном порядке (по ID сотрудников и снаряжения).
 */

export interface StageOption {
  id: string; label: string; hint: string; pDelta: number; riskDelta: number; minutes: number;
  civil: number; evidence: number; result: string; needsEquipment?: string; pDeltaWithout?: number;
}
export interface Stage { phase: string; title: string; text: string; options: StageOption[] }

export const OPS = opsFile as unknown as {
  sceneMinutes: Record<'routine' | 'complex' | 'special', number>;
  outcome: { successBelowP: number; partialBelowP: number; pMin: number; pMax: number };
  casualties: {
    contactByRisk: number[]; contactBonus: Record<Outcome, number>; injuryGivenContact: number; seriousGivenInjury: number;
    seriousPerFatiguePoint: number; deathGivenSerious: number; deathBonusOnFailure: number;
  };
  fatiguePerOperation: number;
  xp: Record<Outcome, number>;
  equipmentDamageOnContact: number;
  district: Record<Outcome, { safety: number; trust: number; threat: number }>;
  returnRestFatigue: number;
  stages: Record<string, Stage[]>;
};

export const stagesFor = (inc: Incident): Stage[] => OPS.stages[inc.templateId] ?? [];
export const homeNode = (sq: Squad) => SQUADS_DEMO.find((d) => d.id === sq.id)?.currentNodeId ?? sq.currentNodeId;

/** Отряд, ждущий решения игрока (DECISION_PAUSE, ТЗ §2.2). Пока он есть, время не идёт. */
export function pendingDecision(s: GameState): { squad: Squad; incident: Incident; stage: Stage; index: number; total: number } | null {
  for (const squad of s.squads) {
    const op = squad.operation;
    if (op?.phase !== 'decision') continue;
    const incident = s.incidents.find((i) => i.id === op.incidentId);
    if (!incident) continue;
    const stages = stagesFor(incident);
    const stage = stages[op.stageIndex];
    if (stage) return { squad, incident, stage, index: op.stageIndex, total: stages.length };
  }
  return null;
}

/** Есть ли у отряда нужное для варианта снаряжение. */
export function hasEquipment(s: GameState, op: SquadOperation, typeId: string) {
  return op.equipmentIds.some((id) => s.equipment.find((e) => e.id === id)?.typeId === typeId);
}

export function optionPDelta(s: GameState, op: SquadOperation, o: StageOption) {
  if (o.needsEquipment && !hasEquipment(s, op, o.needsEquipment)) return o.pDeltaWithout ?? o.pDelta;
  return o.pDelta;
}

/** Прибытие на место: развилки начинаются сразу, рядовое событие — по таймеру работы на месте. */
export function beginScene(sq: Squad, inc: Incident) {
  const op = sq.operation;
  if (!op) return;
  const cls = incidentProfile(inc).incidentClass;
  op.phase = stagesFor(inc).length ? 'decision' : 'scene';
  op.timer = OPS.sceneMinutes[cls] + tacticById(op.tactic).sceneMinutes;
}

/** Выбор варианта на развилке: тратит минуты, копит последствия. */
export function applyOption(s: GameState, sq: Squad, o: StageOption, stage: Stage) {
  const op = sq.operation!;
  op.pDelta += optionPDelta(s, op, o);
  op.riskDelta += o.riskDelta;
  op.civil += o.civil;
  op.evidence += o.evidence;
  op.decisions.push({ stage: stage.phase, label: o.label, result: o.result });
  op.stageIndex += 1;
  op.phase = 'scene';
  op.timer = Math.max(1, o.minutes);
}

/** Минута на месте. Возвращает отчёт, если операция завершилась. */
export function tickScene(s: GameState, sq: Squad): OperationReport | null {
  const op = sq.operation;
  if (!op || op.phase !== 'scene') return null;
  op.timer -= 1;
  if (op.timer > 0) return null;
  const inc = s.incidents.find((i) => i.id === op.incidentId);
  if (!inc) return null;
  if (op.stageIndex < stagesFor(inc).length) {
    op.phase = 'decision';
    return null;
  }
  return resolveOperation(s, sq, inc);
}

const roll = (s: GameState) => {
  const [v, next] = nextFloat(s.rng);
  s.rng = next;
  return v;
};
const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const worse = (h: HealthState, to: HealthState): HealthState => {
  const order: HealthState[] = ['healthy', 'fatigued', 'light_injury', 'recovering', 'serious_injury', 'critical', 'missing', 'dead'];
  return order.indexOf(to) > order.indexOf(h) ? to : h;
};

/** Развязка: исход, ранения, снаряжение, район, отчёт. */
export function resolveOperation(s: GameState, sq: Squad, inc: Incident): OperationReport {
  const op = sq.operation!;
  const p = clamp(OPS.outcome.pMin, OPS.outcome.pMax, op.forecast.p + op.pDelta);
  const r = roll(s);
  const outcome: Outcome = r < p + OPS.outcome.successBelowP ? 'success' : r < p + OPS.outcome.partialBelowP ? 'partial' : 'failure';

  // Потери: отдельные условные проверки контакт → ранение → тяжёлое → гибель (ТЗ §6.3).
  const C = OPS.casualties;
  const riskLevel = clamp(0, C.contactByRisk.length - 1, op.riskLevel + op.riskDelta);
  const members = [...sq.memberIds].sort().map((id) => s.staff.find((x) => x.id === id)).filter((x): x is Staff => !!x);
  const casualties: OperationReport['casualties'] = [];
  let anyContact = false;
  for (const m of members) {
    const before = m.health;
    if (roll(s) < C.contactByRisk[riskLevel]! + C.contactBonus[outcome]) {
      anyContact = true;
      if (roll(s) < C.injuryGivenContact) {
        const fatiguePts = Math.min(3, Math.floor(m.fatigue / DISPATCH_RULES.forecast.fatiguePerPoint));
        if (roll(s) < C.seriousGivenInjury + C.seriousPerFatiguePoint * fatiguePts) {
          const death = C.deathGivenSerious + (outcome === 'failure' ? C.deathBonusOnFailure : 0);
          m.health = roll(s) < death ? 'dead' : worse(m.health, 'serious_injury');
        } else {
          m.health = m.health === 'light_injury' ? 'serious_injury' : worse(m.health, 'light_injury');
        }
      }
    }
    m.fatigue = Math.min(100, m.fatigue + OPS.fatiguePerOperation);
    if (m.health !== 'dead') m.xp += OPS.xp[outcome];
    if (m.health !== before) casualties.push({ staffId: m.id, name: m.name, before, after: m.health });
  }

  // Снаряжение: расходник тратится при контакте или силовой тактике; многоразовое может пострадать.
  const equipment: OperationReport['equipment'] = [];
  for (const id of [...op.equipmentIds].sort()) {
    const u = s.equipment.find((e) => e.id === id);
    if (!u) continue;
    const t = equipmentType(u.typeId);
    if (t?.consumable) {
      if (anyContact || op.tactic === 'suppression') { u.state = 'consumed'; u.squadId = null; }
    } else if (anyContact && roll(s) < OPS.equipmentDamageOnContact) {
      u.state = 'damaged';
      u.squadId = null;
    }
    equipment.push({ id: u.id, label: t?.label ?? u.typeId, state: u.state === 'deployed' ? 'available' : u.state });
  }

  // Город: исход и решения меняют безопасность и доверие района.
  const d = s.districts.find((x) => x.id === inc.districtId);
  const eff = OPS.district[outcome];
  const civilScore = op.civil - (tacticById(op.tactic).civilianRisk - 1);
  const trustDelta = eff.trust + Math.sign(civilScore);
  if (d) {
    d.safety = clamp(0, 100, d.safety + eff.safety);
    d.civilianTrust = clamp(0, 100, d.civilianTrust + trustDelta);
    d.threat = Math.max(0, d.threat + eff.threat);
  }

  const goal = outcome === 'success' ? 'done' : outcome === 'partial' ? 'partial' : 'failed';
  const civil = civilScore > 0 ? 'done' : civilScore === 0 ? 'partial' : 'failed';
  const evidenceScore = op.evidence + (tacticById(op.tactic).evidence === 'сохраняются' ? 0 : -1);
  const evidence = evidenceScore > 0 ? 'done' : evidenceScore === 0 ? 'partial' : 'failed';
  inc.state = outcome === 'success' ? 'resolved_success' : outcome === 'partial' ? 'resolved_partial' : 'failed';

  const report: OperationReport = {
    id: s.nextIds.report++,
    shift: s.shift,
    minute: s.minute,
    incidentId: inc.id,
    incidentTitle: inc.title,
    squadId: sq.id,
    squadName: sq.name,
    tactic: op.tactic,
    outcome,
    decisions: op.decisions,
    tasks: [
      { label: 'Цель операции', result: goal },
      { label: 'Безопасность горожан', result: civil },
      { label: 'Сохранность улик', result: evidence },
    ],
    casualties,
    xp: OPS.xp[outcome],
    fatigue: OPS.fatiguePerOperation,
    equipment,
    district: { safety: eff.safety, trust: trustDelta },
    seen: false,
  };
  s.operationReports.push(report);

  // Погибшие уходят в архив: из отряда исключаются, запись — только через журнал.
  const dead = casualties.filter((c) => c.after === 'dead').map((c) => c.staffId);
  sq.memberIds = sq.memberIds.filter((id) => !dead.includes(id));

  // Возвращение на базу.
  const target = districtById(inc.districtId);
  sq.currentNodeId = target?.serviceNode ?? sq.currentNodeId;
  const route = buildRoute(sq.currentNodeId, homeNode(sq), s.roadClosures);
  sq.assignedIncidentId = null;
  op.phase = 'returning';
  if (!sq.memberIds.length) {
    finishReturn(s, sq);
    sq.status = 'unavailable';
  } else if (route && route.totalMinutes > 0) {
    sq.status = 'returning';
    sq.movement = { route, elapsed: 0, destinationIncidentId: '', aborted: false };
  } else {
    finishReturn(s, sq);
  }
  return report;
}

/** Отряд на базе: снаряжение на склад, при сильной усталости — отдых. */
export function finishReturn(s: GameState, sq: Squad) {
  for (const u of s.equipment) if (u.squadId === sq.id && u.state === 'deployed') { u.state = 'available'; u.squadId = null; }
  sq.movement = null;
  sq.operation = null;
  sq.assignedIncidentId = null;
  const ms = sq.memberIds.map((id) => s.staff.find((x) => x.id === id)).filter((x): x is Staff => !!x);
  const avg = ms.length ? ms.reduce((a, m) => a + m.fatigue, 0) / ms.length : 0;
  sq.status = !ms.length ? 'unavailable' : avg >= OPS.returnRestFatigue ? 'resting' : 'ready';
}
