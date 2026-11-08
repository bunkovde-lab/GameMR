import { LAST_MILE_MINUTES, MAP, edgeById, nodePosition, type Point } from './mapConfig';

/** Маршрут: последовательность узлов и рёбер; веса — игровые минуты (W3 §4). */
export interface Route {
  nodeIds: string[];
  edgeIds: string[];
  /** Минуты каждого ребра + последний участок до точки события */
  legMinutes: number[];
  totalMinutes: number;
}

/** Dijkstra по весу времени; закрытые рёбра исключаются. Детерминирован: при равенстве весов выигрывает меньший id. */
export function shortestPath(from: string, to: string, closed: readonly string[] = []): { nodeIds: string[]; edgeIds: string[]; minutes: number } | null {
  if (from === to) return { nodeIds: [from], edgeIds: [], minutes: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; edge: string }>();
  const done = new Set<string>();
  const closedSet = new Set(closed);
  while (true) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [n, d] of dist) {
      if (done.has(n)) continue;
      if (d < best || (d === best && cur !== null && n < cur)) { best = d; cur = n; }
    }
    if (cur === null) return null;
    if (cur === to) break;
    done.add(cur);
    for (const e of MAP.edges) {
      if (!e.enabled || closedSet.has(e.id)) continue;
      const next = e.from === cur ? e.to : e.to === cur ? e.from : null;
      if (!next || done.has(next)) continue;
      const nd = best + e.baselineMinutes;
      const old = dist.get(next);
      if (old === undefined || nd < old || (nd === old && e.id < (prev.get(next)?.edge ?? ''))) {
        dist.set(next, nd);
        prev.set(next, { node: cur, edge: e.id });
      }
    }
  }
  const nodeIds = [to];
  const edgeIds: string[] = [];
  for (let n = to; n !== from; ) {
    const p = prev.get(n)!;
    edgeIds.unshift(p.edge);
    nodeIds.unshift(p.node);
    n = p.node;
  }
  return { nodeIds, edgeIds, minutes: dist.get(to)! };
}

export function buildRoute(from: string, to: string, closed: readonly string[] = []): Route | null {
  const p = shortestPath(from, to, closed);
  if (!p) return null;
  const legMinutes = p.edgeIds.map((id) => edgeById(id)!.baselineMinutes);
  legMinutes.push(LAST_MILE_MINUTES);
  return { nodeIds: p.nodeIds, edgeIds: p.edgeIds, legMinutes, totalMinutes: legMinutes.reduce((a, b) => a + b, 0) };
}

/** ETA для игрока: округление вверх до целой минуты (W3 §4 п.6). */
export const etaMinutes = (route: Route, elapsed: number) => Math.max(0, Math.ceil(route.totalMinutes - elapsed));

/** Точка на маршруте после `elapsed` минут: по polyline текущего ребра пропорционально его длине. */
export function positionOnRoute(route: Route, elapsed: number, target: Point): Point {
  let t = elapsed;
  for (let i = 0; i < route.edgeIds.length; i++) {
    const leg = route.legMinutes[i]!;
    if (t < leg) {
      const e = edgeById(route.edgeIds[i]!)!;
      const forward = e.from === route.nodeIds[i];
      const pts = forward ? e.polyline : [...e.polyline].reverse();
      return alongPolyline(pts, t / leg);
    }
    t -= leg;
  }
  const last = nodePosition(route.nodeIds[route.nodeIds.length - 1]!);
  const k = Math.min(1, t / LAST_MILE_MINUTES);
  return [last[0] + (target[0] - last[0]) * k, last[1] + (target[1] - last[1]) * k];
}

/** Полилиния всего маршрута для слоя route-preview. */
export function routePolyline(route: Route, target: Point): Point[] {
  const pts: Point[] = [];
  route.edgeIds.forEach((id, i) => {
    const e = edgeById(id)!;
    const seg = e.from === route.nodeIds[i] ? e.polyline : [...e.polyline].reverse();
    pts.push(...(pts.length ? seg.slice(1) : seg));
  });
  if (!pts.length) pts.push(nodePosition(route.nodeIds[0]!));
  pts.push(target);
  return pts;
}

function alongPolyline(pts: Point[], f: number): Point {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = f * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) {
      const k = lens[i]! ? Math.min(1, d / lens[i]!) : 0;
      const a = pts[i]!, b = pts[i + 1]!;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    d -= lens[i]!;
  }
  return pts[pts.length - 1]!;
}
