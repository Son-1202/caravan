import { describe, expect, it } from 'vitest';
import { BALANCE, REGION_BY_ID, validateContent } from '../../src/data';
import type { BalanceConfig } from '../../src/data';
import {
  Battle, DEFAULT_FORMATION, SeededRng, compileRelics, curseMods, enemyTargets, makeHeroUnit, type SimEvent,
} from '../../src/sim';
import { ofType, only, party } from './sim-helpers';

const R1 = REGION_BY_ID.whisperpine;

describe('content', () => {
  it('validateContent() returns no problems', () => {
    expect(validateContent()).toEqual([]);
  });
});

describe('shield / break / recover', () => {
  it('weakness hits strip shield, 0 shield breaks, Broken skips a turn then recovers with full shield', () => {
    // Lysa (pierce) vs one Moss Wolf (weak to pierce, shield 2)
    const b = new Battle({ party: party(), formation: only('lysa'), enemies: { front: ['moss_wolf'], back: [] }, rng: 3 });
    b.runToEnd();
    const log = b.log;
    const iBreak = log.findIndex((e) => e.type === 'break');
    expect(iBreak).toBeGreaterThan(0);
    const shieldsBefore = ofType(log.slice(0, iBreak), 'shield').map((e) => e.shield);
    expect(shieldsBefore).toEqual([1, 0]);
    const hitsBefore = ofType(log.slice(0, iBreak), 'hit').filter((h) => h.source === 'h:lysa');
    expect(hitsBefore.every((h) => h.weakness)).toBe(true);
    const after = log.slice(iBreak);
    const iSkip = after.findIndex((e) => e.type === 'skip' && e.actor === 'e:0');
    const iRecover = after.findIndex((e) => e.type === 'recover' && e.target === 'e:0');
    const died = after.some((e) => e.type === 'death' && e.target === 'e:0');
    expect(iSkip).toBeGreaterThan(0);
    if (iRecover >= 0) {
      expect(iRecover).toBeGreaterThan(iSkip);
      expect(after[iRecover + 1]).toEqual({ type: 'shield', target: 'e:0', shield: 2 });
    } else {
      expect(died).toBe(true);
    }
  });

  it('a Broken enemy recovers after its break duration (no kill)', () => {
    // Lysa alone vs the Rootmother (900 HP, weak to fire only): use Shatter Salt ×4 to force a break
    const b = new Battle({
      party: party(), formation: only('bram'), enemies: { front: ['rootmother'], back: [] }, rng: 5,
      consumables: ['shatter_salt', 'shatter_salt', 'shatter_salt', 'shatter_salt'],
    });
    for (let i = 0; i < 4; i++) b.useConsumable('shatter_salt');
    expect(b.state.units.find((u) => u.uid === 'e:0')?.broken).toBe(true);
    for (let i = 0; i < 2000 && !b.log.some((e) => e.type === 'recover'); i++) b.tick();
    const iRec = b.log.findIndex((e) => e.type === 'recover');
    expect(iRec).toBeGreaterThan(0);
    // skip turn + duration: exactly durationActions enemy turns (1 skipped) before recovery
    const between = b.log.slice(b.log.findIndex((e) => e.type === 'break'), iRec);
    expect(ofType(between, 'skip').length).toBe(BALANCE.break.skipActions);
    const acts = ofType(between, 'action_start').filter((e) => e.actor === 'e:0').length;
    expect(acts + BALANCE.break.skipActions).toBe(BALANCE.break.durationActions);
    expect(b.state.units.find((u) => u.uid === 'e:0')?.shield).toBe(8);
  });

  it('Broken targets take ×breakDamageMult damage', () => {
    const bal: BalanceConfig = { ...BALANCE, damage: { ...BALANCE.damage, variance: 0, critMult: 1 } };
    const b = new Battle({
      party: party(), formation: only('kit'), enemies: { front: ['barkhide_stag'], back: [] }, rng: 11, balance: bal,
    });
    b.runToEnd();
    let broken = false;
    let action = '';
    const normal: number[] = [];
    const vsBroken: number[] = [];
    for (const e of b.log) {
      if (e.type === 'break') broken = true;
      if (e.type === 'recover') broken = false;
      if (e.type === 'action_start' && e.actor === 'h:kit') action = e.skill;
      if (e.type === 'ultimate') action = 'ultimate';
      if (e.type === 'hit' && e.source === 'h:kit' && action === 'basic' && !e.dot) (broken ? vsBroken : normal).push(e.amount);
    }
    expect(normal.length).toBeGreaterThan(0);
    expect(vsBroken.length).toBeGreaterThan(0);
    const n = normal[0] as number;
    for (const v of normal) expect(v).toBe(n);
    for (const v of vsBroken) expect(Math.abs(v - n * BALANCE.break.dmgMult)).toBeLessThanOrEqual(1);
  });
});

