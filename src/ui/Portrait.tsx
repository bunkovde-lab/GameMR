import type { HealthState } from '../core/types';

/**
 * ART-005: утверждённые портреты сотрудников. Файлы — уменьшенные копии из scripts/build_portraits.py,
 * оригиналы в assets/characters не меняются. Состояния (ранен, погиб, пропал) рисует код, не файл.
 * Для нанятых позже сотрудников без портрета — монограмма.
 */
const faces = import.meta.glob('../../assets/characters/web/face_p*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const fulls = import.meta.glob('../../assets/characters/web/portrait_p*.webp', { eager: true, import: 'default' }) as Record<string, string>;

const byId = (files: Record<string, string>) => {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /_p(\d\d)\.webp$/.exec(path);
    if (m) out[`p${Number(m[1])}`] = url;
  }
  return out;
};
const FACE = byId(faces);
const FULL = byId(fulls);

export const hasPortrait = (staffId: string) => staffId in FACE;

const INJURED: HealthState[] = ['light_injury', 'serious_injury', 'critical'];
const MARK: Partial<Record<HealthState, string>> = {
  light_injury: 'ранен', serious_injury: 'тяжело ранен', critical: 'критично', missing: 'пропал', dead: 'погиб',
};

export function Portrait({ id, name, health = 'healthy', size = 'sm' }: { id: string; name: string; health?: HealthState; size?: 'xs' | 'sm' | 'lg' }) {
  const src = size === 'lg' ? FULL[id] : FACE[id];
  const cls = `portrait ${size}${health === 'dead' ? ' dead' : ''}${health === 'missing' ? ' missing' : ''}${INJURED.includes(health) ? ' injured' : ''}`;
  const mark = size !== 'xs' ? MARK[health] : undefined;
  return (
    <span className={cls} data-testid={`portrait-${id}`} aria-hidden={size !== 'lg' || undefined}>
      {src
        ? <img src={src} alt={size === 'lg' ? `Портрет: ${name}` : ''} loading="lazy" decoding="async" draggable={false} />
        : <span className="monogram">{name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)}</span>}
      {mark && <span className="portrait-mark">{mark}</span>}
    </span>
  );
}
