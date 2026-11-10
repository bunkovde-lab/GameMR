import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

/** ART-021: пять утверждённых медальонов разделов; «Дирекция» остаётся с гербом Дирекции. */
describe('ART-021 значки разделов', () => {
  const entries = manifest.assets.filter((a) => /^NAV_[A-Z_]+_MEDALLION$/.test(a.id));
  it('5 исходников в манифесте, хеши совпадают, у каждого есть веб-копия; отдельного значка Дирекции нет', () => {
    expect(entries.map((a) => a.file.replace(/^.*nav_|\.png$/g, '')).sort()).toEqual(['end_shift', 'investigations', 'map', 'saves', 'staff']);
    for (const a of entries) {
      const sha = (a as { sha256?: string }).sha256;
      if (sha) expect(createHash('sha256').update(readFileSync(a.file)).digest('hex')).toBe(sha);
      expect(readFileSync(a.file.replace('/nav/', '/nav/web/').replace('.png', '.webp')).length).toBeGreaterThan(1000);
    }
    expect(existsSync('assets/ui/nav/nav_directorate.png')).toBe(false);
  });
});
