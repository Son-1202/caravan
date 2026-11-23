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
import { Bursts } from './fx/bursts';
import { ashDissolve, healMotes, impactSparks } from './fx/presets';
import { FlashLights, Projectiles, ScreenFlash } from './fx/effects';
import { actionInfo, enemyTier, TIER_PX, type ActionInfo } from './actionInfo';
import { heroSlot, stagePosition, STAGE } from './layout';
import { spriteUrl } from './assets';
import { createWagon, type Wagon } from './wagon';

export interface CombatViewOpts {
  regionId: string;
}

const DMG_COLOR: Record<string, string> = { slash: '#fff1d6', pierce: '#d8f0ff', fire: '#ff8a3a', holy: '#ffe27a' };
const HERO_COLORS: Record<string, string> = { bram: '#9aa7b8', kit: '#c08a4a', lysa: '#4f7a3a', oren: '#8e2f2f' };
const SLOWMO = { scale: 0.3, real: 0.4, visual: 0.35 };
const ULT_STAGGER = 0.5;
const WINDUP = 0.12;
/** fraction of the fg layer pushed below frame so it never covers the units */
const FG_DROP = 0.3;
/** lunge duration 0.42 s, contact at 42% */
const MELEE_IMPACT = 0.42 * 0.42;

interface Pending {
  info: ActionInfo;
  at: number;
  started: boolean;
  impactAt: number;
  hits: number;
}

