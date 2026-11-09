import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../assets/manifest.json';
import { artIconNames } from '../../src/ui/Icon';

/** ART-007: 35 иконок интерфейса на все имена IconName, контурные, без своих цветов и стилей. */
describe('ART-007 иконки интерфейса', () => {
  const entries = manifest.assets.filter((a) => a.id.startsWith('ART007_ICO_'));
  const NAMES = ['radio', 'shield', 'clock', 'users', 'pause', 'play', 'mail', 'cog', 'map', 'pin', 'warning', 'beaker', 'medical', 'folder', 'scales', 'wrench', 'eye', 'plus', 'minus', 'search', 'check', 'heart', 'crosshair', 'truck', 'lock', 'book', 'person', 'close', 'save', 'briefcase', 'list', 'layers', 'upload', 'chart', 'arrow'];

  it('у каждого имени из кода есть файл, хеши в манифесте совпадают', () => {
    expect(artIconNames().sort()).toEqual([...NAMES].sort());
    expect(entries).toHaveLength(35);
    for (const a of entries) expect(createHash('sha256').update(readFileSync(a.file)).digest('hex')).toBe(a.sha256);
  });

  it('файлы 24×24, без заливок, стилей, скриптов и ссылок', () => {
    for (const a of entries) {
      const svg = readFileSync(a.file, 'utf8');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).not.toMatch(/fill=|style=|transform=|<script|href=|on[a-z]+=/i);
    }
  });
});
