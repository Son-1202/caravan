# Balance notes (T-10)

Tuned against `npm run balance` (bots in `src/sim/bots.ts`). Final report is `docs/qa/balance_report.md` (5000 runs/bot).
Validator-locked values are unchanged: break `dmgMult` 1.5, `frontMeleeShare` 0.7, camp `healFrac` 0.4.

## What the bots taught us
- The **random** bot ignites as soon as the meter is full. The **greedy** bot waits for a Broken enemy (or an emergency), so with the old hit-driven Ember it wasted meter and lost to random.
  Fix: Ember now comes **mostly from Breaks**. The meter tops up on a Break, so both bots Ignite into a Broken enemy and timing stops being a penalty for greedy.
- Formation, relic choice, camp and event choices barely moved the win rate. What separates the bots is **node choice + merchant**: greedy fights more, buys relics and ends with about 15 relics, while random ends with about 7.
  So relics were made strong and bosses were made into gear checks. Normal and elite fights are long but safe.

## Changes (before → after)
| Area | Before | After |
|---|---|---|
| Ember gain | hit 3, weakness +2, Break 12, hero damaged 1 | hit 0.5, weakness +0.5, **Break 40**, hero damaged 0.5 (kill 5) |
| Hero base HP/DEF | Bram 260/14, Lysa 170/7, Oren 180/8, Kit 160/6 | Bram 300/18, Lysa 150/5, Oren 210/12, Kit 140/4 |
| Ultimates | Oathwall 1.2, Starfall 1.6, Choir 0.8 (heal 2.5), Red Comet 3.5 | 2.0, 2.8, 1.4 (heal 4.0), 6.0 |
| Normal enemies | base | HP ×3.2, ATK ×0.8, DEF ×1.4 (e.g. Moss Wolf 120/13/6 → 380/10/8) |
| Elites | base | HP ×1.6, ATK ×1.4, DEF ×1.4 |
| Region bosses | Rootmother 900/18, Colossus 1300/24, Wintermaw 1650/30 | 1820/32, 3290/43, 3800/50 (DEF ×1.4) |
| Hollow King | 2600 HP / 34 ATK / 24 DEF | 6580 / 66 / 34 |
| Relics | +20–35% style values | roughly ×2.5: e.g. Seer's Lens 25% → 60%, Warden's Mantle 20% → 60%, Phoenix Ash 15% → 40%, Banked Coals 30 → 50, Tinderbox 10 → 20, Cinder Brand burn 5% → 10%, Last Light 35% → 75% |
| Economy | fight shards 18–28, elite 40–55, relic 90/140, fight relic chance 10% | 35–45, 50–65, relic 50/80, 25% |
| Consumables | Broth 35, Feather 60, Spark 45, Salt 40 | 60, 110, 50, 45 (random buys these; greedy buys relics) |

## Result (5000 runs/bot)
random 28.8% · greedy 74.8% · ignite-never 0.2% · max relic ratio 1.05× · normal 21.1 s · boss 78.0 s · HK phases 100/100/100%. All B7 rows PASS.

## Caveats
- ignite-never at ~0% means Ignite is mandatory. That meets the target, but if the design wants a "possible without Ignite" path, lower the Ember dependence (ultimate power) and raise base hero power.
- Elite fights are about as long as normal fights (~21 s, R4 ~13 s, where the Ignite usually ends them). The GDD target for elites (30–45 s) is not a B7 row and was not chased.
- The Rootmother is about 75 s and the R2 boss about 83 s. The upper bound (90 s) has some headroom.
