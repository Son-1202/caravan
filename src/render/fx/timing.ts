// Pure "game feel" timing helpers (no Three imports; unit-tested):
// - Trauma: camera-shake trauma model (shake = trauma^2, smooth noise offsets).
// - TimeWarp: hit-stop (full freeze) + slow-mo with an ease back to 1x.

/** Smooth pseudo-noise in [-1, 1] from incommensurate sines (cheap, deterministic). */
function wobble(t: number, seed: number): number {
  return (Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 4.77 + seed * 2.9) * 0.2);
}

export interface ShakeOffset {
  x: number;
  y: number;
  roll: number;
}

/**
 * Trauma model (Squirrel Eiserloh): events add trauma (0..1), it decays
 * linearly, and the visible shake is trauma^2 so small hits stay subtle
 * while big beats (Break, boss phase, Ignite) really kick.
 */
export class Trauma {
  value = 0;
  private t = 0;

  constructor(
    private readonly decay = 1.5,
    private readonly max = { x: 0.42, y: 0.3, roll: 0.025 },
    private readonly freq = 38,
  ) {}

  add(k: number): void {
    this.value = Math.min(1, this.value + k);
  }

  update(dt: number): void {
    this.t += dt;
    this.value = Math.max(0, this.value - this.decay * dt);
  }

  get shake(): number {
    return this.value * this.value;
  }

  offset(out: ShakeOffset = { x: 0, y: 0, roll: 0 }): ShakeOffset {
    const s = this.shake;
    const t = this.t * this.freq;
    out.x = this.max.x * s * wobble(t, 1.3);
    out.y = this.max.y * s * wobble(t, 7.1);
    out.roll = this.max.roll * s * wobble(t, 4.2);
    return out;
  }
}

/** Break slow-mo: 0.25x held for 0.35 s (real), then eased back to 1x over 0.2 s. */
export const SLOWMO = { scale: 0.25, hold: 0.35, easeOut: 0.2 } as const;
/** Hit-stop on crits / Breaks (real seconds). */
export const HITSTOP = 0.06;

/** Real-time warp: returns the visual/sim speed factor each frame. */
export class TimeWarp {
  private stopLeft = 0;
  private slowT = Infinity;
  private slow: { scale: number; hold: number; easeOut: number } = SLOWMO;

  hitStop(sec = HITSTOP): void {
    this.stopLeft = Math.max(this.stopLeft, sec);
  }

  slowMo(o: { scale: number; hold: number; easeOut: number } = SLOWMO): void {
    this.slow = o;
    this.slowT = 0;
  }

  get stopped(): boolean {
    return this.stopLeft > 0;
  }

  /** True while slow-mo (hold or ease) is running. */
  get slowing(): boolean {
    return this.slowT < this.slow.hold + this.slow.easeOut;
  }

  /** Current factor without advancing time. */
  get factor(): number {
    if (this.stopLeft > 0) return 0;
    const { scale, hold, easeOut } = this.slow;
    if (this.slowT < hold) return scale;
    if (this.slowT < hold + easeOut) {
      const k = (this.slowT - hold) / easeOut;
      return scale + (1 - scale) * (k * k * (3 - 2 * k));
    }
    return 1;
  }

  /** Advance by real dt; returns the factor that applied over this frame. */
  update(dtReal: number): number {
    const f = this.factor;
    if (this.stopLeft > 0) this.stopLeft = Math.max(0, this.stopLeft - dtReal);
    else if (this.slowing) this.slowT += dtReal;
    return f;
  }
}
