// Typed access to all content JSON. The sim imports from here, never the JSON directly.
//
// Typing note: TS widens string literals in imported JSON to `string`, so
// `json satisfies HeroDef[]` cannot type-check unions like DamageType. We therefore
// assert the types here and verify the content at runtime with `validateContent()`
// (src/data/validate.ts) — DEV should assert it returns [] in a unit test.
import type {
  BalanceConfig,
  ConsumableDef,
  CurseDef,
  EnemyDef,
  EventDef,
  HeroDef,
  HeroId,
  MapGenConfig,
  RegionDef,
  RegionId,
  RelicDef,
  StoryData,
} from './types';
import heroesJson from './heroes.json';
import enemiesJson from './enemies.json';
import relicsJson from './relics.json';
import consumablesJson from './consumables.json';
import cursesJson from './curses.json';
import eventsJson from './events.json';
import regionsJson from './regions.json';
import mapJson from './map.json';
import balanceJson from './balance.json';
import storyJson from './story.json';
import { validateContentBundle } from './validate';

export * from './types';

export const HEROES = heroesJson as unknown as readonly HeroDef[];
export const ENEMIES = enemiesJson as unknown as readonly EnemyDef[];
export const RELICS = relicsJson as unknown as readonly RelicDef[];
export const CONSUMABLES = consumablesJson as unknown as readonly ConsumableDef[];
export const CURSES = cursesJson as unknown as readonly CurseDef[];
export const EVENTS = eventsJson as unknown as readonly EventDef[];
export const REGIONS = regionsJson as unknown as readonly RegionDef[];
export const MAP_CONFIG = mapJson as unknown as MapGenConfig;
export const BALANCE = balanceJson as unknown as BalanceConfig;
export const STORY = storyJson as unknown as StoryData;

function byId<T extends { id: string }>(list: readonly T[]): Readonly<Record<string, T>> {
  const out: Record<string, T> = {};
  for (const item of list) out[item.id] = item;
  return out;
}

export const HERO_BY_ID = byId(HEROES) as Readonly<Record<HeroId, HeroDef>>;
export const ENEMY_BY_ID = byId(ENEMIES);
export const RELIC_BY_ID = byId(RELICS);
export const CONSUMABLE_BY_ID = byId(CONSUMABLES);
export const CURSE_BY_ID = byId(CURSES);
export const EVENT_BY_ID = byId(EVENTS);
export const REGION_BY_ID = byId(REGIONS) as Readonly<Record<RegionId, RegionDef>>;

/** Regions in play order. */
export const REGION_ORDER: readonly RegionId[] = [...REGIONS]
  .sort((a, b) => a.order - b.order)
  .map((r) => r.id);

/** Returns a list of content problems; empty array means all JSON is consistent. */
export function validateContent(): string[] {
  return validateContentBundle({
    heroes: HEROES,
    enemies: ENEMIES,
    relics: RELICS,
    consumables: CONSUMABLES,
    curses: CURSES,
    events: EVENTS,
    regions: REGIONS,
    map: MAP_CONFIG,
    balance: BALANCE,
    story: STORY,
  });
}
