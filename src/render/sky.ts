// Sky backdrop: code gradient shader (top -> horizon -> glow) with optional
// aurora and twinkling stars, plus drifting region particles.
import * as THREE from 'three';
import type { ParticleKind, RegionConfig } from './regions';
import { makeDotTexture } from './placeholders';
import { mulberry32 } from '../sim/rng';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow;
uniform float uTime; uniform float uAurora; uniform float uStars; uniform float uScroll;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float y = vUv.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.25, 0.95, y));
  col = mix(col, uGlow, pow(1.0 - smoothstep(0.15, 0.5, y), 2.0) * 0.85);
  vec2 sp = vec2(vUv.x + uScroll, vUv.y) * vec2(220.0, 120.0);
  vec2 cell = floor(sp);
  float h = hash(cell);
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
  float star = step(1.0 - 0.012 * uStars, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * tw;
  col += vec3(star) * smoothstep(0.35, 0.8, y);
  if (uAurora > 0.5) {
    float x = vUv.x + uScroll * 0.5;
    float band = sin(x * 9.0 + uTime * 0.25) * 0.05 + sin(x * 23.0 - uTime * 0.4) * 0.02 + 0.68;
    float a = exp(-pow((y - band) * 14.0, 2.0)) * (0.55 + 0.45 * sin(x * 40.0 + uTime));
    col += a * mix(vec3(0.1, 0.9, 0.6), vec3(0.5, 0.3, 0.9), smoothstep(0.6, 0.8, y)) * 0.7;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uTime: { value: 0 },
      uAurora: { value: 0 },
      uStars: { value: 0 },
      uScroll: { value: 0 },
    },
  });
}

export function applySky(mat: THREE.ShaderMaterial, cfg: RegionConfig): void {
  const u = mat.uniforms;
  (u.uTop.value as THREE.Color).set(cfg.sky.top);
  (u.uHorizon.value as THREE.Color).set(cfg.sky.horizon);
  (u.uGlow.value as THREE.Color).set(cfg.sky.glow);
  u.uAurora.value = cfg.sky.aurora ? 1 : 0;
  u.uStars.value = cfg.sky.stars;
}

const BOX = { x: 22, yMin: -1, yMax: 9, zMin: -26, zMax: 6 };

/** Drifting motes (fireflies / sand / snow / ash) spread through the depth. */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly seed: Float32Array;
  private readonly max = 300;
  private kind: ParticleKind = 'fireflies';
  private readonly mat: THREE.PointsMaterial;

  constructor() {
    this.pos = new Float32Array(this.max * 3);
    this.seed = new Float32Array(this.max);
    const rng = mulberry32(7);
    for (let i = 0; i < this.max; i++) {
      this.pos[i * 3] = (rng() * 2 - 1) * BOX.x;
      this.pos[i * 3 + 1] = BOX.yMin + rng() * (BOX.yMax - BOX.yMin);
      this.pos[i * 3 + 2] = BOX.zMin + rng() * (BOX.zMax - BOX.zMin);
      this.seed[i] = rng() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.18,
      map: makeDotTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  apply(cfg: RegionConfig): void {
    this.kind = cfg.particles.kind;
    const c = new THREE.Color(cfg.particles.color);
    // fireflies get HDR color so bloom picks them up
    if (this.kind === 'fireflies') c.multiplyScalar(1.6);
    this.mat.color.copy(c);
    this.mat.size = this.kind === 'sand' ? 0.09 : this.kind === 'fireflies' ? 0.14 : 0.12;
    this.points.geometry.setDrawRange(0, Math.min(this.max, cfg.particles.count));
  }

  update(dt: number, t: number, scrollSpeed: number): void {
    const p = this.pos;
    for (let i = 0; i < this.max; i++) {
      const s = this.seed[i];
      let vx = -scrollSpeed;
      let vy = 0;
      switch (this.kind) {
        case 'fireflies':
          vx += Math.sin(t * 0.7 + s) * 0.4;
          vy = Math.cos(t * 0.9 + s * 1.3) * 0.3;
          break;
        case 'sand':
          vx -= 2.5 + Math.sin(s) * 1.2;
          vy = Math.sin(t * 2 + s) * 0.15;
          break;
        case 'snow':
          vx += Math.sin(t * 0.5 + s) * 0.3 - 0.4;
          vy = -0.9 - (s % 1) * 0.4;
          break;
        case 'ash':
          vx += Math.sin(t * 0.3 + s) * 0.2;
          vy = -0.25 + Math.sin(t + s) * 0.1;
          break;
      }
      p[i * 3] += vx * dt;
      p[i * 3 + 1] += vy * dt;
      if (p[i * 3] < -BOX.x) p[i * 3] += BOX.x * 2;
      if (p[i * 3] > BOX.x) p[i * 3] -= BOX.x * 2;
      if (p[i * 3 + 1] < BOX.yMin) p[i * 3 + 1] = BOX.yMax;
      if (p[i * 3 + 1] > BOX.yMax) p[i * 3 + 1] = BOX.yMin;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
