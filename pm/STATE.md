# STATE — single source of truth

**Phase:** SHIPPED. Live build matches main; e2e 15/15 PASS; live smoke test has 0 console errors.
**Live URL:** https://caravan-of-embers.vercel.app
**Repo:** https://github.com/Son-1202/caravan
**Credits spent:** 66 / 100

## Preflight results
- gh auth status: FAILED (GH_TOKEN invalid in container). git push via proxy: OK.
- vercel whoami: not logged in (CLI via npx).
- Higgsfield balance: 200 credits (starter).
- Node 22, npm 10.

## Tickets
| ID | Role | Title | Status |
|---|---|---|---|
| T-01 | DEV | Scaffold + diorama + post-FX | done |
| T-04 | DEV | src/sim combat + run + tests | done (29 tests) |
| T-05 | ART | Regions 1–2 + heroes | done |
| T-06 | DEV | bots + balance harness | done (all bots 99–100% win: too easy) |
| T-07 | DEV | combat render + pixelize | done |
| T-08 | ART | regions 3–4 + enemies + bosses | done |
| T-10 | CONTENT | balance tuning | done (all B7 PASS) |
| T-11 | ART | relics, Mira, CG, map, UI frame | done |
| T-09 | DEV | game flow + UI | done (after T-09-fix) |
| T-12 | DEV | story, title, end screens, save, audio, mobile | done |
| T-14 | QA | e2e + screenshot review | done (15/15 PASS; 1 major, 5 minor bugs) |
| T-15-1 | DEV | fg canopy, stuck hit-flash, boss outline | done |
| T-15-2 | DEV | map zoom, mobile map, nameplates, title layout | done |
| T-13 | DEV | render juice + polish | done |
| T-02 | CONTENT | GDD + data JSON + story | done |
| T-03 | ART | 3 key-art candidates | done (style bible = B) |

## Known issues
- Vercel: user is importing the repo via the dashboard; URL pending.
- The assets registry (src/render/assets.ts) only globs *.png. Art uses .jpg for opaque layers → extend the glob in T-07.
- The scripts/pixelize.ts and scripts/balance.ts files are stubs (T-06 and the art pipeline will complete them).
- Combat ground is a flat untextured plane (large empty brown/dark area). The wagon is a placeholder box. Some enemies face the wrong way (fix: a per-enemy flip table). → T-13 polish.
- 60 fps can't be verified in this container: headless Chromium uses SwiftShader, a software GPU (about 600 ms per frame). It needs a real-GPU check; the quality auto-drop is the safety net.

## Release (2026-11-23)
- Live: https://caravan-of-embers.vercel.app (auto-deploys from main; the bundle hash matches main)
- Unit tests 68/68; e2e 15/15; balance report: all B7 rows PASS
- Credits: 66/100
- Open known issues: 60 fps not verified on a real GPU. On the forced-win debug path the win screen shows zeroed stats (it skips the fights; the real bot win shows full stats). A human's real run length isn't measured (about 6 min of bot battle time at 2×, so an estimated 15–20 min at 1× with menus and story).
