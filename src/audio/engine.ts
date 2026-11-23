// Procedural WebAudio core (T-12): one AudioContext, master gain, shared noise buffer, voice helpers.
// Muted (no context at all) until the first user gesture calls unlock().

type Ctor = typeof AudioContext;

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  /** sfx and music buses (both into master) */
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  private volume = 0.7;
  private noiseBuf: AudioBuffer | null = null;
  private readonly unlockCbs: Array<() => void> = [];

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) as Ctor | undefined;
        if (!C) return;
        const ctx = new C();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.volume;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(ctx.destination);
        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
        this.music = ctx.createGain();
        this.music.gain.value = 0.55;
        this.music.connect(this.master);
        this.noiseBuf = makeNoise(ctx);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.flushUnlock(), () => undefined);
      else this.flushUnlock();
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  onUnlock(cb: () => void): void {
    if (this.ready) cb();
    else this.unlockCbs.push(cb);
  }

  private flushUnlock(): void {
    while (this.unlockCbs.length) this.unlockCbs.shift()?.();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  // ---------- voice helpers (all no-ops before unlock) ----------
  noise(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }

  /** gain node with an attack/decay envelope, connected to `dest` */
  env(dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode | null {
    if (!this.ctx) return null;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** filtered noise burst */
  burst(dest: AudioNode | null, o: { type: BiquadFilterType; freq: number; q?: number; peak: number; attack: number; decay: number; sweepTo?: number; delay?: number }): void {
    if (!this.ctx || !dest) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const src = this.noise();
    const f = this.filter(o.type, o.freq, o.q);
    const g = this.env(dest, t, o.peak, o.attack, o.decay);
    if (!src || !f || !g) return;
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.attack + o.decay);
    src.connect(f).connect(g);
    src.start(t, Math.random());
    src.stop(t + o.attack + o.decay + 0.05);
  }

  /** oscillator tone with an envelope; optional pitch glide */
  tone(dest: AudioNode | null, o: { type?: OscillatorType; freq: number; to?: number; peak: number; attack: number; decay: number; delay?: number; detune?: number }): void {
    if (!this.ctx || !dest) return;
    const t = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.attack + o.decay);
    const g = this.env(dest, t, o.peak, o.attack, o.decay);
    if (!g) return;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + o.attack + o.decay + 0.05);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
