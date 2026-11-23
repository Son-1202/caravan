// Procedural ambience / drones (T-12): map wind + per-region accents, battle pad + pulse, boss variant.
// One "bed" at a time; switching crossfades. Driven by update(dt) from the game loop.
import type { RegionId } from '../data';
import type { AudioEngine } from './engine';

export type MusicMode = 'none' | 'title' | 'map' | 'battle' | 'boss' | 'story';

interface Bed {
  out: GainNode;
  stop(): void;
}

const ROOT: Record<RegionId, number> = { whisperpine: 55, glass_dunes: 58.27, frostspire: 49, solenne: 46.25 };

export class Music {
  private mode: MusicMode = 'none';
  private region: RegionId = 'whisperpine';
  private bed: Bed | null = null;
  private nextAccent = 2;
  private nextBeat = 0;
  private beat = 0;

  constructor(private readonly a: AudioEngine) {
    a.onUnlock(() => this.rebuild());
  }

  set(mode: MusicMode, region?: RegionId): void {
    const r = region ?? this.region;
    if (mode === this.mode && r === this.region) return;
    this.mode = mode;
    this.region = r;
    this.rebuild();
  }

  private rebuild(): void {
    const a = this.a;
    if (!a.ctx || !a.music) return;
    const old = this.bed;
    if (old) {
      old.out.gain.setTargetAtTime(0.0001, a.now, 0.4);
      setTimeout(() => old.stop(), 2000);
    }
    this.bed = null;
    if (this.mode === 'none') return;
    const bed = this.mode === 'battle' || this.mode === 'boss' ? this.drone(this.mode === 'boss') : this.wind(this.mode === 'title' || this.mode === 'story' ? 0.6 : 1);
    bed.out.gain.setValueAtTime(0.0001, a.now);
    bed.out.gain.setTargetAtTime(1, a.now, 0.6);
    this.bed = bed;
    this.nextBeat = a.now + 0.3;
  }

  /** wind: noise through a slowly wandering bandpass + a soft root pad */
  private wind(level: number): Bed {
    const a = this.a;
    const ctx = a.ctx!;
    const out = ctx.createGain();
    out.connect(a.music!);
    const src = a.noise()!;
    const bp = a.filter('bandpass', this.region === 'frostspire' ? 900 : 500, 0.9)!;
    const g = ctx.createGain();
    g.gain.value = 0.16 * level;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 300;
    lfo.connect(lfoAmt).connect(bp.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.11;
    const lfo2Amt = ctx.createGain();
    lfo2Amt.gain.value = 0.07 * level;
    lfo2.connect(lfo2Amt).connect(g.gain);
    src.connect(bp).connect(g).connect(out);
    const pad = ctx.createOscillator();
    pad.type = 'triangle';
    pad.frequency.value = ROOT[this.region] * 2;
    const padG = ctx.createGain();
    padG.gain.value = 0.03 * level;
    pad.connect(padG).connect(out);
    const nodes = [src, lfo, lfo2, pad];
    nodes.forEach((n) => n.start());
    return { out, stop: () => { nodes.forEach((n) => { try { n.stop(); } catch { /* already */ } }); out.disconnect(); } };
  }

  /** battle: detuned saw pad through a lowpass; the pulse is scheduled in update() */
  private drone(boss: boolean): Bed {
    const a = this.a;
    const ctx = a.ctx!;
    const out = ctx.createGain();
    out.connect(a.music!);
    const lp = a.filter('lowpass', boss ? 380 : 520, 2)!;
    const g = ctx.createGain();
    g.gain.value = boss ? 0.1 : 0.08;
    lp.connect(g).connect(out);
    const root = ROOT[this.region] * (boss ? 0.75 : 1);
    const ratios = boss ? [1, 1.414, 2, 2.01] : [1, 1.5, 2, 2.005];
    const oscs = ratios.map((r, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root * r;
      o.detune.value = (i - 1.5) * 7;
      o.connect(lp);
      return o;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = boss ? 0.25 : 0.15;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = boss ? 220 : 160;
    lfo.connect(lfoAmt).connect(lp.frequency);
    const nodes = [...oscs, lfo];
    nodes.forEach((n) => n.start());
    return { out, stop: () => { nodes.forEach((n) => { try { n.stop(); } catch { /* already */ } }); out.disconnect(); } };
  }

  update(dt: number): void {
    const a = this.a;
    if (!a.ready || !this.bed) return;
    const out = this.bed.out;
    if (this.mode === 'battle' || this.mode === 'boss') {
      const boss = this.mode === 'boss';
      const step = boss ? 0.36 : 0.5;
      while (this.nextBeat < a.now + 0.1) {
        const delay = Math.max(0, this.nextBeat - a.now);
        const accent = this.beat % 4 === 0;
        a.tone(out, { type: 'sine', freq: accent ? 90 : 70, to: 40, peak: accent ? 0.32 : 0.18, attack: 0.004, decay: 0.22, delay });
        if (boss && this.beat % 2 === 1) a.burst(out, { type: 'highpass', freq: 6000, peak: 0.04, attack: 0.002, decay: 0.05, delay });
        this.beat++;
        this.nextBeat += step;
      }
      return;
    }
    this.nextAccent -= dt;
    if (this.nextAccent > 0) return;
    this.nextAccent = 3 + Math.random() * 6;
    this.accent(out);
  }

  /** occasional light detail per region */
  private accent(out: AudioNode): void {
    const a = this.a;
    const crackle = (): void => {
      for (let i = 0; i < 4; i++) a.burst(out, { type: 'highpass', freq: 2500, peak: 0.05 + Math.random() * 0.05, attack: 0.001, decay: 0.02, delay: i * (0.05 + Math.random() * 0.15) });
    };
    if (Math.random() < 0.35 || this.mode !== 'map') return crackle();
    switch (this.region) {
      case 'whisperpine': {
        const f = 2600 + Math.random() * 1200;
        for (let i = 0; i < 3; i++) a.tone(out, { type: 'sine', freq: f, to: f * 1.35, peak: 0.03, attack: 0.01, decay: 0.09, delay: i * 0.14 });
        break;
      }
      case 'glass_dunes':
        a.tone(out, { type: 'sine', freq: 1760 + Math.random() * 900, peak: 0.025, attack: 0.005, decay: 1.4 });
        break;
      case 'frostspire':
        a.burst(out, { type: 'bandpass', freq: 600, q: 6, peak: 0.08, attack: 0.8, decay: 1.6, sweepTo: 1400 });
        break;
      case 'solenne':
        a.tone(out, { type: 'sine', freq: 110, peak: 0.05, attack: 0.01, decay: 2.4 });
        a.tone(out, { type: 'sine', freq: 277, peak: 0.02, attack: 0.01, decay: 2 });
        break;
    }
  }
}
