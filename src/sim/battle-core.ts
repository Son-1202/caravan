// Battle state + low-level rules shared by the turn logic: damage, shields/Break, phases, statuses, heals, Ember.
import { BALANCE, ENEMY_BY_ID } from '../data';
import type { BalanceConfig, CurseId, DamageType, StatusApply, StatusKind } from '../data';
import { compileRelics, type HitInfo, type RelicContext, type RelicHooks } from './relics';
import { SeededRng } from './rng';
import type { BattleSnapshot, BattleStats, Formation, HeroState, Outcome, SimEvent, Unit } from './types';
import { curseMods, effAtk, guardReduction, hpFrac, makeEnemyUnit, makeHeroUnit } from './units';

export interface BattleSetup {
  party: readonly HeroState[];
  formation: Formation;
  enemies: { front: readonly string[]; back: readonly string[] };
  /** region the fight takes place in (1..4); scales enemies met outside their home region */
  regionOrder?: number;
  relics?: readonly string[];
  consumables?: readonly string[];
  curses?: readonly CurseId[];
  hard?: boolean;
  balance?: BalanceConfig;
  rng: SeededRng | number;
  /** sim seconds before the fight counts as a loss (stalemate guard); default 300 */
  timeLimit?: number;
}

export interface HitOpts {
  shieldDmg?: number;
  guaranteedCrit?: boolean;
}

export abstract class BattleCore {
  readonly log: SimEvent[] = [];
  readonly consumables: string[];
  protected readonly units: Unit[] = [];
  protected readonly bal: BalanceConfig;
  protected readonly rng: SeededRng;
  protected readonly relics: RelicHooks;
  protected readonly emberMult: number;
  protected readonly timeLimit: number;
  protected readonly party: readonly HeroState[];
  protected ember = 0;
  protected time = 0;
  protected outcome: Outcome = 'ongoing';
  protected igniting = false;
  protected pending: SimEvent[] = [];
  protected readonly st: BattleStats = { time: 0, breaks: 0, ignites: 0, kills: 0, damageDealt: 0, damageTaken: 0, healing: 0 };
  protected readonly ctx: RelicContext;

  constructor(setup: BattleSetup) {
    this.bal = setup.balance ?? BALANCE;
    this.rng = typeof setup.rng === 'number' ? new SeededRng(setup.rng) : setup.rng;
    this.relics = compileRelics(setup.relics ?? []);
    this.consumables = [...(setup.consumables ?? [])];
    this.timeLimit = setup.timeLimit ?? 300;
    this.party = setup.party;
    const curses = curseMods(setup.curses ?? []);
    this.emberMult = this.relics.emberGainMult() * curses.emberGain * (setup.hard ? this.bal.hardMode.emberGainMult : 1);
    const byId = new Map(setup.party.map((h) => [h.id, h]));
    for (const row of ['front', 'back'] as const) {
      setup.formation[row].forEach((id, slot) => {
        const hs = id ? byId.get(id) : undefined;
        if (hs) this.units.push(makeHeroUnit(hs, row, slot, this.bal, this.relics, curses));
      });
    }
    let idx = 0;
    const region = setup.regionOrder ?? 1;
    for (const row of ['front', 'back'] as const) {
      setup.enemies[row].forEach((id, slot) => {
        this.units.push(makeEnemyUnit(id, idx++, row, slot, region, setup.hard ?? false, this.bal));
      });
    }
    const g = this.bal.gauge;
    for (const u of this.units) if (u.side === 'hero' && u.alive) u.gauge = g.max * g.startJitter * this.rng.next();
    this.ctx = {
      addEmber: (v) => this.addEmber(v, true),
      healParty: (frac, source) => {
        for (const h of this.living('hero')) this.heal(source, h, h.maxHp * frac);
      },
      applyStatus: (uid, kind, value, duration, source) => {
        const u = this.unit(uid);
        if (u) this.applyStatus(u, { kind, chance: 1, duration, value }, 0, source);
      },
    };
    this.relics.onBattleStart(this.ctx);
  }


  // ---------- public API ----------
  get state(): BattleSnapshot {
    return {
      units: this.units.map((u) => ({
        uid: u.uid, side: u.side, defId: u.defId, name: u.name, row: u.row, slot: u.slot,
        hp: u.hp, maxHp: u.maxHp, gauge: u.gauge, shield: u.shield, maxShield: u.maxShield,
        weaknesses: [...u.weaknesses], broken: u.broken, alive: u.alive, phase: u.phase,
        status: u.statuses.map((s) => ({ kind: s.kind, value: s.value, remaining: s.remaining })),
      })),
      emberMeter: this.ember,
      emberMax: this.bal.ember.max,
      time: this.time,
      outcome: this.outcome,
    };
  }

