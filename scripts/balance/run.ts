/**
 * Запуск: node_modules/.bin/vite-node scripts/balance/run.ts -- <runs> <out.json> [first]
 * Прогоны first…first+runs−1 (зерно = 1000 + номер, стратегия = номер mod 3). Несколько частей сводит merge.ts.
 */
import { writeFileSync } from 'node:fs';
import { simulate, type Policy, type RunResult } from './simulate';

const args = process.argv.slice(2).filter((a) => a !== '--');
const runs = Number(args[0] ?? 100);
const out = args[1] ?? 'balance_part.json';
const first = Number(args[2] ?? 0);
const policies: Policy[] = ['idle', 'dispatch', 'full'];
const results: RunResult[] = [];
const t0 = Date.now();
for (let i = first; i < first + runs; i++) {
  results.push(simulate(1000 + i, policies[i % 3]!));
  if ((i - first + 1) % 250 === 0) console.error(`${i - first + 1}/${runs} · ${Math.round((Date.now() - t0) / 1000)} с`);
}
writeFileSync(out, JSON.stringify(results));
