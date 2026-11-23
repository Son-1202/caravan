// Battle ground for the diorama tabletop: a region-tinted procedural texture
// (tileable value noise + dirt / sand / snow / ash detail, pixel-crisp) and
// "dressing" planes: soft contact fog where the ground meets the mid layer,
// plus a dark tabletop vignette pooling light on the stage.
import * as THREE from 'three';
import { mulberry32, hashString, type Rng } from '../sim/rng';
import type { RegionConfig, RegionId } from './regions';

const S = 512;

/** Tileable 2D value noise (period = S) with `cells` lattice points per side. */
function tileNoise(rng: Rng, cells: number): (x: number, y: number) => number {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (i: number, j: number) => g[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)]!;
  return (x, y) => {
    const fx = (x / S) * cells;
    const fy = (y / S) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

interface Palette {
  base: string;
  /** colour pulled in by low noise (dirt / shadowed snow / dark ash) */
  low: string;
  /** colour pulled in by high noise (moss / bright sand / fresh snow / pale ash) */
  high: string;
}

const PALETTES: Record<RegionId, Palette> = {
  whisperpine: { base: '#34482a', low: '#45351f', high: '#4c6a32' },
  glass_dunes: { base: '#b07c48', low: '#8a5a36', high: '#d4a066' },
  frostspire: { base: '#b9c7e0', low: '#7f92ba', high: '#e6eefc' },
  solenne: { base: '#3a3029', low: '#241c17', high: '#5e5146' },
};

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draw at (x, y) and its wrapped copies so details tile seamlessly. */
function wrapped(x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) {
    const px = x + dx;
    const py = y + dy;
    if (px > -r && px < S + r && py > -r && py < S + r) draw(px, py);
  }
}

function paintBase(ctx: CanvasRenderingContext2D, rng: Rng, pal: Palette): void {
  const big = tileNoise(rng, 6);
  const mid = tileNoise(rng, 16);
  const fine = tileNoise(rng, 64);
  const [b, lo, hi] = [hex(pal.base), hex(pal.low), hex(pal.high)];
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = big(x, y) * 0.55 + mid(x, y) * 0.3 + fine(x, y) * 0.15;
      // quantize into 5 bands for a pixel-art read
      const q = Math.round((n - 0.5) * 2.4 * 2) / 2; // -1.5..1.5 in 0.5 steps
      const t = Math.max(-1, Math.min(1, q));
      const src = t < 0 ? lo : hi;
      const k = Math.abs(t) * 0.85;
      const o = (y * S + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = b[c]! + (src[c]! - b[c]!) * k;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx: CanvasRenderingContext2D, rng: Rng, n: number, colors: string[], w = 2, h = 2): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)]!;
    ctx.fillRect(Math.floor(rng() * S), Math.floor(rng() * S), w + Math.floor(rng() * w), h);
  }
}

function pebble(ctx: CanvasRenderingContext2D, rng: Rng, light: string, dark: string): void {
  const x = rng() * S;
  const y = rng() * S;
  const r = 2 + Math.floor(rng() * 4);
  wrapped(x, y, r + 2, (px, py) => {
    ctx.fillStyle = dark;
    ctx.fillRect(Math.floor(px - r), Math.floor(py - r / 2 + 1), r * 2, r);
    ctx.fillStyle = light;
    ctx.fillRect(Math.floor(px - r + 1), Math.floor(py - r / 2), r * 2 - 2, r - 1);
  });
}

