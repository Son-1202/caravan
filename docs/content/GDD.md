# Caravan of Embers — Game Design Document (v0.2, T-02; numbers retuned in T-10)

Source of truth for numbers is `src/data/*.json`; types in `src/data/types.ts`. This doc explains intent.

## 1. Pitch
An HD-2D auto-battler roguelite. A wagon carries the last true flame, the **Ember**, across four darkening regions to relight the brazier of Solenne. You choose the path and build the party with relics; the heroes fight on their own in real-time ATB. One run is about 20–30 minutes.

## 2. Run structure
- 4 regions in order: `whisperpine` → `glass_dunes` → `frostspire` → `solenne`. Each one is darker than the last (`regions.json darkness` 0 → 0.8). Only the Ember stays warm.
- Each region has **3 steps** of choice (2–3 nodes per step), then a **boss** node. A run has 16 nodes; about 13 of them are encounters (fight, elite, event or boss) and the rest are camps and merchants.
- Node types:
  - **fight**: a random group from the region's `fights`. Reward: 35–45 shards, plus a 25% chance of a relic.
  - **elite**: harder. Reward: 50–65 shards and a guaranteed relic.
  - **camp**: choose one. Heal the party for 40% of max HP, or give one hero +1 skill rank (max 3).
  - **merchant**: 3 relics (common 50, rare 80) and 3 consumables. Reroll costs 25.
  - **event**: a text choice that trades risk for reward. There are 6 unique events and they never repeat in a run.
  - **boss**: reward is 80–100 shards and a pick of 1 relic from 3. The heroes level up after every region boss.
- Map generation (`map.json`): weights per step, region 1 step 1 is fixed to [fight, event], and a step never shows the same type twice. Each region has at most 1 elite, 1 camp, 1 merchant and 2 events. Every step offers at least one combat node.
- The currency is **Ember Shards** (start with 50).

## 3. Combat
- **Formation 2×2**: front and back row. Enemy **melee** hits go to the front row 70% of the time. **Ranged** attacks can hit any hero, and **AoE** attacks hit every hero. If a row is empty, its share passes to the other row. Enemies use the same 2×2 layout (`front`/`back` in each encounter).
- **ATB**: each unit gains `SPD × 1` gauge per second at 1× speed and acts when the gauge reaches 100. A unit with SPD 25 acts every 4 s. Battles can run at 1×, 2× or 4×. Start gauges are jittered by up to 50%.
- **Damage**: `atk × power × 100/(100+def)`, ±10% variance, and ×1.5 on a crit. Damage types are **slash, pierce, fire, holy**. Each hero has one main type, so the party covers all four: Kit slash, Lysa pierce, Oren fire, Bram holy.
- **Shields & Break**: every enemy has shield points and 1–2 visible weaknesses. A hit on a weakness removes 1 shield (more with `shieldDmg`). At 0 shield the enemy is **Broken**: it skips its next action and takes +50% damage for 2 of its actions. After that the shield refills.
- **Ember meter** (0–100): +0.5 per hero hit, +0.5 extra on a weakness hit, **+40 per Break**, +5 per kill and +0.5 each time a hero takes damage. The meter fills mostly from Breaks, so an Ignite usually lands while an enemy is Broken. When it is full you can **Ignite**, and all living heroes cast their ultimate in order. The meter does not carry between fights. Banked Coals adds a starting value.
- **Statuses**: burn (% max HP per action), bleed (× ATK per action), chill (−SPD), weaken (−ATK), guard (−damage taken), taunt, regen, haste.
- **Target durations (1×)**: normal fight 15–35 s, elite 30–45 s, boss 45–90 s. After T-10 tuning the sim averages ~21 s per normal fight and ~78 s per boss (see `BALANCE_NOTES.md`).
- **Growth**: after each region the heroes gain HP ×1.15, ATK ×1.12, DEF +2 and SPD +1. An enemy met outside its home region is scaled by HP ×1.3, ATK ×1.2, DEF ×1.1 and SPD ×1.05 per region later.
- **Hard mode**: enemy HP ×1.3, ATK ×1.2, SPD ×1.1 and +1 shield. Shards ×0.8, Ember gain ×0.85, camp heal 30%.

## 4. Heroes (auto AI)
| id | Name | Row | HP/ATK/DEF/SPD/Crit | Basic | Skill (ranks 1–3) | Ultimate |
|---|---|---|---|---|---|---|
| `bram` | Bram the Warden (tank) | front | 300/14/18/22/5% | Oathbash, melee holy | **Stand Fast**: guards the lowest-HP ally (30/40/50%) and taunts all enemies onto Bram | **Oathwall**: holy AoE ×2.0, and the whole party gains 40% guard |
| `lysa` | Lysa the Ranger (archer) | back | 150/20/5/28/10% | Longshot, ranged pierce | **Pinning Volley**: 2–3 arrows; rank 3 strips +1 shield | **Starfall Quiver**: pierce AoE ×2.8, −1 shield to all enemies |
| `oren` | Oren the Ember Priest (healer) | back | 210/16/12/24/5% | Cinder, ranged fire | **Hearthlight**: heals ATK ×2.4/3.0/3.4; rank 3 adds regen | **Kindled Choir**: heals the whole party (ATK ×4), fire AoE ×1.4 and burn |
| `kit` | Kit the Duelist (rogue) | front | 140/22/4/32/25% | Quick Cut, melee slash | **Ember Fang**: 3–4 cuts with bleed | **Red Comet**: one slash at ×6 that always crits |

