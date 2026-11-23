# Caravan of Embers

An HD-2D pixel-art caravan roguelite for the browser. Guide a small band of heroes and the last warm Ember
across a world sliding into cold dusk: Whisperpine Woods, the Glass Dunes, Frostspire Pass, and the Gates of Solenne.

**Live URL:** https://caravan-of-embers.vercel.app

## Stack
Vite + TypeScript (strict) + Three.js + `postprocessing` + Howler. Static build deployed on Vercel.

## Commands
```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # type-check (tsc --noEmit) + production build into dist/
npm run preview   # serve dist/
npm run test      # unit tests (Vitest, tests/unit)
npm run screens   # build first; Playwright screenshots into docs/qa/screens/
                  #   npm run screens -- <prefix> <region...>   e.g. -- T-01 solenne glass_dunes
npm run pixelize -- in.png out.png 4   # nearest-neighbour pixelize helper (sharp)
npm run balance   # balance sim (stub until combat lands)
```

## Controls (demo)
| Key | Action |
|---|---|
| 1-4 | Switch region (Whisperpine, Glass Dunes, Frostspire, Solenne) |
| Q | Toggle post-FX quality High/Low (turns off auto-quality) |
| C | Chromatic-aberration pulse + Ember surge |
| Space | Pause/resume scrolling |

URL params: `?region=frostspire&quality=high|low&scroll=1.2`. Forcing `quality` disables the automatic drop to Low
(which otherwise kicks in when FPS stays under 45 for 3 s).

## Layout
- `src/sim/` pure deterministic simulation (no DOM/Three).
- `src/render/` diorama (`diorama.ts`), camera, sky + particles, sprites, Ember light, post-FX, art registry.
- `src/ui/` DOM overlay.
- `src/data/` content JSON (owned by CONTENT).

## Art hookup
Drop PNGs into `/assets` (repo root) and they are picked up at build time by `src/render/assets.ts`; missing files
fall back to procedural placeholders.
- `assets/regions/<regionId>/<layer>.png` where layer is `far`, `mid`, `fg` or `ground`
  (horizontal layers should tile seamlessly; silhouettes sit on the lower part of the image, transparent above).
- `assets/sprites/<name>.png`, e.g. `hero_1`..`hero_4`, `enemy_1`..`enemy_3`, `wagon` (feet at the bottom edge).

Region ids: `whisperpine`, `glass_dunes`, `frostspire`, `solenne`.
