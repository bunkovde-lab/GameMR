import { describe, expect, it } from 'vitest';
import { organBlocker } from '../../src/core/career';
import { computeForecast, defaultDraft, memberBlocker } from '../../src/core/dispatch';
import { reduce } from '../../src/core/reduce';
import { experimentalFail, projectView, startBlocker } from '../../src/core/research';
import { createInitialState } from '../../src/core/state';
import { parseSave } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const nextShift = (s: GameState) => ok(ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
const proj = (s: GameState, id: string) => s.research.find((p) => p.id === id)!;

describe('W7.2 research (ТЗ §9.2)', () => {
  it('locked → available follows prerequisites and lab level; branches cross', () => {
    const s = started();
    expect(projectView(s, 'bio_reagents').status).toBe('available');
    expect(projectView(s, 'porog').reason).toMatch(/Стабилизация реагентов/);
    expect(projectView(s, 'bio_procedure').reason).toMatch(/Модель оперативного прогноза/); // биология требует аналитику
    s.research.push({ id: 'bio_reagents', protocol: 'conservative', researcherId: 'p5', status: 'completed', stagesDone: 3, stagesTotal: 3, spent: 0, reagentsSpent: 0, startedShift: 1 });
    s.research.push({ id: 'forecast_model', protocol: 'conservative', researcherId: 'p8', status: 'completed', stagesDone: 3, stagesTotal: 3, spent: 0, reagentsSpent: 0, startedShift: 1 });
    expect(projectView(s, 'bio_procedure').reason).toMatch(/лабораторный комплекс ур. 2/);
  });

  it('a project pays money and reagents per stage between shifts, takes a researcher out of the squad, and completes', () => {
    let s = ok(started(), { type: 'START_PROJECT', projectId: 'forecast_model', protocol: 'conservative', researcherId: 'p8' });
    expect(proj(s, 'forecast_model')).toMatchObject({ status: 'active', stagesTotal: 3 });
    expect(memberBlocker(s, 'p8', '')).toBe('ведёт исследование');
    expect(s.squads.some((q) => q.memberIds.includes('p8'))).toBe(false);
    const d = defaultDraft(s, 'axon', 'missing');
    const before = computeForecast(s, d);
    for (let i = 0; i < 3; i++) s = nextShift(s);
    expect(proj(s, 'forecast_model').status).toBe('completed');
    expect(s.economy.ledger.filter((t) => t.kind === 'research').map((t) => t.amount)).toEqual([-300, -300, -300]);
    const after = computeForecast(s, defaultDraft(s, 'axon', 'missing'));
    expect(after.high - after.low).toBeLessThan(before.high - before.low + 1e-9);
  });

  it('lab cells limit parallel work; the rest waits in queue', () => {
    let s = ok(started(), { type: 'START_PROJECT', projectId: 'forecast_model', protocol: 'conservative', researcherId: 'p8' });
    s = ok(s, { type: 'START_PROJECT', projectId: 'bio_reagents', protocol: 'conservative', researcherId: 'p7' });
    expect(s.research.map((p) => p.status)).toEqual(['active', 'queued']);
  });

  it('no reagents — the stage stops (blocked_inputs) instead of being bought with money', () => {
    let s = ok(started(), { type: 'START_PROJECT', projectId: 'bio_reagents', protocol: 'conservative', researcherId: 'p7' });
    s = ok(tick(s, 720), { type: 'END_SHIFT' });
    s.resources.reagents = -2; // поставка +2 вернёт к нулю, а этап требует 1
    s = ok(s, { type: 'ADVANCE_SHIFT' });
    expect(proj(s, 'bio_reagents').status).toBe('blocked_inputs');
    expect(proj(s, 'bio_reagents').stagesDone).toBe(0);
  });

  it('experimental risk falls with lab level and researcher analysis; failure loses the spending', () => {
    const s = started();
    const weak = { ...s.staff.find((p) => p.id === 'p8')!, stats: { ...s.staff.find((p) => p.id === 'p8')!.stats, analysis: 2 } };
    const strong = { ...weak, stats: { ...weak.stats, analysis: 5 } };
    expect(experimentalFail(s, strong)).toBeLessThan(experimentalFail(s, weak));
    const lab2 = { ...s, facilities: { ...s.facilities, lab: 2 } };
    expect(experimentalFail(lab2, weak)).toBeLessThan(experimentalFail(s, weak));
    let failed = false;
    for (let seed = 1; seed < 40 && !failed; seed++) {
      let x = ok(started(seed), { type: 'START_PROJECT', projectId: 'forecast_model', protocol: 'experimental', researcherId: 'p8' });
      x = nextShift(x);
      failed = proj(x, 'forecast_model').status === 'failed';
      if (failed) expect(startBlocker(x, 'forecast_model', 'conservative', 'p8')).toBeNull(); // можно начать заново
    }
    expect(failed).toBe(true);
  });

  it('results need fabrication; research gates an organ; v7 saves migrate', () => {
    let s = started();
    s.research.push({ id: 'sedative_synth', protocol: 'conservative', researcherId: 'p8', status: 'completed', stagesDone: 3, stagesTotal: 3, spent: 0, reagentsSpent: 0, startedShift: 1 });
    const n = s.equipment.filter((u) => u.typeId === 'sedative').length;
    s = ok(s, { type: 'FABRICATE', projectId: 'sedative_synth' });
    expect(s.equipment.filter((u) => u.typeId === 'sedative')).toHaveLength(n + 2);
    expect(new Set(s.equipment.map((u) => u.id)).size).toBe(s.equipment.length);
    expect(reduce(s, { type: 'FABRICATE', projectId: 'uzel' }).ok).toBe(false);
    expect(organBlocker(s, 'p2', 'org_adapt')).toMatch(/Программа совместимости/);
    const old = structuredClone(createInitialState()) as unknown as Record<string, unknown>;
    delete old.research;
    delete old.resources;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 7, savedAt: '', label: '', state: { ...old, schemaVersion: 7 } });
    expect(r.ok && r.state.resources.reagents).toBe(4);
  });
});
