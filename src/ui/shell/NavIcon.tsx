import { Icon, type IconName } from '../Icon';
import crestDirectorate from '../../../assets/ui/kit_v2/crest_directorate.png';

/** Кнопки нижней панели и кнопка «Сохранения» в шапке. */
export type NavIconId = 'map' | 'staff' | 'investigations' | 'directorate' | 'end_shift' | 'saves';

/**
 * ART-021: рисованные значки разделов. Файлы кладутся в assets/ui/nav/nav_<id>.png (или .webp)
 * и подхватываются сами, без правки кода. Пока файла нет:
 *  - «Дирекция» показывает утверждённый герб Дирекции (ART-008, kit_v2/crest_directorate.png);
 *  - остальные — контурная иконка ART-007.
 */
const files = import.meta.glob('../../../assets/ui/nav/nav_*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const NAV_ART: Partial<Record<NavIconId, string>> = {};
for (const [path, url] of Object.entries(files)) {
  const id = /nav_([a-z_]+)\.(png|webp)$/.exec(path)?.[1] as NavIconId | undefined;
  if (id && (!NAV_ART[id] || path.endsWith('.webp'))) NAV_ART[id] = url;
}

const CLOSEST: Partial<Record<NavIconId, string>> = { directorate: crestDirectorate };
const FALLBACK: Record<NavIconId, IconName> = {
  map: 'map', staff: 'users', investigations: 'search', directorate: 'briefcase', end_shift: 'arrow', saves: 'save',
};

/** Откуда берётся значок: ART-021, ближайший утверждённый арт или контур ART-007. */
export function navIconSource(id: NavIconId): 'art021' | 'closest' | 'art007' {
  return NAV_ART[id] ? 'art021' : CLOSEST[id] ? 'closest' : 'art007';
}

export function NavIcon({ id }: { id: NavIconId }) {
  const src = NAV_ART[id] ?? CLOSEST[id];
  if (!src) return <Icon name={FALLBACK[id]} />;
  return <img className="nav-art" src={src} alt="" aria-hidden="true" draggable={false} data-src={navIconSource(id)} data-testid={`nav-icon-${id}`} />;
}
