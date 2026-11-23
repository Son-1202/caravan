// Runtime integrity check for content JSON (enums, cross-references, counts).
// Pure TS; returns a list of human-readable problems (empty = OK).
import type {
  BalanceConfig,
  ConsumableDef,
  CurseDef,
  EnemyDef,
  EventDef,
  HeroDef,
  MapGenConfig,
  RegionDef,
  RelicDef,
  StoryData,
} from './types';

export interface ContentBundle {
  heroes: readonly HeroDef[];
  enemies: readonly EnemyDef[];
  relics: readonly RelicDef[];
  consumables: readonly ConsumableDef[];
  curses: readonly CurseDef[];
  events: readonly EventDef[];
  regions: readonly RegionDef[];
  map: MapGenConfig;
  balance: BalanceConfig;
  story: StoryData;
}

const DAMAGE_TYPES = ['slash', 'pierce', 'fire', 'holy'];
const ATTACK_KINDS = ['melee', 'ranged', 'aoe', 'support'];
const TIERS = ['normal', 'elite', 'boss', 'final'];
const REGION_IDS = ['whisperpine', 'glass_dunes', 'frostspire', 'solenne'];
const HERO_IDS = ['bram', 'lysa', 'oren', 'kit'];
const STATUS = ['burn', 'bleed', 'chill', 'weaken', 'guard', 'taunt', 'regen', 'haste'];
const TARGETS = [
  'self', 'lowest_hp_ally', 'all_allies', 'lowest_hp_enemy', 'weakness_match_enemy',
  'broken_enemy', 'highest_atk_enemy', 'random_enemy', 'all_enemies',
];
const AI_CONDS = ['always', 'skill_ready', 'ally_below_half', 'ally_threatened', 'enemy_broken'];
const RELIC_KINDS = [
  'stat_mult', 'on_break', 'on_ignite_heal', 'ember_gain_mult', 'weakness_dmg_mult',
  'broken_dmg_mult', 'damage_type_mult', 'shield_dmg_bonus', 'break_duration_bonus',
  'start_battle_ember', 'crit_bonus', 'heal_mult', 'shard_mult', 'low_hp_atk',
];
const EVENT_EFFECTS = ['shards', 'hp', 'relic', 'curse', 'fight', 'skill_rank', 'consumable', 'nothing'];
const SPEAKERS = ['mira', 'bram', 'lysa', 'oren', 'kit', 'ember', 'mira_child', 'narrator'];
const SCENES = ['prologue', 'after_r1', 'after_r2', 'after_r3_twist', 'epilogue'];
const SNAKE = /^[a-z][a-z0-9_]*$/;

