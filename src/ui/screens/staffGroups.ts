import { squadCommander } from '../../core/staff';
import type { GameState, Squad, Staff } from '../../core/types';

/** Группа сотрудников для списков «Кадров»: состав (отряд), резерв или архив погибших. */
export interface StaffGroup {
  key: string;
  title: string;
  squad: Squad | null;
  commanderId: string | null;
  members: Staff[];
}

/**
 * Разбивает штат по составам в порядке отрядов; затем резерв (живые вне отрядов) и, если нужно, архив.
 * Только чтение состояния игры — ничего не хранит отдельно.
 */
export function staffGroups(game: GameState, withArchive: boolean): StaffGroup[] {
  const byId = new Map(game.staff.map((p) => [p.id, p]));
  const placed = new Set<string>();
  const groups: StaffGroup[] = game.squads.map((q) => {
    const members = q.memberIds.map((id) => byId.get(id)).filter((p): p is Staff => !!p && p.health !== 'dead');
    members.forEach((p) => placed.add(p.id));
    return { key: q.id, title: `«${q.name}»`, squad: q, commanderId: squadCommander(game, q)?.id ?? null, members };
  });
  const reserve = game.staff.filter((p) => p.health !== 'dead' && !placed.has(p.id));
  groups.push({ key: 'reserve', title: 'Резерв', squad: null, commanderId: null, members: reserve });
  if (withArchive) {
    const dead = game.staff.filter((p) => p.health === 'dead');
    if (dead.length) groups.push({ key: 'archive', title: 'Архив · погибшие', squad: null, commanderId: null, members: dead });
  }
  return groups;
}
