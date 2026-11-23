// Sprite facing. Heroes are painted facing right (toward the enemies); every
// enemy must face left (toward the heroes). ART flips most sheets on import
// (docs/art/PROMPTS.md T-08: moss_wolf, glass_scarab, dune_jackal, frost_wight
// were mirrored there), but "facing LEFT" is ignored ~1 in 3 for new gens, so
// the renderer keeps an explicit per-sprite table of the *painted* facing.
// 'front' sprites (golems, colossus, wraiths) are left as painted.

export type Facing = 'left' | 'right' | 'front';

/**
 * Painted facing of each enemy sprite in assets/sprites/enemies (checked
 * by eye 2026-11-23, T-13). Anything painted 'right' is mirrored on stage.
 */
export const FACING_OVERRIDE: Record<string, Facing> = {
  // Whisperpine
  moss_wolf: 'left',
  thornling: 'front',
  wisp_lantern: 'front',
  barkhide_stag: 'left',
  rootmother: 'left',
  // Glass Dunes
  glass_scarab: 'left',
  dune_jackal: 'left',
  sand_wraith: 'front',
  prism_basilisk: 'left',
  sunshard_colossus: 'front',
  // Frostspire
  frost_wight: 'left',
  ice_harpy: 'left',
  rime_golem: 'front',
  aurora_drake: 'left',
  wintermaw: 'left',
  // Solenne
  hollow_king: 'left',
};

/** Should this unit's sprite be mirrored so it faces its foes? */
export function shouldFlip(side: 'hero' | 'enemy', defId: string): boolean {
  if (side === 'hero') return false; // hero sheet faces right
  return FACING_OVERRIDE[defId] === 'right';
}
