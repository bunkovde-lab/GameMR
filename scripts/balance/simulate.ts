/**
 * W10: балансные прогоны (ТЗ §16, «10k+ балансных прогонов»). Бот играет кампанию из 12 смен настоящим ядром
 * (reduce) и собирает итоги. Стратегии бота — грубые модели игрока, не «правильная игра».
 *
 * Запуск: node_modules/.bin/vite-node scripts/balance/run.ts -- [runs] [out.json]
 */
import { reduce } from '../../src/core/reduce';
import { dispatchBlocker } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { pendingDecision } from '../../src/core/operations';
import { storyNode } from '../../src/core/campaign';
import { SPECIAL_OPS, activeOp, opAvailability, opDef, optionBlocker, startOpBlocker } from '../../src/core/specialOps';
import { treatmentForecast } from '../../src/core/staff';
import { citySafety, cityTrust, isOpen } from '../../src/core/selectors';
import type { Command, GameState } from '../../src/core/types';

const SEV = { critical: 3, high: 2, medium: 1, low: 0 } as const;

export type Policy = 'idle' | 'dispatch' | 'full';
export interface RunResult {
  policy: Policy; seed: number; shiftsPlayed: number; balance: number; minBalance: number; unpaid: number;
  safety: number; trust: number; dead: number; injured: number; staffAlive: number;
  operations: { success: number; partial: number; failure: number }; openIncidents: number; escalated: number; expired: number;
  ending: string | null; casesOpened: number; opsDone: number; opsFailed: number; violations: number; rejected: number;
}

/** Детерминированный выбор бота (своё зерно, чтобы не трогать генератор игры). */
function botRng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

export function simulate(seed: number, policy: Policy): RunResult {
  const pick = botRng(seed + 17);
  let s: GameState = createInitialState(seed);
  let rejected = 0;
  let minBalance = s.economy.balance;
  const run = (c: Command) => {
    const r = reduce(s, c);
    if (r.ok) s = r.state;
    else rejected++;
    return r.ok;
  };
  const choose = <T,>(xs: T[]) => xs[Math.floor(pick() * xs.length)]!;

  for (let shift = 1; shift <= 12; shift++) {
    if (policy === 'full') {
      const n = storyNode(s.shift);
      if (n?.options?.length) run({ type: 'STORY_CHOICE', shift: s.shift, optionId: choose(n.options).id });
    }
    run({ type: 'START_SHIFT' });
    let guard = 0;
    while (s.phase === 'ACTIVE' && s.minute < 719 && guard++ < 2000) {
      const p = pendingDecision(s);
      if (p) {
        const opts = p.stage.options.map((o) => o.id);
        run({ type: 'CHOOSE_OPTION', squadId: p.squad.id, optionId: policy === 'full' ? choose(opts) : opts[0]! });
        continue;
      }
      const op = activeOp(s);
      if (op) {
        const d = opDef(op.id)!;
        const allowed = d.phases[op.phase]!.options.filter((o) => !optionBlocker(s, op, o.id));
        run({ type: 'SPECIAL_OP_CHOICE', opId: op.id, optionId: choose(allowed).id });
        continue;
      }
      if (policy !== 'idle') {
        // Отправить готовые отряды на открытые вызовы: сначала самые тяжёлые и срочные.
        const open = s.incidents.filter((i) => isOpen(i) && ['new', 'acknowledged', 'escalated'].includes(i.state))
          .sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.deadlineMinute - b.deadlineMinute);
        for (const inc of open) {
          const sq = s.squads.find((q) => !dispatchBlocker(s, q, inc));
          if (sq) run({ type: 'DISPATCH_SQUAD', squadId: sq.id, incidentId: inc.id });
        }
        for (const p of s.staff) {
          if (!['serious_injury', 'critical'].includes(p.health) || s.medical.patients.some((x) => x.staffId === p.id)) continue;
          if (!treatmentForecast(s, p.id, 'standard').blocker) run({ type: 'START_TREATMENT', staffId: p.id, plan: 'standard' });
        }
      }
      if (policy === 'full') {
        for (const o of SPECIAL_OPS) {
          if (!opAvailability(s, o.id).open || activeOp(s)) continue;
          const sq = s.squads.find((q) => !startOpBlocker(s, o.id, q.id));
          if (sq && pick() < 0.5) run({ type: 'START_SPECIAL_OP', opId: o.id, squadId: sq.id });
        }
      }
      if (activeOp(s)) continue;
      if (!run({ type: 'TICK', minutes: Math.min(30, 719 - s.minute) })) break;
      minBalance = Math.min(minBalance, s.economy.balance);
    }
    if (!run({ type: 'END_SHIFT' })) break;
    minBalance = Math.min(minBalance, s.economy.balance);
    if (s.campaign.ending) break;
    run({ type: 'ADVANCE_SHIFT' });
  }
  const ops = s.operationReports;
  return {
    policy, seed, shiftsPlayed: s.shift, balance: s.economy.balance / 100, minBalance: minBalance / 100, unpaid: s.economy.unpaidObligations / 100,
    safety: citySafety(s), trust: cityTrust(s),
    dead: s.staff.filter((p) => p.health === 'dead').length,
    injured: s.staff.filter((p) => ['light_injury', 'serious_injury', 'critical'].includes(p.health)).length,
    staffAlive: s.staff.filter((p) => p.health !== 'dead').length,
    operations: { success: ops.filter((r) => r.outcome === 'success').length, partial: ops.filter((r) => r.outcome === 'partial').length, failure: ops.filter((r) => r.outcome === 'failure').length },
    openIncidents: s.incidents.filter(isOpen).length, escalated: s.incidents.filter((i) => i.state === 'escalated').length, expired: s.incidents.filter((i) => i.state === 'expired').length,
    ending: s.campaign.ending, casesOpened: s.investigations.cases.length,
    opsDone: s.campaign.ops.filter((o) => o.report && o.report.outcome !== 'failure').length,
    opsFailed: s.campaign.ops.filter((o) => o.report?.outcome === 'failure').length,
    violations: s.politics.violations.length, rejected,
  };
}

