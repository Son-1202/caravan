// Sprite pixelize pipeline (batch).
//   npm run pixelize                 -> every group
//   npm run pixelize -- heroes       -> only listed groups
// assets/raw/{heroes,enemies,npc}/<id>_sprite.png -> assets/sprites/<group>/<id>.png
// Steps: alpha-trim -> smoothing downscale to target height -> hard alpha
// threshold + magenta-fringe cleanup -> ~32-colour palette -> 1-px dark outline.
// Deterministic (same input -> same bytes), so re-running is idempotent.
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'assets/raw');
const OUT = path.join(ROOT, 'assets/sprites');
const GROUPS = ['heroes', 'enemies', 'npc'] as const;
type Group = (typeof GROUPS)[number];

/** Target heights (px, outline included). Bosses ~2x normal. */
export const TIER_HEIGHT: Record<string, number> = { normal: 96, elite: 120, boss: 192, final: 192 };
const DEFAULT_HEIGHT = 96;
const OUTLINE = { r: 0x1a, g: 0x10, b: 0x20 };
const ALPHA_CUT = 128;
const COLORS = 32;

function enemyTiers(): Record<string, string> {
  const file = path.join(ROOT, 'src/data/enemies.json');
  if (!existsSync(file)) return {};
  const list = JSON.parse(readFileSync(file, 'utf8')) as Array<{ id: string; tier: string }>;
  return Object.fromEntries(list.map((e) => [e.id, e.tier]));
}

function targetHeight(group: Group, id: string, tiers: Record<string, string>): number {
  if (group !== 'enemies') return DEFAULT_HEIGHT;
  return TIER_HEIGHT[tiers[id] ?? 'normal'] ?? DEFAULT_HEIGHT;
}

interface Img {
  data: Buffer;
  w: number;
  h: number;
}

async function loadRgba(file: string): Promise<Img> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** True for a pixel with a strong magenta cast (chroma-key fringe). */
function isMagenta(r: number, g: number, b: number): boolean {
  return r - g > 60 && b - g > 60 && Math.abs(r - b) < 90;
}

/** Bounding box of pixels with alpha above the cut. */
function opaqueBox(img: Img, cut: number): { x: number; y: number; w: number; h: number } {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if ((img.data[(y * img.w + x) * 4 + 3] ?? 0) > cut) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: img.w, h: img.h };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Pre-clean the raw image: magenta-tinted pixels become transparent. */
function stripMagenta(img: Img): void {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] ?? 0) > 0 && isMagenta(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0)) d[i + 3] = 0;
  }
}

/** Hard alpha + desaturate any remaining magenta cast; then a 1-px outline (canvas grows by 2). */
function hardenAndOutline(img: Img): Img {
  const { w, h } = img;
  const W = w + 2;
  const H = h + 2;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = img.data[i + 3] ?? 0;
      if (a < ALPHA_CUT) continue;
      let r = img.data[i] ?? 0;
      let g = img.data[i + 1] ?? 0;
      let b = img.data[i + 2] ?? 0;
      if (isMagenta(r, g, b)) {
        const l = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
        r = g = b = l;
      }
      const o = ((y + 1) * W + (x + 1)) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && out[(y * W + x) * 4 + 3] === 255 && !edge.has(y * W + x);
  const edge = new Set<number>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (out[(y * W + x) * 4 + 3] === 255) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.add(y * W + x);
    }
  }
  for (const p of edge) {
    out[p * 4] = OUTLINE.r;
    out[p * 4 + 1] = OUTLINE.g;
    out[p * 4 + 2] = OUTLINE.b;
    out[p * 4 + 3] = 255;
  }
  return { data: out, w: W, h: H };
}

async function processSprite(src: string, dst: string, height: number): Promise<string> {
  const raw = await loadRgba(src);
  stripMagenta(raw);
  const box = opaqueBox(raw, 8);
  const inner = height - 2; // outline adds a pixel top and bottom
  const scale = inner / box.h;
  const tw = Math.max(1, Math.round(box.w * scale));
  const cropped = await sharp(raw.data, { raw: { width: raw.w, height: raw.h, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize(tw, inner, { kernel: 'mitchell', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const small = hardenAndOutline({ data: cropped.data, w: cropped.info.width, h: cropped.info.height });
  mkdirSync(path.dirname(dst), { recursive: true });
  await sharp(small.data, { raw: { width: small.w, height: small.h, channels: 4 } })
    .png({ palette: true, colors: COLORS, dither: 0, effort: 10, compressionLevel: 9 })
    .toFile(dst);
  return `${small.w}x${small.h}`;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((a) => (GROUPS as readonly string[]).includes(a)) as Group[];
  const groups = only.length ? only : [...GROUPS];
  const tiers = enemyTiers();
  let n = 0;
  for (const group of groups) {
    const dir = path.join(RAW, group);
    if (!existsSync(dir)) {
      console.log(`skip ${group} (no assets/raw/${group})`);
      continue;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('_sprite.png')).sort();
    for (const f of files) {
      const id = f.replace(/_sprite\.png$/, '');
      const dst = path.join(OUT, group, `${id}.png`);
      const size = await processSprite(path.join(dir, f), dst, targetHeight(group, id, tiers));
      console.log(`${group}/${id}: ${size} -> ${path.relative(ROOT, dst)}`);
      n++;
    }
  }
  console.log(`pixelized ${n} sprite(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