export class CombatView {
  readonly root = new THREE.Group();
  /** Suggested sim speed: 0.3 during Break slow-mo, 0 while the Ignite cinematic plays. */
  timeScale = 1;
  /** Optional hook fired when a visual beat starts (QA / audio / UI sync). */
  onCue?: (cue: 'attack' | 'impact' | 'break' | 'ignite' | 'death', uid: string, side: 'hero' | 'enemy' | null) => void;
  private readonly units = new Map<string, CombatUnit>();
  private readonly snap = new Map<string, UnitSnapshot>();
  private readonly bursts = new Bursts();
  private readonly lights = new FlashLights();
  private readonly projectiles = new Projectiles(this.lights);
  private readonly flash: ScreenFlash;
  private readonly wagon: Wagon;
  private queue: Array<{ at: number; fn: () => void }> = [];
  private readonly pending = new Map<string, Pending>();
  /** visual clock (s) */
  private now = 0;
  private busyUntil = 0;
  private igniteUntil = 0;
  private slowLeft = 0;
  private shakeK = 0;
  private shakeT = 0;
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
    ctx.diorama.setFgDrop(FG_DROP);
    // soft front fill so sprites read against the dusk diorama
    this.fill.position.set(0, 5, 14);
    this.root.add(this.fill, this.fill.target);
    if (!ctx.cam.camera.parent) ctx.scene.add(ctx.cam.camera);
    this.flash = new ScreenFlash(ctx.cam.camera);
    this.wagon = createWagon();
    this.wagon.group.position.set(STAGE.wagon.x, 0, STAGE.wagon.z);
    this.root.add(this.wagon.group, this.bursts.points, this.lights.group, this.projectiles.group);
    ctx.diorama.actors.add(this.root);
    this.onResize();
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
      const unit = new CombatUnit({ uid: s.uid, side: s.side, url, width: h * 0.7, height: h, color: HERO_COLORS[s.defId] ?? '#4a4a5e' });
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
          this.pending.set(e.actor, { info: actionInfo(s.side, s.defId, e.skill), at: t + 0.3, started: false, impactAt: t + 0.3, hits: 0 });
          this.at(t, () => this.ultimateWindup(e.actor));
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
          this.at(t, () => this.onBreak(e.target));
          break;
        }
        case 'recover':
          this.at(cursor, () => this.onRecover(e.target));
          break;
        case 'heal': {
          const t = Math.max(cursor, impactOf(e.source)) + 0.12;
          this.at(t, () => this.onHeal(e.target));
          break;
        }
        case 'death': {
          const t = (lastHitOn.get(e.target) ?? lastImpact) + 0.18;
          this.at(t, () => this.onDeath(e.target));
          break;
        }
        case 'revive':
          this.at(cursor, () => this.onRevive(e.target));
          break;
        case 'ignite':
          this.at(cursor, () => this.onIgnite());
          this.igniteUntil = Math.max(this.igniteUntil, cursor + 0.6);
          cursor += 0.45;
          break;
        case 'phase':
          this.at(Math.max(cursor, lastImpact) + 0.1, () => this.onPhase(e.target));
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
      this.at(cursor, () => this.onImpact(tgt, null, dmgType, false, false, true));
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
      if (style !== 'melee') this.at(start + WINDUP, () => this.launchIfAlive(style, attacker, tgt));
      t = p.impactAt;
    } else {
      // extra targets / extra hits of the same action
      p.hits++;
      t = p.impactAt + p.hits * (style === 'melee' ? 0.09 : 0.05);
      if (style !== 'melee') this.at(t - (p.impactAt - p.at - WINDUP), () => this.launchIfAlive(style, attacker, tgt));
    }
    const fromX = attacker.home.x;
    this.at(t, () => this.onImpact(tgt, fromX, dmgType, crit, weak, false));
    return t;
  }

  private launchIfAlive(style: 'arrow' | 'orb' | 'beam', from: CombatUnit, tgt: string): void {
    const to = this.units.get(tgt);
    if (!to || !from.alive) return;
    const a = from.worldPoint(0.55, new THREE.Vector3());
    const b = to.worldPoint(0.5, new THREE.Vector3());
    this.projectiles.launch(style, a, b);
  }

  private at(t: number, fn: () => void): void {
    this.queue.push({ at: t, fn });
  }

  // ---------- reactions ----------
  private onImpact(uid: string, fromX: number | null, dmgType: string, crit: boolean, weak: boolean, dot: boolean): void {
    const u = this.units.get(uid);
    if (!u) return;
    const c = DMG_COLOR[dmgType] ?? '#ffffff';
    const p = u.worldPoint(0.5, this.tmp2);
    if (dot) {
      u.flash(c, 0.4);
      this.bursts.burst({ pos: p, count: 6, color: c, hdr: 1.5, speed: 0.8, life: 0.5, size: 0.08, drift: new THREE.Vector3(0, 0.8, 0) });
      return;
    }
    u.flash('#ffffff', 1);
    this.onCue?.('impact', uid, u.side);
    if (fromX !== null) u.recoil(fromX);
    impactSparks(this.bursts, p, c, crit, weak);
    if (crit) {
      this.ctx.postfx.pulseChromatic(0.004, 0.2);
      this.shake(0.12);
    }
  }

  private onBreak(uid: string): void {
    const u = this.units.get(uid);
    if (!u) return;
    u.setBroken(true);
    u.flash('#cfe8ff', 1);
    this.onCue?.('break', uid, u.side);
    const p = u.worldPoint(0.55, this.tmp2);
    this.bursts.burst({ pos: p, count: 46, color: '#a8dcff', hdr: 3, speed: 6, gravity: 7, drag: 2, life: 0.9, size: 0.1, soft: 0, radius: 0.35, zScale: 0.7 });
    this.bursts.burst({ pos: p, count: 18, color: '#ffffff', hdr: 4, speed: 3, life: 0.35, size: 0.16, radius: 0.2 });
    this.flash.flash('#dff0ff', 0.3, 0.25);
    this.ctx.postfx.pulseChromatic(0.012, 0.45);
    this.lights.fire(p, '#9fd4ff', 24, 0.4);
    this.shake(0.25);
    this.slowLeft = SLOWMO.real;
    this.busyUntil = Math.max(this.busyUntil, this.now + SLOWMO.real * SLOWMO.visual);
  }

  private onRecover(uid: string): void {
    const u = this.units.get(uid);
    if (!u) return;
    u.setBroken(false);
    this.bursts.burst({ pos: u.worldPoint(0.5, this.tmp2), count: 14, color: '#8fc8ff', hdr: 2, speed: 1, life: 0.6, size: 0.08, drift: new THREE.Vector3(0, 0.6, 0) });
  }

  private onHeal(uid: string): void {
    const u = this.units.get(uid);
    if (!u || !u.alive) return;
    u.flash('#b8ff9a', 0.35);
    healMotes(this.bursts, u);
  }

  private onDeath(uid: string): void {
    const u = this.units.get(uid);
    if (!u || !u.alive) return;
    u.dissolve();
    this.onCue?.('death', uid, u.side);
    ashDissolve(this.bursts, u);
    this.bursts.burst({ pos: u.worldPoint(0.4, this.tmp2), count: 10, color: '#ff7a30', hdr: 2.5, speed: 0.6, drift: new THREE.Vector3(0, 1, 0), life: 1.2, size: 0.05 });
  }

  private onRevive(uid: string): void {
    const u = this.units.get(uid);
    if (!u) return;
    u.revive();
    u.flash('#ffd27a', 1);
    this.onHeal(uid);
  }

  private onIgnite(): void {
    this.flash.flash('#ffb060', 0.8, 0.7);
    this.onCue?.('ignite', '', null);
    this.wagon.ember.surge = 1;
    this.ctx.postfx.pulseChromatic(0.008, 0.6);
    this.lights.fire(this.wagon.ember.group.getWorldPosition(new THREE.Vector3()), '#ff9a3c', 60, 1.2);
    this.shake(0.15);
  }

  private ultimateWindup(uid: string): void {
    const u = this.units.get(uid);
    if (!u || !u.alive) return;
    u.jump(0.55);
    u.glow(1);
    this.bursts.burst({ pos: u.home, box: new THREE.Vector3(u.width * 0.5, u.height, 0.2), count: 22, color: '#ff9a3c', hdr: 3, speed: 0.6, drift: new THREE.Vector3(0, 1.6, 0), life: 0.8, size: 0.08 });
  }

  private onPhase(uid: string): void {
    this.flash.darkPulse(0.55, 0.7);
    this.shake(0.5);
    const u = this.units.get(uid);
    if (!u) return;
    u.flash('#ff2a2a', 1);
    this.bursts.burst({ pos: u.worldPoint(0.5, this.tmp2), count: 30, color: '#7a1030', hdr: 1.5, speed: 3, drag: 2, life: 0.9, size: 0.14 });
  }

  private shake(k: number): void {
    this.shakeK = Math.max(this.shakeK, k);
  }

  // ---------- frame ----------
  update(dtReal: number): void {
    const slow = this.slowLeft > 0;
    this.slowLeft = Math.max(0, this.slowLeft - dtReal);
    const dt = dtReal * (slow ? SLOWMO.visual : 1);
    this.now += dt;
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= this.now).sort((a, b) => a.at - b.at);
      if (due.length) {
        this.queue = this.queue.filter((q) => q.at > this.now);
        for (const q of due) q.fn();
      }
    }
    this.timeScale = this.now < this.igniteUntil ? 0 : slow ? SLOWMO.scale : 1;
    for (const u of this.units.values()) u.update(dt);
    this.wagon.update(this.now, dt);
    this.bursts.update(dt);
    this.lights.update(dt);
    this.projectiles.update(dt);
    this.flash.update(dtReal);
    // camera shake (decays in real time)
    this.shakeT += dtReal;
    this.shakeK = Math.max(0, this.shakeK - dtReal * 1.6);
    const k = this.shakeK * this.shakeK;
    this.ctx.cam.shake.set(Math.sin(this.shakeT * 61) * 0.35 * k, Math.sin(this.shakeT * 47 + 1) * 0.25 * k, 0);
  }

  onResize(): void {
    const el = this.ctx.renderer.domElement;
    this.bursts.setViewport(el.clientHeight || window.innerHeight, this.ctx.cam.camera.fov);
  }

  dispose(): void {
    for (const u of this.units.values()) u.dispose();
    this.units.clear();
    this.queue = [];
    this.flash.dispose();
    this.bursts.dispose();
    this.projectiles.dispose();
    this.wagon.dispose();
    this.ctx.cam.shake.set(0, 0, 0);
    this.ctx.diorama.setFgDrop(0);
    this.ctx.diorama.actors.remove(this.root);
  }
}
