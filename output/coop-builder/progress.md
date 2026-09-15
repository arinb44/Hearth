# Progress: coop-builder

- **Current phase:** Phase 4 (Implementation), M0 (setup) complete
- **Status:** Waiting for user (approval of the repo-local git identity commands and the M0 commit/push)

## Completed Milestones
- 2026-10-03: Project root confirmed: `C:\Users\arins\Arin\School\UMich\MHacks\spacetime-market` (new subfolder; no earlier program-agent work).
- 2026-10-04: Phase 1 setup interview complete and confirmed. Slug `coop-builder`.
- 2026-10-04: Phase 2 complete: `programAgent.md` approved (including the proposed coding standards).
- 2026-10-04: GitHub repository chosen: `https://github.com/arinb44/SpacetimeDemoMHacks`, branch `main`. The remote already has 1 commit (`1c99efa`: `README.md` + MIT `LICENSE`). Build on it; never force-push.
- 2026-10-04: Phase 3 complete: `plan.md` approved. Recommendations adopted for D1–D8 (see `decisions.md`).
- 2026-10-04: **M0 complete (not yet committed).** Installed Node.js 24.19.0 and SpacetimeDB CLI 2.10.2. Git set up on `origin/main`. Scaffolded the TypeScript module (`game_state` singleton + `init`), shared `logic/grid.ts`, the Vite + Three.js client (island scene + live status pill), and Vitest unit + sync projects. `npm test`: 5 passed, 0 failed (4 unit, 1 sync). `npm run build` and the module type-check pass. Checked visually in the browser: the HUD shows "Lobby · round 0" live from the DB.

## Environment Facts
- Windows 11. At the start only `git` 2.54 and `winget` are installed (no Node, no SpacetimeDB CLI).
- VC++ runtime (`vcruntime140.dll`) is present, so the SpacetimeDB installer skips that step.
- Global git identity: `arinb45` / `166319374+arinb45@users.noreply.github.com`. **Note:** the repo owner is `arinb44`, a different account; a push may fail if `arinb45` lacks write access. Do not change the git identity unless the user asks.
- The system `init.defaultBranch` is `master`, so use `git init -b main`. Credential helper: `manager` (Git Credential Manager).

## How to Run (dev, in this environment)
- In this sandbox the `spacetime.exe` launcher can't start the CLI through the `bin\current` junction, and Node can't spawn through it either. Set `SPACETIME_CLI=%LOCALAPPDATA%\SpacetimeDB\bin\2.10.2\spacetimedb-cli.exe` for the npm `stdb:*` scripts and the sync tests. In a normal user terminal, plain `spacetime` probably works.
- Local server: `spacetimedb-cli start` (listens on 0.0.0.0:3000). Dev DB `coop-builder`, test DB `coop-builder-test`, Maincloud DB `coop-builder-mhacks`.
- Node is at `C:\Program Files\nodejs`. Prepend it to PATH in shells opened before the install.

## Next Step
Run the approved repo-local identity commands (`git config user.name arinb44`, `git config user.email 323401710+arinb44@users.noreply.github.com`), make the M0 commit after approval, check the message has no AI markers, and push to `origin main` after approval. Then start M1 (presence + movement): `player` table, lifecycle reducers, `join`/`set_name`/`move`, avatars + interpolation, sync tests 1 and 5.

## Open Questions
- Approval of the repo-local git identity commands.
- Approval of the M0 commit and push.

**Last updated:** 2026-10-04
