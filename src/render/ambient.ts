// Ambient region atmosphere: drifting particles per region (blinking
// fireflies, wind-blown sand, snowfall, falling ash with rising embers) in one
// Points draw call with per-particle colour/size/alpha, plus a heat-haze UV
// shimmer patched into the painted far layer (Glass Dunes). Density follows
// the render quality (Low = ~1/3 of the particles).
import * as THREE from 'three';
import type { ParticleKind, RegionConfig } from './regions';
import { mulberry32 } from '../sim/rng';
import { particleDensity } from './quality';

const BOX = { x: 22, yMin: -1, yMax: 9, zMin: -26, zMax: 6 };
const MAX = 320;

const vert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aSoft;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
uniform float uScale;
void main() {
  vColor = aColor; vAlpha = aAlpha; vSoft = aSoft;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vSoft > 0.5 ? smoothstep(1.0, 0.15, d) : step(d, 0.9);
  if (vAlpha * a < 0.01) discard;
  gl_FragColor = vec4(vColor, vAlpha * a);
}`;

const tmpColor = new THREE.Color();

/** Ash region: ~15% of the particles are rising embers. */
const isEmber = (s: number) => (s * 7.31) % 1 < 0.15;

export class Particles {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly soft = new Float32Array(MAX);
  private readonly seed = new Float32Array(MAX);
  private readonly mat: THREE.ShaderMaterial;
  private kind: ParticleKind = 'fireflies';
  private count = 0;
  private baseCount = 0;

  constructor() {
    const rng = mulberry32(7);
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3] = (rng() * 2 - 1) * BOX.x;
      this.pos[i * 3 + 1] = BOX.yMin + rng() * (BOX.yMax - BOX.yMin);
      this.pos[i * 3 + 2] = BOX.zMin + rng() * (BOX.zMax - BOX.zMin);
      this.seed[i] = rng() * 100;
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aSoft', new THREE.BufferAttribute(this.soft, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.onBeforeRender = (renderer, _s, camera) => {
      const h = renderer.getContext().drawingBufferHeight;
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 28;
      this.mat.uniforms.uScale!.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    };
  }

  apply(cfg: RegionConfig): void {
    this.kind = cfg.particles.kind;
    this.baseCount = Math.min(MAX, cfg.particles.count);
    const base = new THREE.Color(cfg.particles.color);
    const [y0, y1] = this.kind === 'fireflies' ? [0.15, 4.5] : [BOX.yMin, BOX.yMax];
    for (let i = 0; i < MAX; i++) {
      const s = this.seed[i]!;
      const r = (s * 13.37) % 1;
      let c = tmpColor.copy(base);
      let size = 0.1;
      let soft = 1;
      switch (this.kind) {
        case 'fireflies':
          c.multiplyScalar(2.4);
          size = 0.1 + r * 0.06;
          break;
        case 'sand':
          c.multiplyScalar(0.85 + r * 0.3);
          size = 0.05 + r * 0.05;
          soft = 0;
          break;
        case 'snow':
          size = 0.06 + r * r * 0.14; // a few big near flakes
          break;
        case 'ash':
          if (isEmber(s)) {
            c = tmpColor.set('#ff8a3a').multiplyScalar(3);
            size = 0.06;
          } else {
            c.multiplyScalar(0.55 + r * 0.35);
            size = 0.07 + r * 0.06;
            soft = 0;
          }
          break;
      }
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      this.size[i] = size;
      this.soft[i] = soft;
      // fireflies hover near the ground: remap their heights once
      const y = this.pos[i * 3 + 1]!;
      if (y < y0 || y > y1) this.pos[i * 3 + 1] = y0 + (((y - BOX.yMin) / (BOX.yMax - BOX.yMin)) * (y1 - y0));
    }
    for (const n of ['aColor', 'aSize', 'aSoft']) (this.geo.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    this.count = -1; // force draw-range refresh
  }

  update(dt: number, t: number, scrollSpeed: number): void {
    const want = Math.round(this.baseCount * particleDensity());
    if (want !== this.count) {
      this.count = want;
      this.geo.setDrawRange(0, want);
    }
    const p = this.pos;
    const yTop = this.kind === 'fireflies' ? 4.5 : BOX.yMax;
    const yBot = this.kind === 'fireflies' ? 0.15 : BOX.yMin;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i]!;
      let vx = -scrollSpeed;
      let vy = 0;
      let a = 1;
      switch (this.kind) {
        case 'fireflies': {
          vx += Math.sin(t * 0.7 + s) * 0.4;
          vy = Math.cos(t * 0.9 + s * 1.3) * 0.3;
          // slow blink: mostly dim, brief bright glow
          const b = Math.max(0, Math.sin(t * (0.9 + (s % 1) * 0.8) + s));
          a = 0.08 + 0.92 * b * b * b;
          break;
        }
        case 'sand':
          vx -= 3 + Math.sin(s) * 1.4 + Math.sin(t * 0.8) * 0.8; // gusts
          vy = Math.sin(t * 2 + s) * 0.18;
          a = 0.35 + 0.25 * Math.sin(s * 3.1);
          break;
        case 'snow':
          vx += Math.sin(t * 0.5 + s) * 0.35 - 0.45;
          vy = -0.8 - (s % 1) * 0.5;
          a = 0.85;
          break;
        case 'ash':
          if (isEmber(s)) {
            vx += Math.sin(t * 0.9 + s) * 0.25;
            vy = 0.35 + (s % 1) * 0.3;
            a = 0.5 + 0.5 * Math.sin(t * 6 + s * 5);
          } else {
            vx += Math.sin(t * 0.3 + s) * 0.25 + 0.1;
            vy = -0.3 + Math.sin(t * 1.7 + s) * 0.12; // flutter
            a = 0.75;
          }
          break;
      }
      this.alpha[i] = a;
      p[i * 3] += vx * dt;
      p[i * 3 + 1] += vy * dt;
      if (p[i * 3]! < -BOX.x) p[i * 3] += BOX.x * 2;
      if (p[i * 3]! > BOX.x) p[i * 3] -= BOX.x * 2;
      if (p[i * 3 + 1]! < yBot) p[i * 3 + 1] = yTop;
      if (p[i * 3 + 1]! > yTop) p[i * 3 + 1] = yBot;
    }
    this.geo.attributes.position!.needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Shared uniforms for the heat-haze shimmer (uHaze 0 = off). */
export const hazeUniforms = { uHaze: { value: 0 }, uHazeTime: { value: 0 } };

/**
 * Patch a painted layer material so its map (and emissive map) sample with a
 * small wavy UV offset near the horizon band: cheap heat-haze shimmer.
 */
export function addHeatHaze(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHaze = hazeUniforms.uHaze;
    shader.uniforms.uHazeTime = hazeUniforms.uHazeTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uHaze;\nuniform float uHazeTime;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `vec2 hazeOff = vec2(0.0);
#ifdef USE_MAP
  float hazeM = uHaze * smoothstep(0.32, 0.45, vMapUv.y) * (1.0 - smoothstep(0.5, 0.66, vMapUv.y));
  hazeOff = vec2(sin(vMapUv.y * 260.0 + uHazeTime * 5.0) * 0.0016, sin(vMapUv.x * 120.0 + uHazeTime * 3.0) * 0.0009) * hazeM;
  vec4 sampledDiffuseColor = texture2D(map, vMapUv + hazeOff);
  diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture2D(emissiveMap, vEmissiveMapUv + hazeOff);
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'heat-haze';
}
