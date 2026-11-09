import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/reduce';
import { caseDef, caseFile, openCaseFromReport } from '../../../src/core/investigations';
import { toSaveFile } from '../../../src/persistence/saveFormat';
import type { CaseFile, GameState, OperationReport } from '../../../src/core/types';

/** Сохранения для e2e: состояние собирается настоящим ядром (Playwright сам не грузит JSON-контент как модули). */
const fresh = () => {
  const s = structuredClone(reduce(createInitialState(7), { type: 'START_SHIFT' }).state);
  s.paused = true;
  return s;
};
const open = (s: GameState, id: string) => {
  const d = caseDef(id)!;
  if (s.shift < d.fromShift) s.shift = d.fromShift;
  const report = { incidentId: d.templateId, memberIds: [], tasks: [{ label: 'Сохранность улик', result: 'done' }] } as unknown as OperationReport;
  openCaseFromReport(s, report, d.templateId, () => {});
  return caseFile(s, id)!;
};
const put = (f: CaseFile, ids: string[], analysis: CaseFile['evidence'][number]['analysis'] = 'confirmed') => {
  for (const id of ids) {
    if (!f.evidence.some((e) => e.id === id)) f.evidence.push({ id, foundShift: 1, analysis: 'none', checks: 0, questionable: false });
    const ev = f.evidence.find((e) => e.id === id)!;
    ev.analysis = analysis;
    ev.checks = analysis === 'none' ? 0 : 1;
  }
};
const save = (name: string, s: GameState) => writeFileSync(`test-results/fixtures/${name}.json`, JSON.stringify(toSaveFile(s, 'e2e', new Date(0))));
mkdirSync('test-results/fixtures', { recursive: true });

// 1. Смена 1: только что открыто дело №418.
const s1 = fresh();
open(s1, 'c1');
save('case_c1', s1);

// 2. Смена 6: дело №418 решено, №431 открыто с уликами, окно операции «Контур 18», предложение Ашер.
const s6 = fresh();
const c1 = open(s6, 'c1');
put(c1, ['e01', 'e02', 'e03', 'e05', 'e06', 'e08']);
c1.status = 'concluded';
c1.decision = { conclusionId: 'audit', shift: 4 };
s6.shift = 6;
const c2 = open(s6, 'c2');
put(c2, ['e01', 'e04']);
put(c2, ['e02'], 'none');
save('mid_c2', s6);

// 3. Смена 9: дело №447 — реконструкция с подложным журналом клапанов.
const s9 = fresh();
s9.shift = 9;
const c3 = open(s9, 'c3');
put(c3, ['e05'], 'none');
save('case_c3', s9);

// 4. Конец смены 12: финал кампании.
const s12 = fresh();
s12.shift = 12;
const end = reduce(s12, { type: 'END_SHIFT' });
if (!end.ok) throw new Error(end.reason);
save('ending', end.state);

// 5. W10: три вызова в одной точке — кластер на карте.
const sc = fresh();
const base = sc.incidents.find((i) => i.templateId === 'missing')!;
for (const n of [1, 2]) sc.incidents.push({ ...structuredClone(base), id: `${base.id}-dup${n}`, title: `${base.title} (${n + 1})` });
save('cluster', sc);
