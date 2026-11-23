// CombatView: turns sim events into procedural combat visuals on the diorama.
// Heroes stand left in their 2x2 formation (front row nearer the centre),
// enemies right (bosses 2x), the wagon + Ember behind the heroes.
// Reactions are scheduled on a visual clock so lunges land before hit flashes,
// projectiles arrive before sparks, etc. Pure consumer: never mutates the sim.
import * as THREE from 'three';
import type { BattleSnapshot, Formation, SimEvent, UnitSnapshot } from '../sim';
import { getRegion, isRegionId } from './regions';
import type { RenderContext } from './context';
import { CombatUnit, PX_PER_UNIT } from './combatUnit';
import { landingDust } from './fx/presets';
import { Projectiles } from './fx/effects';
import { CombatFx, DMG_COLOR, type CombatCue, type CombatFxHost } from './combatFx';
import { shouldFlip } from './facing';
import { actionInfo, enemyTier, TIER_PX, type ActionInfo } from './actionInfo';
import { heroSlot, stagePosition, STAGE } from './layout';
import { spriteUrl } from './assets';
import { createWagon, type Wagon } from './wagon';

export interface CombatViewOpts {
  regionId: string;
}

const HERO_COLORS: Record<string, string> = { bram: '#9aa7b8', kit: '#c08a4a', lysa: '#4f7a3a', oren: '#8e2f2f' };
const ULT_STAGGER = 0.5;
/** ultimate VFX lead (s before the impact) */
const ULT_LEAD: Record<string, number> = { bram: 0.12, lysa: 0.42, oren: 0.15, kit: 0 };
const WINDUP = 0.12;
/** fraction of the fg layer pushed below frame so it never covers the units */
const FG_DROP = 0.3;
/** in combat the fg only frames the bottom of the screen: hidden above the stage floor */
const FG_CLIP = 0.64;
/** cold rim outline on bosses */
const BOSS_RIM = '#9fd2ff';
/** lunge duration 0.42 s, contact at 42% */
const MELEE_IMPACT = 0.42 * 0.42;

interface Pending {
  info: ActionInfo;
  at: number;
  started: boolean;
  impactAt: number;
  hits: number;
  /** hero defId when this action is an Ignite ultimate */
  ult?: string;
}

