// Run state machine: map, battles, rewards, camp, merchant, events, story, curses, stats.
import { BALANCE, CONSUMABLES, CONSUMABLE_BY_ID, EVENT_BY_ID, HERO_BY_ID, HEROES, REGION_BY_ID, RELICS } from '../data';
import type { CurseId, EncounterDef, EventDef, EventEffect, HeroId, SceneId } from '../data';
import { Battle } from './combat';
import { generateMap, type MapNode, type RegionMap } from './mapgen';
import { compileRelics } from './relics';
import { SeededRng } from './rng';
import { DEFAULT_FORMATION, type Formation, type HeroState } from './types';
import { curseMods, heroMaxHp } from './units';

export type RunStatus = 'map' | 'battle' | 'camp' | 'merchant' | 'event' | 'reward' | 'story' | 'won' | 'lost';
export type CampChoice = { kind: 'heal' } | { kind: 'skill'; hero: HeroId };

export interface ActiveCurse { id: CurseId; fights: number }
export interface MerchantItem { kind: 'relic' | 'consumable'; id: string; price: number; sold: boolean }
export interface RewardInfo { shards: number; relicChoices: string[]; levelUp: boolean }
export interface EventResult { text: string; effects: EventEffect[]; pendingSkillRank: boolean }

export interface RunStats {
  nodes: number;
  fights: number;
  breaks: number;
  ignites: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shardsEarned: number;
  /** total battle sim seconds */
  time: number;
}

interface PendingBattle {
  encounter: Pick<EncounterDef, 'front' | 'back'>;
  kind: 'fight' | 'elite' | 'boss';
  relicReward: boolean;
}

const STORY_AFTER: Record<number, SceneId> = { 1: 'after_r1', 2: 'after_r2', 3: 'after_r3_twist', 4: 'epilogue' };

export class Run {
  readonly seed: number;
  readonly hard: boolean;
  readonly map: RegionMap[];
  status: RunStatus = 'story';
  pendingStory: SceneId | null = 'prologue';
  shards: number;
  relics: string[] = [];
  consumables: string[] = [];
  curses: ActiveCurse[] = [];
  party: HeroState[];
  regionIdx = 0;
  step = 0;
  currentNode: MapNode | null = null;
  lastReward: RewardInfo | null = null;
  eventResult: EventResult | null = null;
  readonly stats: RunStats = {
    nodes: 0, fights: 0, breaks: 0, ignites: 0, kills: 0, damageDealt: 0, damageTaken: 0, healing: 0, shardsEarned: 0, time: 0,
  };
  private readonly rng: SeededRng;
  private pendingBattle: PendingBattle | null = null;
  private relicChoices: string[] | null = null;
  private stock: MerchantItem[] = [];
  private battles = 0;

  constructor(seed: number, hard = false) {
    this.seed = seed >>> 0;
    this.hard = hard;
    this.rng = new SeededRng(this.seed);
    this.map = generateMap(this.rng.fork('map'));
    this.shards = BALANCE.shards.start;
    this.party = HEROES.map((h) => ({ id: h.id, level: 1, skillRank: BALANCE.skills.startRank, hpFrac: 1 }));
  }

  // ---------- story ----------
  ackStory(): void {
    if (this.status !== 'story') return;
    this.pendingStory = null;
    this.status = this.regionIdx >= this.map.length ? 'won' : 'map';
  }

  // ---------- map ----------
  availableNodes(): MapNode[] {
    if (this.status !== 'map') return [];
    return this.map[this.regionIdx]?.steps[this.step] ?? [];
  }

  chooseNode(id: string): void {
    const node = this.availableNodes().find((n) => n.id === id);
    if (!node) throw new Error(`node ${id} not available`);
    this.currentNode = node;
    this.stats.nodes++;
    const reg = REGION_BY_ID[node.region];
    switch (node.type) {
      case 'fight':
      case 'elite':
      case 'boss': {
        const pool = node.type === 'fight' ? reg.fights : node.type === 'elite' ? reg.elites : [reg.boss];
        const enc = pool.find((e) => e.id === node.encounterId) ?? pool[0];
        if (!enc) throw new Error(`no encounter for ${node.id}`);
        this.pendingBattle = { encounter: enc, kind: node.type, relicReward: false };
        this.status = 'battle';
        break;
      }
      case 'camp': this.status = 'camp'; break;
      case 'merchant': this.stock = this.rollStock(); this.status = 'merchant'; break;
      case 'event': this.eventResult = null; this.status = 'event'; break;
    }
  }

  // ---------- battle ----------
  /** Encounter waiting to be fought (status 'battle'). */
  pendingEncounter(): PendingBattle | null {
    return this.pendingBattle;
  }

  startBattle(formation: Formation = DEFAULT_FORMATION): Battle {
    if (this.status !== 'battle' || !this.pendingBattle) throw new Error('no battle pending');
    return new Battle({
      party: this.party,
      formation,
      enemies: this.pendingBattle.encounter,
      regionOrder: this.regionIdx + 1,
      relics: this.relics,
      consumables: this.consumables,
      curses: this.curses.map((c) => c.id),
      hard: this.hard,
      rng: this.rng.fork(`battle:${this.battles++}`),
    });
  }

