import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/core/state';
import { awayLine, homeStatus, returnHome } from '../../src/core/squadHome';
import { reserve } from '../../src/core/staff';
import { parseSave, toSaveFile } from '../../src/persistence/saveFormat';
import type { GameState } from '../../src/core/types';
import { ok, tick } from './helpers';

const started = () => ok(createInitialState(), { type: 'START_SHIFT' });
const person = (s: GameState, id: string) => s.staff.find((p) => p.id === id)!;
const squad = (s: GameState, id: string) => s.squads.find((q) => q.id === id)!;
const nextShift = (s: GameState) => ok(ok(ok(tick(s, 720), { type: 'END_SHIFT' }), { type: 'ADVANCE_SHIFT' }), { type: 'START_SHIFT' });
/** «Аксон» полон: p1, p2 и p10 из «Резонанса»; p9 — в резерве. */
const fullAxon = () => {
  let s = started();
  s = ok(s, { type: 'ASSIGN_STAFF', staffId: 'p10', squadId: 'axon' });
  s = ok(s, { type: 'UNASSIGN_STAFF', staffId: 'p9' });
  expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p2', 'p10']);
  return s;
};

describe('Постоянный состав: возврат в свой отряд', () => {
  it('после курса сотрудник сам встаёт на прежнее место и снова командует', () => {
    let s = started();
    s = ok(s, { type: 'SET_COMMANDER', squadId: 'axon', staffId: 'p1' });
    s = ok(s, { type: 'START_COURSE', staffId: 'p1', nodeId: 'cmd1' });
    expect(squad(s, 'axon').memberIds).toEqual(['p2']);
    expect(homeStatus(s, person(s, 'p1'))?.text).toBe('Вернётся в отряд «Аксон»');
    s = nextShift(s);
    expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p2']);
    expect(squad(s, 'axon').commanderId).toBe('p1');
    expect(person(s, 'p1').home).toBeNull();
    expect(s.log.find((e) => e.type === 'staff_returned')?.text).toBe(`${person(s, 'p1').name} вернулся(лась) в отряд «Аксон» командиром.`);
  });

  it('раненого подменили резервистом — после лечения он возвращается, подмена уходит в резерв', () => {
    let s = fullAxon();
    person(s, 'p2').health = 'serious_injury';
    s = ok(s, { type: 'START_TREATMENT', staffId: 'p2', plan: 'standard' });
    s = ok(s, { type: 'SWAP_STAFF', staffId: 'p2', withId: 'p9' });
    expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p9', 'p10']);
    expect(person(s, 'p2').home).toMatchObject({ squadId: 'axon', slot: 1, standInId: 'p9' });
    // Сохранение и загрузка не теряют место.
    const loaded = parseSave(JSON.parse(JSON.stringify(toSaveFile(s, 't', new Date(0)))));
    expect(loaded.ok && person(loaded.state, 'p2').home?.squadId).toBe('axon');
    for (let i = 0; i < 8 && person(s, 'p2').health !== 'healthy'; i++) s = nextShift(s);
    expect(person(s, 'p2').health).toBe('healthy');
    expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p2', 'p10']);
    expect(reserve(s).map((p) => p.id)).toContain('p9');
  });

  it('место занято без подмены — ждёт с пометкой и возвращается, как только место освободится', () => {
    let s = fullAxon();
    s = ok(s, { type: 'START_COURSE', staffId: 'p1', nodeId: 'cmd1' });
    s = ok(s, { type: 'ASSIGN_STAFF', staffId: 'p9', squadId: 'axon' });
    s = nextShift(s);
    expect(person(s, 'p1').training).toBeNull();
    expect(squad(s, 'axon').memberIds).toEqual(['p2', 'p10', 'p9']);
    expect(homeStatus(s, person(s, 'p1'))).toMatchObject({ waiting: true, text: 'Ждёт места в отряде «Аксон»' });
    s = ok(s, { type: 'UNASSIGN_STAFF', staffId: 'p9' });
    s = tick(s, 1);
    expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p2', 'p10']);
  });

  it('отряд на выезде — возврат откладывается до его возвращения', () => {
    let s = started();
    s = ok(s, { type: 'START_COURSE', staffId: 'p2', nodeId: 'cmd1' });
    expect(squad(s, 'axon').memberIds).toEqual(['p1']);
    person(s, 'p2').training = null; // курс окончен, а «Аксон» как раз выехал
    squad(s, 'axon').status = 'en_route';
    returnHome(s, () => {});
    expect(squad(s, 'axon').memberIds).not.toContain('p2');
    expect(homeStatus(s, person(s, 'p2'))?.text).toBe('Вернётся в «Аксон» после выезда');
    squad(s, 'axon').status = 'ready';
    returnHome(s, () => {});
    expect(squad(s, 'axon').memberIds).toEqual(['p1', 'p2']);
  });

  it('ручное назначение в другой отряд отменяет возврат; здоровый, выведенный в резерв, не возвращается', () => {
    let s = started();
    s = ok(s, { type: 'START_COURSE', staffId: 'p1', nodeId: 'cmd1' });
    s = ok(s, { type: 'UNASSIGN_STAFF', staffId: 'p10' });
    expect(person(s, 'p10').home ?? null).toBeNull();
    s = ok(s, { type: 'ASSIGN_STAFF', staffId: 'p1', squadId: 'resonance' });
    expect(person(s, 'p1').home).toBeNull();
    s = nextShift(s);
    expect(squad(s, 'axon').memberIds).toEqual(['p2']);
    expect(squad(s, 'resonance').memberIds).toEqual(['p9', 'p1']);
  });
});

describe('Пометка в карточке отряда', () => {
  it('awayLine называет выбывших и причину', () => {
    let s = started();
    s = ok(s, { type: 'START_COURSE', staffId: 'p1', nodeId: 'cmd1' });
    expect(awayLine(s, 'axon')).toBe(`${person(s, 'p1').name} (на обучении)`);
    expect(awayLine(s, 'sigma')).toBe('');
  });
});
