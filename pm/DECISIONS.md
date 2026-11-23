# Decisions Log

- D-001 (Phase 0): Repo `Son-1202/caravan` already existed and was cloned; skipped `gh repo create`. `gh` token invalid in this container, but git push over the session proxy works — git is the only GitHub channel needed.
- D-002: Git identity Son-1202 <Son-1202@users.noreply.github.com> (GIT_EMAIL placeholder was not filled in; noreply keeps the personal email off a public repo).
- D-003: Higgsfield balance is 200; the project cap stays at 100 as specified.
- D-004: Tests use Vitest; node scripts run via tsx.
- D-005: User chose: they import the repo into Vercel themselves (Vite preset, auto-deploy from main). The PM keeps building; the live URL gets recorded once they provide it.
- D-006: User confirmed pushing to `main` (overriding the session's default claude/ branch).
- D-007 (art budget): nano_banana_pro 2k = 2 cr/image, gpt_image_2_6 1:1 = 0.75 cr. The full one-per-item list (~61 images) would be about 102 cr, which is over the cap. Plan: pack items into sheets and crop them in code. Hero sprites go in one 2×2 sheet, portraits in one sheet, normal enemies + elite in one 2×2 sheet per region, and the 16 relic icons in one 4×4 gpt sheet. Bosses and the Hollow King are generated one each. Sprites are generated on a flat chroma background and keyed out in pixelize.ts (free); remove_background is used only as a fallback. Planned spend: about 60 cr.
- D-008: Style bible = candidate B (job c05564d4-14be-4f28-b5a3-8cba21e153b4). It has the clearest sprite designs, shows the woods→dunes progression and the warm wagon light against a cold sky. Copied to assets/style_bible.jpg and assets/key_art.jpg. Candidate A (moodiest dusk) is a mood reference for the later dark regions. Hero look is locked from B: Bram = steel plate armor with a kite shield; Lysa = green hood with a bow; Oren = crimson hooded robe with a censer; Kit = light tan cloak with twin blades; Mira = white-haired old woman in a green shawl.
- D-009: Higgsfield routed nano_banana_pro to nano_banana_2 at the same 2 cr. Accepted.
- D-010: The content data uses casts plus runtime validateContent() instead of satisfies, because TS widens string literals in imported JSON. DEV adds a vitest for it. CONTENT also added curses.json.
