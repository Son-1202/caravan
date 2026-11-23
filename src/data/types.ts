// Caravan of Embers — content contract. Pure TS, no imports.
// The sim (src/sim) imports these types; JSON in src/data must match them.
// Conventions:
//  - ids are snake_case and stable.
//  - "power" multiplies the actor's ATK (damage = atk * power * DEF factor, see BalanceConfig.damage).
//  - heal values multiply the healer's ATK unless the field name says "Frac" (fraction of max HP).
//  - durations are counted in the affected unit's own actions unless stated otherwise.
//  - probabilities / chances are 0..1.

// ---------- Core enums ----------
export type DamageType = 'slash' | 'pierce' | 'fire' | 'holy';
export type HeroId = 'bram' | 'lysa' | 'oren' | 'kit';
export type RegionId = 'whisperpine' | 'glass_dunes' | 'frostspire' | 'solenne';
export type Row = 'front' | 'back';
export type Stat = 'hp' | 'atk' | 'def' | 'spd' | 'crit';
/** melee: hits front row 70% of the time (see formation). ranged: any target. aoe: every target. support: no damage. */
export type AttackKind = 'melee' | 'ranged' | 'aoe' | 'support';
export type EnemyTier = 'normal' | 'elite' | 'boss' | 'final';
export type NodeType = 'fight' | 'elite' | 'camp' | 'merchant' | 'event' | 'boss';
export type Rarity = 'common' | 'rare';

export type StatusKind =
  | 'burn' // value = fraction of target max HP lost per target action
  | 'bleed' // value = flat multiple of applier ATK lost per target action
  | 'chill' // value = SPD reduction fraction
  | 'weaken' // value = ATK reduction fraction
  | 'guard' // value = damage taken reduction fraction
  | 'taunt' // forces single-target enemy attacks onto this unit; value unused (0)
  | 'regen' // value = fraction of max HP healed per own action
  | 'haste'; // value = SPD increase fraction

export interface StatusApply {
  kind: StatusKind;
  /** chance to apply, 0..1 */
  chance: number;
  /** in actions of the affected unit */
  duration: number;
  value: number;
}

// ---------- Targeting & AI ----------
export type TargetRule =
  | 'self'
  | 'lowest_hp_ally' // lowest HP fraction ally (incl. self)
  | 'all_allies'
  | 'lowest_hp_enemy'
  | 'weakness_match_enemy' // enemy weak to this action's damageType; falls back to lowest_hp_enemy
  | 'broken_enemy' // a Broken enemy; falls back to highest_atk_enemy
  | 'highest_atk_enemy' // "highest-damage enemy"
  | 'random_enemy'
  | 'all_enemies';

export type AiCondition =
  | 'always'
  | 'skill_ready' // skill off cooldown
  | 'ally_below_half' // any ally under 50% HP
  | 'ally_threatened' // an ally under 50% HP and no living ally has taunt
  | 'enemy_broken'; // any enemy Broken

export interface AiRule {
  when: AiCondition[]; // all must hold
  use: 'basic' | 'skill';
  target: TargetRule;
}

// ---------- Heroes ----------
export interface HeroStats {
  hp: number;
  atk: number;
  def: number;
  /** gauge fill rate (units/sec at 1x) */
  spd: number;
  /** crit chance 0..1 */
  crit: number;
}

export interface BasicAttackDef {
  name: string;
  kind: AttackKind;
  damageType: DamageType;
  power: number;
  target: TargetRule;
}

export interface SkillRank {
  /** damage multiplier per hit (0 for support skills) */
  power: number;
  /** number of hits (default 1) */
  hits?: number;
  /** heal = healer ATK * heal */
  heal?: number;
  /** extra shield points removed if the hit lands on a weakness */
  shieldDmg?: number;
  status?: StatusApply;
  /** applied to the caster in addition to the target */
  selfStatus?: StatusApply;
}

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  kind: AttackKind;
  damageType?: DamageType;
  target: TargetRule;
  /** own actions before reuse */
  cooldown: number;
  /** ranks 1..3 */
  ranks: [SkillRank, SkillRank, SkillRank];
}

export interface UltimateDef {
  id: string;
  name: string;
  description: string;
  kind: AttackKind;
  damageType?: DamageType;
  target: TargetRule;
  power: number;
  hits?: number;
  /** heals EVERY living hero for caster ATK * heal */
  heal?: number;
  shieldDmg?: number;
  /** ultimate always crits */
  guaranteedCrit?: boolean;
  status?: StatusApply;
  /** applied to every hero when this ultimate resolves */
  allyStatus?: StatusApply;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  role: string;
  description: string;
  defaultRow: Row;
  base: HeroStats;
  basic: BasicAttackDef;
  skill: SkillDef;
  ultimate: UltimateDef;
  /** evaluated top to bottom; first matching rule acts. Last rule should be `always`. */
  ai: AiRule[];
}

