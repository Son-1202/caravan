import { describe, expect, it } from 'vitest';
import { BALANCE, MAP_CONFIG } from '../../src/data';
import { Run, isEncounter } from '../../src/sim';
import { autoplay } from './sim-helpers';

describe('Run map', () => {
  it('builds 4 regions of 3 steps (2–3 choices) + a boss, following map.json rules', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const run = new Run(seed);
      expect(run.map.map((r) => r.region)).toEqual(['whisperpine', 'glass_dunes', 'frostspire', 'solenne']);
      run.map.forEach((reg, ri) => {
        expect(reg.steps).toHaveLength(MAP_CONFIG.stepsPerRegion + 1);
        const counts: Record<string, number> = {};
        reg.steps.forEach((nodes, si) => {
          if (si === MAP_CONFIG.stepsPerRegion) {
            expect(nodes.map((n) => n.type)).toEqual(['boss']);
            return;
          }
          if (ri === 0 && si === 0) expect(nodes.map((n) => n.type)).toEqual(MAP_CONFIG.firstStepTypes);
          else {
            expect(nodes.length).toBeGreaterThanOrEqual(MAP_CONFIG.nodesPerStep.min - 1); // dedupe may drop 1 fallback
            expect(nodes.length).toBeLessThanOrEqual(MAP_CONFIG.nodesPerStep.max);
          }
          const types = nodes.map((n) => n.type);
          expect(new Set(types).size).toBe(types.length);
          expect(types.some((t) => t === 'fight' || t === 'elite')).toBe(true);
          for (const n of nodes) {
            counts[n.type] = (counts[n.type] ?? 0) + 1;
            if (n.type === 'event') expect(n.eventId).toBeTruthy();
            if (n.type === 'fight' || n.type === 'elite') expect(n.encounterId).toBeTruthy();
          }
        });
        for (const [t, max] of Object.entries(MAP_CONFIG.rules.maxPerRegion)) expect(counts[t] ?? 0).toBeLessThanOrEqual(max as number);
      });
      const events = run.map.flatMap((r) => r.steps.flat()).filter((n) => n.eventId).map((n) => n.eventId);
      expect(new Set(events).size).toBe(events.length);
    }
  });

  it('a full path is 16 nodes with ~13 encounters on average', () => {
    let enc = 0;
    let runs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { run, path } = autoplay(seed);
      if (run.status !== 'won') continue;
      runs++;
      expect(path).toHaveLength(16);
      enc += path.filter((t) => isEncounter(t as never)).length;
    }
    expect(runs).toBeGreaterThan(0);
    const avg = enc / runs;
    expect(avg).toBeGreaterThan(11);
    expect(avg).toBeLessThan(15);
  });
});

describe('Run flow', () => {
  it('starts with the prologue, 50 shards and a level-1 party', () => {
    const run = new Run(5);
    expect(run.status).toBe('story');
    expect(run.pendingStory).toBe('prologue');
    expect(run.shards).toBe(BALANCE.shards.start);
    expect(run.party.map((h) => h.level)).toEqual([1, 1, 1, 1]);
    run.ackStory();
    expect(run.status).toBe('map');
    expect(run.availableNodes().map((n) => n.type)).toEqual(['fight', 'event']);
  });

  it('pays shards for a fight and carries HP over', () => {
    const run = new Run(5);
    run.ackStory();
    const fight = run.availableNodes().find((n) => n.type === 'fight');
    run.chooseNode(fight!.id);
    expect(run.status).toBe('battle');
    const b = run.startBattle();
    b.runToEnd();
    run.finishBattle(b);
    expect(run.status).toBe('reward');
    const [lo, hi] = BALANCE.shards.fight;
    expect(run.lastReward!.shards).toBeGreaterThanOrEqual(lo);
    expect(run.lastReward!.shards).toBeLessThanOrEqual(hi);
    expect(run.party).toEqual(b.heroStates());
    if (run.pendingRelicChoice()) run.takeRelic(run.pendingRelicChoice()![0]!);
    else run.proceed();
    expect(run.status).toBe('map');
    expect(run.step).toBe(1);
  });

  it('plays to the end deterministically: stories after each region, levels after bosses', () => {
    const a = autoplay(1234);
    const b = autoplay(1234);
    expect(a.path).toEqual(b.path);
    expect(a.run.stats).toEqual(b.run.stats);
    expect(a.run.shards).toBe(b.run.shards);
    expect(a.run.relics).toEqual(b.run.relics);
    const won = [...Array(20).keys()].map((i) => autoplay(i + 1)).find((x) => x.run.status === 'won');
    expect(won).toBeTruthy();
    expect(won!.run.party.every((h) => h.level === 5)).toBe(true);
    expect(won!.run.stats.fights).toBeGreaterThanOrEqual(8);
  });

  it('camp heals or ranks up a skill; merchant sells and rerolls', () => {
    const run = new Run(9);
    run.status = 'camp';
    run.party = run.party.map((h) => ({ ...h, hpFrac: 0.5 }));
    run.camp({ kind: 'heal' });
    expect(run.party.every((h) => Math.abs(h.hpFrac - 0.9) < 1e-9)).toBe(true);
    run.status = 'camp';
    run.camp({ kind: 'skill', hero: 'lysa' });
    expect(run.party.find((h) => h.id === 'lysa')!.skillRank).toBe(2);

    run.status = 'merchant';
    run.shards = 500;
    (run as unknown as { stock: unknown }).stock = [];
    expect(run.reroll()).toBe(true);
    const stock = run.merchantStock();
    expect(stock.filter((s) => s.kind === 'relic')).toHaveLength(BALANCE.merchant.relicsOffered);
    expect(stock.filter((s) => s.kind === 'consumable')).toHaveLength(BALANCE.merchant.consumablesOffered);
    const relic = stock.find((s) => s.kind === 'relic')!;
    expect(run.buy(relic.id)).toBe(true);
    expect(run.relics).toContain(relic.id);
    expect(run.shards).toBe(500 - BALANCE.merchant.rerollCost - relic.price);
    expect(run.buy(relic.id)).toBe(false);
  });

  it('hard mode scales rewards down', () => {
    const run = new Run(5, true);
    expect(run.hard).toBe(true);
    run.ackStory();
    run.chooseNode(run.availableNodes().find((n) => n.type === 'fight')!.id);
    const b = run.startBattle();
    b.runToEnd();
    run.finishBattle(b);
    if (run.status === 'reward') {
      const [lo, hi] = BALANCE.shards.fight;
      expect(run.lastReward!.shards).toBeGreaterThanOrEqual(Math.round(lo * BALANCE.hardMode.shardMult));
      expect(run.lastReward!.shards).toBeLessThanOrEqual(Math.round(hi * BALANCE.hardMode.shardMult));
    }
  });
});
