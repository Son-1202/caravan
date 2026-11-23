// Post-FX stack (pmndrs postprocessing): tilt-shift, bloom, per-region color
// grade (hue/sat + brightness/contrast), vignette, film grain, and a
// chromatic-aberration pulse for impacts. High/Low quality, with automatic
// drop to Low when FPS < 45 for 3 s.
import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  KernelSize,
  NoiseEffect,
  RenderPass,
  TiltShiftEffect,
  VignetteEffect,
} from 'postprocessing';
import type { ColorGrade } from './regions';
import { renderQuality, type Quality } from './quality';

export type { Quality } from './quality';

const FPS_FLOOR = 45;
const FPS_WINDOW = 3; // seconds under the floor before dropping

export class PostFX {
  readonly composer: EffectComposer;
  quality: Quality = 'high';
  /** Set false to keep the current quality regardless of FPS. */
  autoQuality = true;
  onQualityChange?: (q: Quality) => void;

  private readonly tiltShift: TiltShiftEffect;
  private readonly bloom: BloomEffect;
  private readonly hueSat = new HueSaturationEffect();
  private readonly brightCon = new BrightnessContrastEffect();
  private readonly vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
  private readonly noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  private readonly chroma = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0, 0),
    radialModulation: true,
    modulationOffset: 0.15,
  });
  private chromaPulse = 0;
  private chromaStrength = 0;
  private chromaDecay = 4;
  private lowFpsTime = 0;
  private fpsAvg = 60;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.tiltShift = new TiltShiftEffect({
      // NDC units (-1..1, y up): focus band centered just below middle, on the actors
      offset: -0.05,
      rotation: 0,
      focusArea: 0.45,
      feather: 0.22,
      kernelSize: KernelSize.LARGE,
    });
    this.bloom = new BloomEffect({
      luminanceThreshold: 0.75,
      luminanceSmoothing: 0.25,
      intensity: 1.6,
      mipmapBlur: true,
      radius: 0.7,
    });
    this.noise.blendMode.opacity.value = 0.22;
    this.build();
  }

  private build(): void {
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const high = this.quality === 'high';
    renderQuality.level = this.quality;
    this.tiltShift.blurPass.kernelSize = KernelSize.LARGE;
    this.tiltShift.resolution.scale = 0.5;
    // Convolution effects (tilt-shift blur, bloom) can't share a pass with
    // each other or with chromatic aberration; split accordingly.
    // Low: no DoF (tilt-shift), no grain, no chromatic aberration.
    if (high) {
      this.composer.addPass(new EffectPass(this.camera, this.tiltShift));
      this.composer.addPass(new EffectPass(this.camera, this.bloom, this.hueSat, this.brightCon, this.vignette, this.noise));
      this.composer.addPass(new EffectPass(this.camera, this.chroma));
    } else {
      this.composer.addPass(new EffectPass(this.camera, this.bloom, this.hueSat, this.brightCon, this.vignette));
    }
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    this.build();
    this.setSize(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
    this.onQualityChange?.(q);
  }

  setGrade(g: ColorGrade): void {
    this.hueSat.hue = g.hue;
    this.hueSat.saturation = g.saturation;
    this.brightCon.brightness = g.brightness;
    this.brightCon.contrast = g.contrast;
  }

  /** Brief RGB-split kick (hits, breaks). strength ~ 0.002..0.01. */
  pulseChromatic(strength = 0.006, duration = 0.25): void {
    this.chromaStrength = Math.max(this.chromaStrength * this.chromaPulse, strength);
    this.chromaPulse = 1;
    this.chromaDecay = 1 / Math.max(0.01, duration);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  get fps(): number {
    return this.fpsAvg;
  }

  render(dt: number): void {
    if (dt > 0) {
      this.fpsAvg += (1 / dt - this.fpsAvg) * 0.1;
      if (this.autoQuality && this.quality === 'high') {
        this.lowFpsTime = this.fpsAvg < FPS_FLOOR ? this.lowFpsTime + dt : 0;
        if (this.lowFpsTime >= FPS_WINDOW) this.setQuality('low');
      }
    }
    this.chromaPulse = Math.max(0, this.chromaPulse - dt * this.chromaDecay);
    const o = this.chromaStrength * this.chromaPulse * this.chromaPulse;
    this.chroma.offset.set(o, o * 0.6);
    this.composer.render(dt);
  }
}