// ---------- Enemies ----------
export interface EnemyAction {
  id: string;
  name: string;
  kind: Exclude<AttackKind, 'support'> | 'support';
  damageType: DamageType;
  power: number;
  /** relative pick weight when patternMode = 'weighted' */
  weight: number;
  status?: StatusApply;
  /** support actions: restore this many shield points to self */
  restoreShield?: number;
  /** telegraph line shown above the enemy before the action */
  telegraph?: string;
}

export interface BossPhase {
  /** phase starts when HP fraction <= this (first phase = 1) */
  hpThreshold: number;
  name: string;
  /** replaces the action list when set */
  actions?: EnemyAction[];
  /** replaces weaknesses when set */
  weaknesses?: DamageType[];
  /** shield points added (and max raised) on phase start */
  addShield: number;
  spdMult?: number;
  atkMult?: number;
  /** bark spoken on phase start */
  line?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  description: string;
  /** home region; stats are authored for this region */
  region: RegionId;
  tier: EnemyTier;
  hp: number;
  atk: number;
  spd: number;
  def: number;
  /** shield points; weakness hit = -1 */
  shield: number;
  weaknesses: DamageType[];
  patternMode: 'cycle' | 'weighted';
  actions: EnemyAction[];
  /** sprite scale; bosses are 2 */
  size: 1 | 2;
  phases?: BossPhase[];
}

// ---------- Relics ----------
export type RelicEffect =
  | { kind: 'stat_mult'; stat: Stat; row?: Row; hero?: HeroId; value: number }
  | { kind: 'on_break'; effect: 'burn'; value: number; duration: number }
  | { kind: 'on_break'; effect: 'ember'; value: number }
  | { kind: 'on_break'; effect: 'heal_party'; value: number }
  | { kind: 'on_ignite_heal'; value: number }
  | { kind: 'ember_gain_mult'; value: number }
  | { kind: 'weakness_dmg_mult'; value: number }
  | { kind: 'broken_dmg_mult'; value: number }
  | { kind: 'damage_type_mult'; damageType: DamageType; value: number }
  | { kind: 'shield_dmg_bonus'; damageType?: DamageType; value: number }
  | { kind: 'break_duration_bonus'; value: number }
  | { kind: 'start_battle_ember'; value: number }
  | { kind: 'crit_bonus'; chance: number; mult: number }
  | { kind: 'heal_mult'; value: number }
  | { kind: 'shard_mult'; value: number }
  | { kind: 'low_hp_atk'; threshold: number; value: number };

export type RelicEffectKind = RelicEffect['kind'];

export interface RelicDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  tags: string[];
  effect: RelicEffect;
}

// ---------- Consumables ----------
export type ConsumableEffect =
  | { kind: 'heal_party'; value: number } // fraction of max HP
  | { kind: 'revive'; value: number } // revive one fallen hero at fraction of max HP
  | { kind: 'ember_fill'; value: number } // flat ember
  | { kind: 'shield_crack'; value: number } // remove N shield from all enemies
  | { kind: 'haste_party'; value: number; duration: number };

export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  price: number;
  usableIn: Array<'map' | 'battle'>;
  effect: ConsumableEffect;
}

// ---------- Events ----------
export type CurseId = 'frail' | 'dim' | 'slow';

export type EventEffect =
  | { kind: 'shards'; value: number }
  | { kind: 'hp'; value: number } // fraction of max HP, +/- for whole party
  | { kind: 'relic'; relicId?: string } // random if omitted
  | { kind: 'curse'; curse: CurseId; fights: number }
  | { kind: 'fight'; pool: 'fight' | 'elite'; relicReward: boolean }
  | { kind: 'skill_rank' } // player picks a hero
  | { kind: 'consumable'; consumableId?: string }
  | { kind: 'nothing' };

export interface EventOutcome {
  probability: number; // outcomes in a choice sum to 1
  text: string;
  effects: EventEffect[];
}

export interface EventChoice {
  label: string;
  /** greyed out if the party has fewer shards */
  costShards?: number;
  outcomes: EventOutcome[];
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** regions this event may appear in; all if omitted */
  regions?: RegionId[];
  choices: EventChoice[];
}

