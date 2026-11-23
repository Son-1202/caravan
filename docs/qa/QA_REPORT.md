# QA Report — T-14 (E2E + screenshot review)

**Date:** 2026-11-23 · **Build:** `dist/` from 12:21 (current with src) · **Runner:** `npm run e2e` (`tests/e2e/game.e2e.ts`, headless Chromium / SwiftShader)
**Result:** E2E **PASS** (15/15 checks, 0 console/page errors). **Bugs:** 0 blocker · 1 major · 5 minor.
Raw results: `docs/qa/e2e-results.json`. Screenshots: `docs/qa/screens/final/` (DPR 1).

## E2E checks
| Check | Result |
|---|---|
| (a) Loads with zero console errors / pageerrors (title, canvas present) | PASS |
| (c) Map screen | PASS |
| (c) Combat in Whisperpine / Glass Dunes / Frostspire / Solenne (diorama region matches) | PASS ×4 |
| (c) Break moment (froze 0.7 s after a sim `break` event) | PASS |
| (c) Hollow King boss fight (region 4 boss node) | PASS |
| (c) Twist dialogue (`after_r3_twist`, lines 2 and 5) | PASS |
| (c) All 5 story scenes open | PASS |
| (c) Win screen | PASS |
| (c) Mobile 844×390 map + battle, no page overflow | PASS |
| (b) Greedy bot full run in real UI, seed 7 | lost in Frostspire (289 s wall) |
| (b) Greedy bot full run in real UI, seed 11 | **won** (378 s wall; 14 fights, 38 breaks, 19 ignites, 14 relics) |
| (b) A greedy run wins within 5 seeds | PASS (2nd seed) |

The seed-7 loss is consistent with the tuned balance target (greedy win rate is 74.8%, target 65–85%, per `docs/qa/balance_report.md`). It is not a bug.

How screens are reached: `__debug.newRun` + `app.begin()`, then jump region by setting `run.regionIdx`/`run.step` and `app.refresh()`. The boss uses the last map step of region 4. No new debug hook was needed.

## Definition of Done checklist
| Item | Status | Evidence |
|---|---|---|
| 4 regions with distinct dioramas | ✅ | combat-*.png |
| ~13 encounters per run | ✅ | the seed-11 win had 14 fights; the map is 3 steps + boss × 4 regions |
| 16 relics | ✅ | 16 in `relics.json`, 16 icons in `assets/relics/`; 14 collected in the seed-11 run (bot-end-seed11-won.png) |
| All enemies / 4 bosses | ✅ (data/art) · partly seen | 16 enemy defs all have sprites; seen: moss wolf, thornling, wisp lantern, glass scarab, frost wight, sand wraith, Hollow King. Rootmother, Colossus and Wintermaw were fought by the bot but not screenshotted |
| 5 story scenes | ✅ | e2e opens all 5 |
| Twist | ✅ | twist.png (Mira reveal, dissolving sprite), twist-ember.png |
| HD-2D look | ✅ with one major defect | painterly layers, pixel sprites, warm Ember vs cold dusk, darkening per region. See BUG-1 |
| Mobile (844×390) | ✅ with minors | mobile-map/battle-844x390.png, no overflow |
| Win + lose screens | ✅ | win.png, bot-end-seed11-won.png, bot-end-seed7-lost.png |
| 60 fps | ⚠ not verifiable | software GPU in the container (see STATE) |

## Bugs
### BUG-1 · MAJOR · Whisperpine fg canopy renders as a black block over the wagon/party → **T-15-1**
Repro: start a run (seed 7) and open the first fight at 1280×720. A hard-edged near-black pixel block (the fg tree canopy) covers x≈0–280, y≈180–410 over the wagon, behind Lysa's and Oren's plates. The same block floats at the top of the map and end screens.
Screens: `final/combat-whisperpine.png`, `final/break.png`, `final/map.png`, `final/win.png`.

### BUG-2 · minor · Mobile map top bar drops the region name and progress
Repro: at 844×390, open the map. The top bar shows only shards and relics; "Whisperpine Woods · 1/4" is missing, so the player has no region indicator. Screen: `final/mobile-map-844x390.png`.

### BUG-3 · minor · Mobile map node labels are hidden by neighbouring nodes
Repro: at 844×390, open the map. The step-2 "Merchant" label is covered by the Camp node, and the step-3 labels overlap too. Screen: `final/mobile-map-844x390.png`.

### BUG-4 · minor · Region map nodes are spread over the whole-world parchment
Repro: open the map in region 1. The world map art shows all 4 regions, and Whisperpine's step 2/3 nodes and boss are drawn over the Dunes, Frostspire and Solenne art (the boss skull sits on Solenne). This reads as if the player is crossing every region. Screen: `final/map.png`.

### BUG-5 · minor · Hero nameplates overlap in combat
Repro: any battle. Oren's HP text sits under Lysa's plate and the lantern glow ("210/210" is partly hidden), at both 1280×720 and 844×390. Screens: `final/combat-glass_dunes.png`, `final/mobile-battle-844x390.png`.

### BUG-6 · minor · The Hollow King is hard to read against Solenne
Repro: region-4 boss fight. The dark armoured sprite blends into the dark ruins. A rim light or a brighter back-glow would help. Screen: `final/boss-hollow-king.png`.

## Notes
- The bot takes about 5–6 min of wall time per full run in this container (quality=low, bot speed 16). The default timeout is 25 min per seed (`E2E_BOT_TIMEOUT_MIN`).
- `E2E_SKIP_BOT=1` runs only the load and screenshot checks (about 3 min). `E2E_SEEDS=…` overrides the seeds.
