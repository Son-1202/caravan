// Unit construction (stats after level, region scaling, hard mode, relics, curses) and effective-stat helpers.
import { CURSE_BY_ID, ENEMY_BY_ID, HERO_BY_ID } from '../data';
import type { BalanceConfig, CurseId, EnemyDef, HeroDef, Row } from '../data';
import type { RelicHooks } from './relics';
import type { HeroState, Unit } from './types';

export interface CurseMods {
  hp: number;
  spd: number;
  emberGain: number;
}

export function curseMods(curses: readonly CurseId[]): CurseMods {
  const m: CurseMods = { hp: 1, spd: 1, emberGain: 1 };
  for (const id of curses) {
    const c = CURSE_BY_ID[id];
    if (!c) continue;
    if (c.effect.stat === 'hp') m.hp *= 1 + c.effect.value;
    else if (c.effect.stat === 'spd') m.spd *= 1 + c.effect.value;
    else m.emberGain *= 1 + c.effect.value;
  }
  return m;
}

/** Hero max HP outside battle (used by Run for display / map heals). */
export function heroMaxHp(
  def: HeroDef, level: number, row: Row, balance: BalanceConfig, relics: RelicHooks, curses: CurseMods,
): number {
  const g = balance.growth;
  return Math.round(def.base.hp * g.hp ** (level - 1) * relics.modifyStat('hp', def.id, row) * curses.hp);
}

export function makeHeroUnit(
  st: HeroState, row: Row, slot: number, balance: BalanceConfig, relics: RelicHooks, curses: CurseMods,
): Unit {
  const def = HERO_BY_ID[st.id];
  const g = balance.growth;
  const lv = st.level - 1;
  const maxHp = heroMaxHp(def, st.level, row, balance, relics, curses);
  const hp = Math.max(0, Math.min(maxHp, Math.round(maxHp * st.hpFrac)));
  return {
    uid: `h:${def.id}`,
    side: 'hero',
    defId: def.id,
    name: def.name,
    row,
    slot,
    hp,
    maxHp,
    atk: def.base.atk * g.atk ** lv * relics.modifyStat('atk', def.id, row),
    def: (def.base.def + g.def * lv) * relics.modifyStat('def', def.id, row),
    spd: (def.base.spd + g.spd * lv) * relics.modifyStat('spd', def.id, row) * curses.spd,
    crit: def.base.crit * relics.modifyStat('crit', def.id, row) + relics.critChanceBonus(),
    gauge: 0,
    shield: 0,
    maxShield: 0,
    weaknesses: [],
    broken: false,
    brokenTurns: 0,
    skipTurns: 0,
    statuses: [],
    alive: hp > 0,
    skillCd: 0,
    skillRank: Math.max(1, Math.min(3, st.skillRank)),
    actions: [],
    actionIdx: 0,
    phase: 0,
    atkMult: 1,
    spdMult: 1,
    tier: 'hero',
  };
}

export function makeEnemyUnit(
  id: string, index: number, row: Row, slot: number, regionOrder: number, hard: boolean, balance: BalanceConfig,
): Unit {
  const def: EnemyDef | undefined = ENEMY_BY_ID[id];
  if (!def) throw new Error(`unknown enemy ${id}`);
  const homeOrder = regionOrderOf(def.region);
  const later = Math.max(0, regionOrder - homeOrder);
  const sc = balance.enemyCrossRegionScale;
  const hm = balance.hardMode;
  const maxHp = Math.round(def.hp * sc.hp ** later * (hard ? hm.enemyHp : 1));
  const shield = def.shield + (hard ? hm.enemyShieldAdd : 0);
  return {
    uid: `e:${index}`,
    side: 'enemy',
    defId: def.id,
    name: def.name,
    row,
    slot,
    hp: maxHp,
    maxHp,
    atk: def.atk * sc.atk ** later * (hard ? hm.enemyAtk : 1),
    def: def.def * sc.def ** later,
    spd: def.spd * sc.spd ** later * (hard ? hm.enemySpd : 1),
    crit: 0,
    gauge: 0,
    shield,
    maxShield: shield,
    weaknesses: [...def.weaknesses],
    broken: false,
    brokenTurns: 0,
    skipTurns: 0,
    statuses: [],
    alive: true,
    skillCd: 0,
    skillRank: 1,
    actions: [...def.actions],
    actionIdx: 0,
    phase: 0,
    atkMult: 1,
    spdMult: 1,
    tier: def.tier,
  };
}

const ORDER: Record<string, number> = { whisperpine: 1, glass_dunes: 2, frostspire: 3, solenne: 4 };
export function regionOrderOf(region: string): number {
  return ORDER[region] ?? 1;
}

function statusValue(u: Unit, kind: string): number {
  let v = 0;
  for (const s of u.statuses) if (s.kind === kind) v = Math.max(v, s.value);
  return v;
}

export function hasStatus(u: Unit, kind: string): boolean {
  return u.statuses.some((s) => s.kind === kind);
}

export function effAtk(u: Unit): number {
  return u.atk * u.atkMult * (1 - statusValue(u, 'weaken'));
}

export function effSpd(u: Unit): number {
  return u.spd * u.spdMult * (1 - statusValue(u, 'chill') + statusValue(u, 'haste'));
}

export function guardReduction(u: Unit): number {
  return Math.min(0.9, statusValue(u, 'guard'));
}

export function hpFrac(u: Unit): number {
  return u.maxHp > 0 ? u.hp / u.maxHp : 0;
}
