// Region look configs for the diorama renderer. Pure data + no Three imports,
// so it stays unit-testable. Colors are hex strings ("#rrggbb").
// The world darkens region by region; only the Ember stays warm.

export const REGION_IDS = ['whisperpine', 'glass_dunes', 'frostspire', 'solenne'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export type SilhouetteKind = 'pines' | 'dunes' | 'peaks' | 'ruins';
export type ParticleKind = 'fireflies' | 'sand' | 'snow' | 'ash';

export interface ColorGrade {
  hue: number; // radians
  saturation: number; // -1..1
  brightness: number; // -1..1
  contrast: number; // -1..1
}

export interface RegionConfig {
  id: RegionId;
  name: string;
  sky: { top: string; horizon: string; glow: string; aurora: boolean; stars: number };
  layers: { far: string; mid: string; fg: string; ground: string; accent: string };
  silhouette: SilhouetteKind;
  fog: { color: string; near: number; far: number };
  dusk: { color: string; intensity: number; ambient: string; ambientIntensity: number };
  particles: { kind: ParticleKind; color: string; count: number };
  grade: ColorGrade;
}

export const REGIONS: Record<RegionId, RegionConfig> = {
  whisperpine: {
    id: 'whisperpine',
    name: 'Whisperpine Woods',
    sky: { top: '#0c1626', horizon: '#3c5a58', glow: '#d27a45', aurora: false, stars: 0.35 },
    layers: { far: '#1e3a37', mid: '#16301f', fg: '#08140d', ground: '#2a3f26', accent: '#4d7a3a' },
    silhouette: 'pines',
    fog: { color: '#22383a', near: 22, far: 62 },
    dusk: { color: '#7d9cd6', intensity: 1.1, ambient: '#30405a', ambientIntensity: 0.55 },
    particles: { kind: 'fireflies', color: '#d6ff7a', count: 140 },
    grade: { hue: 0, saturation: 0.1, brightness: 0, contrast: 0.08 },
  },
  glass_dunes: {
    id: 'glass_dunes',
    name: 'Glass Dunes',
    sky: { top: '#161636', horizon: '#c9784a', glow: '#ffb15c', aurora: false, stars: 0.2 },
    layers: { far: '#8a5636', mid: '#a8703e', fg: '#3c2214', ground: '#b88450', accent: '#7fd6e6' },
    silhouette: 'dunes',
    fog: { color: '#7a4e3a', near: 24, far: 70 },
    dusk: { color: '#8f96d8', intensity: 1.0, ambient: '#5a4058', ambientIntensity: 0.55 },
    particles: { kind: 'sand', color: '#ffd59a', count: 220 },
    grade: { hue: 0.03, saturation: 0.05, brightness: 0, contrast: 0.06 },
  },
  frostspire: {
    id: 'frostspire',
    name: 'Frostspire Pass',
    sky: { top: '#060b24', horizon: '#4c5f92', glow: '#8fb2e8', aurora: true, stars: 0.8 },
    layers: { far: '#a9bcdd', mid: '#7084ad', fg: '#1b2440', ground: '#c6d3ea', accent: '#e8f2ff' },
    silhouette: 'peaks',
    fog: { color: '#3c4a74', near: 22, far: 64 },
    dusk: { color: '#9ab8ff', intensity: 0.9, ambient: '#2a3a66', ambientIntensity: 0.5 },
    particles: { kind: 'snow', color: '#ffffff', count: 260 },
    grade: { hue: -0.03, saturation: -0.05, brightness: -0.02, contrast: 0.1 },
  },
  solenne: {
    id: 'solenne',
    name: 'Gates of Solenne',
    sky: { top: '#070505', horizon: '#3e2218', glow: '#7a3a1c', aurora: false, stars: 0.05 },
    layers: { far: '#3a3026', mid: '#272019', fg: '#0d0a08', ground: '#2b231d', accent: '#7a6230' },
    silhouette: 'ruins',
    fog: { color: '#1e1612', near: 18, far: 55 },
    dusk: { color: '#6e6478', intensity: 0.6, ambient: '#231c22', ambientIntensity: 0.45 },
    particles: { kind: 'ash', color: '#b0a090', count: 200 },
    grade: { hue: 0, saturation: -0.25, brightness: -0.05, contrast: 0.15 },
  },
};

export function getRegion(id: string): RegionConfig {
  return (REGIONS as Record<string, RegionConfig>)[id] ?? REGIONS.whisperpine;
}

export function isRegionId(id: string): id is RegionId {
  return (REGION_IDS as readonly string[]).includes(id);
}

/** Diorama layer depths (world Z). Actors stand on Z = 0. */
export const LAYER_Z = { sky: -30, far: -15, mid: -6, actors: 0, fg: 4 } as const;
export type LayerName = 'far' | 'mid' | 'fg';
