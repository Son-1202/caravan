// Headless bot players: drive a whole Run (map, formation, rewards, camp, merchant, events, Ignite).
// Pure TS: no node / DOM / Three imports. Used by scripts/balance.ts and (later) window.__debug.
import { BALANCE, ENEMY_BY_ID, HERO_BY_ID, HEROES, RELIC_BY_ID } from '../data';
import type { EventChoice, HeroId, RegionId } from '../data';
import type { Battle } from './combat';
import type { MapNode } from './mapgen';
import { SeededRng } from './rng';
import { Run } from './run';
import type { Formation, HeroState, SimEvent, UnitSnapshot } from './types';

export type BotName = 'random' | 'greedy' | 'ignite-never';
export const BOT_NAMES: readonly BotName[] = ['random', 'greedy', 'ignite-never'];

export type FightKind = 'normal' | 'elite' | 'boss' | 'final';

export interface FightRecord {
  kind: FightKind;
  region: RegionId;
  durationSec: number;
  won: boolean;
  ignites: number;
  breaks: number;
  /** highest boss phase reached (1 = base); 0 when no boss/final enemy */
  bossPhase: number;
}

export interface RunResult {
  seed: number;
  bot: BotName;
  won: boolean;
  /** 1..4: region the run ended in (4 when won) */
  regionReached: number;
  region: RegionId;
  encounters: number;
  fights: FightRecord[];
  relics: string[];
  /** highest Hollow King phase reached (1..3); 0 if never fought */
  hollowKingPhase: number;
  /** total battle sim seconds */
  totalTime: number;
}

export interface PlayOpts {
  hard?: boolean;
  /** battle tick size in sim seconds (default 0.05) */
  dt?: number;
}

export interface BattleBotResult {
  won: boolean;
  durationSec: number;
  ignites: number;
  breaks: number;
  bossPhase: number;
}

const HEAL_THRESHOLD = 0.6;

function botRng(seed: number, bot: BotName): SeededRng {
  return new SeededRng(seed >>> 0).fork(`bot:${bot}`);
}

function isBossUnit(u: UnitSnapshot): boolean {
  const t = ENEMY_BY_ID[u.defId]?.tier;
  return u.side === 'enemy' && (t === 'boss' || t === 'final');
}

/** Party HP as a fraction of total max HP (fallen heroes count as 0). */
function partyHpFrac(units: readonly UnitSnapshot[]): number {
  let hp = 0;
  let max = 0;
  for (const u of units) {
    if (u.side !== 'hero') continue;
    hp += u.alive ? u.hp : 0;
    max += u.maxHp;
  }
  return max > 0 ? hp / max : 0;
}

function runHpFrac(party: readonly HeroState[]): number {
  return party.reduce((s, h) => s + h.hpFrac, 0) / Math.max(1, party.length);
}

/** Greedy Ignite policy: hold until an enemy (or the boss, when present) is Broken, or the party is about to die. */
function greedyWantsIgnite(units: readonly UnitSnapshot[]): boolean {
  const heroes = units.filter((u) => u.side === 'hero' && u.alive);
  const dying = partyHpFrac(units) < 0.3 || heroes.length <= 1 || heroes.some((h) => h.hp / h.maxHp < 0.15);
  if (dying) return true;
  const enemies = units.filter((u) => u.side === 'enemy' && u.alive);
  const bosses = enemies.filter(isBossUnit);
  return (bosses.length > 0 ? bosses : enemies).some((e) => e.broken);
}

/** Battle-time consumables (all bots): revive fallen heroes, drink broth when low. */
function useBattleItems(battle: Battle): void {
  if (battle.consumables.length === 0) return;
  const units = battle.state.units;
  const fallen = units.find((u) => u.side === 'hero' && !u.alive);
  if (fallen && battle.consumables.includes('phoenix_feather')) battle.useConsumable('phoenix_feather', fallen.uid);
  if (partyHpFrac(units) < 0.4 && battle.consumables.includes('hearth_broth')) battle.useConsumable('hearth_broth');
}

/** Opening consumables (greedy family): crack shields / feed the Ember against bosses. */
function useOpeningItems(battle: Battle): SimEvent[] {
  const evs: SimEvent[] = [];
  if (!battle.state.units.some(isBossUnit)) return evs;
  if (battle.consumables.includes('shatter_salt')) evs.push(...battle.useConsumable('shatter_salt'));
  if (battle.consumables.includes('bottled_spark')) evs.push(...battle.useConsumable('bottled_spark'));
  return evs;
}

