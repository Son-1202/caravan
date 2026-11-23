// Pure 2x2 formation helpers for the formation screen (T-09).
import type { HeroId } from '../data';
import { DEFAULT_FORMATION, type Formation } from '../sim';

export type SlotKey = 'front0' | 'front1' | 'back0' | 'back1';
export const SLOT_KEYS: readonly SlotKey[] = ['front0', 'front1', 'back0', 'back1'];

export function parseSlot(k: SlotKey): { row: 'front' | 'back'; slot: 0 | 1 } {
  return { row: k.startsWith('front') ? 'front' : 'back', slot: k.endsWith('1') ? 1 : 0 };
}

export function cloneFormation(f: Formation): Formation {
  return { front: [f.front[0], f.front[1]], back: [f.back[0], f.back[1]] };
}

export function getSlot(f: Formation, k: SlotKey): HeroId | null {
  const { row, slot } = parseSlot(k);
  return f[row][slot];
}

/** Swap the contents of two slots (either may be empty). Returns a new formation. */
export function swapSlots(f: Formation, a: SlotKey, b: SlotKey): Formation {
  const out = cloneFormation(f);
  const pa = parseSlot(a);
  const pb = parseSlot(b);
  const va = out[pa.row][pa.slot];
  out[pa.row][pa.slot] = out[pb.row][pb.slot];
  out[pb.row][pb.slot] = va;
  return out;
}

export function slotOf(f: Formation, hero: HeroId): SlotKey | null {
  return SLOT_KEYS.find((k) => getSlot(f, k) === hero) ?? null;
}

/** A formation is valid when every hero appears exactly once. */
export function isValidFormation(f: Formation, heroes: readonly HeroId[]): boolean {
  const placed = SLOT_KEYS.map((k) => getSlot(f, k)).filter((x): x is HeroId => x !== null);
  return placed.length === heroes.length && heroes.every((h) => placed.includes(h)) && new Set(placed).size === placed.length;
}

export function safeFormation(f: Formation | null | undefined, heroes: readonly HeroId[]): Formation {
  return f && isValidFormation(f, heroes) ? cloneFormation(f) : cloneFormation(DEFAULT_FORMATION);
}
