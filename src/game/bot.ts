// UI-side bot policies (T-09): the same decisions the player makes on each screen,
// used by window.__debug.runBot(). Pure TS (no DOM) so it is unit-testable.
// Battles are played by sim/bots.playBattleWithBot when headless; in the real UI
// the battle controller asks `wantsIgnite` every frame.
import { BALANCE, HEROES, RELIC_BY_ID } from '../data';
import type { EventChoice, HeroId } from '../data';
import { SeededRng, type Formation, type MapNode, type Run, type UnitSnapshot } from '../sim';
import { greedyFormation, playBattleWithBot, type BotName } from '../sim/bots';

export type { BotName };

export function botRngFor(seed: number, bot: BotName): SeededRng {
  return new SeededRng(seed >>> 0).fork(`ui-bot:${bot}`);
}

export function partyHpFrac(run: Run): number {
  return run.party.reduce((s, h) => s + h.hpFrac, 0) / Math.max(1, run.party.length);
}

export function botNode(run: Run, bot: BotName, rng: SeededRng): MapNode {
  const nodes = run.availableNodes();
  if (nodes.length === 0) throw new Error('no node available');
  if (bot === 'random') return rng.pick(nodes);
  const hp = partyHpFrac(run);
  const cheapest = Math.min(...Object.values(BALANCE.merchant.relicPrice));
  const score = (n: MapNode): number => {
    switch (n.type) {
      case 'camp': return hp < 0.6 ? 10 : 2;
      case 'merchant': return run.shards >= cheapest ? 6 : 1;
      case 'elite': return hp > 0.8 ? 7 : 2;
      case 'fight': return 5;
      case 'event': return 3;
      case 'boss': return 0;
    }
  };
  return [...nodes].sort((a, b) => score(b) - score(a))[0] as MapNode;
}

export function botFormation(bot: BotName, rng: SeededRng): Formation {
  if (bot !== 'random') return greedyFormation();
  const ids = rng.shuffle(HEROES.map((h) => h.id));
  return { front: [ids[0] ?? null, ids[1] ?? null], back: [ids[2] ?? null, ids[3] ?? null] };
}

export function botRelic(choices: readonly string[], held: readonly string[], bot: BotName, rng: SeededRng): string | undefined {
  if (choices.length === 0) return undefined;
  if (bot === 'random') return rng.pick([...choices]);
  const tags = new Set(held.flatMap((h) => RELIC_BY_ID[h]?.tags ?? []));
  const score = (id: string): number => {
    const d = RELIC_BY_ID[id];
    if (!d) return -1;
    return d.tags.filter((t) => tags.has(t)).length * 2 + (d.rarity === 'rare' ? 1 : 0) - (d.effect.kind === 'shard_mult' ? 0.5 : 0);
  };
  return [...choices].sort((a, b) => score(b) - score(a))[0];
}

export function botUpgradeHero(run: Run, bot: BotName, rng: SeededRng): HeroId {
  if (bot === 'random') return rng.pick(HEROES).id;
  const order: HeroId[] = ['kit', 'lysa', 'oren', 'bram'];
  const open = run.party.filter((h) => h.skillRank < BALANCE.skills.maxRank);
  const pool = open.length > 0 ? open : run.party;
  return [...pool].sort((a, b) => a.skillRank - b.skillRank || order.indexOf(a.id) - order.indexOf(b.id))[0]?.id ?? 'kit';
}

export function botCampHeal(run: Run, bot: BotName, rng: SeededRng): boolean {
  return bot === 'random' ? rng.chance(0.5) : partyHpFrac(run) < 0.6;
}

/** Ids to buy, in order (re-evaluated after each purchase by the caller). */
export function botPurchase(run: Run, bot: BotName, rng: SeededRng): string | undefined {
  const stock = run.merchantStock().filter((s) => !s.sold && s.price <= run.shards);
  if (bot === 'random') return stock.length > 0 && rng.chance(0.5) ? rng.pick(stock).id : undefined;
  const relics = stock.filter((s) => s.kind === 'relic').map((s) => s.id);
  return botRelic(relics, run.relics, bot, rng);
}