  get stats(): BattleStats {
    return { ...this.st, time: this.time };
  }

  /** Advance the sim by dt seconds (renderer passes dt * battleSpeed). */
  // ---------- damage / shields / break ----------
  protected hit(src: Unit, tgt: Unit, power: number, dt: DamageType, opts: HitOpts): void {
    if (!tgt.alive) return;
    const d = this.bal.damage;
    const fromHero = src.side === 'hero';
    let dmg = effAtk(src) * power * d.defConstant / (d.defConstant + tgt.def);
    dmg *= 1 + this.rng.range(-d.variance, d.variance);
    const weakness = tgt.side === 'enemy' && tgt.weaknesses.includes(dt);
    const crit = fromHero && (opts.guaranteedCrit === true || this.rng.chance(src.crit));
    if (crit) dmg *= d.critMult + this.relics.critMultBonus();
    const info: HitInfo = { damageType: dt, weakness, targetBroken: tgt.broken, attackerHpFrac: hpFrac(src) };
    if (fromHero) dmg *= this.relics.modifyDamage(info);
    if (tgt.broken) dmg *= this.bal.break.dmgMult;
    dmg *= 1 - guardReduction(tgt);
    const amount = this.damage(tgt, Math.max(d.minDamage, Math.round(dmg)));
    this.emit({ type: 'hit', source: src.uid, target: tgt.uid, amount, damageType: dt, weakness, crit });
    if (fromHero) this.st.damageDealt += amount;
    else this.st.damageTaken += amount;
    const e = this.bal.ember;
    if (fromHero && !this.igniting) this.addEmber(e.perHit + (weakness ? e.perWeaknessHit : 0), false);
    if (!fromHero) this.addEmber(e.perHeroDamaged, false);
    this.relics.onHit(this.ctx, tgt.uid, info);
    if (weakness && tgt.alive && !tgt.broken && tgt.maxShield > 0) {
      const extra = fromHero ? (opts.shieldDmg ?? 0) + this.relics.shieldBonus(dt) : 0;
      this.removeShield(tgt, 1 + extra);
    }
    this.afterDamage(tgt, src);
  }

  /** Applies damage; a boss can't skip past an untriggered phase threshold (HP clamps there). */
  protected damage(u: Unit, amount: number): number {
    const phases = u.side === 'enemy' ? ENEMY_BY_ID[u.defId]?.phases : undefined;
    const next = phases?.[u.phase];
    let floor = 0;
    if (next) floor = Math.floor(next.hpThreshold * u.maxHp);
    const actual = Math.min(amount, Math.max(0, u.hp - floor));
    u.hp -= actual;
    return actual;
  }

  protected afterDamage(u: Unit, killer: Unit | null): void {
    if (u.hp <= 0 && u.alive) {
      this.kill(u, killer);
      return;
    }
    const phases = u.side === 'enemy' ? ENEMY_BY_ID[u.defId]?.phases : undefined;
    const next = phases?.[u.phase];
    if (next && u.alive && hpFrac(u) <= next.hpThreshold) {
      u.phase++;
      if (next.actions) u.actions = [...next.actions];
      if (next.weaknesses) u.weaknesses = [...next.weaknesses];
      u.actionIdx = 0;
      u.spdMult *= next.spdMult ?? 1;
      u.atkMult *= next.atkMult ?? 1;
      u.maxShield += next.addShield;
      if (!u.broken) u.shield = Math.min(u.maxShield, u.shield + next.addShield);
      this.emit({ type: 'phase', target: u.uid, phase: u.phase + 1, name: next.name, line: next.line });
      this.emit({ type: 'shield', target: u.uid, shield: u.shield });
    }
  }

  protected removeShield(u: Unit, n: number): void {
    if (!u.alive || u.broken || u.maxShield <= 0) return;
    u.shield = Math.max(0, u.shield - n);
    this.emit({ type: 'shield', target: u.uid, shield: u.shield });
    if (u.shield === 0) this.breakUnit(u);
  }

