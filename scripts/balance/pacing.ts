/**
 * Опыт «постепенное усложнение» (не меняет игру): та же кампания настоящим ядром, но бот
 *  — может держать часть отрядов закрытыми (открываются по смене или по успехам);
 * Запуск: node_modules/.bin/vite-node scripts/balance/pacing.ts -- [runs]
 */
import { reduce } from '../../src/core/reduce';
import { dispatchAny } from './simulate';
import { createInitialState } from '../../src/core/state';
import { pendingDecision } from '../../src/core/operations';
import { activeOp } from '../../src/core/specialOps';
import { citySafety, isOpen } from '../../src/core/selectors';
import { treatmentForecast } from '../../src/core/staff';
import type { Command, GameState } from '../../src/core/types';

const SEV = { critical: 3, high: 2, medium: 1, low: 0 } as const;
const ORDER = ['axon', 'vector', 'sigma', 'cortex', 'resonance', 'omega'];

interface Variant {
  name: string;
  /** сколько отрядов открыто к смене n (null — все) */
  bySquadShift?: (shift: number) => number;
  /** сколько успехов нужно на открытие каждого следующего отряда */
  perSuccess?: number;
  /** отрядов на старте при открытии по успехам */
  base?: number;
  /** дополнительные случайные вызовы в смену (через те же шаблоны: копия одного из вызовов смены) */
}

function play(seed: number, v: Variant) {
  let s: GameState = createInitialState(seed);
  const run = (c: Command) => { const x = reduce(s, c); if (x.ok) s = x.state; return x.ok; };
  let open = v.bySquadShift ? v.bySquadShift(1) : v.perSuccess ? (v.base ?? 1) : 6;
  let successes = 0;
  const per = { late: 0, dispatched: 0, busy: 0, samples: 0, longestIdle: 0, idleShifts: 0, deaths: 0, success: 0, failure: 0 };
  for (let shift = 1; shift <= 12; shift++) {
    if (v.bySquadShift) open = Math.max(open, v.bySquadShift(shift));
    const allowed = new Set(ORDER.slice(0, open));
    const lateBefore = s.log.filter((l) => l.type === 'incident_escalated' || l.type === 'incident_expired').length;
    run({ type: 'START_SHIFT' });
    let guard = 0, lastAction = 0;
    while (s.phase === 'ACTIVE' && s.minute < 719 && guard++ < 4000) {
      const p = pendingDecision(s);
      if (p) { run({ type: 'CHOOSE_OPTION', squadId: p.squad.id, optionId: p.stage.options[0]!.id }); lastAction = s.minute; continue; }
      if (activeOp(s)) break;
      const openInc = s.incidents.filter((i) => isOpen(i) && ['new', 'acknowledged', 'escalated'].includes(i.state))
        .sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.deadlineMinute - b.deadlineMinute);
      for (const inc of openInc) {
        const next = dispatchAny(s, inc.id, allowed);
        if (next) {
          s = next;
          per.dispatched++; per.longestIdle = Math.max(per.longestIdle, s.minute - lastAction); lastAction = s.minute;
        }
      }
      for (const st of s.staff) {
        if (!['serious_injury', 'critical'].includes(st.health) || s.medical.patients.some((x) => x.staffId === st.id)) continue;
        if (!treatmentForecast(s, st.id, 'standard').blocker) run({ type: 'START_TREATMENT', staffId: st.id, plan: 'standard' });
      }
      per.busy += s.squads.filter((q) => allowed.has(q.id) && q.status !== 'ready').length; per.samples += allowed.size;
      if (s.paused) run({ type: 'RESUME' });
      if (!run({ type: 'TICK', minutes: Math.min(10, 719 - s.minute) })) break;
    }
    per.late += s.log.filter((l) => l.type === 'incident_escalated' || l.type === 'incident_expired').length - lateBefore;
    const ok = s.operationReports.filter((r) => r.shift === s.shift && r.outcome !== 'failure').length;
    successes += ok;
    if (v.perSuccess) open = Math.min(6, (v.base ?? 1) + Math.floor(successes / v.perSuccess));
    if (!run({ type: 'END_SHIFT' })) break;
    if (s.campaign.ending) break;
    run({ type: 'ADVANCE_SHIFT' });
  }
  const ops = s.operationReports;
  return {
    late: per.late, dispatched: per.dispatched, busy: per.samples ? (per.busy / per.samples) * 100 : 0,
    longestIdle: per.longestIdle, dead: s.staff.filter((p) => p.health === 'dead').length,
    success: ops.filter((r) => r.outcome === 'success').length, failure: ops.filter((r) => r.outcome === 'failure').length,
    safety: citySafety(s), squadsAtEnd: open,
  };
}

const VARIANTS: Variant[] = [
  { name: 'Вызовы в течение дня, 6 отрядов', },
  { name: 'Отряды по сменам (1,2,3,3,4,4,5,5,6…)', bySquadShift: (n) => [1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6][n - 1]! },
  { name: 'Новый отряд за каждые 3 закрытых вызова', perSuccess: 3 },
  { name: 'Новый отряд за каждые 5 закрытых вызовов', perSuccess: 5 },
  { name: 'Два отряда, третий за 4 закрытых вызова, далее за каждые 4', perSuccess: 4, base: 2 },
];
const runs = Number(process.argv.slice(2).filter((a) => a !== '--')[0] ?? 100);
const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
console.log('вариант | опозданий за кампанию | выездов | занятость отрядов % | самая долгая пауза без дел, мин | погибших | успех/провал | безопасность | отрядов к концу');
for (const v of VARIANTS) {
  const rs = Array.from({ length: runs }, (_, i) => play(1000 + i, v));
  console.log([v.name, avg(rs.map((r) => r.late)), avg(rs.map((r) => r.dispatched)), avg(rs.map((r) => r.busy)), avg(rs.map((r) => r.longestIdle)),
    avg(rs.map((r) => r.dead)), `${avg(rs.map((r) => r.success))}/${avg(rs.map((r) => r.failure))}`, avg(rs.map((r) => r.safety)), avg(rs.map((r) => r.squadsAtEnd))].join(' | '));
}