AI (`heroes.json ai`, first rule that matches is used):
- **Bram**: uses Stand Fast on the lowest-HP ally when that ally is below 50% and nobody is taunting. Otherwise he hits the highest-ATK enemy.
- **Lysa**: shoots an enemy weak to pierce. If there is none, she shoots the lowest-HP enemy. She uses her skill whenever it is ready.
- **Oren**: heals when any ally is below 50%. Otherwise he throws fire at an enemy weak to fire, or the lowest-HP enemy if none is.
- **Kit**: attacks a Broken enemy. If none is Broken, he attacks the highest-ATK ("highest-damage") enemy.

**Mira** is the driver and narrator NPC. She does not fight.

## 5. Enemies
Stats are written for each enemy's home region. Bosses are drawn at 2× size.
| id | Name | Region | Tier | HP | Shield | Weak | Note |
|---|---|---|---|---|---|---|---|
| `moss_wolf` | Moss Wolf | whisperpine | normal | 380 | 2 | fire, pierce | fast biter, bleed |
| `thornling` | Thornling | whisperpine | normal | 450 | 3 | fire, slash | sturdy, spits thorns at the back row |
| `wisp_lantern` | Wisp Lantern | whisperpine | normal | 290 | 2 | holy, slash | fragile fire AoE |
| `barkhide_stag` | Barkhide Stag | whisperpine | elite | 610 | 5 | slash, holy | regrows its shield, tramples |
| `rootmother` | The Rootmother | whisperpine | boss | 1820 | 8 | fire → fire, slash | snares; Bloom phase at 50% |
| `glass_scarab` | Glass Scarab | glass_dunes | normal | 480 | 4 | pierce | high DEF, refracts shield back |
| `dune_jackal` | Dune Jackal | glass_dunes | normal | 480 | 2 | slash, fire | very fast, slows |
| `sand_wraith` | Sand Wraith | glass_dunes | normal | 420 | 3 | holy, pierce | ranged fire, glass AoE |
| `prism_basilisk` | Prism Basilisk | glass_dunes | elite | 830 | 6 | slash, holy | light AoE, weakening fangs |
| `sunshard_colossus` | Sunshard Colossus | glass_dunes | boss | 3290 | 10 | slash, pierce → holy | Molten Core phase at 50% |
| `frost_wight` | Frost Wight | frostspire | normal | 700 | 3 | fire, holy | chilling touch |
| `ice_harpy` | Ice Harpy | frostspire | normal | 580 | 2 | pierce, slash | dives on the back row |
| `rime_golem` | Rime Golem | frostspire | normal | 900 | 5 | fire | slow, refreezes its shield |
| `aurora_drake` | Aurora Drake | frostspire | elite | 1120 | 6 | pierce, holy | frost breath AoE |
| `wintermaw` | Wintermaw | frostspire | boss | 3800 | 10 | fire, holy → fire | Whiteout phase at 50% |
| `hollow_king` | The Hollow King | solenne | final | 6580 | 12 | see phases | 3 phases |

**The Hollow King**:
- Phase 1: weak to holy and fire.
- Phase 2, Hollow Armor (≤66% HP): weak to slash and pierce, +4 shield, SPD ×1.15, mends his armor.
- Phase 3, The Empty Crown (≤33% HP): weak to fire only, +6 shield, SPD ×1.3, ATK ×1.1.

Solenne fights and elites mix enemies from regions 1–3, scaled up by the cross-region factors.

## 6. Relics (16, passive, stack)
| id | Name | Effect | Synergy tags |
|---|---|---|---|
| `cinder_brand` | Cinder Brand | Break also burns (10%/action, 3 actions) | break, burn, fire |
| `wardens_mantle` | Warden's Mantle | Front row +60% DEF | front_row, defense |
| `phoenix_ash` | Phoenix Ash | Ignite heals 40% | ignite, heal |
| `bellows_charm` | Bellows Charm | Ember gain +60% | ember, ignite |
| `seers_lens` | Seer's Lens | Weakness hits +60% damage | weakness |
| `executioners_coin` | Executioner's Coin | +60% damage to Broken enemies | break, kit |
| `sunsteel_whetstone` | Sunsteel Whetstone | Slash +50% | slash, kit |
| `kindling_bundle` | Kindling Bundle | Fire +60% | fire, oren |
| `shatterpoint_heads` | Shatterpoint Arrowheads | Pierce weakness hits strip +1 shield | pierce, shield, lysa |
| `ashen_hourglass` | Ashen Hourglass | Broken lasts +1 action | break |
| `banked_coals` | Banked Coals | Start each battle with 50 Ember | ember, ignite |
| `crimson_ribbon` | Crimson Ribbon | +20% crit chance, +60% crit damage | crit, kit |
| `hearth_psalter` | Hearth Psalter | Healing +60% | heal, oren |
| `gilded_purse` | Gilded Purse | Shards +50% | economy |
| `last_light` | Last Light | Heroes below 30% HP deal +75% damage | low_hp |
| `tinderbox` | Tinderbox | Each Break adds +20 Ember | break, ember |