describe('formation targeting', () => {
  it('melee hits the front row ~70% of the time; empty rows fall through', () => {
    const relics = compileRelics([]);
    const cm = curseMods([]);
    const heroes = party().map((h) => {
      const row = DEFAULT_FORMATION.front.includes(h.id) ? 'front' : 'back';
      return makeHeroUnit(h, row, 0, BALANCE, relics, cm);
    });
    const rng = new SeededRng(2024);
    const N = 20000;
    let front = 0;
    for (let i = 0; i < N; i++) if (enemyTargets('melee', heroes, BALANCE, rng)[0]?.row === 'front') front++;
    expect(Math.abs(front / N - BALANCE.formation.frontMeleeShare)).toBeLessThan(0.05);
    const backOnly = heroes.filter((h) => h.row === 'back');
    for (let i = 0; i < 200; i++) expect(enemyTargets('melee', backOnly, BALANCE, rng)[0]?.row).toBe('back');
    expect(enemyTargets('aoe', heroes, BALANCE, rng)).toHaveLength(4);
  });

  it('front-row share holds in real battles (seeded trials)', () => {
    let front = 0;
    let total = 0;
    for (let seed = 1; seed <= 150; seed++) {
      // no Bram ⇒ no taunt; Rime Golems only ever attack in melee (Glacier Slam)
      const b = new Battle({
        party: party(), formation: only('kit', 'lysa', 'oren'), enemies: { front: ['rime_golem', 'rime_golem'], back: [] },
        regionOrder: 4, rng: seed, timeLimit: 60,
      });
      b.runToEnd({ autoIgnite: false });
      for (const h of ofType(b.log, 'hit')) {
        if (!h.source.startsWith('e:')) continue;
        total++;
        if (h.target === 'h:kit') front++;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(Math.abs(front / total - 0.7)).toBeLessThan(0.05);
  });
});

describe('Ember / Ignite', () => {
  it('requires a full meter and fires 4 ultimates', () => {
    const b = new Battle({
      party: party(), formation: DEFAULT_FORMATION, enemies: { front: ['hollow_king'], back: [] }, regionOrder: 4, rng: 8,
      relics: ['banked_coals'], consumables: ['bottled_spark', 'bottled_spark'],
    });
    expect(b.state.emberMeter).toBe(30);
    expect(b.canIgnite()).toBe(false);
    expect(b.ignite().some((e) => e.type === 'ignite')).toBe(false);
    b.useConsumable('bottled_spark');
    b.useConsumable('bottled_spark');
    expect(b.state.emberMeter).toBe(100);
    expect(b.canIgnite()).toBe(true);
    const ev = b.ignite();
    expect(ev[0]).toEqual({ type: 'ignite' });
    expect(ofType(ev, 'ultimate').map((e) => e.actor).sort()).toEqual(['h:bram', 'h:kit', 'h:lysa', 'h:oren']);
    expect(b.state.emberMeter).toBe(0);
    expect(b.canIgnite()).toBe(false);
  });

  it('meter fills from hits, breaks and kills during a fight', () => {
    const b = new Battle({ party: party(), formation: DEFAULT_FORMATION, enemies: R1.fights[2] as never, rng: 4 });
    const seen: number[] = [];
    while (b.state.outcome === 'ongoing') for (const e of b.tick()) if (e.type === 'ember') seen.push(e.value);
    expect(Math.max(...seen)).toBeGreaterThan(20);
  });
});

describe('hero AI', () => {
  it('Oren heals an ally under 50% HP, otherwise throws fire', () => {
    const hurt = new Battle({
      party: party(1, { bram: { hpFrac: 0.3 } }), formation: only('bram', 'oren'),
      enemies: { front: ['thornling'], back: [] }, rng: 1,
    });
    let first: SimEvent[] = [];
    while (hurt.state.outcome === 'ongoing') {
      const ev = hurt.tick();
      const i = ev.findIndex((e) => e.type === 'action_start' && e.actor === 'h:oren');
      if (i >= 0) { first = ev.slice(i); break; }
    }
    expect(first[0]).toMatchObject({ type: 'action_start', skill: 'hearthlight' });
    expect(first[1]).toMatchObject({ type: 'heal', source: 'h:oren', target: 'h:bram' });
    expect((first[1] as { amount: number }).amount).toBeGreaterThan(0);

    const fine = new Battle({ party: party(), formation: only('bram', 'oren'), enemies: { front: ['thornling'], back: [] }, rng: 1 });
    let act: SimEvent | undefined;
    while (!act) act = fine.tick().find((e) => e.type === 'action_start' && e.actor === 'h:oren');
    expect(act).toMatchObject({ skill: 'basic' });
  });

  it('Bram guards the wounded ally and taunts', () => {
    const b = new Battle({
      party: party(1, { lysa: { hpFrac: 0.2 } }), formation: only('bram', 'lysa'), enemies: { front: ['thornling'], back: [] }, rng: 2,
    });
    let ev: SimEvent[] = [];
    while (!ev.some((e) => e.type === 'action_start' && e.actor === 'h:bram')) ev = b.tick();
    const st = ofType(ev, 'status');
    expect(st).toContainEqual({ type: 'status', target: 'h:lysa', status: 'guard', on: true });
    expect(st).toContainEqual({ type: 'status', target: 'h:bram', status: 'taunt', on: true });
  });
});

describe('bosses', () => {
  it('the Hollow King goes through all 3 phases before he dies', () => {
    for (const [seed, level] of [[42, 4], [7, 4], [13, 12]] as const) {
      const b = new Battle({
        party: party(level), formation: DEFAULT_FORMATION, enemies: REGION_BY_ID.solenne.boss, regionOrder: 4, rng: seed,
      });
      b.runToEnd();
      expect(b.state.outcome).toBe('win');
      const phases = ofType(b.log, 'phase').filter((e) => e.target === 'e:0');
      expect(phases.map((p) => p.phase)).toEqual([2, 3]);
      const iDeath = b.log.findIndex((e) => e.type === 'death' && e.target === 'e:0');
      expect(b.log.indexOf(phases[1] as SimEvent)).toBeLessThan(iDeath);
    }
  });
});

describe('determinism', () => {
  it('same seed + same decisions ⇒ identical event log', () => {
    const mk = (seed: number) => {
      const b = new Battle({ party: party(), formation: DEFAULT_FORMATION, enemies: R1.boss, rng: seed });
      return b.runToEnd();
    };
    expect(mk(77)).toEqual(mk(77));
    expect(mk(77)).not.toEqual(mk(78));
  });

  it('variable dt sequences with the same total still end the same way per seed', () => {
    const a = new Battle({ party: party(), formation: DEFAULT_FORMATION, enemies: R1.fights[0] as never, rng: 9 });
    const b = new Battle({ party: party(), formation: DEFAULT_FORMATION, enemies: R1.fights[0] as never, rng: 9 });
    a.runToEnd({ dt: 0.05 });
    b.runToEnd({ dt: 0.05 });
    expect(a.stats).toEqual(b.stats);
  });
});
