// Pure layout math for the render layer (no Three imports; unit-tested).

export interface UvWindow {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * "background-size: cover" for a texture on a plane: the UV window that fills a
 * plane of aspect `planeAspect` with an image of aspect `imgAspect` without
 * stretching. `anchorY` 0 keeps the image bottom (horizon/ground), 0.5 centers.
 */
export function coverUv(planeAspect: number, imgAspect: number, anchorY = 0.5): UvWindow {
  if (planeAspect >= imgAspect) {
    // plane is wider: show full width, crop top/bottom
    const ry = imgAspect / planeAspect;
    return { repeatX: 1, repeatY: ry, offsetX: 0, offsetY: (1 - ry) * anchorY };
  }
  const rx = planeAspect / imgAspect;
  return { repeatX: rx, repeatY: 1, offsetX: (1 - rx) / 2, offsetY: 0 };
}

export type Side = 'hero' | 'enemy';
export type RowName = 'front' | 'back';

export interface StagePos {
  x: number;
  z: number;
}

/**
 * Stage slots (world units). The camera is low, so depth barely separates units
 * on screen: the 2x2 formation is spread mainly along X. Heroes stand left
 * (x<0), enemies right; the front row is nearer the centre of the stage.
 */
export const STAGE = {
  /** x of [front slot0, front slot1, back slot0, back slot1] (mirrored for enemies) */
  slotX: [2.0, 3.15, 4.35, 5.5] as const,
  /** enemies are wider (beasts), so their slots spread further */
  enemySlotX: [2.2, 3.8, 5.1, 6.4] as const,
  /** slot 0 nearer the camera, slot 1 further back */
  slotZ: [0.7, -0.5] as const,
  bossX: 3.6,
  wagon: { x: -7.1, z: -1.8 },
} as const;

/** 2x2 formation position. Front row is closer to the centre of the stage. */
export function stagePosition(side: Side, row: RowName, slot: number, big = false): StagePos {
  const dir = side === 'hero' ? -1 : 1;
  const s = Math.max(0, Math.min(1, slot));
  if (big) return { x: dir * (row === 'front' ? STAGE.bossX : STAGE.bossX + 2.2), z: row === 'front' ? 0 : -1.2 };
  const i = (row === 'front' ? 0 : 2) + s;
  const xs = side === 'hero' ? STAGE.slotX : STAGE.enemySlotX;
  return { x: dir * (xs[i] ?? 0), z: STAGE.slotZ[s] ?? 0 };
}

/** Row/slot of a hero in a 2x2 formation (null if absent). */
export function heroSlot(
  f: { front: readonly (string | null)[]; back: readonly (string | null)[] },
  id: string,
): { row: RowName; slot: number } | null {
  for (const row of ['front', 'back'] as const) {
    const slot = f[row].indexOf(id);
    if (slot >= 0) return { row, slot };
  }
  return null;
}

export type AttackStyle = 'melee' | 'arrow' | 'orb' | 'beam' | 'none';

/** Map an action (kind + damage type) to its visual delivery. */
export function attackStyle(kind: string | undefined, damageType: string | undefined): AttackStyle {
  if (kind === 'support' || !kind) return 'none';
  if (kind === 'melee') return 'melee';
  if (damageType === 'fire') return 'orb';
  if (damageType === 'holy') return 'beam';
  if (kind === 'aoe' && damageType === 'slash') return 'melee';
  return 'arrow';
}

/** Smooth 0..1 ease curves for tweens. */
export const ease = {
  outCubic: (t: number): number => 1 - (1 - t) ** 3,
  inOutSine: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
  /** 0 -> 1 -> 0 hump (lunge out and back) */
  hump: (t: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, t))),
};
