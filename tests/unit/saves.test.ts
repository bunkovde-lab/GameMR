import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/reduce';
import { createInitialState } from '../../src/core/state';
import { SCHEMA_VERSION, type Command, type GameState } from '../../src/core/types';
import { parseSave, toSaveFile } from '../../src/persistence/saveFormat';
import { exportJson } from '../../src/persistence/saveStore';

const run = (s: GameState, cmds: Command[]) => cmds.reduce((acc, c) => reduce(acc, c).state, s);
const played = () =>
  run(createInitialState(), [
    { type: 'START_SHIFT' }, { type: 'ACKNOWLEDGE_INCIDENT', incidentId: 'bioleak' }, { type: 'TICK', minutes: 300 },
    { type: 'END_SHIFT' }, { type: 'ADVANCE_SHIFT' }, { type: 'START_SHIFT' }, { type: 'TICK', minutes: 47 },
  ]);

describe('CORE-04 saves', () => {
  it('export → import gives the identical state, and play continues identically', () => {
    const s = played();
    const r = parseSave(exportJson(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(s);
    const tail: Command[] = [{ type: 'TICK', minutes: 700 }, { type: 'END_SHIFT' }, { type: 'ADVANCE_SHIFT' }];
    expect(JSON.stringify(run(r.state, tail))).toBe(JSON.stringify(run(s, tail)));
  });
  it('rejects non-JSON, foreign files and newer schema versions with a reason', () => {
    expect(parseSave('{oops').ok).toBe(false);
    expect(parseSave({ hello: 1 }).ok).toBe(false);
    const future = { ...toSaveFile(played(), 'x', new Date(0)), schemaVersion: SCHEMA_VERSION + 1 };
    const r = parseSave(future);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/более новой версии/);
  });
  it('rejects a save where one person is listed in two squads', () => {
    const s = structuredClone(played());
    s.squads[0]!.memberIds.push(s.squads[1]!.memberIds[0]!);
    const r = parseSave(toSaveFile(s, 'x', new Date(0)));
    expect(r.ok).toBe(false);
  });
});
