import { describe, expect, it } from 'vitest';
import { Battle, DEFAULT_FORMATION } from '../../src/sim';
import { BOT_NAMES, greedyFormation, playBattleWithBot, playRun } from '../../src/sim/bots';
import { party } from './sim-helpers';

describe('bots', () => {
  it('are deterministic for a seed', () => {
    for (const bot of BOT_NAMES) {
      for (const seed of [1, 7, 42]) expect(playRun(seed, bot)).toEqual(playRun(seed, bot));
    }
  });

  it('a greedy run terminates with consistent records', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = playRun(seed, 'greedy');
      expect(r.fights.length).toBe(r.encounters);
      expect(r.encounters).toBeGreaterThan(0);
      expect(r.regionReached).toBeGreaterThanOrEqual(1);
      expect(r.regionReached).toBeLessThanOrEqual(4);
      if (r.won) {
        expect(r.fights.at(-1)?.kind).toBe('final');
        expect(r.hollowKingPhase).toBeGreaterThanOrEqual(1);
      } else expect(r.fights.at(-1)?.won).toBe(false);
      expect(r.totalTime).toBeCloseTo(r.fights.reduce((s, f) => s + f.durationSec, 0), 6);
    }
  });

  it('greedy puts Bram in the front row', () => {
    expect(greedyFormation().front).toContain('bram');
  });

  it('ignite-never never ignites; random ignites', () => {
    const never = playRun(3, 'ignite-never');
    expect(never.fights.every((f) => f.ignites === 0)).toBe(true);
    const rnd = playRun(3, 'random');
    expect(rnd.fights.some((f) => f.ignites > 0)).toBe(true);
  });

  it('playBattleWithBot finishes a battle', () => {
    const b = new Battle({ party: party(4), formation: DEFAULT_FORMATION, enemies: { front: ['hollow_king'], back: [] }, regionOrder: 4, rng: 9 });
    const r = playBattleWithBot(b, 'greedy');
    expect(b.state.outcome).not.toBe('ongoing');
    expect(r.bossPhase).toBeGreaterThanOrEqual(1);
  });
});
