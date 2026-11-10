/**
 * W10 (MAP-05, W3 spec §105): раскладка меток вызовов на экране.
 * - 3+ вызова в пределах 48 px — кластер с числом; по тапу разворачивается веером вокруг центра.
 * - Две метки ближе 44 + 8 px — менее важная сдвигается только на экране, с линией к истинной точке.
 * Расстояния даны для метки шириной 44 px и растут вместе с размером метки (opts.width).
 * Мировые координаты не меняются; раскладка — чистая функция от экранных точек.
 */
export interface MarkerIn { id: string; x: number; y: number; severity: string }
export interface PlacedMarker { id: string; x: number; y: number; anchorX: number; anchorY: number; moved: boolean }
export interface Cluster { key: string; ids: string[]; x: number; y: number; top: string }
export interface MarkerLayout { markers: PlacedMarker[]; clusters: Cluster[] }
/**
 * Размер метки и границы окна. width — ширина метки (щит 0,8 × высоты); bounds — где может стоять точка метки,
 * чтобы щит и таймер над ним целиком помещались в окне (метка у края сдвигается внутрь с линией к точке).
 */
export interface LayoutOptions { width?: number; bounds?: { minX: number; maxX: number; minY: number; maxY: number } }

export const CLUSTER_RADIUS = 48;
export const MIN_GAP = 52; // 44 px метка + 8 px зазор
const FAN_RADIUS = 60;
const BASE_WIDTH = 44;
const RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
const rank = (s: string) => RANK[s] ?? 0;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function layoutMarkers(items: MarkerIn[], expanded: string | null = null, opts: LayoutOptions = {}): MarkerLayout {
  const k = Math.max(1, (opts.width ?? BASE_WIDTH) / BASE_WIDTH);
  const clusterR = CLUSTER_RADIUS * k, gap = MIN_GAP * k, fanR = FAN_RADIUS * k;
  const b = opts.bounds;
  const clampPt = (x: number, y: number) => (b ? { x: Math.min(b.maxX, Math.max(b.minX, x)), y: Math.min(b.maxY, Math.max(b.minY, y)) } : { x, y });
  // Важные первыми: они остаются на своих местах, остальные уступают.
  const order = [...items].sort((a, b) => rank(b.severity) - rank(a.severity) || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const clusters: Cluster[] = [];
  const markers: PlacedMarker[] = [];
  for (const seed of order) {
    if (used.has(seed.id)) continue;
    const group = order.filter((o) => !used.has(o.id) && dist(o, seed) <= clusterR);
    if (group.length < 3) continue;
    for (const g of group) used.add(g.id);
    const ids = group.map((g) => g.id).sort();
    const key = ids.join('|');
    const cx = group.reduce((a, g) => a + g.x, 0) / group.length;
    const cy = group.reduce((a, g) => a + g.y, 0) / group.length;
    if (key === expanded) {
      group.forEach((g, i) => {
        const t = -Math.PI / 2 + (2 * Math.PI * i) / group.length;
        const p = clampPt(cx + fanR * Math.cos(t), cy + fanR * Math.sin(t));
        markers.push({ id: g.id, x: p.x, y: p.y, anchorX: g.x, anchorY: g.y, moved: true });
      });
    }
    const c = clampPt(cx, cy);
    clusters.push({ key, ids, x: c.x, y: c.y, top: group[0]!.severity });
  }
  // Одиночные метки: при перекрытии менее важная отодвигается от уже поставленной.
  for (const m of order) {
    if (used.has(m.id)) continue;
    let { x, y } = clampPt(m.x, m.y);
    const free = (p: { x: number; y: number }) => !markers.some((q) => dist(q, p) < gap - 0.01);
    for (let pass = 0; pass < 6; pass++) {
      const hit = markers.find((p) => dist(p, { x, y }) < gap - 0.01);
      if (!hit) break;
      let dx = x - hit.x, dy = y - hit.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
      // Отодвигаем от соседа; если у края окна сдвиг упёрся в границу — пробуем вбок и в обратную сторону.
      const tries = [[dx, dy], [-dy, dx], [dy, -dx], [-dx, -dy]].map(([ux, uy]) => clampPt(hit.x + ux! * gap, hit.y + uy! * gap));
      ({ x, y } = tries.find(free) ?? tries[0]!);
    }
    markers.push({ id: m.id, x, y, anchorX: m.x, anchorY: m.y, moved: x !== m.x || y !== m.y });
  }
  return { markers, clusters: clusters.filter((c) => c.key !== expanded) };
}
