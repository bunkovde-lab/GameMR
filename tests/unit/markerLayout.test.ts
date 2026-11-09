import { describe, expect, it } from 'vitest';
import { MIN_GAP, layoutMarkers } from '../../src/ui/map/markerLayout';

const m = (id: string, x: number, y: number, severity = 'medium') => ({ id, x, y, severity });
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('W10 map markers (MAP-05)', () => {
  it('far markers stay where they are', () => {
    const l = layoutMarkers([m('a', 0, 0), m('b', 200, 0)]);
    expect(l.clusters).toEqual([]);
    expect(l.markers.every((x) => !x.moved)).toBe(true);
  });

  it('two overlapping markers: the more severe stays, the other moves on screen only, keeping its true anchor', () => {
    const l = layoutMarkers([m('low', 10, 0, 'medium'), m('crit', 0, 0, 'critical')]);
    const crit = l.markers.find((x) => x.id === 'crit')!;
    const low = l.markers.find((x) => x.id === 'low')!;
    expect(crit.moved).toBe(false);
    expect(low.moved).toBe(true);
    expect([low.anchorX, low.anchorY]).toEqual([10, 0]);
    expect(d(low, crit)).toBeGreaterThanOrEqual(MIN_GAP - 0.01);
  });

  it('three or more within 48 px form a cluster with a count; tapping expands it into a fan of separate markers', () => {
    const items = [m('a', 0, 0), m('b', 20, 10, 'critical'), m('c', 10, 30), m('far', 300, 300)];
    const l = layoutMarkers(items);
    expect(l.clusters).toHaveLength(1);
    expect(l.clusters[0]!.ids).toEqual(['a', 'b', 'c']);
    expect(l.clusters[0]!.top).toBe('critical');
    expect(l.markers.map((x) => x.id)).toEqual(['far']);
    const open = layoutMarkers(items, l.clusters[0]!.key);
    expect(open.clusters).toEqual([]);
    const fan = open.markers.filter((x) => x.id !== 'far');
    expect(fan).toHaveLength(3);
    for (const a of fan) for (const b of fan) if (a !== b) expect(d(a, b)).toBeGreaterThanOrEqual(MIN_GAP);
  });
});
