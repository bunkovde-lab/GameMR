import opsFile from '../../content/special_ops_v1.json';
import { BALANCE } from './content';
import { memberBlocker } from './dispatch';
import { hasFlag, setFlag } from './flags';
import { applyEffect, caseDef, caseFile, type Effect } from './investigations';
import { hasAccess, makePermit } from './politics';
import { nextFloat } from './rng';
import type { GameState, HealthState, Outcome, SpecialOpReport, SpecialOpState } from './types';

/**
 * W9: особые операции (ТЗ §12, сценарий §5–6). Фазы подход → контакт → кризис → разрешение → отчёт.
 * Пока идёт выбор, время стоит; подтверждённый выбор тратит время. Каждая цель оценивается отдельно.
 */

export interface OpOption {
  id: string; label: string; text: string; scores: Record<string, number>; risk: number;
  requires?: 'judicial' | 'interagency'; requiresText?: string; emergency?: boolean; flags?: string[]; effects?: Effect;
}
export interface OpDef {
  id: string; title: string; caseId: string; fromShift: number; toShift: number; art: string; brief: string;
  objectives: { id: string; label: string }[];
  phases: { id: string; label: string; options: OpOption[] }[];
  success: { flags?: string[]; evidence?: string[]; effects?: Effect };
  failure: { flags?: string[]; effects?: Effect };
  missed: { text: string; flags?: string[]; effects?: Effect };
}
interface Rules { minMembers: number; phaseMinutes: number; doneAt: number; partialAt: number; injuryPerRisk: number; seriousShare: number; deathShareOfSerious: number; statBonusEvery: number }

export const OP_RULES = opsFile.rules as Rules;
export const SPECIAL_OPS = opsFile.ops as unknown as OpDef[];
export const opDef = (id: string) => SPECIAL_OPS.find((o) => o.id === id);
export const opState = (s: GameState, id: string) => s.campaign.ops.find((o) => o.id === id);
export const activeOp = (s: GameState) => s.campaign.ops.find((o) => o.status === 'active');
export const unseenOpReport = (s: GameState) => s.campaign.ops.find((o) => o.status === 'done' && o.report && !o.report.seen);

const roll = (s: GameState) => {
  const [v, next] = nextFloat(s.rng);
  s.rng = next;
  return v;
};
type Post = (amount: number, note: string) => void;
type Log = (type: string, text: string, ids?: string[]) => void;

/** Операция доступна в своём окне смен, если дело открыто (ключ — факт вызова, а не «правильная догадка»). */
export function opAvailability(s: GameState, id: string): { open: boolean; why: string | null } {
  const d = opDef(id);
  if (!d) return { open: false, why: 'Нет такой операции.' };
  if (opState(s, id)) return { open: false, why: 'Операция уже проведена.' };
  if (hasFlag(s, `${id}_missed`)) return { open: false, why: 'Окно операции закрылось.' };
  if (s.shift < d.fromShift) return { open: false, why: `Откроется на смене ${d.fromShift}.` };
  if (s.shift > d.toShift) return { open: false, why: 'Окно операции закрылось.' };
  if (!caseFile(s, d.caseId)) return { open: false, why: `Сначала нужно дело №${caseDef(d.caseId)?.number}: выезд на вызов.` };
  return { open: true, why: null };
}

export const fitMembers = (s: GameState, squadId: string) =>
  (s.squads.find((q) => q.id === squadId)?.memberIds ?? []).filter((id) => !memberBlocker(s, id, squadId));

export function startOpBlocker(s: GameState, id: string, squadId: string): string | null {
  const a = opAvailability(s, id);
  if (!a.open) return a.why;
  if (s.phase !== 'ACTIVE') return 'Операцию можно начать только во время смены.';
  if (activeOp(s)) return 'Уже идёт другая особая операция.';
  const sq = s.squads.find((q) => q.id === squadId);
  if (!sq) return 'Нет такого отряда.';
  if (sq.status !== 'ready') return 'Отряд не готов.';
  if (fitMembers(s, squadId).length < OP_RULES.minMembers) return `Нужно не меньше ${OP_RULES.minMembers} годных к выезду.`;
  return null;
}

