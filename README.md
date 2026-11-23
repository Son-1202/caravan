# Caravan of Embers

A short HD-2D roguelite auto-battler for the browser. The world has fallen into the Long Dusk. Four heroes escort the
Last Ember, a living flame in a lantern-wagon, across four darkening lands to Solenne, whose great brazier is dying.

**Play:** https://caravan-of-embers.vercel.app (auto-deploys from `main`)

A run takes about 15–20 minutes: 4 regions, around 13 encounters, 5 story scenes, and the Hollow King at the end.

## How to play
- **Map:** choose your route. Nodes are Fight, Elite (guaranteed relic), Camp (heal 40% or +1 skill rank), Merchant, Event and Boss.
- **Formation:** drag the four heroes into a 2×2 grid. The front row takes 70% of melee hits.
- **Combat is automatic (ATB).** Hit enemy weaknesses (Slash / Pierce / Fire / Holy) to strip their shields. At 0 shields an enemy is **Broken**: it skips its next action and takes +50% damage.
- **Ignite** is your one live input. When the Ember meter is full, every hero uses their ultimate at once. Time it on a Broken boss.
- Win a run to unlock **Hard mode**. Best runs are saved in your browser.

## Controls
| Input | Action |
|---|---|
| Mouse / touch | Everything (mobile landscape supported) |
| Space | Ignite |
| 1 / 2 | Battle speed 1× / 2× |
| Esc | Pause |

URL params: `?seed=123`, `?quality=high|low` (by default, quality drops to Low automatically when FPS stays under 45 for 3 s), `?demo=combat` (render demo).

## Develop
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/
npm run test       # Vitest unit tests (sim, bots, render layout, game flow, save)
npm run e2e        # build first; Playwright full run via debug hooks + screenshots → docs/qa/screens/final
npm run balance    # headless balance sim: 5000 seeded runs × 3 bots → docs/qa/balance_report.md
npm run balance -- --runs 1000 --bot greedy
npm run pixelize   # assets/raw/**_sprite.png → assets/sprites/** (pixel grid, palette, 1px outline)
```

Debug hooks (browser console): `window.__debug = { seed, run, gotoNode(i), winFight(), setRelics([...]), runBot('greedy'|'random'|'ignite-never'), state() }`.

## Architecture
- `src/sim/` is the pure, deterministic combat and run simulation (seeded RNG, with no DOM or Three imports). It also holds the bots.
- `src/render/` has the Three.js dioramas (layered planes at z −30/−15/−6/0/+4), billboard sprites, procedural animation and VFX, the Ember point light, and post-FX (tilt-shift, bloom, vignette, grain, grade, chromatic aberration).
- `src/ui/` and `src/game/` hold the DOM overlay screens, the HUD and the run state machine. `src/audio/` is procedural WebAudio.
- `src/data/` holds all content and numbers (heroes, enemies, relics, events, map, balance, story).

## Balance (5000 runs per bot)
| Metric | Value | Target |
|---|---|---|
| Win rate, random bot | 28.8% | 20–35% |
| Win rate, greedy bot | 74.8% | 65–85% |
| Win rate, ignite-never | 0.2% | ≥ 15 pts below greedy |
| Max relic win-share ratio | 1.05× | ≤ 1.5× |
| Avg normal / boss fight | 21.1 s / 78.0 s | 15–35 s / 45–90 s |
| Hollow King phases 1/2/3 | 100% each | > 90% |

## Art
Generated with Higgsfield (66 of the 100-credit budget), all styled from one style bible (`assets/style_bible.jpg`). Prompts and job ids are in `docs/art/PROMPTS.md`.
Project management notes (tickets, decisions, credits) are in `pm/`.
