// Procedural sound effects (T-12). Each recipe is a few noise/oscillator voices on the sfx bus.
import type { DamageType } from '../data';
import type { AudioEngine } from './engine';

export type UiSound = 'tick' | 'hover' | 'confirm' | 'back' | 'type';

export class Sfx {
  /** per-sound last play time, to keep fast battles from stacking dozens of voices */
  private readonly last = new Map<string, number>();

  constructor(private readonly a: AudioEngine) {}

  private gate(key: string, minGap: number): boolean {
    const now = this.a.now;
    if (!this.a.ready) return false;
    const t = this.last.get(key) ?? -1;
    if (now - t < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  hit(type: DamageType, strong = false, dot = false): void {
    if (!this.gate(`hit:${type}`, dot ? 0.12 : 0.045)) return;
    const a = this.a;
    const bus = a.sfx;
    const k = (dot ? 0.4 : 1) * (strong ? 1.35 : 1);
    switch (type) {
      case 'slash':
        a.burst(bus, { type: 'highpass', freq: 2400, q: 0.9, peak: 0.5 * k, attack: 0.004, decay: 0.12, sweepTo: 5200 });
        a.burst(bus, { type: 'bandpass', freq: 900, q: 1.2, peak: 0.25 * k, attack: 0.002, decay: 0.07 });
        break;
      case 'pierce':
        a.burst(bus, { type: 'highpass', freq: 3500, peak: 0.35 * k, attack: 0.001, decay: 0.025 });
        a.tone(bus, { type: 'sine', freq: 2600, to: 1400, peak: 0.12 * k, attack: 0.01, decay: 0.14 });
        break;
      case 'fire':
        a.burst(bus, { type: 'lowpass', freq: 500, q: 1.4, peak: 0.55 * k, attack: 0.04, decay: 0.32, sweepTo: 2600 });
        a.burst(bus, { type: 'bandpass', freq: 180, q: 0.8, peak: 0.25 * k, attack: 0.01, decay: 0.2 });
        break;
      case 'holy': {
        const base = 660;
        [1, 1.25, 1.5, 2].forEach((r, i) => a.tone(bus, { type: 'sine', freq: base * r, peak: (0.1 - i * 0.015) * k, attack: 0.005, decay: 0.7 + i * 0.1 }));
        a.burst(bus, { type: 'highpass', freq: 4000, peak: 0.12 * k, attack: 0.002, decay: 0.05 });
        break;
      }
    }
    if (strong && !dot) a.tone(bus, { type: 'triangle', freq: 120, to: 50, peak: 0.35, attack: 0.003, decay: 0.16 });
  }

  /** glassy shatter + low thump */
  break(): void {
    if (!this.gate('break', 0.08)) return;
    const a = this.a;
    const bus = a.sfx;
    a.burst(bus, { type: 'bandpass', freq: 5200, q: 9, peak: 0.6, attack: 0.002, decay: 0.55, sweepTo: 1800 });
    a.burst(bus, { type: 'bandpass', freq: 3100, q: 12, peak: 0.4, attack: 0.002, decay: 0.4, sweepTo: 7000, delay: 0.02 });
    for (let i = 0; i < 5; i++) a.tone(bus, { type: 'sine', freq: 2400 + Math.random() * 3600, peak: 0.07, attack: 0.002, decay: 0.25 + Math.random() * 0.3, delay: Math.random() * 0.12 });
    a.tone(bus, { type: 'sine', freq: 90, to: 38, peak: 0.7, attack: 0.004, decay: 0.38 });
  }

  /** rising whoosh + warm major chord */
  ignite(): void {
    if (!this.gate('ignite', 0.3)) return;
    const a = this.a;
    const bus = a.sfx;
    a.burst(bus, { type: 'bandpass', freq: 250, q: 1.5, peak: 0.6, attack: 0.45, decay: 0.5, sweepTo: 3800 });
    [220, 277.18, 329.63, 440].forEach((f, i) => {
      a.tone(bus, { type: 'sawtooth', freq: f, peak: 0.05, attack: 0.35, decay: 1.3, delay: 0.25 + i * 0.03, detune: (i - 1.5) * 6 });
      a.tone(bus, { type: 'sine', freq: f * 2, peak: 0.06, attack: 0.3, decay: 1.4, delay: 0.25 });
    });
    a.tone(bus, { type: 'sine', freq: 70, to: 110, peak: 0.4, attack: 0.3, decay: 0.6 });
  }

  heal(): void {
    if (!this.gate('heal', 0.15)) return;
    const a = this.a;
    [1046.5, 1318.5, 1568].forEach((f, i) => a.tone(a.sfx, { type: 'sine', freq: f, peak: 0.07, attack: 0.01, decay: 0.5, delay: i * 0.06 }));
  }

  death(): void {
    if (!this.gate('death', 0.1)) return;
    const a = this.a;
    a.tone(a.sfx, { type: 'sine', freq: 70, to: 30, peak: 0.7, attack: 0.005, decay: 0.5 });
    a.burst(a.sfx, { type: 'lowpass', freq: 300, peak: 0.4, attack: 0.005, decay: 0.3 });
  }

  shield(): void {
    if (!this.gate('shield', 0.15)) return;
    this.a.tone(this.a.sfx, { type: 'triangle', freq: 520, to: 780, peak: 0.08, attack: 0.01, decay: 0.25 });
  }

  victory(): void {
    if (!this.gate('victory', 1)) return;
    const a = this.a;
    [392, 493.88, 587.33, 783.99].forEach((f, i) => a.tone(a.sfx, { type: 'triangle', freq: f, peak: 0.12, attack: 0.01, decay: 0.6 + (i === 3 ? 0.8 : 0), delay: i * 0.12 }));
  }

  defeat(): void {
    if (!this.gate('defeat', 1)) return;
    const a = this.a;
    [293.66, 277.18, 261.63, 196].forEach((f, i) => a.tone(a.sfx, { type: 'triangle', freq: f, peak: 0.12, attack: 0.02, decay: 0.7 + (i === 3 ? 1 : 0), delay: i * 0.28 }));
  }

  ui(kind: UiSound): void {
    if (!this.gate(`ui:${kind}`, kind === 'type' ? 0.035 : 0.03)) return;
    const a = this.a;
    switch (kind) {
      case 'tick': a.tone(a.sfx, { type: 'square', freq: 880, peak: 0.04, attack: 0.002, decay: 0.04 }); break;
      case 'hover': a.tone(a.sfx, { type: 'sine', freq: 1320, peak: 0.025, attack: 0.002, decay: 0.035 }); break;
      case 'type': a.tone(a.sfx, { type: 'square', freq: 520 + Math.random() * 120, peak: 0.012, attack: 0.001, decay: 0.02 }); break;
      case 'back': a.tone(a.sfx, { type: 'square', freq: 660, to: 440, peak: 0.04, attack: 0.002, decay: 0.08 }); break;
      case 'confirm':
        a.tone(a.sfx, { type: 'square', freq: 660, peak: 0.04, attack: 0.002, decay: 0.06 });
        a.tone(a.sfx, { type: 'square', freq: 990, peak: 0.04, attack: 0.002, decay: 0.1, delay: 0.06 });
        break;
    }
  }
}
