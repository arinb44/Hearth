# Progress: coop-builder

- **Current phase:** Phase 4 (Implementation), M2 (building) complete
- **Status:** Waiting for user (M2 commit/push approval)

## Completed Milestones
- 2026-10-03: Project root confirmed: `C:\Users\arins\Arin\School\UMich\MHacks\spacetime-market` (new subfolder; no earlier program-agent work).
- 2026-10-04: Phase 1 setup interview complete and confirmed. Slug `coop-builder`.
- 2026-10-04: Phase 2 complete: `programAgent.md` approved (including the proposed coding standards).
- 2026-10-04: GitHub repository chosen: `https://github.com/arinb44/SpacetimeDemoMHacks`, branch `main`. The remote already has 1 commit (`1c99efa`: `README.md` + MIT `LICENSE`). Build on it; never force-push.
- 2026-10-04: Phase 3 complete: `plan.md` approved. Recommendations adopted for D1–D8 (see `decisions.md`).
- 2026-10-04: **M0 complete: commit `807d92e`, pushed to `origin/main`** (repo-local identity `arinb44`). Installed Node.js 24.19.0 and SpacetimeDB CLI 2.10.2. Git set up on `origin/main`. Scaffolded the TypeScript module (`game_state` singleton + `init`), shared `logic/grid.ts`, the Vite + Three.js client (island scene + live status pill), and Vitest unit + sync projects. `npm test`: 5 passed, 0 failed (4 unit, 1 sync). `npm run build` and the module type-check pass. Checked visually in the browser: the HUD shows "Lobby · round 0" live from the DB.

- 2026-10-04: **M2 complete (pending commit).** `logic/pieces.ts` (10 kinds, shared `checkPlacement`/`checkModify`: bounds, kind, rotation, occupancy, reach, phase); `piece` table with unique `tileKey`; `activity` event table; `place_piece`/`rotate_piece`/`remove_piece`. Client: procedural low-poly models with pop-in, palette (1–0), ghost preview tinted green/red, reach ring, left-click place/rotate, right-click remove, activity feed, toasts. `npm test`: 42 passed, 0 failed (31 unit, 11 sync), including the 8-client same-tile race (exactly one winner). Verified in the browser across two tabs. Gotcha: generated client typings show unique indexes as range indexes, but at runtime they have `find` (not `filter`); `src/net/queries.ts#pieceAt` handles this.
- 2026-10-04: **M1 complete: commit `8cf2d7d`, pushed.** `player` table + private `session` table; `client_connected`/`client_disconnected`; `join`/`set_name`/`move` reducers; token-bucket speed limit in `logic/movement.ts`; names and colors in `logic/players.ts`. Client: join screen, low-poly avatars with name tags, WASD prediction + 10 Hz sends, interpolation, snap-back on server correction, follow camera, online list, `?slot=N` for several players per browser. `npm test`: 27 passed, 0 failed (20 unit, 7 sync). Verified in the browser: two tabs see each other; the server accepts moves; reload restores identity without the join screen.

## Environment Facts
- The Browser pane is hidden in this session, so `requestAnimationFrame` only fires on screenshots. To check movement in the browser, hold a key while taking screenshots.
- Windows 11. At the start only `git` 2.54 and `winget` are installed (no Node, no SpacetimeDB CLI).
- VC++ runtime (`vcruntime140.dll`) is present, so the SpacetimeDB installer skips that step.
- Global git identity: `arinb45` / `166319374+arinb45@users.noreply.github.com`. **Note:** the repo owner is `arinb44`, a different account; a push may fail if `arinb45` lacks write access. Do not change the git identity unless the user asks.
- The system `init.defaultBranch` is `master`, so use `git init -b main`. Credential helper: `manager` (Git Credential Manager).

## How to Run (dev, in this environment)
- In this sandbox the `spacetime.exe` launcher can't start the CLI through the `bin\current` junction, and Node can't spawn through it either. Set `SPACETIME_CLI=%LOCALAPPDATA%\SpacetimeDB\bin\2.10.2\spacetimedb-cli.exe` for the npm `stdb:*` scripts and the sync tests. In a normal user terminal, plain `spacetime` probably works.
- Local server: `spacetimedb-cli start` (listens on 0.0.0.0:3000). Dev DB `coop-builder`, test DB `coop-builder-test`, Maincloud DB `coop-builder-mhacks`.
- Node is at `C:\Program Files\nodejs`. Prepend it to PATH in shells opened before the install.

## Next Step
Commit M2 after approval, then push after approval. Then M3 (timed challenges): a phase state machine (Lobby → Building → Scoring → Results → Lobby) on one-shot scheduled reducers via a `phase_timer` schedule table; `start_round` (any player; auto-start 30 s after the first player is present, per D8); challenge definitions + server scoring in `logic/challenges.ts`/`logic/scoring.ts`; a `round_result` table; clear the board at round start (D4); HUD countdown, challenge card, results screen; sync test 4 (full short round). Draft 3–4 challenge themes for user approval.

## Open Questions
- None right now.

**Last updated:** 2026-10-04
