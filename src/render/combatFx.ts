// Combat reactions + one-shot VFX owned by CombatView: impact sparks, Break
// shatter + hit-stop + slow-mo, heal motes, death ash, the Ignite cinematic
// (letterbox, warm flash, per-hero ultimates) and trauma camera shake.
import * as THREE from 'three';
import type { RenderContext } from './context';
import type { CombatUnit } from './combatUnit';
import type { Wagon } from './wagon';
import { Bursts } from './fx/bursts';
import { ashDissolve, breakShatter, healMotes, impactSparks } from './fx/presets';
import { FlashLights, Projectiles, ScreenFlash } from './fx/effects';
import { IgniteCinematic } from './fx/cinematic';
import { UltimateFx } from './fx/ultimates';
import { HITSTOP, TimeWarp, Trauma } from './fx/timing';

export type CombatCue = 'attack' | 'impact' | 'break' | 'ignite' | 'death';

/** The CombatView state the reactions read / extend. */
export interface CombatFxHost {
  /** visual clock (s) */
  readonly now: number;
  busyUntil: number;
  readonly igniteUntil: number;
  onCue?: (cue: CombatCue, uid: string, side: 'hero' | 'enemy' | null) => void;
}

export const DMG_COLOR: Record<string, string> = { slash: '#fff1d6', pierce: '#d8f0ff', fire: '#ff8a3a', holy: '#ffe27a' };
/** visual seconds of the Break slow-mo (0.35 s real at 0.25x + the ease back) */
const SLOWMO_VISUAL = 0.25;
/** camera trauma per beat (shake = trauma^2) */
const TRAUMA = { hit: 0.12, crit: 0.3, break: 0.55, phase: 0.7, ignite: 0.6, ult: 0.25 };

export class CombatFx {
  readonly group = new THREE.Group();
  readonly bursts = new Bursts();
  readonly lights = new FlashLights();
  readonly projectiles = new Projectiles(this.lights);
  readonly warp = new TimeWarp();
  private readonly flash: ScreenFlash;
  private readonly cine: IgniteCinematic;
  private readonly ult: UltimateFx;
  private readonly trauma = new Trauma();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly shakeOut = { x: 0, y: 0, roll: 0 };

  constructor(
    private readonly ctx: RenderContext,
    private readonly host: CombatFxHost,
    private readonly units: Map<string, CombatUnit>,
    private readonly wagon: Wagon,
  ) {
    this.flash = new ScreenFlash(ctx.cam.camera);
    this.cine = new IgniteCinematic(ctx.cam.camera);
    this.ult = new UltimateFx(this.bursts, this.lights);
    this.group.add(this.bursts.points, this.lights.group, this.projectiles.group, this.ult.group);
  }
  onImpact(uid: string, fromX: number | null, dmgType: string, crit: boolean, weak: boolean, dot: boolean): void {
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
    this.host.onCue?.('impact', uid, u.side);
    if (fromX !== null) u.recoil(fromX);
    impactSparks(this.bursts, p, c, crit, weak);
    this.trauma.add(crit ? TRAUMA.crit : TRAUMA.hit);
    if (crit) {
      this.ctx.postfx.pulseChromatic(0.004, 0.2);
      this.warp.hitStop(HITSTOP);
    }
  }

  onBreak(uid: string): void {
    const u = this.units.get(uid);
    if (!u) return;
    u.setBroken(true);
    u.flash('#cfe8ff', 1);
    this.host.onCue?.('break', uid, u.side);
    const p = u.worldPoint(0.55, this.tmp2);
    breakShatter(this.bursts, p);
    this.ult.breakRing(p, Math.max(1, u.height * 0.8));
    this.flash.flash('#dff0ff', 0.35, 0.25);
    this.ctx.postfx.pulseChromatic(0.012, 0.45);
    this.lights.fire(p, '#9fd4ff', 30, 0.45);
    this.trauma.add(TRAUMA.break);
    // freeze on the hit for a beat, then snap into slow-mo
    this.warp.hitStop(HITSTOP);
    this.warp.slowMo();
    this.host.busyUntil = Math.max(this.host.busyUntil, this.host.now + SLOWMO_VISUAL);
  }

  onRecover(uid: string): void {
    const u = this.units.get(uid);
    if (!u) return;
    u.setBroken(false);
    this.bursts.burst({ pos: u.worldPoint(0.5, this.tmp2), count: 14, color: '#8fc8ff', hdr: 2, speed: 1, life: 0.6, size: 0.08, drift: new THREE.Vector3(0, 0.6, 0) });
  }

