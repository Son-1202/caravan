// T-09: pure game-layer logic (screen flow, formation editing, UI bot policies).
import { describe, expect, it } from 'vitest';
import { HEROES } from '../../src/data';
import { DEFAULT_FORMATION, Run } from '../../src/sim';
import { screenFor } from '../../src/game/flow';
import { getSlot, isValidFormation, safeFormation, slotOf, swapSlots } from '../../src/game/formation';
import { autoPlayRun, botEventChoice, botNode, botRngFor, botStep, wantsIgnite } from '../../src/game/bot';

const IDS = HEROES.map((h) => h.id);
const flags = { started: true, battleLive: false, eventOutcomeShown: false };

describe('screenFor', () => {
  it('shows the start screen until begun', () => {
    expect(screenFor('map', { ...flags, started: false })).toBe('start');
  });
  it('maps battle status to formation, then battle once live', () => {
    expect(screenFor('battle', flags)).toBe('formation');
    expect(screenFor('battle', { ...flags, battleLive: true })).toBe('battle');
  });
  it('keeps an event outcome on screen even if it queued a fight', () => {
    expect(screenFor('battle', { ...flags, eventOutcomeShown: true })).toBe('event');
  });
  it('passes other statuses through', () => {
    for (const s of ['map', 'reward', 'camp', 'merchant', 'event', 'won', 'lost'] as const) expect(screenFor(s, flags)).toBe(s);
  });
});

describe('formation helpers', () => {
  it('swaps two filled slots and keeps the formation valid', () => {
    const f = swapSlots(DEFAULT_FORMATION, 'front0', 'back1');
    expect(getSlot(f, 'front0')).toBe(DEFAULT_FORMATION.back[1]);
    expect(getSlot(f, 'back1')).toBe(DEFAULT_FORMATION.front[0]);
    expect(isValidFormation(f, IDS)).toBe(true);
    expect(DEFAULT_FORMATION.front[0]).toBe('bram'); // input untouched
  });
  it('finds a hero slot', () => {
    expect(slotOf(DEFAULT_FORMATION, 'oren')).toBe('back1');
  });
  it('rejects duplicates / missing heroes and falls back to the default', () => {
    const bad = { front: ['bram', 'bram'], back: ['lysa', null] } as never;
    expect(isValidFormation(bad, IDS)).toBe(false);
    expect(safeFormation(bad, IDS)).toEqual(DEFAULT_FORMATION);
    expect(safeFormation(null, IDS)).toEqual(DEFAULT_FORMATION);
  });
});

describe('UI bot', () => {
  it('picks only reachable nodes', () => {
    const run = new Run(11);
    run.ackStory();
    const ids = run.availableNodes().map((n) => n.id);
    expect(ids).toContain(botNode(run, 'greedy', botRngFor(11, 'greedy')).id);
    expect(ids).toContain(botNode(run, 'random', botRngFor(11, 'random')).id);
  });
  it('never picks an unaffordable event choice', () => {
    const choices = [{ label: 'pay', costShards: 999, outcomes: [] }, { label: 'walk', outcomes: [] }];
    expect(botEventChoice(choices, 10, 'greedy', botRngFor(1, 'greedy'))).toBe(1);
  });
  it('ignite policies', () => {
    const unit = (side: 'hero' | 'enemy', broken = false) => ({
      uid: side, side, defId: 'x', name: 'x', row: 'front' as const, slot: 0, hp: 50, maxHp: 50, gauge: 0, shield: 0, maxShield: 0,
      weaknesses: [], broken, alive: true, phase: 0, status: [],
    });
    const calm = [unit('hero'), unit('hero'), unit('enemy')];
    expect(wantsIgnite('ignite-never', calm)).toBe(false);
    expect(wantsIgnite('random', calm)).toBe(true);
    expect(wantsIgnite('greedy', calm)).toBe(false);
    expect(wantsIgnite('greedy', [unit('hero'), unit('hero'), unit('enemy', true)])).toBe(true);
  });
  it('plays a whole run headlessly to won/lost, deterministically', () => {
    const a = new Run(4242);
    const b = new Run(4242);
    const ra = autoPlayRun(a, 'greedy', botRngFor(4242, 'greedy'));
    const rb = autoPlayRun(b, 'greedy', botRngFor(4242, 'greedy'));
    expect(['won', 'lost']).toContain(ra);
    expect(ra).toBe(rb);
    expect(a.stats).toEqual(b.stats);
    expect(a.stats.fights).toBeGreaterThan(0);
  });
  it('botStep returns the final status once the run is over', () => {
    const run = new Run(7);
    const rng = botRngFor(7, 'random');
    let res: string | null = null;
    for (let i = 0; i < 2000 && !res; i++) res = botStep(run, 'random', rng);
    expect(res).toBe(run.status);
  });
});
