import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { buildRoute, etaMinutes, positionOnRoute } from '../../src/core/map/graph';
import { MAP, nodePosition } from '../../src/core/map/mapConfig';
import { parseSave, toSaveFile } from '../../src/persistence/saveFormat';
import type { Command, GameState } from '../../src/core/types';

const ok = (s: GameState, c: Command) => {
  const r = reduce(s, c);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const started = () => ok(createInitialState(), { type: 'START_SHIFT' });
const squad = (s: GameState, id: string) => s.squads.find((q) => q.id === id)!;
const incident = (s: GameState, id: string) => s.incidents.find((i) => i.id === id)!;

describe('approved map asset', () => {
  it('MAP-001/002: PNG on disk matches the SHA-256 and size in map_config.json', () => {
    const buf = readFileSync(MAP.art.file);
    expect(createHash('sha256').update(buf).digest('hex')).toBe(MAP.art.sha256);
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1672, 941]);
  });
  it('config: 6 districts, 20 nodes, 24 edges, every serviceNode exists', () => {
    expect(MAP.districts).toHaveLength(6);
    expect(MAP.nodes).toHaveLength(20);
    expect(MAP.edges).toHaveLength(24);
    for (const d of MAP.districts) expect(MAP.nodes.some((n) => n.id === d.serviceNode)).toBe(true);
  });
});

describe('routing (W3 §4)', () => {
  it('MAP-017: Аксон → medriot goes ADMIN_DEPOT → ADMIN_W → MED_RAMP → MED_MAIN, ETA ≈ 11', () => {
    const r = buildRoute('ADMIN_DEPOT', 'MED_MAIN')!;
    expect(r.nodeIds).toEqual(['ADMIN_DEPOT', 'ADMIN_W', 'MED_RAMP', 'MED_MAIN']);
    expect(r.totalMinutes).toBe(10.5);
    expect(etaMinutes(r, 0)).toBe(11);
  });
  it('route positions start at the depot and end at the incident point', () => {
    const r = buildRoute('ADMIN_DEPOT', 'MED_MAIN')!;
    const target: [number, number] = [0.2, 0.24];
    expect(positionOnRoute(r, 0, target)).toEqual(nodePosition('ADMIN_DEPOT'));
    expect(positionOnRoute(r, r.totalMinutes, target)).toEqual(target);
  });
});

describe('dispatch and movement', () => {
  it('dispatch charges 1,25 РЕ, sets en_route on squad and incident', () => {
    const s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    expect(squad(s, 'axon').status).toBe('en_route');
    expect(incident(s, 'medriot').state).toBe('en_route');
    expect(s.economy.balance).toBe(10500 - 125);
  });
  it('MAP-023: resting, treatment and busy squads cannot be sent', () => {
    for (const id of ['sigma', 'cortex', 'vector', 'omega']) {
      const r = reduce(started(), { type: 'DISPATCH_SQUAD', squadId: id, incidentId: 'bioleak' });
      expect(r.ok, id).toBe(false);
    }
  });
  it('MAP-019/020: pause freezes progress; arrival switches en_route → on_scene for squad and incident together', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    s = ok(s, { type: 'TICK', minutes: 5 });
    s = ok(s, { type: 'PAUSE' });
    expect(reduce(s, { type: 'TICK', minutes: 5 }).ok).toBe(false);
    expect(squad(s, 'axon').movement!.elapsed).toBe(5);
    s = ok(ok(s, { type: 'RESUME' }), { type: 'TICK', minutes: 5 });
    expect(squad(s, 'axon').status).toBe('en_route');
    s = ok(s, { type: 'TICK', minutes: 1 });
    expect([squad(s, 'axon').status, incident(s, 'medriot').state, squad(s, 'axon').currentNodeId]).toEqual(['on_scene', 'on_scene', 'MED_MAIN']);
  });
  it('an incident being driven to does not escalate', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    s = ok(s, { type: 'TICK', minutes: 12 });
    expect(incident(s, 'medriot').state).toBe('on_scene');
  });
  it('MAP-021: closing an edge ahead re-routes with a new ETA', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    s = ok(s, { type: 'TICK', minutes: 1 });
    s = ok(s, { type: 'SET_ROAD_ENABLED', edgeId: 'AW-MR', enabled: false });
    const m = squad(s, 'axon').movement!;
    expect(m.route.edgeIds).not.toContain('AW-MR');
    expect(m.route.nodeIds.at(-1)).toBe('MED_MAIN');
    expect(m.route.totalMinutes).toBeGreaterThan(10.5);
    expect(s.log.at(-1)!.type).toBe('squad_rerouted');
  });
  it('MAP-022: no road left → dispatch refused with a reason; a moving squad stops at a node, no teleport', () => {
    let s = started();
    s = ok(s, { type: 'SET_ROAD_ENABLED', edgeId: 'MR-MM', enabled: false });
    const r = reduce(s, { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Маршрут недоступен/);

    s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    s = ok(s, { type: 'TICK', minutes: 1 });
    s = ok(s, { type: 'SET_ROAD_ENABLED', edgeId: 'MR-MM', enabled: false });
    expect(squad(s, 'axon').movement!.aborted).toBe(true);
    s = ok(s, { type: 'TICK', minutes: 10 });
    expect([squad(s, 'axon').status, squad(s, 'axon').currentNodeId, incident(s, 'medriot').state]).toEqual(['ready', 'ADMIN_W', 'acknowledged']);
  });
  it('MAP-024: save in the middle of a route and load → same edge progress and ETA, no double timer', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'medriot' });
    s = ok(s, { type: 'TICK', minutes: 4 });
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(s, 'x', new Date(0)))));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(squad(loaded.state, 'axon').movement).toEqual(squad(s, 'axon').movement);
    const a = ok(loaded.state, { type: 'TICK', minutes: 7 });
    const b = ok(s, { type: 'TICK', minutes: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(squad(a, 'axon').status).toBe('on_scene');
  });
  it('MAP-036: two squads arriving in the same minute are processed in a fixed order', () => {
    let s = ok(started(), { type: 'DISPATCH_SQUAD', squadId: 'axon', incidentId: 'missing' });
    s = ok(s, { type: 'DISPATCH_SQUAD', squadId: 'resonance', incidentId: 'illegal' });
    const run = (x: GameState) => ok(x, { type: 'TICK', minutes: 30 }).log.filter((e) => e.type === 'squad_arrived').map((e) => e.text);
    expect(run(s)).toEqual(run(structuredClone(s)));
  });
});

describe('save migration v1 → v2', () => {
  it('a W2 save loads with empty movement and road closures', () => {
    const v2 = createInitialState();
    const v1 = structuredClone(v2) as unknown as Record<string, unknown>;
    delete v1.roadClosures;
    (v1.squads as Record<string, unknown>[]).forEach((q) => delete q.movement);
    v1.schemaVersion = 1;
    const r = parseSave({ format: 'gamemr-save', schemaVersion: 1, savedAt: '', label: '', state: v1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.roadClosures).toEqual([]);
      expect(r.state.squads.every((q) => q.movement === null)).toBe(true);
    }
  });
});
