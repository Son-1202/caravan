// Procedural placeholder textures (canvas) used until ART delivers PNGs.
// All horizontal layers tile seamlessly (wrap-around drawing) so parallax
// scrolling with RepeatWrapping shows no seams.
import * as THREE from 'three';
import { mulberry32, hashString, type Rng } from '../sim/rng';
import type { LayerName, RegionConfig, SilhouetteKind } from './regions';

const W = 1024;
const H = 512;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Draw fn at x, x-W, x+W so shapes crossing the edge wrap. */
function wrap(x: number, draw: (x: number) => void): void {
  draw(x);
  draw(x - W);
  draw(x + W);
}

/** Periodic ridge height (0..1) built from integer-frequency sines. */
function ridge(rng: Rng, octaves: number): (u: number) => number {
  const terms = Array.from({ length: octaves }, (_, i) => ({
    f: i + 1 + Math.floor(rng() * (i + 2)),
    p: rng() * Math.PI * 2,
    a: 1 / (i + 1),
  }));
  const sum = terms.reduce((s, t) => s + t.a, 0);
  return (u) => 0.5 + terms.reduce((s, t) => s + t.a * Math.sin(u * Math.PI * 2 * t.f + t.p), 0) / (2 * sum);
}

function pine(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, w: number): void {
  ctx.fillRect(x - w * 0.06, base - h * 0.2, w * 0.12, h * 0.2);
  for (let i = 0; i < 4; i++) {
    const y0 = base - h * (0.15 + i * 0.2);
    const ww = w * (1 - i * 0.2);
    ctx.beginPath();
    ctx.moveTo(x - ww / 2, y0);
    ctx.lineTo(x + ww / 2, y0);
    ctx.lineTo(x, y0 - h * 0.38);
    ctx.closePath();
    ctx.fill();
  }
}

function spire(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(x - w * 0.2, base - h * 0.8);
  ctx.lineTo(x, base - h);
  ctx.lineTo(x + w * 0.25, base - h * 0.7);
  ctx.lineTo(x + w / 2, base);
  ctx.closePath();
  ctx.fill();
}

function ruin(ctx: CanvasRenderingContext2D, rng: Rng, x: number, base: number, h: number, w: number): void {
  ctx.fillRect(x - w / 2, base - h, w, h);
  // broken top
  ctx.clearRect(x - w / 2 + w * rng() * 0.5, base - h - 1, w * 0.4, h * 0.15 * rng());
  if (rng() > 0.5) {
    // arch window
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, base - h * 0.55, w * 0.22, Math.PI, 0);
    ctx.rect(x - w * 0.22, base - h * 0.55, w * 0.44, h * 0.3);
    ctx.fill();
    ctx.restore();
  }
}