Relic effects use 14 kinds: `stat_mult, on_break, on_ignite_heal, ember_gain_mult, weakness_dmg_mult, broken_dmg_mult, damage_type_mult, shield_dmg_bonus, break_duration_bonus, start_battle_ember, crit_bonus, heal_mult, shard_mult, low_hp_atk`.

## 7. Consumables (merchant)
| id | Name | Price | Effect |
|---|---|---|---|
| `hearth_broth` | Hearth Broth | 60 | Party heals 30% |
| `phoenix_feather` | Phoenix Feather | 110 | Revives one hero at 40% |
| `bottled_spark` | Bottled Spark | 50 | +50 Ember (battle only) |
| `shatter_salt` | Shatter Salt | 45 | −2 shield on all enemies (battle only) |

## 8. Events (6) and curses
| id | Title | Regions | Gist |
|---|---|---|---|
| `moss_shrine` | The Moss Shrine | whisperpine, glass_dunes | Light the candle (relic or Dim), take the offering (shards, maybe Frail), or leave |
| `buried_wagon` | The Buried Wagon | glass_dunes, frostspire | Dig (shards or an ambush), search (shards + consumable), or pray (+10% HP) |
| `mirage_market` | The Mirage Market | glass_dunes | Pay 20% HP for a relic, or 60 shards for a 70% chance at a relic |
| `frozen_pilgrim` | The Frozen Pilgrim | frostspire, solenne | Give up HP for a skill rank, or take the lantern (relic or an elite fight) |
| `ember_whispers` | The Ember Whispers | any | Listen (skill rank or Slow), pay 40 shards for a full heal, or ask Mira (+15% HP) |
| `ash_choir` | The Ash Choir | solenne, frostspire | Sing (heal or Frail), silence them (elite + 50 shards), or show the Ember (relic or a fight) |

Curses (`curses.json`) last N fights:
- `frail`: −15% max HP.
- `dim`: −30% Ember gain.
- `slow`: −15% SPD.

## 9. Story (`story.json`, 5 scenes)
1. **prologue**, Ashen Hearth: Mira hands over the Ember. "Keep it fed. Keep it moving."
2. **after_r1**: the Ember whispers, and only Mira understands it.
3. **after_r2**: Mira's name is carved, in her own hand, on a 300-year-old milestone.
4. **after_r3_twist**: Mira reveals she was the previous Ember. She took human form three centuries ago to guide the last caravan. Relighting Solenne needs an Ember to give itself up, and the young flame is too young, so Mira will go in its place.
5. **epilogue**: Mira steps into the brazier and Solenne lights. The young Ember takes Mira's shape as a child and says: "Keep it moving."

Speakers: `mira, bram, lysa, oren, kit, ember, mira_child, narrator`.

## 10. Art asset ID list (ART: name files exactly by these ids)
- **heroes/**: `bram`, `lysa`, `oren`, `kit` (battle sprites). Portraits: `portraits/<id>` for the four heroes plus `mira`, `mira_child`.
- **enemies/**: `moss_wolf`, `thornling`, `wisp_lantern`, `barkhide_stag`, `rootmother`, `glass_scarab`, `dune_jackal`, `sand_wraith`, `prism_basilisk`, `sunshard_colossus`, `frost_wight`, `ice_harpy`, `rime_golem`, `aurora_drake`, `wintermaw`, `hollow_king`.
- **relics/**: `cinder_brand`, `wardens_mantle`, `phoenix_ash`, `bellows_charm`, `seers_lens`, `executioners_coin`, `sunsteel_whetstone`, `kindling_bundle`, `shatterpoint_heads`, `ashen_hourglass`, `banked_coals`, `crimson_ribbon`, `hearth_psalter`, `gilded_purse`, `last_light`, `tinderbox`.
- **consumables/**: `hearth_broth`, `phoenix_feather`, `bottled_spark`, `shatter_salt`.
- **regions/** (diorama backdrops): `whisperpine`, `glass_dunes`, `frostspire`, `solenne`, plus `ashen_hearth` (prologue).
- **ember/**: `ember` (the flame on the wagon), **props/**: `wagon`.

## 11. Integration notes for DEV
- Import everything from `src/data/index.ts` (`HEROES`, `ENEMIES`, `RELICS`, `CONSUMABLES`, `CURSES`, `EVENTS`, `REGIONS`, `MAP_CONFIG`, `BALANCE`, `STORY`, plus the `*_BY_ID` maps and `REGION_ORDER`).
- JSON string literals widen to `string`, so `satisfies` cannot check the unions. `index.ts` asserts the types, and `validateContent()` checks enums, references, counts and the 2×2 fit at runtime. Please add a Vitest that runs `expect(validateContent()).toEqual([])`.
- `tsconfig` needs `resolveJsonModule: true`.