export class CombatView implements CombatFxHost {
  readonly root = new THREE.Group();
  /** Suggested sim speed: 0 during hit-stop and the Ignite cinematic, 0.25..1 during Break slow-mo. */
  timeScale = 1;
  /** Optional hook fired when a visual beat starts (QA / audio / UI sync). */
  onCue?: (cue: CombatCue, uid: string, side: 'hero' | 'enemy' | null) => void;
  private readonly units = new Map<string, CombatUnit>();
  private readonly snap = new Map<string, UnitSnapshot>();
  private readonly fx: CombatFx;
  private readonly wagon: Wagon;
  private readonly dust: string;
  private queue: Array<{ at: number; fn: () => void }> = [];
  private readonly pending = new Map<string, Pending>();
  /** visual clock (s); CombatFxHost state shared with the reactions */
  now = 0;
  busyUntil = 0;
  igniteUntil = 0;
  private readonly fill = new THREE.DirectionalLight('#ffe2c4', 1.1);
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly ctx: RenderContext,
    opts: CombatViewOpts,
  ) {
    if (isRegionId(opts.regionId) && ctx.diorama.region.id !== opts.regionId) ctx.diorama.setRegion(opts.regionId);
    ctx.postfx.setGrade(getRegion(opts.regionId).grade);
    ctx.diorama.setScroll(0);
    // march mode scrolls the layers; restore the authored framing so the fg stays off the stage
    ctx.diorama.resetScroll();
    ctx.diorama.setFgDrop(FG_DROP, FG_CLIP);
    // soft front fill so sprites read against the dusk diorama
    this.fill.position.set(0, 5, 14);
    this.root.add(this.fill, this.fill.target);
    if (!ctx.cam.camera.parent) ctx.scene.add(ctx.cam.camera);
    this.dust = '#' + new THREE.Color(getRegion(opts.regionId).layers.ground).lerp(new THREE.Color('#d8c8b0'), 0.35).getHexString();
    this.wagon = createWagon();
    this.wagon.speed = 0; // parked during battle
    this.wagon.group.position.set(STAGE.wagon.x, 0, STAGE.wagon.z);
    this.fx = new CombatFx(ctx, this, this.units, this.wagon);
    this.root.add(this.wagon.group, this.fx.group);
    ctx.diorama.actors.add(this.root);
    this.onResize();
  }

  /** March preview (QA): let the wagon wheels follow the diorama scroll instead of parking. */
  setMarching(on: boolean): void {
    this.wagon.speed = on ? null : 0;
  }

  get busy(): boolean {
    return this.now < this.busyUntil;
  }

  /** Spawn sprites for every unit in the snapshot. */
  setup(state: BattleSnapshot, formation: Formation): void {
    for (const u of this.units.values()) {
      this.root.remove(u.group);
      u.dispose();
    }
    this.units.clear();
    this.snap.clear();
    for (const s of state.units) {
      this.snap.set(s.uid, s);
      const { row, slot } = s.side === 'hero' ? heroSlot(formation, s.defId) ?? s : s;
      const { tier, big } = s.side === 'enemy' ? enemyTier(s.defId) : { tier: 'normal', big: false };
      const h = (TIER_PX[tier] ?? 96) / PX_PER_UNIT;
      const url = spriteUrl(`${s.side === 'hero' ? 'heroes' : 'enemies'}/${s.defId}`);
      const unit = new CombatUnit({
        uid: s.uid,
        side: s.side,
        url,
        width: h * 0.7,
        height: h,
        color: HERO_COLORS[s.defId] ?? '#4a4a5e',
        flipX: shouldFlip(s.side, s.defId),
        // BUG-6: bosses get a cold rim so they read against the dark late regions
        outline: tier === 'boss' || tier === 'final' ? BOSS_RIM : undefined,
      });
      unit.onLand = (u) => landingDust(this.fx.bursts, u.worldPoint(0, this.tmp2), this.dust, u.width);
      const p = stagePosition(s.side, row, slot, big);
      unit.group.position.set(p.x, 0, p.z);
      if (!s.alive) unit.dissolve();
      this.units.set(s.uid, unit);
      this.root.add(unit.group);
    }
  }

  /** Screen position (CSS px) of a unit: 'top' = above the head, 'feet', 'center'. */
  unitScreenPos(uid: string, anchor: 'top' | 'center' | 'feet' = 'top'): { x: number; y: number } | null {
    const u = this.units.get(uid);
    if (!u) return null;
    const frac = anchor === 'top' ? 1.05 : anchor === 'center' ? 0.5 : 0;
    const p = u.worldPoint(frac, this.tmp).project(this.ctx.cam.camera);
    const el = this.ctx.renderer.domElement;
    return { x: (p.x * 0.5 + 0.5) * el.clientWidth, y: (-p.y * 0.5 + 0.5) * el.clientHeight };
  }

  applyEvents(events: SimEvent[]): void {
    let cursor = this.now;
    let lastImpact = this.now;
    const impactOf = (uid: string): number => this.pending.get(uid)?.impactAt ?? cursor;
    const lastHitOn = new Map<string, number>();
    for (const e of events) {
      switch (e.type) {
        case 'action_start': {
          const s = this.snap.get(e.actor);
          if (!s) break;
          this.pending.set(e.actor, { info: actionInfo(s.side, s.defId, e.skill), at: cursor, started: false, impactAt: cursor, hits: 0 });
          if (e.telegraph) this.at(cursor, () => this.units.get(e.actor)?.flash('#ff4030', 0.6));
          break;
        }
        case 'ultimate': {
          const s = this.snap.get(e.actor);
          if (!s) break;
          const t = cursor;
          const ult = s.side === 'hero' ? s.defId : undefined;
          this.pending.set(e.actor, { info: actionInfo(s.side, s.defId, e.skill), at: t + 0.3, started: false, impactAt: t + 0.3, hits: 0, ult });
          this.at(t, () => this.fx.ultimateWindup(e.actor));
          cursor += ULT_STAGGER;
          break;
        }
        case 'hit': {
          const t = this.scheduleHit(e.source, e.target, e.damageType, e.crit, e.weakness, e.dot === true, cursor);
          lastHitOn.set(e.target, t);
          lastImpact = Math.max(lastImpact, t);
          break;
        }
        case 'break': {
          const t = (lastHitOn.get(e.target) ?? cursor) + 0.02;
          this.at(t, () => this.fx.onBreak(e.target));
          break;
        }
        case 'recover':
          this.at(cursor, () => this.fx.onRecover(e.target));
          break;
        case 'heal': {
          const t = Math.max(cursor, impactOf(e.source)) + 0.12;
          this.at(t, () => this.fx.onHeal(e.target));
          break;
        }
        case 'death': {
          const t = (lastHitOn.get(e.target) ?? lastImpact) + 0.18;
          this.at(t, () => this.fx.onDeath(e.target));
          break;
        }
        case 'revive':
          this.at(cursor, () => this.fx.onRevive(e.target));
          break;
        case 'ignite':
          this.at(cursor, () => this.fx.onIgnite());
          this.igniteUntil = Math.max(this.igniteUntil, cursor + 0.6);
          cursor += 0.45;
          break;
        case 'phase':
          this.at(Math.max(cursor, lastImpact) + 0.1, () => this.fx.onPhase(e.target));
          break;
        case 'end':
          if (e.outcome === 'win') {
            this.at(lastImpact + 0.8, () => {
              for (const u of this.units.values()) if (u.side === 'hero' && u.alive) u.jump(0.5);
            });
          }
          break;
        default:
          break;
      }
    }
    // ignite cinematic: hold the sim until every scheduled ultimate has landed
    if (events.some((e) => e.type === 'ignite')) {
      const end = Math.max(cursor, lastImpact) + 0.5;
      this.igniteUntil = Math.max(this.igniteUntil, end);
      this.busyUntil = Math.max(this.busyUntil, end);
    }
  }

  /** Schedule attacker motion (first hit of an action) + the impact; returns the impact time. */
  private scheduleHit(src: string, tgt: string, dmgType: string, crit: boolean, weak: boolean, dot: boolean, cursor: number): number {
    const attacker = this.units.get(src);
    const target = this.units.get(tgt);
    const p = this.pending.get(src);
    if (!target) return cursor;
    if (dot || !attacker || !p) {
      this.at(cursor, () => this.fx.onImpact(tgt, null, dmgType, false, false, true));
      return cursor;
    }
    let t: number;
    const style = p.info.style === 'none' ? 'melee' : p.info.style;
    if (!p.started) {
      p.started = true;
      const start = Math.max(p.at, cursor);
      p.at = start;
      // impact time is fixed now so later events (break/death) can line up
      const dist = Math.abs(target.home.x - attacker.home.x);
      p.impactAt = start + (style === 'melee' ? MELEE_IMPACT : WINDUP + Projectiles.flightTime(style, dist));
      this.at(start, () => {
        const tu = this.units.get(tgt);
        if (!tu || !attacker.alive) return;
        this.onCue?.('attack', src, attacker.side);
        if (style === 'melee') attacker.lungeTo(tu.home);
        else attacker.flash(DMG_COLOR[dmgType] ?? '#ffffff', 0.35);
      });
      // ultimates replace the plain projectile with the hero's own VFX
      if (p.ult) {
        const who = p.ult;
        this.at(p.impactAt - (ULT_LEAD[who] ?? 0), () => this.fx.playUltimate(who, attacker, tgt));
      } else if (style !== 'melee') this.at(start + WINDUP, () => this.launchIfAlive(style, attacker, tgt));
      t = p.impactAt;
    } else {
      // extra targets / extra hits of the same action
      p.hits++;
      t = p.impactAt + p.hits * (style === 'melee' ? 0.09 : 0.05);
      if (style !== 'melee' && !p.ult) this.at(t - (p.impactAt - p.at - WINDUP), () => this.launchIfAlive(style, attacker, tgt));
    }
    const fromX = attacker.home.x;
    this.at(t, () => this.fx.onImpact(tgt, fromX, dmgType, crit, weak, false));
    return t;
  }

  private launchIfAlive(style: 'arrow' | 'orb' | 'beam', from: CombatUnit, tgt: string): void {
    const to = this.units.get(tgt);
    if (!to || !from.alive) return;
    const a = from.worldPoint(0.55, new THREE.Vector3());
    const b = to.worldPoint(0.5, new THREE.Vector3());
    this.fx.projectiles.launch(style, a, b);
  }

  private at(t: number, fn: () => void): void {
    this.queue.push({ at: t, fn });
  }

  // ---------- frame ----------
  update(dtReal: number): void {
    // hit-stop (factor 0) freezes the hit sprites, VFX and the sim; slow-mo scales both
    const f = this.fx.warp.update(dtReal);
    const dt = dtReal * f;
    this.now += dt;
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= this.now).sort((a, b) => a.at - b.at);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.at > this.now);
        for (const q of due) q.fn();
      }
    }
    this.timeScale = this.now < this.igniteUntil ? 0 : f;
    for (const u of this.units.values()) u.update(dt);
    this.wagon.update(this.now, dt);
    this.fx.update(dt, dtReal);
  }

  onResize(): void {
    this.fx.onResize();
  }

  dispose(): void {
    for (const u of this.units.values()) u.dispose();
    this.units.clear();
    this.queue = [];
    this.fx.dispose();
    this.wagon.dispose();
    this.ctx.diorama.setFgDrop(0);
    this.ctx.diorama.actors.remove(this.root);
  }
}