  protected breakUnit(u: Unit): void {
    const b = this.bal.break;
    u.broken = true;
    u.brokenTurns = b.durationActions + this.relics.breakDurationBonus();
    u.skipTurns = b.skipActions;
    this.st.breaks++;
    this.emit({ type: 'break', target: u.uid });
    this.addEmber(this.bal.ember.perBreak, false);
    this.relics.onBreak(this.ctx, u.uid);
  }

  protected recover(u: Unit): void {
    u.broken = false;
    u.brokenTurns = 0;
    u.skipTurns = 0;
    u.shield = this.bal.break.restoreShield ? u.maxShield : u.shield;
    this.emit({ type: 'recover', target: u.uid });
    this.emit({ type: 'shield', target: u.uid, shield: u.shield });
  }

  protected kill(u: Unit, killer: Unit | null): void {
    u.alive = false;
    u.hp = 0;
    u.gauge = 0;
    u.broken = false;
    u.statuses = [];
    this.emit({ type: 'death', target: u.uid });
    if (u.side === 'enemy') {
      this.st.kills++;
      if (!killer || killer.side === 'hero') this.addEmber(this.bal.ember.perKill, false);
      this.relics.onKill(this.ctx, u.uid);
    }
  }

  // ---------- statuses / heals / ember ----------
  protected applyStatus(t: Unit, s: StatusApply, sourceAtk: number, source: string): void {
    if (!t.alive || !this.rng.chance(s.chance)) return;
    const ex = t.statuses.find((x) => x.kind === s.kind);
    if (ex) {
      ex.value = Math.max(ex.value, s.value);
      ex.remaining = Math.max(ex.remaining, s.duration);
      ex.sourceAtk = Math.max(ex.sourceAtk, sourceAtk);
    } else {
      t.statuses.push({ kind: s.kind, value: s.value, remaining: s.duration, sourceAtk, source });
    }
    this.emit({ type: 'status', target: t.uid, status: s.kind, on: true });
  }

  /** At the start of a unit's own action: DoT / regen tick, then durations count down. */
  protected tickStatuses(u: Unit): void {
    for (const s of [...u.statuses]) {
      if (!u.alive) return;
      if (s.kind === 'burn' || s.kind === 'bleed') {
        const raw = s.kind === 'burn' ? u.maxHp * s.value : s.sourceAtk * s.value;
        const amount = this.damage(u, Math.max(1, Math.round(raw)));
        const dtype: DamageType = s.kind === 'burn' ? 'fire' : 'slash';
        this.emit({ type: 'hit', source: s.source, target: u.uid, amount, damageType: dtype, weakness: false, crit: false, dot: true });
        if (u.side === 'enemy') this.st.damageDealt += amount;
        else this.st.damageTaken += amount;
        this.afterDamage(u, null);
      } else if (s.kind === 'regen') {
        this.heal(s.source, u, u.maxHp * s.value);
      }
    }
    if (!u.alive) return;
    const expired: StatusKind[] = [];
    u.statuses = u.statuses.filter((s) => {
      s.remaining--;
      if (s.remaining <= 0) expired.push(s.kind);
      return s.remaining > 0;
    });
    for (const k of expired) this.emit({ type: 'status', target: u.uid, status: k, on: false });
  }

  protected heal(source: string, t: Unit, raw: number): void {
    if (!t.alive) return;
    const amount = Math.min(t.maxHp - t.hp, Math.round(raw));
    t.hp += amount;
    this.st.healing += amount;
    this.emit({ type: 'heal', source, target: t.uid, amount });
  }

  /** `raw` gains (relics, items) skip the ember-gain multipliers. */
  protected addEmber(v: number, raw: boolean): void {
    const before = this.ember;
    this.ember = Math.min(this.bal.ember.max, this.ember + v * (raw ? 1 : this.emberMult));
    if (this.ember !== before) this.emit({ type: 'ember', value: this.ember });
  }

  // ---------- helpers ----------
  protected living(side: 'hero' | 'enemy'): Unit[] {
    return this.units.filter((u) => u.side === side && u.alive);
  }

  protected unit(uid: string): Unit | undefined {
    return this.units.find((u) => u.uid === uid);
  }

  protected checkEnd(): void {
    if (this.outcome !== 'ongoing') return;
    if (this.living('enemy').length === 0) this.end('win');
    else if (this.living('hero').length === 0) this.end('loss');
  }

  protected end(o: 'win' | 'loss'): void {
    this.outcome = o;
    this.emit({ type: 'end', outcome: o });
  }

  protected emit(e: SimEvent): void {
    this.pending.push(e);
    this.log.push(e);
  }

  protected flush(): SimEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}
