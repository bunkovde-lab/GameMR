import researchFile from '../../content/research_v1.json';
import { toCents } from './content';
import { researchCells } from './facilities';
import { nextFloat } from './rng';
import { dealReagents } from './politics';
import { caseTaskOf } from './selectors';
import type { GameState, Project, ProjectStatus, ResearchProtocol, Staff, StaffRole } from './types';

/**
 * W7 (часть 2): исследования (ТЗ §9.2, UI-18). Ветви пересекаются через требования; стадии потребляют
 * деньги и реагенты поэтапно; результат открывает изготовление или конкретную возможность, а не «+N%».
 */

export type BranchId = 'biology' | 'military' | 'counterintel' | 'analytics';
export interface ProjectDef {
  id: string; label: string; branch: BranchId; stages: number; costPerStage: number; reagentsPerStage: number;
  roles: StaffRole[]; requires: string[]; labLevel: number; result: string;
  effect?: { reagentSupply?: number; unlockOrgan?: string; forecastNarrow?: number };
  fabricate?: { typeId: string; cost: number; reagents: number; units: number };
}
interface ProtocolDef {
  label: string; costMult: number; stageDelta: number; hint: string; complication?: number;
  failBase?: number; failPerLabLevel?: number; failPerAnalysis?: number; failMin?: number; failMax?: number;
}
const R = researchFile as unknown as {
  reagents: { start: number; supplyPerShift: number; cap: number };
  branches: Record<BranchId, string>;
  protocols: Record<ResearchProtocol, ProtocolDef>;
  projects: ProjectDef[];
};
export const RESEARCH = R;
export const PROJECTS = R.projects;
export const PROTOCOL_IDS = Object.keys(R.protocols) as ResearchProtocol[];
export const BRANCHES = Object.keys(R.branches) as BranchId[];
export const projectDef = (id: string) => PROJECTS.find((p) => p.id === id);
const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
const DEPLOYED = ['en_route', 'on_scene', 'returning'];

export const stored = (s: GameState, id: string) => s.research.find((p) => p.id === id);
export const isDone = (s: GameState, id: string) => stored(s, id)?.status === 'completed';
const RUNNING: ProjectStatus[] = ['queued', 'active', 'blocked_inputs', 'blocked_staff'];
export const isRunning = (p: Project) => RUNNING.includes(p.status);
export const researchOf = (s: GameState, staffId: string) => s.research.find((p) => isRunning(p) && p.researcherId === staffId);

export const stagesFor = (d: ProjectDef, protocol: ResearchProtocol) => Math.max(1, d.stages + R.protocols[protocol].stageDelta);
export const stageCost = (d: ProjectDef, protocol: ResearchProtocol) => toCents(d.costPerStage * R.protocols[protocol].costMult);

/** Риск провала эксперимента: ниже с уровнем лаборатории и анализом исследователя (ТЗ §9.2). */
export function experimentalFail(s: GameState, researcher: Staff | undefined): number {
  const P = R.protocols.experimental;
  const lab = s.facilities.lab ?? 1;
  const analysis = researcher?.stats.analysis ?? 1;
  return clamp(P.failMin ?? 0, P.failMax ?? 1, (P.failBase ?? 0) - (P.failPerLabLevel ?? 0) * (lab - 1) - (P.failPerAnalysis ?? 0) * (analysis - 3));
}

export type ProjectView = { status: 'locked' | 'available' | ProjectStatus; reason: string | null };
export function projectView(s: GameState, id: string): ProjectView {
  const d = projectDef(id)!;
  const st = stored(s, id);
  if (st && st.status !== 'failed') return { status: st.status, reason: null };
  const missing = d.requires.filter((r) => !isDone(s, r)).map((r) => `«${projectDef(r)?.label}»`);
  if (missing.length) return { status: 'locked', reason: `Нужно завершить: ${missing.join(', ')}.` };
  if ((s.facilities.lab ?? 1) < d.labLevel) return { status: 'locked', reason: `Нужен лабораторный комплекс ур. ${d.labLevel}.` };
  return { status: st?.status === 'failed' ? 'failed' : 'available', reason: null };
}

/** Кто может вести проект: нужная должность, жив, не на задании, не в клинике, не на курсе, не занят другим проектом. */
export function researcherBlocker(s: GameState, projectId: string, staffId: string): string | null {
  const d = projectDef(projectId);
  const p = s.staff.find((x) => x.id === staffId);
  if (!d || !p) return 'Нет такого проекта или сотрудника.';
  if (!d.roles.includes(p.role)) return 'Не подходит по должности.';
  if (p.health === 'dead') return 'В архиве.';
  if (['serious_injury', 'critical', 'missing'].includes(p.health)) return 'Не допущен(а) по состоянию.';
  if (researchOf(s, p.id)) return 'Ведёт другой проект.';
  if (p.training) return 'На курсе.';
  if (caseTaskOf(s, p.id)) return 'Работает по делу.';
  if (s.medical.patients.some((x) => x.staffId === p.id)) return 'В клинике.';
  if (s.squads.some((q) => q.memberIds.includes(p.id) && DEPLOYED.includes(q.status))) return 'На задании.';
  return null;
}

