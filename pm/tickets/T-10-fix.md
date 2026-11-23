# T-10-fix — DEV: update 3 sim unit tests that hard-code old data numbers
**Role:** DEV · **Owned paths:** tests/unit/sim-*.test.ts, tests/unit/sim-helpers.ts
**Inputs:** pm/handoffs/T-10-test-notes.md (exact failures + suggested fixes), src/data/*.json (read only)
Make the tests data-driven (read values from data instead of literals) so future tuning doesn't break them. Do not weaken what they verify (break multiplier, Ignite gating, HK 3 phases). Don't touch src/**.
**Acceptance:** `npm run test` all green (ignore failures in tests/unit/game* if another agent's in-progress files cause them; mention it), `npm run build` passes.
