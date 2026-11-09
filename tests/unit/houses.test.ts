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