export function validateContentBundle(c: ContentBundle): string[] {
  const errs: string[] = [];
  const chk = (ok: boolean, msg: string): void => {
    if (!ok) errs.push(msg);
  };
  const inSet = (v: unknown, set: readonly string[], where: string): void =>
    chk(typeof v === 'string' && set.includes(v), `${where}: invalid value ${String(v)}`);
  const ids = (list: readonly { id: string }[], what: string): Set<string> => {
    const s = new Set<string>();
    for (const x of list) {
      chk(SNAKE.test(x.id), `${what} id not snake_case: ${x.id}`);
      chk(!s.has(x.id), `${what} duplicate id: ${x.id}`);
      s.add(x.id);
    }
    return s;
  };
  const checkStatus = (st: { kind: string; chance: number } | undefined, where: string): void => {
    if (!st) return;
    inSet(st.kind, STATUS, `${where}.status`);
    chk(st.chance >= 0 && st.chance <= 1, `${where}.status chance out of range`);
  };

  // Heroes
  const heroIds = ids(c.heroes, 'hero');
  chk(heroIds.size === 4, `expected 4 heroes, got ${heroIds.size}`);
  for (const h of c.heroes) {
    const w = `hero ${h.id}`;
    inSet(h.id, HERO_IDS, w);
    inSet(h.defaultRow, ['front', 'back'], `${w}.defaultRow`);
    inSet(h.basic.kind, ATTACK_KINDS, `${w}.basic.kind`);
    inSet(h.basic.damageType, DAMAGE_TYPES, `${w}.basic.damageType`);
    inSet(h.basic.target, TARGETS, `${w}.basic.target`);
    inSet(h.skill.kind, ATTACK_KINDS, `${w}.skill.kind`);
    inSet(h.skill.target, TARGETS, `${w}.skill.target`);
    if (h.skill.damageType) inSet(h.skill.damageType, DAMAGE_TYPES, `${w}.skill.damageType`);
    chk(h.skill.ranks.length === 3, `${w}.skill needs 3 ranks`);
    h.skill.ranks.forEach((r, i) => {
      checkStatus(r.status, `${w}.skill.rank${i + 1}`);
      checkStatus(r.selfStatus, `${w}.skill.rank${i + 1}.self`);
    });
    inSet(h.ultimate.kind, ATTACK_KINDS, `${w}.ultimate.kind`);
    inSet(h.ultimate.target, TARGETS, `${w}.ultimate.target`);
    checkStatus(h.ultimate.status, `${w}.ultimate`);
    checkStatus(h.ultimate.allyStatus, `${w}.ultimate.ally`);
    chk(h.ai.length > 0, `${w}.ai empty`);
    for (const r of h.ai) {
      r.when.forEach((cond) => inSet(cond, AI_CONDS, `${w}.ai.when`));
      inSet(r.use, ['basic', 'skill'], `${w}.ai.use`);
      inSet(r.target, TARGETS, `${w}.ai.target`);
    }
    const last = h.ai[h.ai.length - 1];
    chk(!!last && last.when.includes('always'), `${w}.ai last rule must be 'always'`);
  }

  // Enemies
  const enemyIds = ids(c.enemies, 'enemy');
  for (const e of c.enemies) {
    const w = `enemy ${e.id}`;
    inSet(e.region, REGION_IDS, `${w}.region`);
    inSet(e.tier, TIERS, `${w}.tier`);
    e.weaknesses.forEach((d) => inSet(d, DAMAGE_TYPES, `${w}.weakness`));
    chk(e.weaknesses.length >= 1 && e.weaknesses.length <= 2, `${w} needs 1-2 weaknesses`);
    inSet(e.patternMode, ['cycle', 'weighted'], `${w}.patternMode`);
    chk(e.size === (e.tier === 'boss' || e.tier === 'final' ? 2 : 1), `${w}.size mismatch tier`);
    const actions = [...e.actions, ...(e.phases ?? []).flatMap((p) => p.actions ?? [])];
    for (const a of actions) {
      inSet(a.kind, ATTACK_KINDS, `${w}.${a.id}.kind`);
      inSet(a.damageType, DAMAGE_TYPES, `${w}.${a.id}.damageType`);
      checkStatus(a.status, `${w}.${a.id}`);
    }
    for (const p of e.phases ?? []) {
      chk(p.hpThreshold > 0 && p.hpThreshold < 1, `${w} phase threshold out of range`);
      p.weaknesses?.forEach((d) => inSet(d, DAMAGE_TYPES, `${w}.phase.weakness`));
    }
  }
  const tierCount = (t: string): number => c.enemies.filter((e) => e.tier === t).length;
  chk(tierCount('normal') === 9, `expected 9 normal enemies, got ${tierCount('normal')}`);
  chk(tierCount('elite') === 3, `expected 3 elites, got ${tierCount('elite')}`);
  chk(tierCount('boss') === 3, `expected 3 bosses, got ${tierCount('boss')}`);
  const king = c.enemies.find((e) => e.tier === 'final');
  chk(!!king && (king.phases?.length ?? 0) === 2, 'final boss needs 3 phases (base + 2)');

  // Relics
  const relicIds = ids(c.relics, 'relic');
  chk(relicIds.size === 16, `expected 16 relics, got ${relicIds.size}`);
  for (const r of c.relics) {
    inSet(r.effect.kind, RELIC_KINDS, `relic ${r.id}.effect.kind`);
    inSet(r.rarity, ['common', 'rare'], `relic ${r.id}.rarity`);
    chk(r.tags.length > 0, `relic ${r.id} has no tags`);
  }

  // Consumables & curses
  const consumableIds = ids(c.consumables, 'consumable');
  const curseIds = ids(c.curses, 'curse');

  // Events
  const eventIds = ids(c.events, 'event');
  chk(eventIds.size === 6, `expected 6 events, got ${eventIds.size}`);
  for (const ev of c.events) {
    ev.regions?.forEach((r) => inSet(r, REGION_IDS, `event ${ev.id}.regions`));
    for (const ch of ev.choices) {
      const sum = ch.outcomes.reduce((s, o) => s + o.probability, 0);
      chk(Math.abs(sum - 1) < 1e-6, `event ${ev.id} "${ch.label}" probabilities sum to ${sum}`);
      for (const o of ch.outcomes) {
        for (const fx of o.effects) {
          inSet(fx.kind, EVENT_EFFECTS, `event ${ev.id}.effect`);
          if (fx.kind === 'relic' && fx.relicId) chk(relicIds.has(fx.relicId), `event ${ev.id} unknown relic ${fx.relicId}`);
          if (fx.kind === 'curse') chk(curseIds.has(fx.curse), `event ${ev.id} unknown curse ${fx.curse}`);
          if (fx.kind === 'consumable' && fx.consumableId) chk(consumableIds.has(fx.consumableId), `event ${ev.id} unknown consumable`);
        }
      }
    }
  }

  // Regions
  ids(c.regions, 'region');
  chk(c.regions.length === 4, 'expected 4 regions');
  const encIds = new Set<string>();
  for (const r of c.regions) {
    inSet(r.id, REGION_IDS, `region ${r.id}`);
    chk(enemyIds.has(r.bossId), `region ${r.id} unknown boss ${r.bossId}`);
    chk(r.fights.length > 0 && r.elites.length > 0, `region ${r.id} needs fights and elites`);
    for (const enc of [...r.fights, ...r.elites, r.boss]) {
      chk(!encIds.has(enc.id), `duplicate encounter id ${enc.id}`);
      encIds.add(enc.id);
      const all = [...enc.front, ...enc.back];
      chk(all.length >= 1 && enc.front.length <= 2 && enc.back.length <= 2, `encounter ${enc.id} must fit 2x2`);
      all.forEach((id) => chk(enemyIds.has(id), `encounter ${enc.id} unknown enemy ${id}`));
    }
  }

  // Map & balance sanity
  chk(c.map.stepWeights.length === c.map.stepsPerRegion, 'map.stepWeights length != stepsPerRegion');
  chk(c.map.nodesPerStep.min >= 1 && c.map.nodesPerStep.max >= c.map.nodesPerStep.min, 'map.nodesPerStep invalid');
  chk(c.balance.break.dmgMult === 1.5, 'balance.break.dmgMult should be 1.5');
  chk(c.balance.formation.frontMeleeShare === 0.7, 'balance.formation.frontMeleeShare should be 0.7');
  chk(c.balance.camp.healFrac === 0.4, 'balance.camp.healFrac should be 0.4');
  for (const cons of c.consumables) chk(cons.price > 0, `consumable ${cons.id} price`);

  // Story
  chk(c.story.scenes.length === 5, 'expected 5 story scenes');
  for (const s of c.story.scenes) {
    inSet(s.id, SCENES, `scene ${s.id}`);
    chk(s.lines.length >= 6 && s.lines.length <= 12, `scene ${s.id} must have 6-12 lines`);
    s.lines.forEach((l) => inSet(l.speaker, SPEAKERS, `scene ${s.id}.speaker`));
  }
  return errs;
}
