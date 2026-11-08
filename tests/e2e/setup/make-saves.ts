import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialState } from '../../../src/core/state';
import { reduce } from '../../../src/core/reduce';
import { caseDef, openCaseFromReport } from '../../../src/core/investigations';
import { toSaveFile } from '../../../src/persistence/saveFormat';
import type { OperationReport } from '../../../src/core/types';

/** Сохранения для e2e: состояние собирается настоящим ядром (Playwright сам не грузит JSON-контент как модули). */
const r = reduce(createInitialState(7), { type: 'START_SHIFT' });
const s = structuredClone(r.state);
s.paused = true;
const d = caseDef('c1')!;
const report = { incidentId: 'missing', memberIds: [], tasks: [{ label: 'Сохранность улик', result: 'done' }] } as unknown as OperationReport;
openCaseFromReport(s, report, d.templateId, () => {});
mkdirSync('test-results/fixtures', { recursive: true });
writeFileSync('test-results/fixtures/case_c1.json', JSON.stringify(toSaveFile(s, 'e2e', new Date(0))));