/** Ticks a battle to its end, deciding Ignite (and items) per bot policy. */
export function playBattleWithBot(battle: Battle, bot: BotName, dt = 0.05): BattleBotResult {
  let bossPhase = battle.state.units.some(isBossUnit) ? 1 : 0;
  const track = (evs: readonly SimEvent[]): boolean => {
    let notable = false;
    for (const e of evs) {
      if (e.type === 'phase') bossPhase = Math.max(bossPhase, e.phase);
      else if (e.type === 'death' || e.type === 'break' || e.type === 'hit') notable = true;
    }
    return notable;
  };
  if (bot !== 'random') track(useOpeningItems(battle));
  let n = 0;
  while (battle.state.outcome === 'ongoing') {
    const notable = track(battle.tick(dt));
    n++;
    if (notable) useBattleItems(battle);
    if (!battle.canIgnite() || bot === 'ignite-never') continue;
    if (bot === 'random' || ((notable || n % 4 === 0) && greedyWantsIgnite(battle.state.units))) track(battle.ignite());
  }
  const s = battle.stats;
  return { won: battle.state.outcome === 'win', durationSec: s.time, ignites: s.ignites, breaks: s.breaks, bossPhase };
}

// ---------- run-level decisions ----------

function randomFormation(rng: SeededRng): Formation {
  const ids = rng.shuffle(HEROES.map((h) => h.id));
  return { front: [ids[0] ?? null, ids[1] ?? null], back: [ids[2] ?? null, ids[3] ?? null] };
}

/** Bram front + the next-tankiest hero (HP × DEF); the rest in the back. */
export function greedyFormation(): Formation {
  const tank = (id: HeroId) => HERO_BY_ID[id].base.hp * HERO_BY_ID[id].base.def;
  const others = HEROES.map((h) => h.id).filter((id) => id !== 'bram').sort((a, b) => tank(b) - tank(a));
  return { front: ['bram', others[0] ?? null], back: [others[1] ?? null, others[2] ?? null] };
}

function relicScore(id: string, held: readonly string[]): number {
  const def = RELIC_BY_ID[id];
  if (!def) return -1;
  const tags = new Set(held.flatMap((h) => RELIC_BY_ID[h]?.tags ?? []));
  const synergy = def.tags.filter((t) => tags.has(t)).length;
  return synergy * 2 + (def.rarity === 'rare' ? 1 : 0) + (def.effect.kind === 'shard_mult' ? -0.5 : 0);
}

function bestRelic(ids: readonly string[], held: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const id of ids) {
    const s = relicScore(id, held);
    if (s > bestScore) { best = id; bestScore = s; }
  }
  return best;
}

function greedyNode(nodes: readonly MapNode[], run: Run): MapNode {
  const hp = runHpFrac(run.party);
  const cheapest = Math.min(...Object.values(BALANCE.merchant.relicPrice));
  const score = (n: MapNode): number => {
    switch (n.type) {
      case 'camp': return hp < HEAL_THRESHOLD ? 10 : 2;
      case 'merchant': return run.shards >= cheapest ? 6 : 1;
      case 'elite': return hp > 0.8 ? 7 : 2;
      case 'fight': return 5;
      case 'event': return 3;
      case 'boss': return 0;
    }
  };
  return [...nodes].sort((a, b) => score(b) - score(a))[0] as MapNode;
}

function choiceRisk(c: EventChoice): { risk: number; value: number } {
  let risk = 0;
  let value = -(c.costShards ?? 0) / 100;
  for (const o of c.outcomes) {
    for (const e of o.effects) {
      const p = o.probability;
      switch (e.kind) {
        case 'hp': if (e.value < 0) risk -= p * e.value * 3; else value += p * e.value * 3; break;
        case 'curse': risk += p * 0.1 * e.fights; break;
        case 'fight': risk += p * (e.pool === 'elite' ? 0.6 : 0.3); if (e.relicReward) value += p; break;
        case 'shards': if (e.value < 0) risk -= p * e.value / 200; else value += p * e.value / 100; break;
        case 'relic': value += p; break;
        case 'consumable': value += p * 0.4; break;
        case 'skill_rank': value += p * 0.8; break;
        case 'nothing': break;
      }
    }
  }
  return { risk, value };
}

function greedyEventChoice(choices: readonly EventChoice[], shards: number): number {
  let best = -1;
  let bestRisk = Infinity;
  let bestValue = -Infinity;
  choices.forEach((c, i) => {
    if ((c.costShards ?? 0) > shards) return;
    const { risk, value } = choiceRisk(c);
    if (risk < bestRisk - 1e-9 || (Math.abs(risk - bestRisk) < 1e-9 && value > bestValue)) {
      best = i; bestRisk = risk; bestValue = value;
    }
  });
  return Math.max(0, best);
}

const UPGRADE_ORDER: HeroId[] = ['kit', 'lysa', 'oren', 'bram'];
function greedyUpgradeHero(party: readonly HeroState[]): HeroId {
  const alive = party.filter((h) => h.skillRank < BALANCE.skills.maxRank);
  const pool = alive.length > 0 ? alive : party;
  return [...pool].sort((a, b) => a.skillRank - b.skillRank || UPGRADE_ORDER.indexOf(a.id) - UPGRADE_ORDER.indexOf(b.id))[0]?.id ?? 'kit';
}