  finishBattle(battle: Battle): void {
    const pb = this.pendingBattle;
    const outcome = battle.state.outcome;
    if (!pb || outcome === 'ongoing') throw new Error('battle not finished');
    const s = battle.stats;
    this.stats.fights++;
    this.stats.breaks += s.breaks;
    this.stats.ignites += s.ignites;
    this.stats.kills += s.kills;
    this.stats.damageDealt += s.damageDealt;
    this.stats.damageTaken += s.damageTaken;
    this.stats.healing += s.healing;
    this.stats.time += s.time;
    this.party = battle.heroStates();
    this.consumables = [...battle.consumables];
    this.curses = this.curses.map((c) => ({ ...c, fights: c.fights - 1 })).filter((c) => c.fights > 0);
    this.pendingBattle = null;
    if (outcome === 'loss') {
      this.status = 'lost';
      return;
    }
    const rng = this.rng.fork(`reward:${this.battles}`);
    const range = BALANCE.shards[pb.kind];
    const shards = this.addShards(rng.int(range[0], range[1]));
    const rw = BALANCE.rewards;
    let n = 0;
    if (pb.kind === 'boss') n = rw.bossRelicChoices;
    else if ((pb.kind === 'elite' && rw.eliteRelic) || pb.relicReward || rng.chance(rw.fightRelicChance)) n = 1;
    const choices = this.randomRelics(rng, n);
    const levelUp = pb.kind === 'boss';
    if (levelUp) this.party = this.party.map((h) => ({ ...h, level: h.level + 1, hpFrac: 1 }));
    this.relicChoices = choices.length > 0 ? choices : null;
    this.lastReward = { shards, relicChoices: choices, levelUp };
    this.status = 'reward';
  }

  pendingRelicChoice(): string[] | null {
    return this.relicChoices;
  }

  takeRelic(id: string): void {
    if (!this.relicChoices?.includes(id)) throw new Error(`relic ${id} not offered`);
    this.relics.push(id);
    this.relicChoices = null;
    this.proceed();
  }

  // ---------- camp ----------
  camp(choice: CampChoice): void {
    if (this.status !== 'camp') throw new Error('not at camp');
    if (choice.kind === 'heal') {
      const f = this.hard ? BALANCE.hardMode.campHealFrac : BALANCE.camp.healFrac;
      this.party = this.party.map((h) => (h.hpFrac > 0 ? { ...h, hpFrac: Math.min(1, h.hpFrac + f) } : h));
    } else {
      this.rankUp(choice.hero, BALANCE.camp.skillRankGain);
    }
    this.advance();
  }

  // ---------- merchant ----------
  merchantStock(): MerchantItem[] {
    return this.status === 'merchant' ? this.stock : [];
  }

  buy(itemId: string): boolean {
    if (this.status !== 'merchant') return false;
    const it = this.stock.find((s) => s.id === itemId && !s.sold);
    if (!it || this.shards < it.price) return false;
    this.shards -= it.price;
    it.sold = true;
    if (it.kind === 'relic') this.relics.push(it.id);
    else this.consumables.push(it.id);
    return true;
  }

  reroll(): boolean {
    const cost = BALANCE.merchant.rerollCost;
    if (this.status !== 'merchant' || this.shards < cost) return false;
    this.shards -= cost;
    this.stock = this.rollStock();
    return true;
  }

  // ---------- events ----------
  event(): EventDef | null {
    const id = this.currentNode?.eventId;
    return this.status === 'event' && id ? (EVENT_BY_ID[id] ?? null) : null;
  }

  resolveEvent(choiceIdx: number): EventResult {
    const ev = this.event();
    if (!ev || this.eventResult) throw new Error('no event to resolve');
    const choice = ev.choices[choiceIdx];
    if (!choice) throw new Error(`bad choice ${choiceIdx}`);
    if (choice.costShards && this.shards < choice.costShards) throw new Error('not enough shards');
    if (choice.costShards) this.shards -= choice.costShards;
    const rng = this.rng.fork(`event:${ev.id}`);
    const outcome = rng.weighted(choice.outcomes, (o) => o.probability) ?? choice.outcomes[0];
    if (!outcome) throw new Error('event choice has no outcomes');
    const result: EventResult = { text: outcome.text, effects: outcome.effects, pendingSkillRank: false };
    let fight: PendingBattle | null = null;
    for (const e of outcome.effects) {
      switch (e.kind) {
        case 'shards': if (e.value >= 0) this.addShards(e.value); else this.shards = Math.max(0, this.shards + e.value); break;
        case 'hp': this.party = this.party.map((h) => (h.hpFrac > 0 ? { ...h, hpFrac: Math.min(1, Math.max(0.01, h.hpFrac + e.value)) } : h)); break;
        case 'relic': {
          const id = e.relicId ?? this.randomRelics(rng, 1)[0];
          if (id && !this.relics.includes(id)) this.relics.push(id);
          break;
        }
        case 'curse': {
          const ex = this.curses.find((c) => c.id === e.curse);
          if (ex) ex.fights = Math.max(ex.fights, e.fights);
          else this.curses.push({ id: e.curse, fights: e.fights });
          break;
        }
        case 'fight': {
          const reg = REGION_BY_ID[this.map[this.regionIdx]?.region ?? 'whisperpine'];
          const enc = rng.pick(e.pool === 'elite' ? reg.elites : reg.fights);
          fight = { encounter: enc, kind: e.pool, relicReward: e.relicReward };
          break;
        }
        case 'skill_rank': result.pendingSkillRank = true; break;
        case 'consumable': {
          const id = e.consumableId ?? rng.pick(CONSUMABLES).id;
          this.consumables.push(id);
          break;
        }
        case 'nothing': break;
      }
    }
    this.eventResult = result;
    if (fight) {
      this.pendingBattle = fight;
      this.status = 'battle';
    }
    return result;
  }

