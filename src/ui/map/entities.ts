import { positionOnRoute } from '../../core/map/graph';
import { nodePosition, spawnPosition, type Point } from '../../core/map/mapConfig';
import type { GameState, Incident, Squad } from '../../core/types';
import type { IconName } from '../Icon';

/** Запасная иконка типа вызова (если файла значка ART-003/004 нет). */
export const INCIDENT_ICON: Record<string, IconName> = {
  medriot: 'warning',
  bioleak: 'beaker',
  raid: 'crosshair',
  missing: 'search',
  illegal: 'medical',
};

/** ART-003/004: значок карты по типу вызова (assets/ui/markers/<ключ>.png|svg). */
export const INCIDENT_MARKER: Record<string, string> = {
  medriot: 'marker_incident_riot',
  bioleak: 'marker_incident_bio',
  raid: 'marker_incident_armed',
  missing: 'marker_incident_search',
  illegal: 'marker_incident_illegal_mod',
};
export const SQUAD_MARKER = 'marker_squad_transport';
export const CLUSTER_MARKER = 'marker_cluster';

export const incidentPoint = (inc: Incident): Point | undefined => spawnPosition(inc.spawnId);

/**
 * Позиция отряда выводится из состояния ядра, а не хранится в пикселях (W3 §4).
 * subMinute — доля текущей игровой минуты (0..1) для плавного движения между тиками; ядро её не видит.
 */
export function squadPoint(game: GameState, sq: Squad, subMinute = 0): Point {
  const inc = sq.assignedIncidentId ? game.incidents.find((i) => i.id === sq.assignedIncidentId) : undefined;
  const m = sq.movement;
  const moving = m && (sq.status === 'en_route' || sq.status === 'returning');
  // Возвращение на базу: цели-вызова нет, едем до последнего узла маршрута.
  const target = inc ? incidentPoint(inc) : moving ? nodePosition(m.route.nodeIds[m.route.nodeIds.length - 1]!) : undefined;
  if (m && target) {
    const t = moving ? Math.min(m.route.totalMinutes, m.elapsed + Math.min(1, Math.max(0, subMinute))) : m.elapsed;
    return positionOnRoute(m.route, t, target);
  }
  if (sq.status === 'on_scene' && target) return target;
  return nodePosition(sq.currentNodeId);
}
