# Decisions Log

- D-001 (Phase 0): Repo `Son-1202/caravan` already existed and was cloned; skipped `gh repo create`. `gh` token invalid in this container, but git push over the session proxy works — git is the only GitHub channel needed.
- D-002: Git identity Son-1202 <Son-1202@users.noreply.github.com> (GIT_EMAIL placeholder was not filled in; noreply keeps the personal email off a public repo).
- D-003: Higgsfield balance is 200; the project cap stays at 100 as specified.
- D-004: Tests use Vitest; node scripts run via tsx.
- D-005: User chose: they import the repo into Vercel themselves (Vite preset, auto-deploy from main). The PM keeps building; the live URL gets recorded once they provide it.
- D-006: User confirmed pushing to `main` (overriding the session's default claude/ branch).