export function startBlocker(s: GameState, projectId: string, protocol: ResearchProtocol, researcherId: string): string | null {
  const d = projectDef(projectId);
  if (!d) return 'Нет такого проекта.';
  if (!R.protocols[protocol]) return 'Нет такого протокола.';
  const v = projectView(s, projectId);
  if (v.status === 'locked') return v.reason;
  if (v.status !== 'available' && v.status !== 'failed') return 'Проект уже идёт или завершён.';
  return researcherBlocker(s, projectId, researcherId);
}

export function makeProject(s: GameState, projectId: string, protocol: ResearchProtocol, researcherId: string): Project {
  const d = projectDef(projectId)!;
  return { id: d.id, protocol, researcherId, status: 'queued', stagesDone: 0, stagesTotal: stagesFor(d, protocol), spent: 0, reagentsSpent: 0, startedShift: s.shift };
}

/** Ячейки лаборатории: идут первые N незавершённых проектов, остальные ждут. */
export function refreshResearch(s: GameState) {
  const cells = researchCells(s);
  let used = 0;
  for (const p of s.research) {
    if (!isRunning(p)) continue;
    if (used < cells) { if (p.status === 'queued') p.status = 'active'; used++; }
    else p.status = 'queued';
  }
}

export const reagentSupply = (s: GameState) =>
  R.reagents.supplyPerShift + dealReagents(s) + PROJECTS.filter((d) => isDone(s, d.id)).reduce((a, d) => a + (d.effect?.reagentSupply ?? 0), 0);

/** Между сменами: поставка реагентов, затем стадии проектов в ячейках. */
export function advanceResearch(s: GameState, pay: (amount: number, note: string) => boolean, log: (type: string, text: string, ids?: string[]) => void) {
  s.resources.reagents = Math.min(R.reagents.cap, s.resources.reagents + reagentSupply(s));
  refreshResearch(s);
  for (const p of s.research.filter((x) => isRunning(x) && x.status !== 'queued')) {
    const d = projectDef(p.id)!;
    const who = s.staff.find((x) => x.id === p.researcherId);
    const staffWhy = researcherBlocker({ ...s, research: s.research.filter((x) => x !== p) }, p.id, p.researcherId);
    if (staffWhy) {
      if (p.status !== 'blocked_staff') log('research_blocked', `«${d.label}»: работа стоит — исследователь недоступен (${staffWhy.toLowerCase().replace(/\.$/, '')}).`, who ? [who.id] : []);
      p.status = 'blocked_staff';
      continue;
    }
    const cost = stageCost(d, p.protocol);
    if (s.resources.reagents < d.reagentsPerStage || s.economy.balance < cost) {
      if (p.status !== 'blocked_inputs') log('research_blocked', `«${d.label}»: работа стоит — не хватает ${s.resources.reagents < d.reagentsPerStage ? 'реагентов' : 'средств'}.`);
      p.status = 'blocked_inputs';
      continue;
    }
    pay(-cost, `Исследование «${d.label}», этап ${p.stagesDone + 1}`);
    s.resources.reagents -= d.reagentsPerStage;
    p.spent += cost;
    p.reagentsSpent += d.reagentsPerStage;
    p.status = 'active';
    const proto = R.protocols[p.protocol];
    if (p.protocol === 'experimental') {
      const [v, n] = nextFloat(s.rng); s.rng = n;
      if (v < experimentalFail(s, who)) {
        p.status = 'failed';
        log('research_failed', `«${d.label}»: эксперимент провален на этапе ${p.stagesDone + 1}. Затраты не возвращаются.`, [p.researcherId]);
        continue;
      }
    } else if (proto.complication) {
      const [v, n] = nextFloat(s.rng); s.rng = n;
      if (v < proto.complication) {
        log('research_complication', `«${d.label}»: осложнение, этап ${p.stagesDone + 1} придётся повторить.`, [p.researcherId]);
        continue;
      }
    }
    p.stagesDone += 1;
    if (p.stagesDone >= p.stagesTotal) {
      p.status = 'completed';
      log('research_completed', `Исследование «${d.label}» завершено. ${d.result}`, [p.researcherId]);
    }
  }
  refreshResearch(s);
}

// ---------- Результаты ----------

export const forecastNarrow = (s: GameState) =>
  PROJECTS.filter((d) => isDone(s, d.id)).reduce((a, d) => a + (d.effect?.forecastNarrow ?? 0), 0);

export function fabricateBlocker(s: GameState, projectId: string): string | null {
  const d = projectDef(projectId);
  if (!d?.fabricate) return 'Этот результат не изготавливается.';
  if (!isDone(s, d.id)) return 'Исследование не завершено.';
  if (s.economy.balance < toCents(d.fabricate.cost)) return 'Недостаточно средств.';
  if (s.resources.reagents < d.fabricate.reagents) return 'Не хватает реагентов.';
  return null;
}