function choiceRisk(c: EventChoice): number {
  let risk = (c.costShards ?? 0) / 200;
  for (const o of c.outcomes) {
    for (const e of o.effects) {
      if (e.kind === 'hp' && e.value < 0) risk -= o.probability * e.value * 3;
      else if (e.kind === 'hp') risk -= o.probability * e.value;
      else if (e.kind === 'curse') risk += o.probability * 0.1 * e.fights;
      else if (e.kind === 'fight') risk += o.probability * (e.pool === 'elite' ? 0.6 : 0.3) - (e.relicReward ? o.probability * 0.5 : 0);
      else if (e.kind === 'relic') risk -= o.probability;
      else if (e.kind === 'skill_rank') risk -= o.probability * 0.8;
      else if (e.kind === 'shards') risk -= o.probability * e.value / 100;
    }
  }
  return risk;
}

export function botEventChoice(choices: readonly EventChoice[], shards: number, bot: BotName, rng: SeededRng): number {
  const ok = choices.map((c, i) => ((c.costShards ?? 0) <= shards ? i : -1)).filter((i) => i >= 0);
  if (ok.length === 0) return 0;
  if (bot === 'random') return rng.pick(ok);
  return [...ok].sort((a, b) => choiceRisk(choices[a] as EventChoice) - choiceRisk(choices[b] as EventChoice))[0] ?? 0;
}

/** Ignite decision for the live UI battle loop. */
export function wantsIgnite(bot: BotName, units: readonly UnitSnapshot[]): boolean {
  if (bot === 'ignite-never') return false;
  if (bot === 'random') return true;
  const heroes = units.filter((u) => u.side === 'hero');
  const alive = heroes.filter((u) => u.alive);
  const hp = heroes.reduce((s, u) => s + (u.alive ? u.hp : 0), 0) / Math.max(1, heroes.reduce((s, u) => s + u.maxHp, 0));
  if (hp < 0.3 || alive.length <= 1) return true;
  return units.some((u) => u.side === 'enemy' && u.alive && u.broken);
}

/** Plays the rest of a run headlessly (no render). Returns the final status. */
export function autoPlayRun(run: Run, bot: BotName, rng: SeededRng): 'won' | 'lost' {
  for (let guard = 0; guard < 2000; guard++) {
    const done = botStep(run, bot, rng);
    if (done) return done;
  }
  throw new Error('autoPlayRun did not finish');
}

/** One headless decision. Returns the final status once the run is over. */
export function botStep(run: Run, bot: BotName, rng: SeededRng): 'won' | 'lost' | null {
  switch (run.status) {
    case 'won':
    case 'lost': return run.status;
    case 'story': run.ackStory(); break;
    case 'map': run.chooseNode(botNode(run, bot, rng).id); break;
    case 'battle': {
      const b = run.startBattle(botFormation(bot, rng));
      playBattleWithBot(b, bot);
      run.finishBattle(b);
      break;
    }
    case 'reward': {
      const pick = botRelic(run.pendingRelicChoice() ?? [], run.relics, bot, rng);
      if (pick) run.takeRelic(pick);
      else run.proceed();
      break;
    }
    case 'camp':
      if (botCampHeal(run, bot, rng)) run.camp({ kind: 'heal' });
      else run.camp({ kind: 'skill', hero: botUpgradeHero(run, bot, rng) });
      break;
    case 'merchant': {
      for (let i = 0; i < 6; i++) {
        const id = botPurchase(run, bot, rng);
        if (!id || !run.buy(id)) break;
      }
      run.proceed();
      break;
    }
    case 'event': {
      const ev = run.event();
      if (!run.eventResult && ev) run.resolveEvent(botEventChoice(ev.choices, run.shards, bot, rng));
      else if (run.eventResult?.pendingSkillRank) run.chooseSkillRank(botUpgradeHero(run, bot, rng));
      else run.proceed();
      break;
    }
  }
  return null;
}
