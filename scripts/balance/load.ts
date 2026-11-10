/**
 * Нагрузка по сменам: сколько вызовов приходит, когда, сколько отрядов свободно, сколько вызовов успели взять.
 * Бот «dispatch» (как в simulate.ts) играет кампанию настоящим ядром.
 * Запуск: node_modules/.bin/vite-node scripts/balance/load.ts -- [runs]
 */
import { reduce } from '../../src/core/reduce';
import { treatmentForecast } from '../../src/core/staff';
import { dispatchAny } from './simulate';
import { createInitialState } from '../../src/core/state';
import { pendingDecision } from '../../src/core/operations';
import { activeOp } from '../../src/core/specialOps';
import { isOpen } from '../../src/core/selectors';
import type { Command, GameState } from '../../src/core/types';

const SEV = { critical: 3, high: 2, medium: 1, low: 0 } as const;
const runs = Number(process.argv.slice(2).filter((a) => a !== '--')[0] ?? 50);
type Row = { arrived: number; arrivedAtStart: number; readySquadsAtStart: number; busyShare: number; maxOpen: number; dispatched: number; late: number; firstGap: number[]; ops: number; deaths: number };
const rows: Row[][] = Array.from({ length: 12 }, () => []);

for (let r = 0; r < runs; r++) {
  let s: GameState = createInitialState(1000 + r);
  const run = (c: Command) => { const x = reduce(s, c); if (x.ok) s = x.state; return x.ok; };
  for (let shift = 1; shift <= 12; shift++) {
    const before = new Set(s.incidents.map((i) => i.id));
    const startIds = s.incidents.filter((i) => isOpen(i) && i.createdShift === s.shift).length;
    const ready = s.squads.filter((q) => q.status === 'ready').length;
    const lateBefore = s.log.filter((l) => l.type === 'incident_escalated' || l.type === 'incident_expired').length;
    const opsBefore = s.operationReports.length;
    const deadBefore = s.staff.filter((p) => p.health === 'dead').length;
    run({ type: 'START_SHIFT' });
    let busy = 0, samples = 0, maxOpen = 0, dispatched = 0, guard = 0;
    const waits: number[] = [];
    while (s.phase === 'ACTIVE' && s.minute < 719 && guard++ < 4000) {
      const p = pendingDecision(s);
      if (p) { run({ type: 'CHOOSE_OPTION', squadId: p.squad.id, optionId: p.stage.options[0]!.id }); continue; }
      if (activeOp(s)) break;
      const open = s.incidents.filter((i) => isOpen(i) && ['new', 'acknowledged', 'escalated'].includes(i.state))
        .sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.deadlineMinute - b.deadlineMinute);
      maxOpen = Math.max(maxOpen, open.length);
      for (const inc of open) {
        const next = dispatchAny(s, inc.id);
        if (next) { s = next; dispatched++; waits.push(s.minute); }
      }
      for (const st of s.staff) {
        if (!['serious_injury', 'critical'].includes(st.health) || s.medical.patients.some((x) => x.staffId === st.id)) continue;
        if (!treatmentForecast(s, st.id, 'standard').blocker) run({ type: 'START_TREATMENT', staffId: st.id, plan: 'standard' });
      }
      busy += s.squads.filter((q) => q.status !== 'ready').length; samples += s.squads.length;
      if (s.paused) run({ type: 'RESUME' }); // новый вызов поставил паузу — бот уже отреагировал выше
      if (!run({ type: 'TICK', minutes: Math.min(10, 719 - s.minute) })) break;
    }
    rows[shift - 1]!.push({
      arrived: s.incidents.filter((i) => !before.has(i.id)).length + startIds,
      arrivedAtStart: startIds,
      readySquadsAtStart: ready,
      busyShare: samples ? busy / samples : 0,
      maxOpen, dispatched,
      late: s.log.filter((l) => l.type === 'incident_escalated' || l.type === 'incident_expired').length - lateBefore,
      firstGap: waits,
      ops: s.operationReports.length - opsBefore,
      deaths: s.staff.filter((p) => p.health === 'dead').length - deadBefore,
    });
    if (!run({ type: 'END_SHIFT' })) break;
    if (s.campaign.ending) break;
    run({ type: 'ADVANCE_SHIFT' });
  }
}
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
console.log('смена | вызовов | из них сразу | готовых отрядов | занятость отрядов % | пик открытых | отправок | опозданий | последняя отправка, мин | гибель');
rows.forEach((rs, i) => {
  if (!rs.length) return;
  console.log([i + 1, avg(rs.map((r) => r.arrived)), avg(rs.map((r) => r.arrivedAtStart)), avg(rs.map((r) => r.readySquadsAtStart)),
    avg(rs.map((r) => r.busyShare * 100)), avg(rs.map((r) => r.maxOpen)), avg(rs.map((r) => r.dispatched)), avg(rs.map((r) => r.late)),
    avg(rs.map((r) => (r.firstGap.length ? Math.max(...r.firstGap) : 0))), avg(rs.map((r) => r.deaths))].join(' | '));
});
