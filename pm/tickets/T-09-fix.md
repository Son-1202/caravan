# T-09-fix — DEV: diorama is not visible behind the map/formation screens, and the battle scene is washed out

**Role:** DEV · **Owned paths:** src/game/**, src/ui/**, src/render/** (only what the fix needs), src/main.ts, scripts/screens-game.ts, docs/qa/screens/T-09*.png
**Inputs:** CLAUDE.md, pm/STATE.md, pm/tickets/T-09.md (the original spec; the previous agent hit a usage limit before finishing review), the screenshots docs/qa/screens/T-09-*.png

## Problems seen in the T-09 screenshots (PM review: REJECTED)
1. **Battle (T-09-battle.png, T-09-battle-844x390.png):** the whole frame is a flat beige/white wash. No diorama and no hero/enemy sprites are visible, only the HUD bars. Compare with docs/qa/screens/T-07-*.png, where the same CombatView renders correctly. Likely causes: the HUD/backdrop overlay is opaque; the postfx/bloom is blown out; the scene/camera isn't set up in game mode; the textures hadn't loaded when the screenshot was taken; or there is a fog colour/exposure issue. Find the real cause and fix it, so the battle looks at least as good as T-07-break.png with the HUD on top.
2. **Map and formation screens:** the background is a flat grey; the marching diorama should be visible behind the panels (dimmed slightly, with the caravan walking and the layers scrolling). The map panel also floats in the lower half with a big empty gap above it. Centre it vertically under the top bar, or let it fill the available space.
3. Check the HUD on the battle screen: name labels overlap when units are close (Oren/Lysa, the two Wisp Lanterns). Stagger or offset the labels so all of them stay readable; HP numbers must not overlap.
4. Check that the T-09 deliverables are all present and work: map, formation drag (mouse + touch), battle with HUD and Ignite (Space), reward with a relic choice, camp, merchant, event, end screen, and `window.__debug` (seed, run, gotoNode, winFight, setRelics, runBot, state). Fill any gap.

## Acceptance
build and test pass. Regenerate all the T-09 screenshots (1280x720 plus the 844x390 battle) and look at them yourself. The battle must show the real diorama and sprites, the map and formation screens must show the diorama behind them, and there must be no console errors during `__debug.runBot('greedy')`.