  onHeal(uid: string): void {
    const u = this.units.get(uid);
    if (!u || !u.alive) return;
    u.flash('#b8ff9a', 0.35);
    healMotes(this.bursts, u);
  }

  onDeath(uid: string): void {
    const u = this.units.get(uid);
    if (!u || !u.alive) return;
    u.dissolve();
    this.host.onCue?.('death', uid, u.side);
    ashDissolve(this.bursts, u);
    this.bursts.burst({ pos: u.worldPoint(0.4, this.tmp2), count: 10, color: '#ff7a30', hdr: 2.5, speed: 0.6, drift: new THREE.Vector3(0, 1, 0), life: 1.2, size: 0.05 });
  }

  onRevive(uid: string): void {
    const u = this.units.get(uid);
    if (!u) return;
    u.revive();
    u.flash('#ffd27a', 1);
    this.onHeal(uid);
  }

  onIgnite(): void {
    const ember = this.wagon.ember.group.getWorldPosition(new THREE.Vector3());
    this.flash.flash('#ffb060', 0.45, 0.6);
    this.cine.flash(ember, 1.1);
    this.cine.bars(Math.max(0.8, this.host.igniteUntil - this.host.now + 0.1));
    this.host.onCue?.('ignite', '', null);
    this.wagon.ember.surge = 1;
    this.ctx.postfx.pulseChromatic(0.008, 0.6);
    this.lights.fire(ember, '#ff9a3c', 60, 1.2);
    this.trauma.add(TRAUMA.ignite);
  }

  playUltimate(who: string, from: CombatUnit, tgt: string): void {
    if (!from.alive) return;
    const foes = [...this.units.values()].filter((u) => u.side !== from.side && u.alive);
    const friends = [...this.units.values()].filter((u) => u.side === from.side && u.alive);
    this.trauma.add(TRAUMA.ult);
    if (who === 'bram') {
      const xs = friends.map((u) => u.home.x);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      this.ult.shieldDome(this.tmp.set((x0 + x1) / 2, 0, -0.1), (x1 - x0) / 2 + 1.3);
    } else if (who === 'lysa') {
      const xs = foes.map((u) => u.home.x);
      if (xs.length) this.ult.arrowRain(Math.min(...xs) - 0.8, Math.max(...xs) + 0.8, 0);
    } else if (who === 'oren') {
      foes.forEach((u, i) => this.ult.firePillar(u.home, i * 0.06));
    } else {
      const tu = this.units.get(tgt);
      if (tu) this.ult.dashSlash(tu.worldPoint(0.5, this.tmp), from.home.x);
    }
  }

  ultimateWindup(uid: string): void {
    const u = this.units.get(uid);
    if (!u || !u.alive) return;
    u.jump(0.55);
    u.glow(1);
    this.bursts.burst({ pos: u.home, box: new THREE.Vector3(u.width * 0.5, u.height, 0.2), count: 22, color: '#ff9a3c', hdr: 3, speed: 0.6, drift: new THREE.Vector3(0, 1.6, 0), life: 0.8, size: 0.08 });
  }

  onPhase(uid: string): void {
    this.flash.darkPulse(0.55, 0.7);
    this.trauma.add(TRAUMA.phase);
    const u = this.units.get(uid);
    if (!u) return;
    u.flash('#ff2a2a', 1);
    this.bursts.burst({ pos: u.worldPoint(0.5, this.tmp2), count: 30, color: '#7a1030', hdr: 1.5, speed: 3, drag: 2, life: 0.9, size: 0.14 });
  }

  /** dt = warped visual dt, dtReal = wall-clock dt. */
  update(dt: number, dtReal: number): void {
    this.bursts.update(dt);
    this.lights.update(dt);
    this.projectiles.update(dt);
    this.ult.update(dt);
    this.flash.update(dtReal);
    this.cine.update(dtReal);
    // camera shake: trauma model, decays in real time (keeps shaking through hit-stop)
    this.trauma.update(dtReal);
    const o = this.trauma.offset(this.shakeOut);
    this.ctx.cam.shake.set(o.x, o.y, 0);
    this.ctx.cam.roll = o.roll;
  }

  onResize(): void {
    const el = this.ctx.renderer.domElement;
    this.bursts.setViewport(el.clientHeight || window.innerHeight, this.ctx.cam.camera.fov);
  }

  dispose(): void {
    this.flash.dispose();
    this.cine.dispose();
    this.ult.dispose();
    this.bursts.dispose();
    this.projectiles.dispose();
    this.ctx.cam.shake.set(0, 0, 0);
    this.ctx.cam.roll = 0;
  }
}
