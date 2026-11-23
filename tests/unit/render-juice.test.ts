import { describe, expect, it } from 'vitest';
import { HITSTOP, SLOWMO, TimeWarp, Trauma } from '../../src/render/fx/timing';
import { FACING_OVERRIDE, shouldFlip } from '../../src/render/facing';
import { ENEMIES } from '../../src/data';

describe('Trauma (camera shake)', () => {
  it('accumulates, clamps to 1 and decays to 0', () => {
    const t = new Trauma(1.5);
    t.add(0.6);
    t.add(0.7);
    expect(t.value).toBe(1);
    t.update(0.5);
    expect(t.value).toBeCloseTo(0.25);
    t.update(1);
    expect(t.value).toBe(0);
  });

  it('shake is trauma squared: small hits stay subtle, big beats kick', () => {
    const small = new Trauma();
    small.add(0.12);
    const big = new Trauma();
    big.add(0.55);
    expect(small.shake).toBeCloseTo(0.0144);
    expect(big.shake / small.shake).toBeGreaterThan(20);
  });

  it('offset stays within the configured max and is zero without trauma', () => {
    const t = new Trauma(1.5, { x: 0.4, y: 0.3, roll: 0.02 });
    const z = t.offset();
    expect(Math.abs(z.x) + Math.abs(z.y) + Math.abs(z.roll)).toBe(0);
    t.add(1);
    for (let i = 0; i < 50; i++) {
      t.update(0.005);
      const o = t.offset();
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(o.roll)).toBeLessThanOrEqual(0.02);
    }
  });
});

describe('TimeWarp (hit-stop + slow-mo)', () => {
  it('hit-stop freezes (factor 0) for ~60 ms then resumes', () => {
    const w = new TimeWarp();
    w.hitStop();
    expect(HITSTOP).toBeCloseTo(0.06);
    expect(w.update(0.03)).toBe(0);
    expect(w.update(0.03)).toBe(0);
    expect(w.update(0.016)).toBe(1);
  });

  it('Break slow-mo holds 0.25x for 0.35 s then eases back to 1x', () => {
    const w = new TimeWarp();
    w.slowMo();
    expect(w.factor).toBe(SLOWMO.scale);
    let t = 0;
    while (t < SLOWMO.hold - 0.02) t += (w.update(0.01), 0.01);
    expect(w.factor).toBe(0.25);
    for (let i = 0; i < 5; i++) w.update(0.01);
    const mid = w.factor;
    expect(mid).toBeGreaterThan(0.25);
    expect(mid).toBeLessThan(1);
    for (let i = 0; i < 30; i++) w.update(0.01);
    expect(w.factor).toBe(1);
    expect(w.slowing).toBe(false);
  });

  it('slow-mo waits behind a hit-stop', () => {
    const w = new TimeWarp();
    w.hitStop(0.06);
    w.slowMo();
    expect(w.update(0.05)).toBe(0);
    expect(w.update(0.02)).toBe(0);
    expect(w.update(0.01)).toBe(SLOWMO.scale);
  });
});

describe('enemy facing', () => {
  it('every enemy in the data has a facing entry', () => {
    for (const e of ENEMIES) expect(FACING_OVERRIDE[e.id], e.id).toBeDefined();
  });

  it('mirrors only sprites painted facing right; heroes never flip', () => {
    expect(shouldFlip('hero', 'bram')).toBe(false);
    for (const [id, f] of Object.entries(FACING_OVERRIDE)) expect(shouldFlip('enemy', id)).toBe(f === 'right');
  });
});
