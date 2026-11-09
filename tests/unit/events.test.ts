import { describe, expect, it } from 'vitest';
import { INCIDENT_TEMPLATES, START_INCIDENTS } from '../../src/core/content';
import { RANDOM_POOL, houseTextWith, outcomeFlags, publicAftermath, templateById } from '../../src/core/events';
import { OPS } from '../../src/core/operations';
import { createInitialState } from '../../src/core/state';

/** W10: 36 происшествий по сценарию W10_EVENTS_v1 (согласован Дмитрием 2026-11-09). */
describe('W10 события', () => {
  it('36 шаблонов: по 6 на район, 22 рядовых, 12 сложных, 2 особых; id пяти демо-вызовов сохранены', () => {
    expect(INCIDENT_TEMPLATES).toHaveLength(36);
    const byDistrict = new Map<string, number>();
    for (const t of INCIDENT_TEMPLATES) byDistrict.set(t.districtId, (byDistrict.get(t.districtId) ?? 0) + 1);
    expect([...byDistrict.values()]).toEqual([6, 6, 6, 6, 6, 6]);
    const cls = (c: string) => INCIDENT_TEMPLATES.filter((t) => (t as unknown as { incidentClass: string }).incidentClass === c).length;
    expect([cls('routine'), cls('complex'), cls('special')]).toEqual([22, 12, 2]);
    for (const id of ['medriot', 'bioleak', 'missing', 'raid', 'illegal']) expect(templateById(id)?.title).toBeTruthy();
    expect(new Set(INCIDENT_TEMPLATES.map((t) => t.id)).size).toBe(36);
  });

  it('у каждого сложного и особого есть развилки; у рядовых их нет', () => {
    for (const t of INCIDENT_TEMPLATES) {
      const c = (t as unknown as { incidentClass: string }).incidentClass;
      const st = OPS.stages[t.id] ?? [];
      if (c === 'routine') expect(st, t.id).toHaveLength(0);
      else expect(st.length, t.id).toBeGreaterThanOrEqual(1);
      for (const s of st) for (const o of s.options) expect(o.result, `${t.id}/${o.id}`).toBeTruthy();
    }
  });

  it('10 сюжетных событий не входят в случайный пул; первая смена — те же пять вызовов', () => {
    const story = INCIDENT_TEMPLATES.filter((t) => t.story);
    expect(story).toHaveLength(10);
    expect(RANDOM_POOL).toHaveLength(26);
    expect(RANDOM_POOL.some((t) => t.story)).toBe(false);
    expect(createInitialState().incidents.map((i) => i.templateId)).toEqual(START_INCIDENTS.map((t) => t.id));
  });

  it('скрытая правда и строки о деле не попадают в «что на кону»; сцены — только у сложных и особых', () => {
    for (const t of INCIDENT_TEMPLATES) {
      const stakes = publicAftermath(t).join(' ');
      expect(stakes).not.toMatch(/C\d-E\d\d|Дело:/);
      if (t.hidden) expect(stakes).not.toContain(t.hidden);
      const c = (t as unknown as { incidentClass: string }).incidentClass;
      if (c === 'routine') expect(t.scene ?? null, t.id).toBeNull();
    }
  });

  it('флаги: успех — все, частичный — первый, риск — при неудаче', () => {
    const t = templateById('organ_vault')!;
    expect(outcomeFlags(t, 'success')).toEqual(['c3_organ_chain_secured']);
    expect(outcomeFlags(t, 'failure')).toEqual(['medical_recipients_at_risk']);
    expect(outcomeFlags(templateById('medriot'), 'partial')).toEqual(['medriot_patients_preserved']);
  });

  it('имена Домов подставляются по справочнику в нужном падеже', () => {
    const names = ['Ротан', 'Вельт', 'Севрин', 'Тессен', 'Варек', 'Астэр'];
    const f = (x: string) => houseTextWith(x, (i) => names[i]!);
    expect(f('лаборатория Первого Дома')).toBe('лаборатория Дома Ротан');
    expect(f('претензии Второму Дому')).toBe('претензии Дому Вельт');
    expect(f('Второй Дом против')).toBe('Дом Вельт против');
    expect(f('связывая Шестой и Пятый Дома')).toBe('связывая Дома Астэр и Варек');
    expect(houseTextWith('Первого Дома', () => null)).toBe('Первого Дома');
  });
});