/** Fill the band below a periodic ridge line. top/amp are fractions of H. */
function ridgeFill(ctx: CanvasRenderingContext2D, f: (u: number) => number, top: number, amp: number): void {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, H * (top + amp * (1 - f(x / W))));
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// Fraction of the layer height (from the bottom) the silhouettes reach.
const LAYER_HEIGHT: Record<LayerName, number> = { far: 0.8, mid: 0.7, fg: 0.34 };

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  kind: SilhouetteKind,
  layer: LayerName,
  cfg: RegionConfig,
  rng: Rng,
): void {
  const reach = LAYER_HEIGHT[layer];
  const top = 1 - reach;
  const count = layer === 'far' ? 26 : layer === 'mid' ? 14 : 9;
  switch (kind) {
    case 'pines': {
      ridgeFill(ctx, ridge(rng, 3), top + reach * 0.45, reach * 0.15);
      for (let i = 0; i < count; i++) {
        const h = H * reach * (0.55 + rng() * 0.45);
        wrap(rng() * W, (x) => pine(ctx, x, H, h, h * 0.42));
      }
      break;
    }
    case 'dunes': {
      ridgeFill(ctx, ridge(rng, 2), top + reach * 0.35, reach * 0.4);
      if (layer === 'far') {
        ctx.fillStyle = cfg.layers.accent;
        for (let i = 0; i < 7; i++) {
          const h = H * reach * (0.5 + rng() * 0.5);
          wrap(rng() * W, (x) => spire(ctx, x, H * (top + reach * 0.6), h, 26 + rng() * 22));
        }
      }
      break;
    }
    case 'peaks': {
      const f = ridge(rng, 4);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        const v = Math.pow(f(x / W), 1.3);
        ctx.lineTo(x, H * (top + reach * (1 - v) * 0.7));
      }
      ctx.lineTo(W, H);
      ctx.fill();
      if (layer === 'fg') {
        for (let i = 0; i < count; i++) {
          const h = H * reach * (0.6 + rng() * 0.4);
          wrap(rng() * W, (x) => pine(ctx, x, H, h, h * 0.4));
        }
      }
      break;
    }
    case 'ruins': {
      ridgeFill(ctx, ridge(rng, 3), top + reach * 0.7, reach * 0.12);
      for (let i = 0; i < count; i++) {
        const h = H * reach * (0.35 + rng() * 0.65);
        const w = 30 + rng() * 70;
        wrap(rng() * W, (x) => ruin(ctx, rng, x, H, h, w));
      }
      if (layer === 'far') {
        // the giant dim brazier
        ctx.fillStyle = cfg.layers.accent;
        wrap(W * 0.62, (x) => {
          ctx.fillRect(x - 18, H * (top + 0.05), 36, H * reach);
          ctx.beginPath();
          ctx.ellipse(x, H * (top + 0.05), 90, 26, 0, 0, Math.PI);
          ctx.fill();
        });
      }
      break;
    }
  }
}

export function makeLayerTexture(cfg: RegionConfig, layer: LayerName): THREE.CanvasTexture {
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(hashString(`${cfg.id}:${layer}`));
  ctx.fillStyle = cfg.layers[layer];
  drawSilhouette(ctx, cfg.silhouette, layer, cfg, rng);
  // soft top highlight (rim light from the dusk sky) for a painterly read
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return toTexture(c);
}

export function makeGroundTexture(cfg: RegionConfig): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = mulberry32(hashString(`${cfg.id}:ground`));
  ctx.fillStyle = cfg.layers.ground;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = rng();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.floor(rng() * S), Math.floor(rng() * S), 2 + Math.floor(rng() * 4), 2);
  }
  const t = toTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Soft round dot for particles. */
export function makeDotTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(32, 32);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return toTexture(c, false);
}

/** Radial blob shadow. */
export function makeShadowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.65)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** Tiny pixel-figure placeholder: colored body, darker outline, head. */
export function makeFigureTexture(color: string, kind: 'hero' | 'enemy' | 'prop'): THREE.CanvasTexture {
  const w = kind === 'prop' ? 32 : 16;
  const h = kind === 'prop' ? 20 : 24;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#05040a';
  if (kind === 'prop') {
    ctx.fillRect(1, 4, w - 2, h - 9);
    ctx.fillStyle = color;
    ctx.fillRect(2, 5, w - 4, h - 11);
    ctx.fillStyle = '#05040a';
    for (const x of [6, w - 8]) ctx.fillRect(x - 3, h - 7, 7, 7);
    ctx.fillStyle = '#6a5038';
    for (const x of [6, w - 8]) ctx.fillRect(x - 2, h - 6, 5, 5);
  } else {
    const hx = kind === 'hero' ? 5 : 4;
    ctx.fillRect(hx - 1, 1, 8, 8);
    ctx.fillRect(2, 8, 12, 13);
    ctx.fillRect(3, 20, 4, 4);
    ctx.fillRect(9, 20, 4, 4);
    ctx.fillStyle = '#e8c8a8';
    ctx.fillRect(hx, 2, 6, 6);
    ctx.fillStyle = color;
    ctx.fillRect(3, 9, 10, 11);
    ctx.fillRect(4, 20, 2, 3);
    ctx.fillRect(10, 20, 2, 3);
    ctx.fillStyle = kind === 'enemy' ? '#ff3b2f' : '#1a1020';
    ctx.fillRect(kind === 'hero' ? hx + 4 : hx + 1, 4, 1, 1);
  }
  const t = toTexture(c, false);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
