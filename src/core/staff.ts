import staffFile from '../../content/staff_v1.json';
import { toCents } from './content';
import { candidatesPerVacancy, medicalCapacity } from './facilities';
import { nextFloat, nextInt } from './rng';
import type {
  Candidate, DossierStatus, GameState, HealthState, MedicalPlanId, Patient, Squad, Staff, StaffRole, Stats,
} from './types';

/**
 * W6 (часть 1): медицина (ТЗ §7.4), штат и назначения (§7.6, UI-14), найм (§7.6, UI-13).
 * Все случайные решения — через RNG состояния; UI только читает эти функции.
 */

export interface PlanDef {
  label: string; costMult: number; shifts: Partial<Record<HealthState, number>>; complication: number;
  needsCapsule: boolean; for: HealthState[]; hint: string;
}
export const STAFF_RULES = staffFile as unknown as {
  staffingTable: Record<StaffRole, number>;
  hireCost: Record<StaffRole, number>;
  salaryByRole: Record<StaffRole, number>;
  roleWeights: Record<StaffRole, Record<keyof Stats, number>>;
  candidatesPerVacancy: number;
  deepCheck: { cost: number; shifts: number };
  reportedNoise: number;
  adaptationShifts: number[];
  politicalFlagChance: number;
  houses: string[];
  names: string[];
  medical: { beds: number; capsules: number; baseCost: Partial<Record<HealthState, number>>; plans: Record<MedicalPlanId, PlanDef>; returnFatigue: number };
};
export const PLANS = STAFF_RULES.medical.plans;
export const PLAN_IDS = Object.keys(PLANS) as MedicalPlanId[];
const ROLES = Object.keys(STAFF_RULES.staffingTable).filter((k) => !k.startsWith('_')) as StaffRole[];
const STAT_KEYS: (keyof Stats)[] = ['reaction', 'analysis', 'control', 'resilience', 'authority'];
export const TREATABLE: HealthState[] = ['light_injury', 'serious_injury', 'critical'];

const roll = (s: GameState) => { const [v, n] = nextFloat(s.rng); s.rng = n; return v; };
const rint = (s: GameState, n: number) => { const [v, r] = nextInt(s.rng, n); s.rng = r; return v; };
const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

// ---------- Медицина ----------

export const patientOf = (s: GameState, staffId: string) => s.medical.patients.find((p) => p.staffId === staffId);
export const bedsUsed = (s: GameState) => s.medical.patients.filter((p) => p.status === 'treating').length;
export const capsulesUsed = (s: GameState) => s.medical.patients.filter((p) => p.status === 'treating' && PLANS[p.plan].needsCapsule).length;

export interface TreatmentForecast {
  cost: number; shifts: number; returnShift: number; complication: string; queued: boolean; blocker: string | null;
}

/** Прогноз лечения: стоимость, срок, ожидаемая смена возвращения и риск осложнения (не «0%», ТЗ §7.4). */
export function treatmentForecast(s: GameState, staffId: string, plan: MedicalPlanId): TreatmentForecast {
  const p = s.staff.find((x) => x.id === staffId);
  const def = PLANS[plan];
  const injury = p?.health ?? 'healthy';
  const shifts = def.shifts[injury] ?? 1;
  const cost = toCents((STAFF_RULES.medical.baseCost[injury] ?? 0) * def.costMult);
  const queued = bedsUsed(s) >= medicalCapacity(s).beds;
  const complication = def.complication < 0.1 ? 'низкий' : def.complication < 0.2 ? 'умеренный' : 'повышенный';
  let blocker: string | null = null;
  if (!p) blocker = 'Сотрудник не найден.';
  else if (!TREATABLE.includes(injury)) blocker = `${p.name} не нуждается в лечении.`;
  else if (!def.for.includes(injury)) blocker = `План «${def.label}» не показан при этом состоянии.`;
  else if (patientOf(s, staffId)) blocker = `${p.name} уже в клинике.`;
  else if (s.squads.some((q) => q.memberIds.includes(staffId) && ['en_route', 'on_scene', 'returning'].includes(q.status))) blocker = `${p.name} на задании.`;
  else if (def.needsCapsule && capsulesUsed(s) >= medicalCapacity(s).capsules) blocker = 'Нет свободной регенерационной капсулы.';
  else if (def.needsCapsule && queued) blocker = 'Нет свободного места для регенерации.';
  else if (!queued && s.economy.balance < cost) blocker = 'Недостаточно средств на лечение.';
  return { cost, shifts, returnShift: s.shift + shifts + (queued ? 1 : 0), complication, queued, blocker };
}

