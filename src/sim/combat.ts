// Deterministic real-time ATB battle. Pure TS: no DOM / Three / Math.random.
// Turn flow, hero AI, skills/ultimates, enemy patterns and the public API; rules live in BattleCore.
import { CONSUMABLE_BY_ID, ENEMY_BY_ID, HERO_BY_ID } from '../data';
import type { AiRule, DamageType, HeroDef, HeroId } from '../data';
import { BattleCore, type HitOpts } from './battle-core';
import { enemyTargets, heroTargets } from './targeting';
import type { HeroState, SimEvent, Unit } from './types';
import { effAtk, effSpd, hasStatus, hpFrac } from './units';

export type { BattleSetup } from './battle-core';

export class Battle extends BattleCore {
  tick(dt = 0.05): SimEvent[] {
    if (this.outcome !== 'ongoing') return this.flush();
    this.time += dt;
    const g = this.bal.gauge;
    for (const u of this.units) if (u.alive) u.gauge += effSpd(u) * g.fillPerSpdPerSec * dt;
    for (let guard = 0; guard < 64 && this.outcome === 'ongoing'; guard++) {
      const ready = this.units.filter((u) => u.alive && u.gauge >= g.max);
      if (ready.length === 0) break;
      ready.sort((a, b) => b.gauge - a.gauge || (a.side === b.side ? 0 : a.side === 'hero' ? -1 : 1));
      const u = ready[0] as Unit;
      u.gauge = 0;
      this.takeTurn(u);
      this.checkEnd();
    }
    if (this.outcome === 'ongoing' && this.time >= this.timeLimit) this.end('loss');
    return this.flush();
  }

  canIgnite(): boolean {
    return this.outcome === 'ongoing' && this.ember >= this.bal.ember.max && this.living('hero').length > 0;
  }

  /** All living heroes immediately cast their ultimate, in formation order. */
  ignite(): SimEvent[] {
    if (!this.canIgnite()) return this.flush();
    this.emit({ type: 'ignite' });
    this.st.ignites++;
    this.ember = 0;
    this.emit({ type: 'ember', value: 0 });
    this.relics.onIgnite(this.ctx);
    this.igniting = true;
    for (const h of this.units.filter((u) => u.side === 'hero')) {
      if (!h.alive || this.outcome !== 'ongoing') continue;
      this.ultimate(h, HERO_BY_ID[h.defId as HeroId]);
      this.checkEnd();
    }
    this.igniting = false;
    return this.flush();
  }

  /** Use a battle consumable from the inventory. `targetUid` picks the hero for revive. */
  useConsumable(id: string, targetUid?: string): SimEvent[] {
    const def = CONSUMABLE_BY_ID[id];
    const i = this.consumables.indexOf(id);
    if (!def || i < 0 || !def.usableIn.includes('battle') || this.outcome !== 'ongoing') return this.flush();
    const e = def.effect;
    const heroes = this.units.filter((u) => u.side === 'hero');
    if (e.kind === 'revive') {
      const t = heroes.find((h) => !h.alive && (!targetUid || h.uid === targetUid));
      if (!t) return this.flush();
      this.consumables.splice(i, 1);
      this.emit({ type: 'item', item: id });
      t.alive = true;
      t.hp = Math.max(1, Math.round(t.maxHp * e.value));
      t.gauge = 0;
      this.emit({ type: 'revive', target: t.uid, hp: t.hp });
      return this.flush();
    }
    this.consumables.splice(i, 1);
    this.emit({ type: 'item', item: id });
    if (e.kind === 'heal_party') for (const h of this.living('hero')) this.heal('item', h, h.maxHp * e.value);
    else if (e.kind === 'ember_fill') this.addEmber(e.value, true);
    else if (e.kind === 'shield_crack') {
      for (const en of this.living('enemy')) this.removeShield(en, e.value);
    } else if (e.kind === 'haste_party') {
      for (const h of this.living('hero')) this.applyStatus(h, { kind: 'haste', chance: 1, duration: e.duration, value: e.value }, 0, 'item');
    }
    this.checkEnd();
    return this.flush();
  }

  /** Party states after the fight (hpFrac updated; fallen heroes = 0). */
  heroStates(): HeroState[] {
    return this.party.map((p) => {
      const u = this.unit(`h:${p.id}`);
      return u ? { ...p, hpFrac: u.alive ? u.hp / u.maxHp : 0 } : { ...p };
    });
  }

  /** Convenience for tests / balance script: run until the battle ends. */
  runToEnd(opts: { dt?: number; autoIgnite?: boolean } = {}): SimEvent[] {
    const dt = opts.dt ?? 0.05;
    while (this.outcome === 'ongoing') {
      this.tick(dt);
      if ((opts.autoIgnite ?? true) && this.canIgnite()) this.ignite();
    }
    return this.log;
  }

  // ---------- turn flow ----------
  private takeTurn(u: Unit): void {
    this.relics.onTurnStart(this.ctx, u.uid);
    this.tickStatuses(u);
    if (!u.alive) return;
    if (u.broken) {
      u.brokenTurns--;
      if (u.skipTurns > 0) {
        u.skipTurns--;
        this.emit({ type: 'skip', actor: u.uid });
        if (u.brokenTurns <= 0) this.recover(u);
        return;
      }
    }
    if (u.side === 'hero') this.heroAct(u);
    else this.enemyAct(u);
    if (u.alive && u.broken && u.brokenTurns <= 0) this.recover(u);
  }