export function startOp(s: GameState, id: string, squadId: string, log: Log): SpecialOpState {
  const d = opDef(id)!;
  const memberIds = fitMembers(s, squadId);
  const op: SpecialOpState = {
    id, squadId, memberIds, startedShift: s.shift, phase: 0, choices: [], risk: 0, status: 'active',
    scores: Object.fromEntries(d.objectives.map((o) => [o.id, 0])),
  };
  s.campaign.ops.push(op);
  const sq = s.squads.find((q) => q.id === squadId)!;
  sq.status = 'on_scene';
  s.paused = true;
  log('special_op_started', `Особая операция «${d.title}»: отряд «${sq.name}» выдвинулся.`, memberIds);
  return op;
}

/** Законность варианта: ордер или допуск по делу, договор с Домом или решение кампании. */
export function optionBlocker(s: GameState, op: SpecialOpState, optionId: string): string | null {
  const d = opDef(op.id)!;
  const phase = d.phases[op.phase];
  const o = phase?.options.find((x) => x.id === optionId);
  if (!phase || !o) return 'Нет такого варианта.';
  if (o.requires) {
    const has = s.politics.permits.some((p) => p.caseId === d.caseId && p.kind === o.requires && (p.status === 'granted' || p.status === 'used'))
      || (o.requires === 'interagency' && (hasAccess(s, caseDef(d.caseId)!.houseId) || hasFlag(s, `access_${caseDef(d.caseId)!.houseId}`)));
    if (!has) return o.requiresText ?? 'Нет законного основания.';
  }
  return null;
}

export function chooseOpOption(s: GameState, op: SpecialOpState, optionId: string, post: Post, log: Log) {
  const d = opDef(op.id)!;
  const phase = d.phases[op.phase]!;
  const o = phase.options.find((x) => x.id === optionId)!;
  op.choices.push(o.id);
  for (const [k, v] of Object.entries(o.scores)) op.scores[k] = (op.scores[k] ?? 0) + v;
  op.risk += o.risk;
  for (const f of o.flags ?? []) setFlag(s, f);
  applyEffect(s, caseDef(d.caseId)!, o.effects, post, `Операция «${d.title}»`);
  if (o.emergency) {
    const inc = s.incidents.find((i) => i.id === caseFile(s, d.caseId)?.incidentId);
    if (inc) {
      const p = makePermit(s, inc, 'emergency', 'suppression');
      p.target = `Операция «${d.title}»: ${o.label.toLowerCase()}`;
      s.politics.permits.push(p);
    }
    log('emergency_used', `Операция «${d.title}»: чрезвычайное основание под ответственность руководителя. Проверка на следующей смене.`);
  }
  s.minute = Math.min(BALANCE.shift.lengthMinutes - 1, s.minute + OP_RULES.phaseMinutes);
  log('special_op_choice', `«${d.title}», ${phase.label.toLowerCase()}: ${o.label.toLowerCase()}.`, op.memberIds);
  op.phase += 1;
  if (op.phase >= d.phases.length) resolveOp(s, op, post, log);
}

const WORSE: HealthState[] = ['healthy', 'fatigued', 'light_injury', 'recovering', 'serious_injury', 'critical', 'missing', 'dead'];
const worse = (h: HealthState, to: HealthState): HealthState => (WORSE.indexOf(to) > WORSE.indexOf(h) ? to : h);

