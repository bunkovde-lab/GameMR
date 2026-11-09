/**
 * W10 (MAP-05, W3 spec §105): раскладка меток вызовов на экране.
 * - 3+ вызова в пределах 48 px — кластер с числом; по тапу разворачивается веером вокруг центра.
 * - Две метки ближе 44 + 8 px — менее важная сдвигается только на экране, с линией к истинной точке.
 * Мировые координаты не меняются; раскладка — чистая функция от экранных точек.
 */
export interface MarkerIn { id: string; x: number; y: number; severity: string }
export interface PlacedMarker { id: string; x: number; y: number; anchorX: number; anchorY: number; moved: boolean }
export interface Cluster { key: string; ids: string[]; x: number; y: number; top: string }
export interface MarkerLayout { markers: PlacedMarker[]; clusters: Cluster[] }

export const CLUSTER_RADIUS = 48;
export const MIN_GAP = 52; // 44 px метка + 8 px зазор
const FAN_RADIUS = 60;
const RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
const rank = (s: string) => RANK[s] ?? 0;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function layoutMarkers(items: MarkerIn[], expanded: string | null = null): MarkerLayout {
  // Важные первыми: они остаются на своих местах, остальные уступают.
  const order = [...items].sort((a, b) => rank(b.severity) - rank(a.severity) || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const clusters: Cluster[] = [];
  const markers: PlacedMarker[] = [];
  for (const seed of order) {
    if (used.has(seed.id)) continue;
    const group = order.filter((o) => !used.has(o.id) && dist(o, seed) <= CLUSTER_RADIUS);
    if (group.length < 3) continue;
    for (const g of group) used.add(g.id);
    const ids = group.map((g) => g.id).sort();
    const key = ids.join('|');
    const cx = group.reduce((a, g) => a + g.x, 0) / group.length;
    const cy = group.reduce((a, g) => a + g.y, 0) / group.length;
    if (key === expanded) {
      group.forEach((g, i) => {
        const t = -Math.PI / 2 + (2 * Math.PI * i) / group.length;
        markers.push({ id: g.id, x: cx + FAN_RADIUS * Math.cos(t), y: cy + FAN_RADIUS * Math.sin(t), anchorX: g.x, anchorY: g.y, moved: true });
      });
    }
    clusters.push({ key, ids, x: cx, y: cy, top: group[0]!.severity });
  }
  // Одиночные метки: при перекрытии менее важная отодвигается от уже поставленной.
  for (const m of order) {
    if (used.has(m.id)) continue;
    let x = m.x, y = m.y;
    for (let pass = 0; pass < 4; pass++) {
      const hit = markers.find((p) => dist(p, { x, y }) < MIN_GAP);
      if (!hit) break;
      let dx = x - hit.x, dy = y - hit.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
      x = hit.x + dx * MIN_GAP;
      y = hit.y + dy * MIN_GAP;
    }
    markers.push({ id: m.id, x, y, anchorX: m.x, anchorY: m.y, moved: x !== m.x || y !== m.y });
  }
  return { markers, clusters: clusters.filter((c) => c.key !== expanded) };
}
