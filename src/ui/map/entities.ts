import { positionOnRoute } from '../../core/map/graph';
import { nodePosition, spawnPosition, type Point } from '../../core/map/mapConfig';
import type { GameState, Incident, Squad } from '../../core/types';
import type { IconName } from '../Icon';

/** Иконка типа вызова. Временная (placeholder) до поставки ART-003. */
export const INCIDENT_ICON: Record<string, IconName> = {
  medriot: 'warning',
  bioleak: 'beaker',
  raid: 'crosshair',
  missing: 'search',
  illegal: 'medical',
};

export const incidentPoint = (inc: Incident): Point | undefined => spawnPosition(inc.spawnId);

/** Позиция отряда выводится из состояния ядра, а не хранится в пикселях (W3 §4). */
export function squadPoint(game: GameState, sq: Squad): Point {
  const inc = sq.assignedIncidentId ? game.incidents.find((i) => i.id === sq.assignedIncidentId) : undefined;
  const target = inc ? incidentPoint(inc) : undefined;
  if (sq.movement && target) return positionOnRoute(sq.movement.route, sq.movement.elapsed, target);
  if (sq.status === 'on_scene' && target) return target;
  return nodePosition(sq.currentNodeId);
}