/** Смена закончилась: лечение идёт, осложнения возможны, освободившиеся места занимает очередь. */
export function advanceMedical(s: GameState, log: (type: string, text: string) => void, pay: (amount: number, note: string) => boolean) {
  for (const pt of [...s.medical.patients].sort((a, b) => a.staffId.localeCompare(b.staffId))) {
    if (pt.status !== 'treating') continue;
    const person = s.staff.find((x) => x.id === pt.staffId)!;
    pt.shiftsLeft -= 1;
    if (pt.shiftsLeft > 0) continue;
    if (roll(s) < PLANS[pt.plan].complication) {
      pt.shiftsLeft = 1;
      log('treatment_complication', `${person.name}: осложнение, ${pt.kind === 'implant' ? 'реабилитация' : 'лечение'} продлена на смену.`);
      continue;
    }
    s.medical.patients = s.medical.patients.filter((x) => x !== pt);
    person.fatigue = STAFF_RULES.medical.returnFatigue;
    if (pt.kind === 'implant' && pt.organId) {
      person.implants.push(pt.organId);
      log('implant_installed', `${person.name}: реабилитация завершена, орган интегрирован.`);
      continue;
    }
    person.health = 'healthy';
    log('treatment_finished', `${person.name} выписан(а) и вернулся(лась) к службе.`);
  }
  for (const pt of s.medical.patients.filter((x) => x.status === 'queued')) {
    if (bedsUsed(s) >= medicalCapacity(s).beds) break;
    if (PLANS[pt.plan].needsCapsule && capsulesUsed(s) >= medicalCapacity(s).capsules) continue;
    const person = s.staff.find((x) => x.id === pt.staffId)!;
    const cost = toCents((STAFF_RULES.medical.baseCost[pt.injury] ?? 0) * PLANS[pt.plan].costMult);
    if (!pay(-cost, `Лечение: ${person.name}`)) {
      log('treatment_unpaid', `${person.name}: нет средств, остаётся в очереди.`);
      continue;
    }
    pt.status = 'treating';
    log('treatment_started', `${person.name} принят(а) в клинику.`);
  }
}

export function admitPatient(s: GameState, staffId: string, plan: MedicalPlanId): Patient {
  const p = s.staff.find((x) => x.id === staffId)!;
  const f = treatmentForecast(s, staffId, plan);
  const pt: Patient = { staffId, plan, status: f.queued ? 'queued' : 'treating', shiftsLeft: f.shifts, injury: p.health, since: s.shift };
  s.medical.patients.push(pt);
  return pt;
}

// ---------- Штат и назначения ----------

export const squadOf = (s: GameState, staffId: string) => s.squads.find((q) => q.memberIds.includes(staffId));
export const reserve = (s: GameState) => s.staff.filter((p) => p.health !== 'dead' && !squadOf(s, p.id));

/** Командир отряда: назначенный, если годен, иначе старший по рангу. */
export function squadCommander(s: GameState, sq: Squad): Staff | undefined {
  const fixed = sq.commanderId && sq.memberIds.includes(sq.commanderId) ? s.staff.find((p) => p.id === sq.commanderId) : undefined;
  if (fixed) return fixed;
  return sq.memberIds.map((id) => s.staff.find((p) => p.id === id)!).filter(Boolean)
    .sort((a, b) => b.rank - a.rank || b.stats.authority - a.stats.authority || a.id.localeCompare(b.id))[0];
}

/** Дефицит штата (UI-14): отряды без годных людей, вакансии по ролям. */
export function vacancies(s: GameState): Record<StaffRole, number> {
  const out = {} as Record<StaffRole, number>;
  for (const r of ROLES) out[r] = Math.max(0, STAFF_RULES.staffingTable[r] - s.staff.filter((p) => p.role === r && p.health !== 'dead').length);
  return out;
}

// ---------- Найм ----------