  /** Resolve an event's `skill_rank` effect. */
  chooseSkillRank(hero: HeroId): void {
    if (!this.eventResult?.pendingSkillRank) throw new Error('no skill rank pending');
    this.rankUp(hero, 1);
    this.eventResult = { ...this.eventResult, pendingSkillRank: false };
  }

  // ---------- consumables on the map ----------
  useConsumable(id: string, hero?: HeroId): boolean {
    const def = CONSUMABLE_BY_ID[id];
    const i = this.consumables.indexOf(id);
    if (!def || i < 0 || !def.usableIn.includes('map')) return false;
    const e = def.effect;
    if (e.kind === 'heal_party') {
      this.party = this.party.map((h) => (h.hpFrac > 0 ? { ...h, hpFrac: Math.min(1, h.hpFrac + e.value) } : h));
    } else if (e.kind === 'revive') {
      const t = this.party.find((h) => h.hpFrac <= 0 && (!hero || h.id === hero));
      if (!t) return false;
      t.hpFrac = e.value;
    } else return false;
    this.consumables.splice(i, 1);
    return true;
  }

  // ---------- flow ----------
  /** Leave the reward / merchant / resolved-event screen (skips any unclaimed relic). */
  proceed(): void {
    if (this.status === 'event' && (!this.eventResult || this.eventResult.pendingSkillRank)) {
      throw new Error('resolve the event first');
    }
    if (this.status !== 'reward' && this.status !== 'merchant' && this.status !== 'event') return;
    this.relicChoices = null;
    this.advance();
  }

  heroMaxHp(id: HeroId): number {
    const st = this.party.find((h) => h.id === id);
    const row = DEFAULT_FORMATION.front.includes(id) ? 'front' : 'back';
    return heroMaxHp(HERO_BY_ID[id], st?.level ?? 1, row, BALANCE, compileRelics(this.relics), curseMods(this.curses.map((c) => c.id)));
  }

  private advance(): void {
    const wasBoss = this.currentNode?.type === 'boss';
    this.currentNode = null;
    this.eventResult = null;
    if (wasBoss) {
      this.regionIdx++;
      this.step = 0;
      this.pendingStory = STORY_AFTER[this.regionIdx] ?? null;
      this.status = this.pendingStory ? 'story' : this.regionIdx >= this.map.length ? 'won' : 'map';
    } else {
      this.step++;
      this.status = 'map';
    }
  }

  private rankUp(hero: HeroId, n: number): void {
    const max = BALANCE.skills.maxRank;
    this.party = this.party.map((h) => (h.id === hero ? { ...h, skillRank: Math.min(max, h.skillRank + n) } : h));
  }

  private addShards(base: number): number {
    const v = Math.round(base * compileRelics(this.relics).shardMult() * (this.hard ? BALANCE.hardMode.shardMult : 1));
    this.shards += v;
    this.stats.shardsEarned += v;
    return v;
  }

  private randomRelics(rng: SeededRng, n: number): string[] {
    const pool = RELICS.filter((r) => !this.relics.includes(r.id)).map((r) => r.id);
    return rng.shuffle(pool).slice(0, n);
  }

  private rollStock(): MerchantItem[] {
    const rng = this.rng.fork(`merchant:${this.stats.nodes}:${this.shards}`);
    const m = BALANCE.merchant;
    const relics = rng.shuffle(RELICS.filter((r) => !this.relics.includes(r.id))).slice(0, m.relicsOffered);
    const cons = rng.shuffle(CONSUMABLES).slice(0, m.consumablesOffered);
    return [
      ...relics.map((r) => ({ kind: 'relic' as const, id: r.id, price: m.relicPrice[r.rarity], sold: false })),
      ...cons.map((c) => ({ kind: 'consumable' as const, id: c.id, price: c.price, sold: false })),
    ];
  }
}
