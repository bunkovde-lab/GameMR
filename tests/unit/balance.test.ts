import { describe, expect, it } from 'vitest';
import { simulate } from '../../scripts/balance/simulate';

// W10: бот проходит кампанию настоящим ядром; полные 10 000 прогонов — scripts/balance/run.ts.
describe('W10 balance bot', () => {
  it.each(['idle', 'dispatch', 'full'] as const)('%s: plays all 12 shifts to an ending with sane numbers, deterministically', (policy) => {
    const r = simulate(4242, policy);
    expect(r.shiftsPlayed).toBe(12);
    expect(['order', 'cost', 'collapse']).toContain(r.ending);
    for (const v of [r.balance, r.safety, r.trust, r.dead]) expect(Number.isFinite(v)).toBe(true);
    expect(r.staffAlive + r.dead).toBeGreaterThanOrEqual(12);
    expect(simulate(4242, policy)).toEqual(r);
  }, 30_000);
});
