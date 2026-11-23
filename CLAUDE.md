# Caravan of Embers — Project Rules (every agent reads this first)

**Before anything: read `pm/STATE.md`, then your ticket `pm/tickets/T-XX.md`.**

## Stack
Vite + TypeScript (strict) + Three.js + `postprocessing` (pmndrs) + Howler. Static site on Vercel (`npm run build` → `dist/`).
Tests: Vitest (`npm run test`). E2E: Playwright (pre-installed; `require('playwright')`, `chromium.launch()` no options; never run `playwright install`).

## Architecture (hard rule)
- `src/sim/` — pure TS combat + run simulation. Deterministic, seeded RNG. **Zero DOM / Three / window imports.**
- `src/render/` — Three.js dioramas, sprites, VFX; consumes sim events (attack, hit, break, heal, death, ignite).
- `src/ui/` — DOM overlay UI (HTML/CSS) over the canvas.
- `src/data/*.json` — all content and numbers (CONTENT owns).
- `scripts/` — node scripts (balance.ts, pixelize.ts), run with `tsx`.

## Folder ownership (write only in your owned paths)
| Role | Owns |
|---|---|
| DEV | `src/**` (except `src/data/**`), `scripts/**`, `tests/**`, root config files, `index.html`, `public/**` |
| CONTENT | `src/data/**`, `docs/content/**` |
| ART | `assets/**`, `docs/art/**` |
| QA | `tests/e2e/**`, `docs/qa/**` (read-only elsewhere) |
Only the PM runs git commands. Never commit; never run git.

## Code style
- TS strict, no `any` unless justified. ES modules. Small files (<400 lines).
- No new runtime deps without noting it in your report.
- `npm run build` must pass with zero TS errors; `npm run test` must pass.

## Art style block (prepend to every Higgsfield prompt)
"HD-2D pixel art, Octopath Traveler style, crisp pixel sprites, painterly diorama background, tilt-shift miniature depth, dramatic warm ember light against cold dusk, volumetric fog, high fantasy, no text, no watermark, no UI"
Regions: Whisperpine Woods (deep greens, fireflies, moss) · Glass Dunes (amber sand, crystal spires, heat haze) · Frostspire Pass (blue-white snow, aurora) · Gates of Solenne (ruined gold city, ash, giant dim brazier). World darkens each region; only the Ember stays warm.
Credit cap: 100 total. Log every generation in `pm/CREDITS.md` and `docs/art/PROMPTS.md`.

## Agent protocol
- One ticket per agent. If low on context or ticket is bigger than expected: STOP, write `pm/handoffs/T-XX.md` (done / remaining / exact next steps / files touched) and report.
- Final report ≤ 150 words; details go in files.
- Visual work: save Playwright screenshots to `docs/qa/screens/` (deviceScaleFactor 1).
