import { Icon, type IconName } from './Icon';

/**
 * Значки навыков дерева развития. Пока художник не прислал картинки (ART-020),
 * показываются иконки ART-007 по смыслу навыка. Когда в assets/ui/skills/ появится
 * файл skill_<id>.webp или .png, он автоматически заменит иконку.
 */
const files = import.meta.glob('../../assets/ui/skills/skill_*.{png,webp}', { eager: true, import: 'default' }) as Record<string, string>;
const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const id = /skill_([a-z0-9]+)\.(png|webp)$/.exec(path)?.[1];
  if (id) ART[id] = url;
}

const PLACEHOLDER: Record<string, IconName> = {
  cmd1: 'users', cmd2: 'layers', cmd3: 'medical',
  ci1: 'search', ci2: 'folder', ci3: 'eye',
  op1: 'scales', op2: 'crosshair', op3: 'warning',
};

export const hasSkillArt = (id: string) => !!ART[id];

export function SkillArt({ id }: { id: string }) {
  const url = ART[id];
  if (url) return <img className="skill-img" src={url} alt="" draggable={false} />;
  return <span className="skill-ph"><Icon name={PLACEHOLDER[id] ?? 'book'} /></span>;
}
