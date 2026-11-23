# T-10 — unit tests broken only by changed data numbers (for DEV)

`npm run test`: 40 pass, 3 fail in tests/unit/sim-combat.test.ts. Each failure comes from a hard-coded data assumption, not from a sim bug. Tests were not edited.

1. **Ember / Ignite › requires a full meter…** expects `emberMeter` 30 after Banked Coals. Banked Coals is now 50 (relics.json). Suggest `expect(...).toBe(RELIC_BY_ID.banked_coals.effect.value)` and enough Bottled Sparks to reach 100.
2. **bosses › the Hollow King goes through all 3 phases** expects a level-4/rank-1 party with **no relics** to beat the HK. The HK is now a relic gear check (6580 HP / 66 ATK), so a bare party loses. Suggest giving the test party a relic set (or higher level) with a generous timeLimit, or asserting only the phase order before the end of the fight.
3. **shield / break › Broken targets take ×breakDamageMult damage**: Kit alone vs Barkhide Stag (seed 11). The killing blow lands on a Broken stag, and `damage()` clamps it to the remaining HP (9 instead of 24). Suggest excluding the hit that precedes the `death` event, or using a target that can't die in the window.

`validateContent()` returns [].
