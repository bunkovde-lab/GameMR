import raw from '../../../content/map_config.json';
import type { DistrictId } from '../types';

/** Геометрия W3. Единственный источник координат — content/map_config.json (нормализованные 0..1). */
export type Point = [number, number];

export interface MapDistrict {
  id: DistrictId;
  name: string;
  description: string;
  labelAnchor: Point;
  hitPolygon: Point[];
  spawnPoints: { id: string; position: Point }[];
  serviceNode: string;
}
export interface RoadNode { id: string; position: Point; districtId: DistrictId }
export interface RoadEdge { id: string; from: string; to: string; baselineMinutes: number; enabled: boolean; polyline: Point[] }

export const MAP = {
  art: raw.approvedArt as { file: string; sha256: string; width: number; height: number },
  districts: raw.districts as unknown as MapDistrict[],
  nodes: raw.roadNetwork.nodes as unknown as RoadNode[],
  edges: raw.roadNetwork.edges as unknown as RoadEdge[],
  view: raw.viewDefaults as { zoomMin: number; zoomMax: number },
};

/** W3 §4 п.5: финальный участок от узла до точки события, игровые минуты (provisional). */
export const LAST_MILE_MINUTES = 1.5;

const nodeById = new Map(MAP.nodes.map((n) => [n.id, n]));
const spawnById = new Map(MAP.districts.flatMap((d) => d.spawnPoints.map((s) => [s.id, s.position] as const)));

export const nodePosition = (id: string): Point => nodeById.get(id)?.position ?? [0.5, 0.5];
export const spawnPosition = (id: string): Point | undefined => spawnById.get(id);
export const districtById = (id: string) => MAP.districts.find((d) => d.id === id);
export const edgeById = (id: string) => MAP.edges.find((e) => e.id === id);
