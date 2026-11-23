# STATE — single source of truth

**Phase:** 3 Core systems (Phase 2 deploy is waiting on the user's Vercel import)
**Live URL:** (pending Vercel)
**Repo:** https://github.com/Son-1202/caravan
**Credits spent:** 26 / 100

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
| T-07 | DEV | combat render + pixelize | in progress |
| T-08 | ART | regions 3–4 + enemies + bosses | in progress |
| T-02 | CONTENT | GDD + data JSON + story | done |
| T-03 | ART | 3 key-art candidates | done (style bible = B) |

## Known issues
- Vercel: user is importing the repo via the dashboard; URL pending.
- The assets registry (src/render/assets.ts) only globs *.png. Art uses .jpg for opaque layers → extend the glob in T-07.
- The scripts/pixelize.ts and scripts/balance.ts files are stubs (T-06 and the art pipeline will complete them).