function useMapItems(run: Run): void {
  for (const h of run.party) {
    if (h.hpFrac <= 0 && run.consumables.includes('phoenix_feather')) run.useConsumable('phoenix_feather', h.id);
  }
  if (runHpFrac(run.party) < 0.5 && run.consumables.includes('hearth_broth')) run.useConsumable('hearth_broth');
}

function fightKind(kind: 'fight' | 'elite' | 'boss', regionIdx: number, regions: number): FightKind {
  if (kind === 'fight') return 'normal';
  if (kind === 'elite') return 'elite';
  return regionIdx === regions - 1 ? 'final' : 'boss';
}

/** Plays a whole run from the prologue to won/lost. Deterministic for (seed, bot, opts). */
export function playRun(seed: number, bot: BotName, opts: PlayOpts = {}): RunResult {
  const run = new Run(seed, opts.hard ?? false);
  const rng = botRng(seed, bot);
  const smart = bot !== 'random';
  const fights: FightRecord[] = [];
  let hk = 0;
  for (let guard = 0; guard < 1000; guard++) {
    switch (run.status) {
      case 'won':
      case 'lost': {
        const reg = run.map[Math.min(run.regionIdx, run.map.length - 1)];
        return {
          seed, bot, won: run.status === 'won',
          regionReached: Math.min(run.regionIdx + 1, run.map.length),
          region: reg?.region ?? 'whisperpine',
          encounters: fights.length, fights, relics: [...run.relics], hollowKingPhase: hk, totalTime: run.stats.time,
        };
      }
      case 'story': run.ackStory(); break;
      case 'map': {
        if (smart) useMapItems(run);
        const nodes = run.availableNodes();
        const node = smart ? greedyNode(nodes, run) : rng.pick(nodes);
        run.chooseNode(node.id);
        break;
      }
      case 'battle': {
        const pending = run.pendingEncounter();
        const b = run.startBattle(smart ? greedyFormation() : randomFormation(rng));
        const r = playBattleWithBot(b, bot, opts.dt);
        const kind = fightKind(pending?.kind ?? 'fight', run.regionIdx, run.map.length);
        if (kind === 'final') hk = Math.max(hk, r.bossPhase);
        fights.push({
          kind, region: run.map[run.regionIdx]?.region ?? 'whisperpine',
          durationSec: r.durationSec, won: r.won, ignites: r.ignites, breaks: r.breaks, bossPhase: r.bossPhase,
        });
        run.finishBattle(b);
        break;
      }
      case 'reward': {
        const choices = run.pendingRelicChoice();
        const pick = choices && choices.length > 0 ? (smart ? bestRelic(choices, run.relics) : rng.pick(choices)) : undefined;
        if (pick) run.takeRelic(pick);
        else run.proceed();
        break;
      }
      case 'camp': {
        const heal = smart ? runHpFrac(run.party) < HEAL_THRESHOLD : rng.chance(0.5);
        if (heal) run.camp({ kind: 'heal' });
        else run.camp({ kind: 'skill', hero: smart ? greedyUpgradeHero(run.party) : rng.pick(HEROES).id });
        break;
      }
      case 'merchant': {
        if (smart) {
          for (;;) {
            const relics = run.merchantStock().filter((s) => s.kind === 'relic' && !s.sold && s.price <= run.shards);
            const best = bestRelic(relics.map((s) => s.id), run.relics);
            if (!best || !run.buy(best)) break;
          }
        } else {
          for (let i = 0; i < 4 && rng.chance(0.6); i++) {
            const items = run.merchantStock().filter((s) => !s.sold && s.price <= run.shards);
            if (items.length === 0) break;
            run.buy(rng.pick(items).id);
          }
        }
        run.proceed();
        break;
      }
      case 'event': {
        if (!run.eventResult) {
          const ev = run.event();
          if (!ev) throw new Error('event node without event');
          let idx: number;
          if (smart) idx = greedyEventChoice(ev.choices, run.shards);
          else {
            const ok = ev.choices.map((c, i) => ((c.costShards ?? 0) <= run.shards ? i : -1)).filter((i) => i >= 0);
            idx = ok.length > 0 ? rng.pick(ok) : 0;
          }
          run.resolveEvent(idx);
        } else if (run.eventResult.pendingSkillRank) {
          run.chooseSkillRank(smart ? greedyUpgradeHero(run.party) : rng.pick(HEROES).id);
        } else run.proceed();
        break;
      }
    }
  }
  throw new Error(`playRun(${seed}, ${bot}) did not finish`);
}