export interface CurseDef {
  id: CurseId;
  name: string;
  description: string;
  effect: { stat: 'hp' | 'spd'; value: number } | { stat: 'ember_gain'; value: number };
}

// ---------- Regions & map ----------
export interface EncounterDef {
  id: string;
  front: string[]; // enemy ids
  back: string[];
}

export interface RegionPalette {
  primary: string;
  secondary: string;
  fog: string;
  light: string;
}

export interface RegionDef {
  id: RegionId;
  name: string;
  subtitle: string;
  order: 1 | 2 | 3 | 4;
  /** 0 = full dusk light, 1 = near-black; the Ember stays warm regardless */
  darkness: number;
  palette: RegionPalette;
  fights: EncounterDef[];
  elites: EncounterDef[];
  boss: EncounterDef;
  bossId: string;
}

export type NodeTypeWeights = Partial<Record<Exclude<NodeType, 'boss'>, number>>;

export interface MapGenConfig {
  stepsPerRegion: number;
  nodesPerStep: { min: number; max: number };
  /** one entry per step (index 0 = first step) */
  stepWeights: NodeTypeWeights[];
  /** region 1, step 1 forced types (tutorial-safe) */
  firstStepTypes: Array<Exclude<NodeType, 'boss'>>;
  rules: {
    maxPerRegion: NodeTypeWeights;
    /** a step never shows the same type twice */
    uniqueTypesPerStep: boolean;
    /** events never repeat within a run */
    noRepeatEvents: boolean;
    /** each region contains at least one combat path */
    guaranteeCombatEachStep: boolean;
  };
  bossNodeAtEnd: boolean;
}

// ---------- Balance ----------
export interface StatGrowth {
  hp: number; // multiplier per region cleared
  atk: number;
  def: number; // flat
  spd: number; // flat
}

export interface BalanceConfig {
  gauge: {
    max: number;
    /** gauge units gained per point of SPD per second at 1x speed */
    fillPerSpdPerSec: number;
    /** heroes start a battle with gauge = max * this * random(0..1) */
    startJitter: number;
    note: string;
  };
  damage: {
    /** dmg = atk * power * defConstant / (defConstant + def) */
    defConstant: number;
    variance: number;
    critMult: number;
    minDamage: number;
    note: string;
  };
  ember: {
    max: number;
    perHit: number;
    perWeaknessHit: number;
    perBreak: number;
    perHeroDamaged: number;
    perKill: number;
    /** ember carried between fights as a fraction */
    carryOver: number;
  };
  break: {
    /** actions the Broken enemy skips */
    skipActions: number;
    /** enemy actions during which bonus damage applies */
    durationActions: number;
    dmgMult: number;
    /** shield refills to max when Broken ends */
    restoreShield: boolean;
  };
  formation: {
    frontMeleeShare: number;
    /** if a row is empty, its share passes to the other row */
    emptyRowFallthrough: boolean;
  };
  growth: StatGrowth;
  /** enemy stats when met in a later region than their home: mult^(regionsLater) */
  enemyCrossRegionScale: { hp: number; atk: number; def: number; spd: number };
  shards: {
    start: number;
    fight: [number, number];
    elite: [number, number];
    boss: [number, number];
  };
  merchant: {
    relicPrice: Record<Rarity, number>;
    relicsOffered: number;
    consumablesOffered: number;
    rerollCost: number;
  };
  camp: {
    healFrac: number;
    skillRankGain: number;
  };
  skills: { maxRank: number; startRank: number };
  rewards: {
    eliteRelic: boolean;
    bossRelicChoices: number;
    fightRelicChance: number;
  };
  /** applied on top of everything in hard mode */
  hardMode: {
    enemyHp: number;
    enemyAtk: number;
    enemySpd: number;
    enemyShieldAdd: number;
    shardMult: number;
    emberGainMult: number;
    campHealFrac: number;
  };
  battleSpeeds: number[];
}

// ---------- Story ----------
export type Speaker = 'mira' | 'bram' | 'lysa' | 'oren' | 'kit' | 'ember' | 'mira_child' | 'narrator';
export type SceneId = 'prologue' | 'after_r1' | 'after_r2' | 'after_r3_twist' | 'epilogue';

export interface StoryLine {
  speaker: Speaker;
  text: string;
}

export interface SceneDef {
  id: SceneId;
  title: string;
  /** region whose diorama is the backdrop; prologue uses whisperpine edge (Ashen Hearth) */
  backdrop: RegionId | 'ashen_hearth';
  lines: StoryLine[];
}

export interface StoryData {
  scenes: SceneDef[];
}
