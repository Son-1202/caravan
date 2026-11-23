// Art registry. ART drops PNGs into /assets (repo root). Vite resolves them at
// build time; anything missing simply returns null and the renderer falls back
// to procedural placeholders.
//
// Conventions (paths relative to /assets):
//   regions/<regionId>/<layer>.png   layer = sky | far | mid | fg | ground
//   sprites/<name>.png               e.g. sprites/hero_knight.png

const files = import.meta.glob('/assets/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function normalize(path: string): string {
  const p = path.replace(/^\.?\/?(assets\/)?/, '');
  return `/assets/${p}`;
}

/** URL for an asset path like "regions/whisperpine/far.png", or null if absent. */
export function getAssetUrl(path: string): string | null {
  return files[normalize(path)] ?? null;
}

export function regionLayerUrl(regionId: string, layer: string): string | null {
  return getAssetUrl(`regions/${regionId}/${layer}.png`);
}

export function spriteUrl(name: string): string | null {
  return getAssetUrl(`sprites/${name}.png`);
}

export function listAssets(): string[] {
  return Object.keys(files).map((k) => k.replace(/^\/assets\//, ''));
}
