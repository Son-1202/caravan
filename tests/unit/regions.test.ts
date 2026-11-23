import { describe, expect, it } from 'vitest';
import { LAYER_Z, REGIONS, REGION_IDS, getRegion, isRegionId } from '../../src/render/regions';
import { getAssetUrl } from '../../src/render/assets';
import { mulberry32 } from '../../src/sim/rng';

describe('regions', () => {
  it('defines all four regions with hex colors', () => {
    expect(REGION_IDS).toEqual(['whisperpine', 'glass_dunes', 'frostspire', 'solenne']);
    for (const id of REGION_IDS) {
      const r = REGIONS[id];
      expect(r.id).toBe(id);
      for (const c of [r.sky.top, r.sky.horizon, r.layers.far, r.layers.mid, r.layers.fg, r.dusk.color]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
  it('falls back to whisperpine for unknown ids', () => {
    expect(getRegion('nope').id).toBe('whisperpine');
    expect(isRegionId('frostspire')).toBe(true);
    expect(isRegionId('nope')).toBe(false);
  });
  it('orders layers back to front', () => {
    expect(LAYER_Z.sky).toBeLessThan(LAYER_Z.far);
    expect(LAYER_Z.far).toBeLessThan(LAYER_Z.mid);
    expect(LAYER_Z.mid).toBeLessThan(LAYER_Z.actors);
    expect(LAYER_Z.actors).toBeLessThan(LAYER_Z.fg);
  });
});

describe('assets registry', () => {
  it('returns null for missing art', () => {
    expect(getAssetUrl('regions/whisperpine/does_not_exist.png')).toBeNull();
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});
