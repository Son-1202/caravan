// Art registry. ART drops images into /assets (repo root). Vite resolves them at
// build time; anything missing simply returns null and the renderer falls back
// to procedural placeholders.
//
// Conventions (paths relative to /assets):
//   regions/<regionId>/<layer>.{jpg,png,webp}   layer = sky | far | mid | fg | ground
//   sprites/<group>/<id>.png                     pixelized output of scripts/pixelize.ts
// assets/raw/** (pipeline inputs) and key-art candidates are never bundled.

const files = import.meta.glob(['/assets/**/*.{png,jpg,jpeg,webp}', '!/assets/raw/**', '!/assets/key_art/**', '!/assets/style_bible.*'], {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const EXTS = ['png', 'jpg', 'jpeg', 'webp'] as const;

function normalize(path: string): string {
  const p = path.replace(/^\.?\/?(assets\/)?/, '');
  return `/assets/${p}`;
}

/** URL for an asset path like "regions/whisperpine/far.jpg", or null if absent. */
export function getAssetUrl(path: string): string | null {
  return files[normalize(path)] ?? null;
}

/** First existing extension for an extension-less path ("regions/x/far"). */
export function findAsset(pathNoExt: string): string | null {
  for (const ext of EXTS) {
    const url = getAssetUrl(`${pathNoExt}.${ext}`);
    if (url) return url;
  }
  return null;
}

export function regionLayerUrl(regionId: string, layer: string): string | null {
  return findAsset(`regions/${regionId}/${layer}`);
}

/** Sprite by name, e.g. "heroes/bram" or "enemies/moss_wolf". */
export function spriteUrl(name: string): string | null {
  return findAsset(`sprites/${name}`);
}

export function listAssets(): string[] {
  return Object.keys(files).map((k) => k.replace(/^\/assets\//, ''));
}
