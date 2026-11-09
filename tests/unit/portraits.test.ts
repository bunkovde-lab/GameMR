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

/** ART-008: в CSS подключены только одобренные файлы; неутверждённые (шапка, стяги, герб) не используются. */
describe('ART-008 UI-kit PNG', () => {
  const css = readFileSync('src/ui/kit-png.css', 'utf8');
  const kit = manifest.assets.filter((a) => a.file.includes('/kit_v2/'));
  it('каждый файл из CSS существует и одобрен', () => {
    const used = [...css.matchAll(/kit_v2\/([\w]+\.png)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const f of used) {
      const a = kit.find((x) => x.file.endsWith(f))!;
      expect(existsSync(a.file)).toBe(true);
      expect(a.status).toBe('integrated');
    }
  });
  it('файлы на приёмке в CSS не попали', () => {
    for (const a of kit.filter((x) => x.status === 'review')) expect(css).not.toContain(a.file.split('/').pop()!);
  });
});

/** ART-009: 12 кандидатов на найм — по одному на имя из пула; лицо сохраняется после найма (привязка по имени). */
describe('ART-009 портреты кандидатов', async () => {
  const rules = (await import('../../content/staff_v1.json')).default as { names: string[] };
  const cands = manifest.assets.filter((a) => a.id.startsWith('ART009_CANDIDATE_C'));

  it('12 файлов на 12 имён пула, утверждены, хеши совпадают, игровые копии есть', () => {
    expect(cands).toHaveLength(12);
    rules.names.forEach((name, i) => {
      const n = String(i + 1).padStart(2, '0');
      const a = cands.find((x) => x.id === `ART009_CANDIDATE_C${n}`)!;
      expect(a.role).toContain(name);
      expect(a.status).toBe('approved');
      expect(createHash('sha256').update(readFileSync(a.file)).digest('hex')).toBe(a.sha256);
      expect(existsSync(`assets/characters/web/portrait_c${n}.webp`)).toBe(true);
      expect(existsSync(`assets/characters/web/face_c${n}.webp`)).toBe(true);
    });
  });
});
