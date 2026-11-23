// Sim-side types: units, formation, events, snapshots.
import type { DamageType, EnemyAction, HeroId, Row, StatusKind } from '../data';

export type Side = 'hero' | 'enemy';
export type Outcome = 'ongoing' | 'win' | 'loss';

/** 2×2 formation: two slots per row; null = empty slot. */
export interface Formation {
  front: [HeroId | null, HeroId | null];
  back: [HeroId | null, HeroId | null];
}

export const DEFAULT_FORMATION: Formation = {
  front: ['bram', 'kit'],
  back: ['lysa', 'oren'],
};

/** Persistent hero state carried between fights. */
export interface HeroState {
  id: HeroId;
  /** 1 at run start, +1 after each region boss */
  level: number;
  /** 1..3 */
  skillRank: number;
  /** current HP as a fraction of max HP (0 = fallen). Fractions survive max-HP changes (curses, relics). */
  hpFrac: number;
}

export interface StatusInstance {
  kind: StatusKind;
  value: number;
  /** remaining own actions */
  remaining: number;
  /** ATK of the applier (bleed) */
  sourceAtk: number;
  source: string;
}

export interface Unit {
  uid: string;
  side: Side;
  defId: string;
  name: string;
  row: Row;
  slot: number;
  hp: number;
  maxHp: number;
  /** base stats after level / scaling / relic stat_mult (before statuses) */
  atk: number;
  def: number;
  spd: number;
  crit: number;
  gauge: number;
  shield: number;
  maxShield: number;
  weaknesses: DamageType[];
  broken: boolean;
  /** own turns left in the Broken state (incl. skipped ones) */
  brokenTurns: number;
  skipTurns: number;
  statuses: StatusInstance[];
  alive: boolean;
  // hero-only
  skillCd: number;
  skillRank: number;
  // enemy-only
  actions: EnemyAction[];
  actionIdx: number;
  /** 0 = base phase; i = phases[i-1] active */
  phase: number;
  atkMult: number;
  spdMult: number;
  tier: string;
}

export interface UnitSnapshot {
  uid: string;
  side: Side;
  defId: string;
  name: string;
  row: Row;
  slot: number;
  hp: number;
  maxHp: number;
  gauge: number;
  shield: number;
  maxShield: number;
  weaknesses: DamageType[];
  broken: boolean;
  alive: boolean;
  phase: number;
  status: Array<{ kind: StatusKind; value: number; remaining: number }>;
}

export interface BattleSnapshot {
  units: UnitSnapshot[];
  emberMeter: number;
  emberMax: number;
  time: number;
  outcome: Outcome;
}

export type SimEvent =
  | { type: 'action_start'; actor: string; skill: string; name: string; telegraph?: string }
  | {
      type: 'hit';
      source: string;
      target: string;
      amount: number;
      damageType: DamageType;
      weakness: boolean;
      crit: boolean;
      /** true for burn / bleed ticks */
      dot?: boolean;
    }
  | { type: 'shield'; target: string; shield: number }
  | { type: 'break'; target: string }
  | { type: 'recover'; target: string }
  | { type: 'heal'; source: string; target: string; amount: number }
  | { type: 'status'; target: string; status: StatusKind; on: boolean }
  | { type: 'death'; target: string }
  | { type: 'revive'; target: string; hp: number }
  | { type: 'ignite' }
  | { type: 'ultimate'; actor: string; skill: string }
  | { type: 'phase'; target: string; phase: number; name: string; line?: string }
  | { type: 'ember'; value: number }
  | { type: 'skip'; actor: string }
  | { type: 'item'; item: string }
  | { type: 'end'; outcome: Exclude<Outcome, 'ongoing'> };

export interface BattleStats {
  time: number;
  breaks: number;
  ignites: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  healing: number;
}