function resolveOp(s: GameState, op: SpecialOpState, post: Post, log: Log) {
  const d = opDef(op.id)!;
  const R = OP_RULES;
  const members = op.memberIds.map((id) => s.staff.find((p) => p.id === id)!).filter(Boolean);
  // Потери: каждый рискованный выбор повышает шанс ранения; выучка (реакция + контроль) снижает тяжесть.
  const casualties: SpecialOpReport['casualties'] = [];
  for (const m of [...members].sort((a, b) => a.id.localeCompare(b.id))) {
    const before = m.health;
    if (roll(s) < R.injuryPerRisk * op.risk) {
      const serious = roll(s) < R.seriousShare + (op.risk >= 6 ? 0.15 : 0) - (m.stats.control >= 4 ? 0.1 : 0);
      if (serious) m.health = roll(s) < R.deathShareOfSerious ? 'dead' : worse(m.health, 'serious_injury');
      else m.health = m.health === 'light_injury' ? 'serious_injury' : worse(m.health, 'light_injury');
    }
    m.fatigue = Math.min(100, m.fatigue + 25);
    if (m.health !== 'dead') m.xp += 20;
    if (m.health !== before) casualties.push({ staffId: m.id, name: m.name, before, after: m.health });
  }
  const dead = casualties.filter((c) => c.after === 'dead').length;
  const hurt = casualties.length - dead;
  const quality = members.length ? members.reduce((a, m) => a + m.stats.reaction + m.stats.control, 0) / (2 * members.length) : 0;

  const objectives: SpecialOpReport['objectives'] = d.objectives.map((o) => {
    let v = op.scores[o.id] ?? 0;
    if (o.id === 'staff') v += dead ? -3 : hurt ? -1 : 1;
    else if (roll(s) < 0.5) v += quality >= R.statBonusEvery ? 1 : 0;
    else if (roll(s) < 0.25) v -= 1;
    return { id: o.id, label: o.label, result: v >= R.doneAt ? 'done' : v >= R.partialAt ? 'partial' : 'failed' };
  });
  const failed = objectives.filter((o) => o.result === 'failed').length;
  const done = objectives.filter((o) => o.result === 'done').length;
  const outcome: Outcome = failed === 0 && done >= 3 ? 'success' : failed >= 3 ? 'failure' : 'partial';
  const c = caseDef(d.caseId)!;
  const notes: string[] = [];
  if (outcome !== 'failure') {
    for (const f of d.success.flags ?? []) setFlag(s, f);
    applyEffect(s, c, d.success.effects, post, `Операция «${d.title}»`);
    const file = caseFile(s, d.caseId);
    if (file && objectives.find((o) => o.id === 'evidence')?.result === 'done') {
      for (const id of d.success.evidence ?? []) {
        if (file.evidence.some((e) => e.id === id)) continue;
        file.evidence.push({ id, foundShift: s.shift, analysis: 'none', checks: 0, questionable: objectives.find((o) => o.id === 'legality')?.result === 'failed' });
        notes.push(`В дело №${c.number} попала улика из операции.`);
      }
    }
  } else {
    for (const f of d.failure.flags ?? []) setFlag(s, f);
    applyEffect(s, c, d.failure.effects, post, `Операция «${d.title}»`);
  }
  if (objectives.find((o) => o.id === 'legality')?.result === 'failed') notes.push('Законность действий под вопросом: суд и проверка учтут это.');
  op.status = 'done';
  op.report = { outcome, objectives, casualties, notes, seen: false };
  const sq = s.squads.find((q) => q.id === op.squadId);
  if (sq) {
    sq.memberIds = sq.memberIds.filter((id) => s.staff.find((p) => p.id === id)?.health !== 'dead');
    sq.status = 'resting';
  }
  const word = outcome === 'success' ? 'успешно' : outcome === 'partial' ? 'частично' : 'провалена';
  log('special_op_done', `Особая операция «${d.title}» завершена: ${word}.`, op.memberIds);
  for (const x of casualties) log(x.after === 'dead' ? 'staff_killed' : 'staff_injured', `${x.name}: ${x.after === 'dead' ? 'погиб(ла) в операции' : 'ранен(а) в операции'}.`, [x.staffId]);
}

/** Между сменами: просроченные окна операций — тоже последствие (сценарий §7). */
export function advanceOps(s: GameState, post: Post, log: Log) {
  for (const d of SPECIAL_OPS) {
    if (opState(s, d.id) || hasFlag(s, `${d.id}_missed`) || s.shift <= d.toShift) continue;
    setFlag(s, `${d.id}_missed`);
    for (const f of d.missed.flags ?? []) setFlag(s, f);
    applyEffect(s, caseDef(d.caseId)!, d.missed.effects, post, `Операция «${d.title}»`);
    log('special_op_missed', d.missed.text);
  }
}