  private heroAct(u: Unit): void {
    const def = HERO_BY_ID[u.defId as HeroId];
    const rule = def.ai.find((r) => this.aiHolds(u, r)) ?? { when: ['always'], use: 'basic', target: def.basic.target };
    if (rule.use === 'skill') {
      this.skill(u, def, rule);
      u.skillCd = def.skill.cooldown;
      return;
    }
    if (u.skillCd > 0) u.skillCd--;
    this.emit({ type: 'action_start', actor: u.uid, skill: 'basic', name: def.basic.name });
    this.attack(u, rule.target, def.basic.damageType, def.basic.power, 1, {});
  }

  private aiHolds(u: Unit, r: AiRule): boolean {
    const heroes = this.living('hero');
    return r.when.every((c) => {
      switch (c) {
        case 'always': return true;
        case 'skill_ready': return u.skillCd === 0;
        case 'ally_below_half': return heroes.some((h) => hpFrac(h) < 0.5);
        case 'ally_threatened': return heroes.some((h) => hpFrac(h) < 0.5) && !heroes.some((h) => hasStatus(h, 'taunt'));
        case 'enemy_broken': return this.living('enemy').some((e) => e.broken);
        default: return false;
      }
    });
  }

  private skill(u: Unit, def: HeroDef, rule: AiRule): void {
    const sk = def.skill;
    const rank = sk.ranks[u.skillRank - 1] ?? sk.ranks[0];
    this.emit({ type: 'action_start', actor: u.uid, skill: sk.id, name: sk.name });
    const healMult = this.relics.healMult();
    if (sk.kind === 'support') {
      for (const t of heroTargets(rule.target, u, this.living('hero'), this.living('enemy'), sk.damageType, this.rng)) {
        if (rank.heal) this.heal(u.uid, t, effAtk(u) * rank.heal * healMult);
        if (rank.status) this.applyStatus(t, rank.status, effAtk(u), u.uid);
      }
    } else {
      const dt = sk.damageType ?? def.basic.damageType;
      const hit = this.attack(u, rule.target, dt, rank.power, rank.hits ?? 1, { shieldDmg: rank.shieldDmg });
      if (rank.status) for (const t of hit) if (t.alive) this.applyStatus(t, rank.status, effAtk(u), u.uid);
      if (rank.heal) this.heal(u.uid, u, effAtk(u) * rank.heal * healMult);
    }
    if (rank.selfStatus) this.applyStatus(u, rank.selfStatus, effAtk(u), u.uid);
  }

  private ultimate(u: Unit, def: HeroDef): void {
    const ult = def.ultimate;
    this.emit({ type: 'ultimate', actor: u.uid, skill: ult.id });
    const dt: DamageType = ult.damageType ?? def.basic.damageType;
    if (ult.power > 0) {
      const hit = this.attack(u, ult.target, dt, ult.power, ult.hits ?? 1, {
        shieldDmg: ult.shieldDmg, guaranteedCrit: ult.guaranteedCrit,
      });
      if (ult.status) for (const t of hit) if (t.alive) this.applyStatus(t, ult.status, effAtk(u), u.uid);
    }
    if (ult.heal) for (const h of this.living('hero')) this.heal(u.uid, h, effAtk(u) * ult.heal * this.relics.healMult());
    if (ult.allyStatus) for (const h of this.living('hero')) this.applyStatus(h, ult.allyStatus, effAtk(u), u.uid);
  }

  /** Hero damage action: `hits` hits per target; single-target hits retarget if the target dies. */
  private attack(u: Unit, rule: AiRule['target'], dt: DamageType, power: number, hits: number, opts: HitOpts): Unit[] {
    const pick = (): Unit[] => heroTargets(rule, u, this.living('hero'), this.living('enemy'), dt, this.rng);
    let targets = pick();
    const all = new Set<Unit>(targets);
    for (let i = 0; i < hits; i++) {
      if (targets.every((t) => !t.alive)) {
        if (targets.length !== 1) break;
        targets = pick();
        targets.forEach((t) => all.add(t));
      }
      for (const t of targets) if (t.alive) this.hit(u, t, power, dt, opts);
      if (this.living('enemy').length === 0) break;
    }
    return [...all];
  }

  private enemyAct(u: Unit): void {
    const def = ENEMY_BY_ID[u.defId];
    const acts = u.actions;
    if (!def || acts.length === 0) return;
    const a = def.patternMode === 'cycle'
      ? (acts[u.actionIdx++ % acts.length] ?? acts[0])
      : (this.rng.weighted(acts, (x) => x.weight) ?? acts[0]);
    if (!a) return;
    this.emit({ type: 'action_start', actor: u.uid, skill: a.id, name: a.name, telegraph: a.telegraph });
    if (a.kind === 'support') {
      if (a.restoreShield && !u.broken) {
        u.shield = Math.min(u.maxShield, u.shield + a.restoreShield);
        this.emit({ type: 'shield', target: u.uid, shield: u.shield });
      }
      if (a.status) this.applyStatus(u, a.status, effAtk(u), u.uid);
      return;
    }
    for (const t of enemyTargets(a.kind, this.living('hero'), this.bal, this.rng)) {
      this.hit(u, t, a.power, a.damageType, {});
      if (a.status && t.alive) this.applyStatus(t, a.status, effAtk(u), u.uid);
    }
  }

}