const DETAIL: Record<RegionId, (ctx: CanvasRenderingContext2D, rng: Rng) => void> = {
  whisperpine(ctx, rng) {
    speckle(ctx, rng, 1400, ['rgba(20,14,8,0.35)', 'rgba(90,120,50,0.3)', 'rgba(120,80,40,0.25)']);
    // grass tufts
    for (let i = 0; i < 260; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const c = rng() > 0.5 ? '#557a34' : '#466a2c';
      wrapped(x, y, 6, (px, py) => {
        ctx.fillStyle = c;
        for (let k = -2; k <= 2; k++) ctx.fillRect(Math.floor(px + k * 2), Math.floor(py - 3 - Math.abs(k === 0 ? 2 : 0)), 1, 3 + (k === 0 ? 2 : 0));
      });
    }
    for (let i = 0; i < 70; i++) pebble(ctx, rng, '#5d5a4e', '#25221c');
  },
  glass_dunes(ctx, rng) {
    // wind ripples: wavy darker/lighter lines that tile (integer periods)
    for (let r = 0; r < 34; r++) {
      const y0 = (r / 34) * S;
      const ph = rng() * Math.PI * 2;
      for (let x = 0; x < S; x += 2) {
        const y = y0 + Math.sin((x / S) * Math.PI * 2 * 3 + ph) * 5;
        ctx.fillStyle = 'rgba(110,64,30,0.28)';
        ctx.fillRect(x, Math.floor(((y % S) + S) % S), 2, 1);
        ctx.fillStyle = 'rgba(255,225,170,0.22)';
        ctx.fillRect(x, Math.floor((((y - 1) % S) + S) % S), 2, 1);
      }
    }
    speckle(ctx, rng, 900, ['rgba(80,45,20,0.25)', 'rgba(255,230,180,0.25)'], 1, 1);
    // glass shards glinting
    speckle(ctx, rng, 90, ['#9fe6f0', '#d8fbff', '#5fb8c8'], 1, 1);
    for (let i = 0; i < 30; i++) pebble(ctx, rng, '#9a6a44', '#5a3a22');
  },
  frostspire(ctx, rng) {
    speckle(ctx, rng, 1000, ['rgba(255,255,255,0.45)', 'rgba(90,110,160,0.18)'], 1, 1);
    // ice patches
    for (let i = 0; i < 18; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const w = 14 + rng() * 30;
      wrapped(x, y, w, (px, py) => {
        ctx.fillStyle = 'rgba(170,205,240,0.45)';
        ctx.fillRect(Math.floor(px - w / 2), Math.floor(py - 3), Math.floor(w), 6);
        ctx.fillStyle = 'rgba(240,250,255,0.6)';
        ctx.fillRect(Math.floor(px - w / 3), Math.floor(py - 2), Math.floor(w / 3), 1);
      });
    }
    // rocks poking through
    for (let i = 0; i < 40; i++) pebble(ctx, rng, '#56607a', '#262c3e');
  },
  solenne(ctx, rng) {
    // cracked flagstones (staggered courses), grout lines tile at S
    const rowH = 32;
    for (let y = 0; y < S; y += rowH) {
      const off = ((y / rowH) % 2) * 24;
      let x = -off;
      while (x < S) {
        const w = 36 + Math.floor(rng() * 28);
        ctx.fillStyle = `rgba(${rng() > 0.5 ? '80,68,58' : '20,16,13'},${0.18 + rng() * 0.15})`;
        ctx.fillRect(x + 1, y + 1, w - 2, rowH - 2);
        ctx.fillStyle = 'rgba(8,6,5,0.55)';
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y, 1, rowH);
        if (rng() > 0.6) {
          // crack
          let cx = x + rng() * w;
          let cy = y + 2;
          for (let k = 0; k < 10; k++) {
            ctx.fillRect(Math.floor(cx), Math.floor(cy), 1, 2);
            cx += rng() * 4 - 2;
            cy += 2.5;
          }
        }
        x += w;
      }
    }
    speckle(ctx, rng, 1300, ['rgba(170,160,150,0.22)', 'rgba(0,0,0,0.3)'], 1, 1);
    speckle(ctx, rng, 40, ['#ff7a30', '#c84a1c'], 1, 1); // dying embers
  },
};

