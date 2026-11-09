import { describe, expect, it } from 'vitest';
import politics from '../../content/politics_v1.json';
import cases from '../../content/cases_v1.json';
import campaign from '../../content/campaign_v1.json';
import ops from '../../content/special_ops_v1.json';

describe('Багряные дома: утверждённые имена', () => {
  it('h1–h6 сохраняют ID и получают имена из лора', () => {
    expect(politics.houses.map((h) => [h.id, h.label])).toEqual([
      ['h1', 'Дом Ротан'], ['h2', 'Дом Вельт'], ['h3', 'Дом Севрин'],
      ['h4', 'Дом Тессен'], ['h5', 'Дом Варек'], ['h6', 'Дом Астэр'],
    ]);
  });
  it('в контенте не осталось временных порядковых имён', () => {
    const text = JSON.stringify([politics, cases, campaign, ops]);
    expect(text).not.toMatch(/(Перв|Втор|Трет|Четв[её]рт|Пят|Шест)[а-я]+ Дом/);
  });
});

describe('ART-017: гербы Домов', () => {
  it('у каждого Дома есть исходник, webp-копии и запись в manifest', async () => {
    const fs = await import('node:fs');
    const manifest = JSON.parse(fs.readFileSync('assets/manifest.json', 'utf-8')) as { assets: { file: string; webCopies?: string[] }[] };
    for (const h of politics.houses) {
      const entry = manifest.assets.find((a) => a.file.startsWith(`assets/houses/crest_${h.id}_`));
      expect(entry, h.id).toBeDefined();
      expect(fs.existsSync(entry!.file)).toBe(true);
      expect(entry!.webCopies).toEqual([`assets/houses/web/crest_${h.id}_256.webp`, `assets/houses/web/crest_${h.id}_64.webp`]);
      for (const w of entry!.webCopies!) expect(fs.existsSync(w)).toBe(true);
    }
  });
});
