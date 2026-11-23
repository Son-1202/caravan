// Relic effects compiled into modifiers + hooks. Every RelicEffect kind in src/data/types.ts is handled here
// (the exhaustive switch in `compileRelics` fails to type-check if a new kind is added).
import { RELIC_BY_ID } from '../data';
import type { DamageType, HeroId, RelicDef, RelicEffect, Row, Stat } from '../data';

/** What a hook may do to the battle. Implemented by Battle. */
export interface RelicContext {
  addEmber(value: number): void;
  healParty(fracOfMax: number, source: string): void;
  applyStatus(targetUid: string, kind: 'burn', value: number, duration: number, source: string): void;
}

export interface HitInfo {
  damageType: DamageType;
  weakness: boolean;
  targetBroken: boolean;
  attackerHpFrac: number;
}

export interface RelicHooks {
  onBattleStart(ctx: RelicContext): void;
  /** multiplier for a hero's stat (1 = unchanged) */
  modifyStat(stat: Stat, hero: HeroId, row: Row): number;
  /** damage multiplier for a hero-dealt hit */
  modifyDamage(hit: HitInfo): number;
  /** extra shield removed by a hero's weakness hit */
  shieldBonus(damageType: DamageType): number;
  critChanceBonus(): number;
  critMultBonus(): number;
  healMult(): number;
  emberGainMult(): number;
  breakDurationBonus(): number;
  shardMult(): number;
  onHit(ctx: RelicContext, targetUid: string, hit: HitInfo): void;
  onBreak(ctx: RelicContext, targetUid: string): void;
  onIgnite(ctx: RelicContext): void;
  onKill(ctx: RelicContext, targetUid: string): void;
  onTurnStart(ctx: RelicContext, actorUid: string): void;
}

export function relicDefs(ids: readonly string[]): RelicDef[] {
  const out: RelicDef[] = [];
  for (const id of ids) {
    const r = RELIC_BY_ID[id];
    if (r) out.push(r);
  }
  return out;
}

export function compileRelics(ids: readonly string[]): RelicHooks {
  const effects: RelicEffect[] = relicDefs(ids).map((r) => r.effect);
  const statMults: Array<Extract<RelicEffect, { kind: 'stat_mult' }>> = [];
  const breakEffects: Array<Extract<RelicEffect, { kind: 'on_break' }>> = [];
  const lowHp: Array<Extract<RelicEffect, { kind: 'low_hp_atk' }>> = [];
  const typeMult: Partial<Record<DamageType, number>> = {};
  const shieldBonus: Array<{ damageType?: DamageType; value: number }> = [];
  let igniteHeal = 0;
  let emberGain = 0;
  let weaknessDmg = 0;
  let brokenDmg = 0;
  let breakBonus = 0;
  let startEmber = 0;
  let critChance = 0;
  let critMult = 0;
  let heal = 0;
  let shards = 0;

  for (const e of effects) {
    switch (e.kind) {
      case 'stat_mult': statMults.push(e); break;
      case 'on_break': breakEffects.push(e); break;
      case 'on_ignite_heal': igniteHeal += e.value; break;
      case 'ember_gain_mult': emberGain += e.value; break;
      case 'weakness_dmg_mult': weaknessDmg += e.value; break;
      case 'broken_dmg_mult': brokenDmg += e.value; break;
      case 'damage_type_mult': typeMult[e.damageType] = (typeMult[e.damageType] ?? 0) + e.value; break;
      case 'shield_dmg_bonus': shieldBonus.push(e); break;
      case 'break_duration_bonus': breakBonus += e.value; break;
      case 'start_battle_ember': startEmber += e.value; break;
      case 'crit_bonus': critChance += e.chance; critMult += e.mult; break;
      case 'heal_mult': heal += e.value; break;
      case 'shard_mult': shards += e.value; break;
      case 'low_hp_atk': lowHp.push(e); break;
      default: {
        const never: never = e;
        throw new Error(`unhandled relic effect ${JSON.stringify(never)}`);
      }
    }
  }

  return {
    onBattleStart(ctx) {
      if (startEmber > 0) ctx.addEmber(startEmber);
    },
    modifyStat(stat, hero, row) {
      let m = 1;
      for (const e of statMults) {
        if (e.stat !== stat) continue;
        if (e.row && e.row !== row) continue;
        if (e.hero && e.hero !== hero) continue;
        m += e.value;
      }
      return m;
    },
    modifyDamage(hit) {
      let m = 1 + (typeMult[hit.damageType] ?? 0);
      if (hit.weakness) m *= 1 + weaknessDmg;
      if (hit.targetBroken) m *= 1 + brokenDmg;
      for (const e of lowHp) if (hit.attackerHpFrac < e.threshold) m *= 1 + e.value;
      return m;
    },
    shieldBonus(damageType) {
      let b = 0;
      for (const e of shieldBonus) if (!e.damageType || e.damageType === damageType) b += e.value;
      return b;
    },
    critChanceBonus: () => critChance,
    critMultBonus: () => critMult,
    healMult: () => 1 + heal,
    emberGainMult: () => 1 + emberGain,
    breakDurationBonus: () => breakBonus,
    shardMult: () => 1 + shards,
    onHit() {
      // no current relic reacts to plain hits; hook kept for future content
    },
    onBreak(ctx, targetUid) {
      for (const e of breakEffects) {
        if (e.effect === 'burn') ctx.applyStatus(targetUid, 'burn', e.value, e.duration, 'relic');
        else if (e.effect === 'ember') ctx.addEmber(e.value);
        else ctx.healParty(e.value, 'relic');
      }
    },
    onIgnite(ctx) {
      if (igniteHeal > 0) ctx.healParty(igniteHeal, 'relic');
    },
    onKill() {
      // reserved
    },
    onTurnStart() {
      // reserved
    },
  };
}