/** Region-tinted, tileable, pixel-crisp ground texture. */
export function makeRegionGroundTexture(cfg: RegionConfig): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const rng = mulberry32(hashString(`${cfg.id}:ground13`));
  paintBase(ctx, rng, PALETTES[cfg.id]);
  DETAIL[cfg.id](ctx, rng);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function gradientTexture(stops: Array<[number, number]>, radial: boolean): THREE.CanvasTexture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = radial ? n : 4;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = radial ? ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2) : ctx.createLinearGradient(0, n, 0, 0);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Contact fog where the ground meets the mid layer: a fog bank (one vertical
 * gradient plane) plus, inside the ground shader (no overdraw), fog lying on
 * the back of the stage and a dark tabletop vignette pooling light on the stage.
 */
export class GroundDressing {
  readonly group = new THREE.Group();
  private readonly wall: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly uniforms = {
    uGFogColor: { value: new THREE.Color() },
    uGFogK: { value: 0.6 },
    uGFogDepth: { value: 4.2 },
    uGZFar: { value: -3 },
    /** vignette centre z, half width, half depth, strength */
    uGPool: { value: new THREE.Vector4(5, 12, 9, 0.5) },
  };

  constructor() {
    // fog bank rising from the far edge: opaque at the ground, fading upward
    this.wall = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: gradientTexture([[0, 1], [0.35, 0.55], [1, 0]], false), transparent: true, depthWrite: false, fog: false, opacity: 0.8 }),
    );
    // after the painted far/mid layers (transparent, renderOrder 0), before the fg (10)
    this.wall.renderOrder = 1;
    this.group.add(this.wall);
  }

  /** Patch the ground material: lying fog at the far edge + tabletop vignette. */
  patch(m: THREE.MeshStandardMaterial): void {
    const u = this.uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vGWorld;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'varying vec3 vGWorld;\nuniform vec3 uGFogColor; uniform float uGFogK; uniform float uGFogDepth; uniform float uGZFar; uniform vec4 uGPool;\nvoid main() {',
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
  float gFog = 1.0 - smoothstep(uGZFar, uGZFar + uGFogDepth, vGWorld.z);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uGFogColor, gFog * gFog * uGFogK);
  vec2 gq = vec2(vGWorld.x / uGPool.y, (vGWorld.z - uGPool.x) / uGPool.z);
  gl_FragColor.rgb *= 1.0 - smoothstep(0.5, 1.0, length(gq)) * uGPool.w;`,
        );
    };
    m.customProgramCacheKey = () => 'ground-dressing';
  }

  /** Fit to the ground strip: width (x), far edge z, near edge z. */
  layout(width: number, zFar: number, zNear: number): void {
    this.wall.scale.set(width, 2.6, 1);
    this.wall.position.set(0, 1.3 - 0.05, zFar + 0.05);
    const depth = zNear - zFar;
    const p = this.uniforms.uGPool.value;
    p.x = zFar + depth * 0.42;
    p.y = width * 0.47;
    p.z = depth * 0.55;
    this.uniforms.uGZFar.value = zFar;
  }

  apply(cfg: RegionConfig): void {
    const fog = new THREE.Color(cfg.fog.color).lerp(new THREE.Color(cfg.sky.horizon), 0.35);
    this.wall.material.color.copy(fog);
    this.uniforms.uGFogColor.value.copy(fog);
    // snow reads as a brighter fog; keep the vignette lighter so the white stage doesn't go grey
    this.uniforms.uGPool.value.w = cfg.id === 'frostspire' ? 0.4 : cfg.id === 'solenne' ? 0.35 : 0.5;
  }

  dispose(): void {
    this.wall.geometry.dispose();
    this.wall.material.map?.dispose();
    this.wall.material.dispose();
  }
}

/** Self-light for the ground texture per region (keeps the texture readable at dusk). */
export const GROUND_SELF_LIGHT: Record<RegionId, number> = { whisperpine: 0.3, glass_dunes: 0.12, frostspire: 0.18, solenne: 0.4 };
