import { describe, expect, it } from 'vitest';
import { attackStyle, coverUv, ease, stagePosition } from '../../src/render/layout';
import { actionInfo, enemyTier } from '../../src/render/actionInfo';
import { spriteUrl, regionLayerUrl } from '../../src/render/assets';
import { HEROES } from '../../src/data';

describe('coverUv', () => {
  it('crops vertically when the plane is wider than the image', () => {
    const uv = coverUv(2, 1, 0);
    expect(uv.repeatX).toBe(1);
    expect(uv.repeatY).toBeCloseTo(0.5);
    expect(uv.offsetY).toBe(0);
    expect(coverUv(2, 1, 0.5).offsetY).toBeCloseTo(0.25);
  });
  it('crops horizontally (centred) when the plane is narrower', () => {
    const uv = coverUv(1, 2);
    expect(uv.repeatX).toBeCloseTo(0.5);
    expect(uv.offsetX).toBeCloseTo(0.25);
    expect(uv.repeatY).toBe(1);
  });
});

describe('stagePosition', () => {
  it('puts heroes left, enemies right, front row nearer the centre', () => {
    for (const side of ['hero', 'enemy'] as const) {
      const sign = side === 'hero' ? -1 : 1;
      const f0 = stagePosition(side, 'front', 0);
      const b0 = stagePosition(side, 'back', 0);
      expect(Math.sign(f0.x)).toBe(sign);
      expect(Math.abs(f0.x)).toBeLessThan(Math.abs(b0.x));
      expect(Math.abs(stagePosition(side, 'front', 1).x)).toBeLessThan(Math.abs(b0.x));
    }
  });
  it('gives every slot a distinct position', () => {
    const keys = new Set<string>();
    for (const row of ['front', 'back'] as const) for (const s of [0, 1]) {
      const p = stagePosition('enemy', row, s);
      keys.add(`${p.x},${p.z}`);
    }
    expect(keys.size).toBe(4);
  });
});

describe('attack styles', () => {
  it('maps kinds and damage types to visuals', () => {
    expect(attackStyle('melee', 'fire')).toBe('melee');
    expect(attackStyle('ranged', 'pierce')).toBe('arrow');
    expect(attackStyle('ranged', 'fire')).toBe('orb');
    expect(attackStyle('aoe', 'holy')).toBe('beam');
    expect(attackStyle('support', undefined)).toBe('none');
  });
  it('resolves every hero basic/skill/ultimate', () => {
    for (const h of HEROES) {
      for (const skill of ['basic', h.skill.id, h.ultimate.id]) {
        expect(actionInfo('hero', h.id, skill).kind).toBeDefined();
      }
    }
    expect(actionInfo('enemy', 'moss_wolf', 'bite').style).toBe('melee');
    expect(actionInfo('enemy', 'nope', 'x').style).toBe('none');
  });
  it('flags bosses as big', () => {
    expect(enemyTier('rootmother').big).toBe(true);
    expect(enemyTier('moss_wolf').big).toBe(false);
  });
  it('hump ease returns to zero', () => {
    expect(ease.hump(0)).toBeCloseTo(0);
    expect(ease.hump(1)).toBeCloseTo(0);
    expect(ease.hump(0.5)).toBeCloseTo(1);
  });
});

describe('assets registry (T-07)', () => {
  it('finds pixelized hero sprites and jpg region layers', () => {
    expect(spriteUrl('heroes/bram')).not.toBeNull();
    expect(regionLayerUrl('whisperpine', 'far')).not.toBeNull();
    expect(regionLayerUrl('whisperpine', 'nope')).toBeNull();
  });
});
