import { reduce } from '../../src/core/reduce';
import { pendingDecision } from '../../src/core/operations';
import type { Command, GameState } from '../../src/core/types';

export const ok = (s: GameState, c: Command) => {
  const r = reduce(s, c);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

/**
 * Прогон времени «как игрок, который всегда выбирает первый вариант»: на развилке (DECISION_PAUSE)
 * время стоит, поэтому тесты, которым важно только время, решают развилку и идут дальше.
 */
export function tick(s: GameState, minutes: number, choose: (options: string[]) => string = (o) => o[0]!): GameState {
  const target = s.minute + minutes;
  let guard = 0;
  while (s.phase === 'ACTIVE' && s.minute < target && guard++ < 10_000) {
    const p = pendingDecision(s);
    if (p) {
      s = ok(s, { type: 'CHOOSE_OPTION', squadId: p.squad.id, optionId: choose(p.stage.options.map((o) => o.id)) });
      continue;
    }
    s = ok(s, { type: 'TICK', minutes: target - s.minute });
  }
  return s;
}

/** Как Array.reduce по командам, но TICK идёт через tick() (ошибки остальных команд игнорируются, как в UI). */
export const runAuto = (s: GameState, cmds: Command[]) =>
  cmds.reduce((acc, c) => (c.type === 'TICK' && acc.phase === 'ACTIVE' && !acc.paused ? tick(acc, c.minutes) : reduce(acc, c).state), s);
