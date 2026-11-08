import { describe, expect, it } from 'vitest';
import { defaultDraft, planDispatch } from '../../src/core/dispatch';
import { financeSummary, medicalCapacity } from '../../src/core/facilities';
import {
  activeDeals, approvalChance, coalitionStrong, emergencyRisk, initialPolitics, permitBlocker, POLITICS,
} from '../../src/core/politics';
import { reagentSupply } from '../../src/core/research';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { parseSave } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = (seed?: number) => ok(createInitialState(seed), { type: 'START_SHIFT' });
const endShift = (s: GameState) => ok(tick(s, 720), { type: 'END_SHIFT' });
const nextShift = (s: GameState) => ok(ok(endShift(s), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
const offer = (s: GameState, templateId: string) => {
  const o = { id: s.politics.nextId++, templateId, expiresShift: s.shift + 1 };
  s.politics.offers.push(o);
  return o.id;
};
const inc = (s: GameState, id: string) => s.incidents.find((i) => i.id === id)!;

describe('W8 authorities (ТЗ §10.1)', () => {
  it('four levels exist; arrest in housing needs a court order, recon stays ordinary', () => {
    expect(POLITICS.levels.map((l) => l.id)).toEqual(['ordinary', 'judicial', 'interagency', 'emergency']);
    const s = started();
    expect(permitBlocker(s, 'illegal', 'arrest')).toMatch(/судебный разрешение|судебное|ордер/i);
    expect(permitBlocker(s, 'illegal', 'recon')).toBeNull();
    expect(permitBlocker(s, 'bioleak', 'quarantine')).toBeNull(); // оцепление снаружи — штатно
    const plan = planDispatch(s, { ...defaultDraft(s, 'resonance', 'illegal'), tactic: 'arrest' });
    expect(plan.blockers.join()).toMatch(/разрешение/);
    expect(defaultDraft(s, 'resonance', 'illegal').tactic).not.toBe('arrest'); // рекомендация не предлагает запрещённое
  });

  it('a judicial request costs a fee, waits for the court, and is decided deterministically', () => {
    let s = ok(started(), { type: 'REQUEST_PERMIT', incidentId: 'illegal', kind: 'judicial' });
    const p = s.politics.permits[0]!;
    expect(p).toMatchObject({ kind: 'judicial', status: 'pending', issuer: 'Суд продолжения', incidentId: 'illegal' });
    expect(p.legalBasis.length).toBeGreaterThan(10);
    expect(p.requirements.length).toBeGreaterThan(0);
    expect(s.economy.ledger.at(-1)).toMatchObject({ kind: 'permit_fee', amount: -50 });
    expect(reduce(s, { type: 'REQUEST_PERMIT', incidentId: 'illegal', kind: 'judicial' }).ok).toBe(false);
    s = tick(s, 45);
    const decided = s.politics.permits[0]!;
    expect(['granted', 'denied']).toContain(decided.status);
    expect(s.log.some((e) => e.type === (decided.status === 'granted' ? 'permit_granted' : 'permit_denied'))).toBe(true);
    // тот же seed — тот же исход
    const again = tick(ok(started(), { type: 'REQUEST_PERMIT', incidentId: 'illegal', kind: 'judicial' }), 45);
    expect(again.politics.permits[0]!.status).toBe(decided.status);
  });

  it('a granted order unlocks the tactic and is spent by the dispatch', () => {
    let s = started();
    s.politics.permits.push({ id: 99, kind: 'judicial', incidentId: 'illegal', target: 't', scope: ['arrest', 'suppression'], issuer: 'Суд продолжения', legalBasis: '', requirements: [], houseId: null, requestedShift: 1, decideMinute: 0, expiresShift: 2, reviewShift: null, auditRisk: 0, status: 'granted', note: '' });
    expect(permitBlocker(s, 'illegal', 'arrest')).toBeNull();
    s = ok(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'illegal', tactic: 'arrest' });
    expect(s.politics.permits.find((p) => p.id === 99)!.status).toBe('used');
    expect(s.politics.permits.some((p) => p.kind === 'emergency')).toBe(false);
  });

  it('emergency basis is an explicit choice: it is recorded with a responsible person and audited next shift', () => {
    let s = started();
    expect(reduce(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'illegal', tactic: 'arrest' }).ok).toBe(false);
    s = ok(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'illegal', tactic: 'arrest', emergency: true });
    const em = s.politics.permits.find((p) => p.kind === 'emergency')!;
    expect(em).toMatchObject({ status: 'used', reviewShift: 2, scope: ['arrest'] });
    expect(em.issuer).toMatch(/Руководитель/);
    expect(em.auditRisk).toBeCloseTo(emergencyRisk(s, inc(s, 'illegal')));
    s = ok(ok(endShift(s), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
    const after = s.politics.permits.find((p) => p.id === em.id)!;
    expect(['justified', 'violation']).toContain(after.status);
    if (after.status === 'violation') {
      expect(s.politics.violations).toEqual([2]);
      expect(s.economy.ledger.some((t) => t.kind === 'sanction')).toBe(true);
    }
  });

  it('a recorded violation makes the court stricter and the next audit riskier', () => {
    const s = started();
    const before = approvalChance(s, inc(s, 'illegal'), 'judicial');
    const riskBefore = emergencyRisk(s, inc(s, 'illegal'));
    s.politics.violations.push(1);
    expect(approvalChance(s, inc(s, 'illegal'), 'judicial')).toBeLessThan(before);
    expect(emergencyRisk(s, inc(s, 'illegal'))).toBeGreaterThan(riskBefore);
  });
});

describe('W8 Houses, coalitions and deals (ТЗ §10.2)', () => {
  it('six Houses with internal currents; three cross-cutting coalitions', () => {
    const p = initialPolitics();
    expect(Object.keys(p.standing)).toHaveLength(6);
    expect(Object.keys(p.coalitions)).toEqual(['continuity', 'open', 'hard']);
    for (const h of POLITICS.houses) expect(h.currents.reduce((a, c) => a + c.share, 0)).toBe(100);
    const lean = new Set(POLITICS.houses.flatMap((h) => h.currents.map((c) => c.coalition)));
    expect(lean.size).toBe(3);
    for (const d of POLITICS.deals) {
      expect(d.benefit && d.cost && d.verification && d.breachText).toBeTruthy();
      expect(d.durationShifts).toBeGreaterThan(0);
      expect(d.conditions.length).toBeGreaterThan(0);
    }
  });

  it('lab access: immediate gains and costs, interagency access, then arrest on the House site breaks it with a delayed reprisal', () => {
    let s = started();
    const id = s.politics.offers.find((o) => o.templateId === 'lab_access')!.id;
    const reagents = s.resources.reagents;
    s = ok(s, { type: 'ACCEPT_DEAL', offerId: id });
    expect(s.resources.reagents).toBe(reagents + 3);
    expect(s.politics.coalitions.hard).toBe(25);
    expect(permitBlocker(s, 'bioleak', 'arrest')).toBeNull();
    expect(reduce(s, { type: 'ACCEPT_DEAL', offerId: id }).ok).toBe(false);
    s = ok(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'bioleak', tactic: 'arrest' });
    s = endShift(s);
    const deal = s.politics.deals[0]!;
    expect(deal.status).toBe('broken');
    expect(s.politics.standing.h1).toBe(10 - 25);
    expect(s.politics.scheduled).toEqual([expect.objectContaining({ kind: 'reprisal', atShift: 3 })]);
    s = ok(s, { type: 'ADVANCE_SHIFT' });
    expect(s.politics.offers.some((o) => o.templateId === 'lab_access')).toBe(false); // разорванный не предлагают снова
    s = nextShift(ok(s, { type: 'START_SHIFT' }));
    expect(s.log.some((e) => e.type === 'deal_reprisal')).toBe(true);
  });

  it('reagent supply: paid every shift end, raises supply; no money means breach', () => {
    let s = started();
    s = ok(s, { type: 'ACCEPT_DEAL', offerId: offer(s, 'reagent_supply') });
    expect(reagentSupply(s)).toBe(POLITICS.deals.length ? 2 + 2 : 0); // базовая поставка 2 + договор 2
    expect(financeSummary(s).deals).toBe(100);
    s = endShift(s);
    expect(s.economy.ledger.filter((t) => t.kind === 'deal').map((t) => t.amount)).toEqual([-100]);
    expect(activeDeals(s)).toHaveLength(1);
    s = ok(ok(s, { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
    for (const p of s.staff) p.salary = 100_000; // жалование съедает всё финансирование смены
    s = endShift(s);
    expect(s.politics.deals[0]!.status).toBe('broken');
    expect(s.log.some((e) => e.type === 'deal_broken' && /не хватило средств/.test(e.text))).toBe(true);
  });

  it('hospital beds: +1 bed while active; acting on emergency basis breaks it', () => {
    let s = started();
    const beds = medicalCapacity(s).beds;
    s = ok(s, { type: 'ACCEPT_DEAL', offerId: offer(s, 'hospital_beds') });
    expect(medicalCapacity(s).beds).toBe(beds + 1);
    s = ok(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'illegal', tactic: 'arrest', emergency: true });
    s = endShift(s);
    expect(s.politics.deals[0]!.status).toBe('broken');
    expect(medicalCapacity(s).beds).toBe(beds);
    expect(s.politics.coalitions.open).toBe(35);
  });

  it('a promised subsidy is not guaranteed: payout depends on standing and the RNG', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      let s = started(seed);
      s = ok(s, { type: 'ACCEPT_DEAL', offerId: s.politics.offers.find((o) => o.templateId === 'subsidy_industry')!.id });
      s = ok(endShift(s), { type: 'ADVANCE_SHIFT' });
      outcomes.add(s.log.some((e) => e.type === 'deal_payout') ? 'paid' : s.log.some((e) => e.type === 'deal_payout_failed') ? 'failed' : 'none');
    }
    expect(outcomes).toEqual(new Set(['paid', 'failed']));
  });

  it('declining costs a little standing; offers refresh every shift up to the limit', () => {
    let s = started();
    const o = s.politics.offers[0]!;
    s = ok(s, { type: 'DECLINE_DEAL', offerId: o.id });
    expect(s.politics.offers).toHaveLength(1);
    s = ok(endShift(s), { type: 'ADVANCE_SHIFT' });
    expect(s.politics.offers.length).toBe(POLITICS.offersMax);
    expect(s.log.some((e) => e.type === 'deal_offered')).toBe(true);
  });

  it('coalition strength switches documented effects', () => {
    const s = started();
    expect(coalitionStrong(s, 'hard')).toBe(false);
    const r0 = emergencyRisk(s, inc(s, 'illegal'));
    s.politics.coalitions.hard = 60;
    expect(emergencyRisk(s, inc(s, 'illegal'))).toBeLessThan(r0);
  });

  it('save v8 → v9 adds politics; current saves round-trip', () => {
    const s = started();
    const { politics: _p, ...v8 } = s;
    void _p;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 8, savedAt: '', label: '', state: { ...v8, schemaVersion: 8 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.politics.offers.length).toBe(2);
    const bad = parseSave({ format: 'gamemr-save', schemaVersion: 9, savedAt: '', label: '', state: { ...v8, schemaVersion: 9 } });
    expect(bad.ok).toBe(false);
  });
});
