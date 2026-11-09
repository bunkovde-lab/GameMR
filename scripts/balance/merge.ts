/** Сводит части прогонов: vite-node scripts/balance/merge.ts -- <out.json> <part1.json> [part2.json …] */
import { readFileSync, writeFileSync } from 'node:fs';
import { summarize, type RunResult } from './simulate';

const [out, ...parts] = process.argv.slice(2).filter((a) => a !== '--');
const results: RunResult[] = parts.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')) as RunResult[]);
const summary = summarize(results);
writeFileSync(out!, JSON.stringify({ runs: results.length, seeds: `1000…${999 + results.length}`, generated: 'scripts/balance/run.ts + merge.ts', summary }, null, 2) + '\n');
console.log(`runs: ${results.length}`);
