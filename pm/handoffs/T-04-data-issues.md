# T-04 — data issues, rule interpretations, balance notes (DEV)

No data was changed. All content was implementable; `validateContent()` returns [].

## Balance (for T-06): fights run well under GDD targets
Default formation, no relics, seed 42, autoIgnite:
- `wp_glade` (R1, lv1): **11.2 s**, win, 3 breaks, 1 ignite, party took 20 dmg (GDD target 15–35 s).
- `so_boss` Hollow King (R4, lv4): **51.3 s**, win, 3 phases, 3 ignites, party took 747 dmg (target 45–90 s).
- Seeded autoplay (tests/unit/sim-helpers.ts `autoplay`): **100/100 runs won**, avg 13.15 encounters/run, ~225 s battle time per run.
Enemy damage is low compared to party HP; R1–R3 bosses end in 33–41 s.

## Rule interpretations (change in src/sim if the GDD means otherwise)
- **Break**: lasts `durationActions` (+relic bonus) of the enemy's own turns, counting the `skipActions` skipped turn(s); bonus dmg ×`dmgMult` applies throughout; then shield refills to max (`recover` + `shield` events).
- **Boss phases**: a hit can't take a boss past an untriggered threshold (HP clamps at it), so every phase always fires. Phase start raises max shield by `addShield`; it adds to the current shield unless Broken (refill happens on recover). `phase` event numbers: 2, 3, … (1 = base).
- **Statuses**: durations tick down at the start of the affected unit's own turn, after burn/bleed/regen tick. Reapplying refreshes (max value/duration). Bleed uses the applier's ATK.
- **Skill cooldown**: after use, `cooldown` own non-skill actions must pass.
- **Ember**: ultimates don't gain per-hit Ember (breaks/kills during Ignite still do). Relic/item Ember (Banked Coals, Tinderbox, Bottled Spark) ignores gain multipliers; hit/break/kill gains use Bellows × Dim curse × hard mode.
- **Melee enemy targeting**: taunt overrides melee+ranged single-target; ranged = uniform random hero. Heroes may target any enemy regardless of row.
- **Weakness** has no base damage bonus (only Seer's Lens adds one); its effect is the shield hit.
- **Fallen heroes** stay down after a fight (hpFrac 0) until Phoenix Feather or a region-boss level-up (level-up fully heals and revives the party). Camp heal and HP events don't revive. HP events never drop a hero below 1%.
- **Stalemate guard**: a battle that passes 300 sim s counts as a loss (`timeLimit` option).
- **Map**: `maxPerRegion` counts offered nodes, not chosen ones. When no unused event fits a region, the slot becomes a fight (deduped if a fight is already in that step).
- Fight shard rewards also apply to event-triggered fights (pool fight/elite).
- `haste_party` consumable effect is supported but no consumable uses it.