/** Пригодность к вакансии считается по сведениям досье, а не по скрытым качествам (ТЗ §7.6). */
export function suitability(c: Candidate): { score: number; word: string; uncertain: boolean } {
  const w = STAFF_RULES.roleWeights[c.role];
  const total = STAT_KEYS.reduce((a, k) => a + w[k], 0);
  const score = STAT_KEYS.reduce((a, k) => a + w[k] * c.reported[k], 0) / total;
  const uncertain = STAT_KEYS.some((k) => w[k] >= 0.8 && c.dossier[k] !== 'verified' && c.dossier[k] !== 'reported');
  return { score: Math.round(score * 10) / 10, word: score >= 3.8 ? 'высокая' : score >= 3 ? 'средняя' : 'низкая', uncertain };
}

function makeCandidate(s: GameState, role: StaffRole): Candidate {
  const R = STAFF_RULES;
  const w = R.roleWeights[role];
  const stats = {} as Stats;
  const reported = {} as Stats;
  const dossier = {} as Record<keyof Stats, DossierStatus>;
  for (const k of STAT_KEYS) {
    const base = w[k] >= 0.8 ? 3 : 1;
    stats[k] = clamp(1, 5, base + rint(s, 3));
    const noise = rint(s, R.reportedNoise * 2 + 1) - R.reportedNoise;
    const st = rint(s, 10);
    dossier[k] = st < 4 ? 'reported' : st < 7 ? 'unverified' : st < 9 ? 'verified' : 'contested';
    reported[k] = dossier[k] === 'verified' ? stats[k] : clamp(1, 5, stats[k] + (dossier[k] === 'contested' ? -1 : noise));
  }
  const used = new Set([...s.staff.map((p) => p.name), ...s.candidates.map((c) => c.name)]);
  const free = R.names.filter((n) => !used.has(n));
  const name = free.length ? free[rint(s, free.length)]! : `Кандидат ${s.nextIds.candidate}`;
  const patron = roll(s) < R.politicalFlagChance ? R.houses[rint(s, R.houses.length)]! : null;
  return {
    id: `c${s.nextIds.candidate++}`, name, role, rank: 1 + rint(s, 2), stats, reported, dossier,
    hireCost: toCents(R.hireCost[role]), salary: toCents(R.salaryByRole[role]),
    adaptation: R.adaptationShifts[rint(s, R.adaptationShifts.length)]!, patron, patronKnown: false, check: 'none',
  };
}

/** Кандидаты появляются только под открытые вакансии; уже рассмотренные не пропадают. */
export function refreshCandidates(s: GameState) {
  const open = vacancies(s);
  s.candidates = s.candidates.filter((c) => open[c.role] > 0);
  for (const r of ROLES) {
    if (open[r] <= 0 || s.candidates.some((c) => c.role === r)) continue;
    for (let i = 0; i < candidatesPerVacancy(s); i++) s.candidates.push(makeCandidate(s, r));
  }
}

/** Глубокая проверка готова к следующей смене: досье подтверждается, обязательства вскрываются. */
export function completeChecks(s: GameState, log: (type: string, text: string) => void) {
  for (const c of s.candidates) {
    if (c.check !== 'pending') continue;
    c.check = 'done';
    for (const k of STAT_KEYS) { c.dossier[k] = 'verified'; c.reported[k] = c.stats[k]; }
    c.patronKnown = true;
    log('candidate_checked', `Проверка кандидата ${c.name} завершена${c.patron ? `: выявлена рекомендация (${c.patron})` : ''}.`);
  }
}

export function hireCandidate(s: GameState, c: Candidate): Staff {
  const n = s.nextIds.staff++;
  const person: Staff = {
    id: `p${n}`, name: c.name, role: c.role, rank: c.rank, xp: 0, stats: { ...c.stats }, health: 'healthy', fatigue: 10,
    salary: c.salary, adaptation: c.adaptation, patron: c.patron,
    skills: [], training: null, implants: [], allegiance: { state: 55, house: 50, directorate: 50 },
  };
  s.staff.push(person);
  s.candidates = s.candidates.filter((x) => x.id !== c.id);
  if (vacancies(s)[c.role] <= 0) s.candidates = s.candidates.filter((x) => x.role !== c.role);
  return person;
}
