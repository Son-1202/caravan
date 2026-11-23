import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/sim';

describe('SeededRng', () => {
  it('is deterministic per seed', () => {
    const a = new SeededRng(1234);
    const b = new SeededRng(1234);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    expect(sa).toEqual(sb);
    const c = new SeededRng(1235);
    expect(Array.from({ length: 50 }, () => c.next())).not.toEqual(sa);
  });

  it('int / pick / chance stay in range', () => {
    const r = new SeededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
      expect(['a', 'b']).toContain(r.pick(['a', 'b']));
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  it('fork is reproducible, label-specific and does not consume the parent', () => {
    const p1 = new SeededRng(99);
    const p2 = new SeededRng(99);
    const f1 = p1.fork('battle:0');
    expect(f1.next()).toBe(p2.fork('battle:0').next());
    expect(p1.fork('battle:1').next()).not.toBe(p1.fork('battle:0').next());
    expect(p1.next()).toBe(p2.next());
  });

  it('accepts string seeds', () => {
    expect(new SeededRng('ember').next()).toBe(new SeededRng('ember').next());
  });
});
