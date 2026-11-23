// Target selection for heroes (TargetRule) and enemies (formation-weighted).
import type { AttackKind, BalanceConfig, DamageType, TargetRule } from '../data';
import type { SeededRng } from './rng';
import type { Unit } from './types';
import { effAtk, hasStatus, hpFrac } from './units';

function minBy(list: Unit[], f: (u: Unit) => number): Unit | undefined {
  let best: Unit | undefined;
  let bv = Infinity;
  for (const u of list) {
    const v = f(u);
    if (v < bv) {
      bv = v;
      best = u;
    }
  }
  return best;
}

/** Resolve a hero TargetRule. Allies/enemies are the living units of each side, in stable order. */
export function heroTargets(
  rule: TargetRule, self: Unit, allies: Unit[], enemies: Unit[], damageType: DamageType | undefined, rng: SeededRng,
): Unit[] {
  const one = (u: Unit | undefined): Unit[] => (u ? [u] : []);
  const lowestEnemy = (): Unit | undefined => minBy(enemies, hpFrac);
  const highestAtk = (): Unit | undefined => minBy(enemies, (u) => -effAtk(u));
  switch (rule) {
    case 'self': return [self];
    case 'lowest_hp_ally': return one(minBy(allies, hpFrac));
    case 'all_allies': return allies;
    case 'lowest_hp_enemy': return one(lowestEnemy());
    case 'weakness_match_enemy': {
      // prefer enemies that are weak and still shielded (a hit there progresses a Break)
      const weak = damageType ? enemies.filter((e) => e.weaknesses.includes(damageType)) : [];
      const shielded = weak.filter((e) => !e.broken && e.shield > 0);
      const pool = shielded.length > 0 ? shielded : weak;
      return one(pool.length > 0 ? minBy(pool, hpFrac) : lowestEnemy());
    }
    case 'broken_enemy': {
      const broken = enemies.filter((e) => e.broken);
      return one(broken.length > 0 ? minBy(broken, hpFrac) : highestAtk());
    }
    case 'highest_atk_enemy': return one(highestAtk());
    case 'random_enemy': return enemies.length > 0 ? [rng.pick(enemies)] : [];
    case 'all_enemies': return enemies;
    default: {
      const never: never = rule;
      throw new Error(`unknown target rule ${String(never)}`);
    }
  }
}

/** Enemy targeting: taunt forces single-target attacks; melee prefers the front row (frontMeleeShare). */
export function enemyTargets(kind: AttackKind, heroes: Unit[], balance: BalanceConfig, rng: SeededRng): Unit[] {
  if (heroes.length === 0) return [];
  if (kind === 'aoe') return heroes;
  const taunters = heroes.filter((h) => hasStatus(h, 'taunt'));
  if (taunters.length > 0) return [taunters[0] as Unit];
  if (kind === 'ranged') return [rng.pick(heroes)];
  const front = heroes.filter((h) => h.row === 'front');
  const back = heroes.filter((h) => h.row === 'back');
  let row: Unit[];
  if (front.length === 0) row = back;
  else if (back.length === 0) row = front;
  else row = rng.chance(balance.formation.frontMeleeShare) ? front : back;
  return [rng.pick(row)];
}