// ---------- Сводка ----------

const pct = (xs: number[], q: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))] ?? 0;
};
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

export function summarize(results: RunResult[]) {
  const by: Record<string, unknown> = {};
  for (const policy of ['idle', 'dispatch', 'full'] as Policy[]) {
    const r = results.filter((x) => x.policy === policy);
    if (!r.length) continue;
    const num = (f: (x: RunResult) => number) => ({ avg: avg(r.map(f)), p10: pct(r.map(f), 0.1), p50: pct(r.map(f), 0.5), p90: pct(r.map(f), 0.9) });
    const share = (f: (x: RunResult) => boolean) => Math.round((r.filter(f).length / r.length) * 1000) / 10;
    by[policy] = {
      runs: r.length,
      finishedCampaign: share((x) => x.ending !== null),
      endings: Object.fromEntries(['order', 'cost', 'collapse'].map((e) => [e, share((x) => x.ending === e)])),
      balance: num((x) => x.balance), minBalance: num((x) => x.minBalance), wentNegativeOrDebt: share((x) => x.unpaid > 0 || x.minBalance < 0),
      safety: num((x) => x.safety), trust: num((x) => x.trust),
      dead: num((x) => x.dead), anyDeath: share((x) => x.dead > 0), injuredAtEnd: num((x) => x.injured),
      opsSuccess: num((x) => x.operations.success), opsPartial: num((x) => x.operations.partial), opsFailure: num((x) => x.operations.failure),
      openIncidentsAtEnd: num((x) => x.openIncidents), escalatedAtEnd: num((x) => x.escalated), expiredAtEnd: num((x) => x.expired ?? 0),
      casesOpened: num((x) => x.casesOpened), specialOpsDone: num((x) => x.opsDone), violations: num((x) => x.violations),
    };
  }
  return by;
}

