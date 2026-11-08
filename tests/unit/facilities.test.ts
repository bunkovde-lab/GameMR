import { describe, expect, it } from 'vitest';
import { financeSummary, medicalCapacity, upgradeBlocker } from '../../src/core/facilities';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { treatmentForecast } from '../../src/core/staff';
import { parseSave } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const endShift = (s: GameState) => ok(tick(s, 720), { type: 'END_SHIFT' });
const nextShift = (s: GameState) => ok(ok(endShift(s), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });

describe('W7 finances (ТЗ §8.2)', () => {
  it('free fund = cash − reserves − protected obligations of the next shift', () => {
    const s = started();
    const f = financeSummary(s);
    expect(f.salary).toBe(3400);
    expect(f.upkeep).toBe(0);
    expect(f.free).toBe(f.balance - f.reserved - f.obligations);
    const q = ok(s, { type: 'QUEUE_UPGRADE', facilityId: 'medical' });
    expect(financeSummary(q).reserved).toBe(1500);
    expect(q.economy.balance).toBe(s.economy.balance); // резерв — не списание
  });

  it('every shift report reconciles: closing = opening + income − expenses', () => {
    let s = ok(started(), { type: 'QUEUE_UPGRADE', facilityId: 'medical' });
    for (let i = 0; i < 3; i++) s = nextShift(s);
    for (const r of s.reports) expect(r.closingBalance).toBe(r.openingBalance + r.income - r.expenses);
    const sum = s.economy.ledger.reduce((a, t) => a + t.amount, 0);
    expect(s.economy.balance).toBe(10500 + sum);
  });

  it('conditional subsidy after shift 4 only if the city is safe enough', () => {
    let s = started();
    for (let i = 0; i < 3; i++) s = nextShift(s);
    s = endShift(s);
    const granted = s.log.some((e) => e.type === 'subsidy_granted');
    const refused = s.log.some((e) => e.type === 'subsidy_refused');
    expect(granted !== refused).toBe(true);
  });
});

describe('W7 infrastructure (ТЗ §9.1)', () => {
  it('an upgrade is paid in stages over shifts and only then raises real capacity', () => {
    let s = ok(started(), { type: 'QUEUE_UPGRADE', facilityId: 'medical' });
    expect(s.construction[0]).toMatchObject({ status: 'active', paid: 0, shiftsTotal: 2 });
    s = nextShift(s);
    expect(s.construction[0]).toMatchObject({ paid: 750, shiftsDone: 1 });
    expect(medicalCapacity(s).beds).toBe(2);
    s = nextShift(s);
    expect(s.facilities.medical).toBe(2);
    expect(s.construction).toHaveLength(0);
    expect(medicalCapacity(s).beds).toBe(3);
    expect(s.economy.ledger.filter((t) => t.kind === 'construction').map((t) => t.amount)).toEqual([-750, -750]);
    // Новое место реально используется клиникой.
    for (const id of ['p5', 'p6', 'p11']) s.staff.find((p) => p.id === id)!.health = 'serious_injury';
    s = ok(ok(s, { type: 'START_TREATMENT', staffId: 'p5', plan: 'standard' }), { type: 'START_TREATMENT', staffId: 'p6', plan: 'standard' });
    expect(treatmentForecast(s, 'p11', 'standard').queued).toBe(false);
  });

  it('building capacity is limited: the second job waits; priority is explicit', () => {
    let s = ok(ok(started(), { type: 'QUEUE_UPGRADE', facilityId: 'medical' }), { type: 'QUEUE_UPGRADE', facilityId: 'training' });
    expect(s.construction.map((b) => [b.facilityId, b.status])).toEqual([['medical', 'active'], ['training', 'queued']]);
    s = ok(s, { type: 'PRIORITIZE_UPGRADE', facilityId: 'training' });
    expect(s.construction.map((b) => [b.facilityId, b.status])).toEqual([['training', 'active'], ['medical', 'queued']]);
  });

  it('no money for a stage — the job stops instead of going into debt', () => {
    let s = ok(started(), { type: 'QUEUE_UPGRADE', facilityId: 'ops' });
    s = endShift(s);
    s.economy.balance = 100;
    s = ok(ok(s, { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
    expect(s.construction[0]).toMatchObject({ status: 'blocked', paid: 0 });
    expect(s.economy.balance).toBeGreaterThanOrEqual(0);
    expect(s.log.some((e) => e.type === 'construction_blocked')).toBe(true);
  });

  it('upgrades need free money after reserves; locked objects explain why', () => {
    const s = started();
    expect(upgradeBlocker(s, 'detention')).toMatch(/W9/);
    s.economy.balance = 4000;
    expect(upgradeBlocker(s, 'lab')).toMatch(/свободных средств/);
  });

  it('tech sector repairs damaged equipment between shifts; v6 saves migrate', () => {
    let s = started();
    s.equipment[0]!.state = 'damaged';
    s.equipment[1]!.state = 'damaged';
    s = nextShift(s);
    expect(s.equipment.filter((u) => u.state === 'damaged')).toHaveLength(1);
    const old = structuredClone(createInitialState()) as unknown as Record<string, unknown>;
    delete old.facilities;
    delete old.construction;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 6, savedAt: '', label: '', state: { ...old, schemaVersion: 6 } });
    expect(r.ok && r.state.facilities.medical).toBe(1);
    expect(reduce(r.ok ? r.state : started(), { type: 'QUEUE_UPGRADE', facilityId: 'archive' }).ok).toBe(false);
  });
});
