import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import start from '../../content/staff_start.json';
import manifest from '../../assets/manifest.json';

/** ART-005: каждому стартовому сотруднику — утверждённый портрет и его игровые копии; оригиналы не изменены. */
describe('ART-005 портреты', () => {
  const portraits = manifest.assets.filter((a) => a.id.startsWith('PORTRAIT_P'));

  it('12 портретов на 12 стартовых сотрудников, имена совпадают', () => {
    expect(portraits).toHaveLength(12);
    for (const s of start.staff) {
      const n = String(Number(s.id.slice(1))).padStart(2, '0');
      const a = portraits.find((x) => x.id === `PORTRAIT_P${n}`)!;
      expect(a.role).toContain(s.name);
      expect(a.status).toBe('integrated');
    }
  });

  it('оригиналы совпадают с хешем из реестра, игровые копии существуют', () => {
    for (const a of portraits) {
      const buf = readFileSync(a.file);
      expect(createHash('sha256').update(buf).digest('hex')).toBe(a.sha256);
      const n = a.id.slice(-2);
      expect(existsSync(`assets/characters/web/portrait_p${n}.webp`)).toBe(true);
      expect(existsSync(`assets/characters/web/face_p${n}.webp`)).toBe(true);
    }
  });
});
