// Deterministic seeded RNG (mulberry32). Pure: safe for sim and render.
// `mulberry32`, `hashString` and `Rng` are used by src/render — keep them.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded RNG with helpers. `fork(label)` derives an independent, reproducible child stream. */
export class SeededRng {
  readonly seed: number;
  private readonly gen: Rng;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.gen = mulberry32(this.seed);
  }

  /** float in [0, 1) */
  next(): number {
    return this.gen();
  }

  /** integer in [a, b] inclusive */
  int(a: number, b: number): number {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return lo + Math.floor(this.gen() * (hi - lo + 1));
  }

  /** float in [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.gen();
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('SeededRng.pick: empty array');
    return arr[Math.floor(this.gen() * arr.length)] as T;
  }

  chance(p: number): boolean {
    return this.gen() < p;
  }

  /** weighted pick; items with weight <= 0 are never picked. Returns undefined if all weights are 0. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = this.gen() * total;
    for (const it of items) {
      const w = Math.max(0, weight(it));
      if (r < w) return it;
      r -= w;
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.gen() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /** Independent child stream; same parent seed + label ⇒ same child. Does not consume parent state. */
  fork(label: string): SeededRng {
    return new SeededRng(hashString(`${this.seed}:${label}`));
  }
}
