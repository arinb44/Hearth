# Handoff: coop-builder (MHacks "Best use of Spacetime")

**Written:** 2026-10-04, after milestone M8b (islands). The user ended the session here; M8c has not been started.
**Read first:** this file, then `progress.md` (status log), `plan.md` (Revision 5 is the current plan), and `decisions.md`. The project follows `C:/Users/arins/Arin/Claude/Agents/programAgents.md` (the `/program-agent` skill). Never write anything into `C:/Users/arins/Arin/Claude/Agents`.

## What this is
A low-poly 3D multiplayer building game on SpacetimeDB:
- **Backend:** a TypeScript SpacetimeDB module in `spacetimedb/`.
- **Client:** Vite, TypeScript and Three.js in `src/`.
- **Play:** players make an account (username plus recovery code), then enter the shared Main Island or their own island, up to 10 players per island. On an island they build on a 24×24 grid in timed rounds picked by lobby vote: co-op challenges or Build Battles with plots and a best-build vote.

| | |
|---|---|
| Repo | https://github.com/arinb44/SpacetimeDemoMHacks (branch `main`) |
| Live site (GitHub Pages) | https://arinb44.github.io/SpacetimeDemoMHacks/ |
| Maincloud database | `coop-builder-mhacks` (dashboard: https://spacetimedb.com/coop-builder-mhacks) |
| Project root | `C:\Users\arins\Arin\School\UMich\MHacks\spacetime-market` |

## Where things stand
**Live today:** commit `7a2e862` (environment round), on both Pages and Maincloud. It has no accounts and no islands yet.

**Local `main` is 2 commits ahead of `origin`. Neither has been pushed or published.**
- `e70df6f` (M8a): accounts with recovery codes and a main screen.
- `feat: add islands with separate boards, rounds, and subscriptions` (M8b): the commit that added this file.

This was deliberate. The user chose to ship accounts and islands to Maincloud and Pages together after M8c.

**Tests:** 96/96 pass (71 unit, 25 sync). `npm run build` and the module type-check are clean.

### M8a: accounts
- **Tables:** `account` (public; username key unique, stats) and `account_secret` (private recovery code).
- **Reducers:**
  - `create_account`
  - `recover_account`, which moves the account to the new identity and rotates the code
  - `new_recovery_code`
- **Recovery code view:** per-user view `my_recovery_code`; only the owner sees their code.
- **Stats:** pieces placed, rounds played, and wins.
- **Main screen:** `src/ui/home.ts`.

### M8b: islands
- **`island` table:**
  - The Main Island is created in `init` with `owner_account_id` 0; it is id 1 on a fresh database.
  - Up to 3 islands per account.
  - 10 online players per island. `player_count` is recounted by every reducer that moves a player.
- **`island_id` on every per-world table:**
  - `game_state` is now keyed by island.
  - `piece` has a unique `cell_key` = island × 1000 + tile, so the one-piece-per-tile race is still settled by the database.
  - `plot` has a unique `plot_key`, and `round_result` has an autoInc id.
  - `player.island_id` is 0 while the player is on the main screen.
- **Reducers:**
  - `enter_island(island_id, name)` replaces `join`. `name` is only used by guests.
  - `leave_island`, `create_island(name)` (account required; it takes you there).
  - Every gameplay reducer resolves the caller's island.
  - Admin `skip_phase` and `reset_game` now take an island id.
- **Client subscriptions:**
  - Global: `config`, `account`, `my_recovery_code`, `island`, and your own `player` row.
  - Per island: `src/net/island.ts` (`IslandSubscription`) subscribes with `where island_id = X`. On a switch it unsubscribes first, then subscribes.
- **`Game` (`src/game/game.ts`):**
  - Follows your own player row and ignores rows from other islands.
  - After a reload it resumes your island.
- **Main screen:** lists islands (Play, Resume, Full, live counts), plus New island and Leave island.
- **Player panel:** shows the island name.

## Next: M8c (friends and saved builds)
This is from `plan.md` Revision 5 (requirements 21–22).
1. **Friends tables.** `friend_request` and `friendship`, with a client visibility filter so only the two people involved see the rows. Check the 2.10 TS API name; it is probably `spacetimedb.clientVisibilityFilter.sql(...)`. Add a sync test proving a third client can't see them.
2. **Friends reducers.**
   - Send a request by username (case-insensitive via `account.username_key`).
   - Accept, decline, and remove.
   - Reject requests to yourself and duplicates.
3. **Friends list on the main screen.**
   - Show online status and the island each friend is on, with a **Join** button that calls `enter_island`.
   - The client only subscribes to its own `player` row, so friends' presence needs a source. Options: subscribe to friends' player rows (visibility filter, or a semijoin with `friendship`), or a per-user view `my_friends` that returns username, online, island id and island name.
4. **Saved builds.**
   - `saved_build` (owner account id, name, an array of {kind, tileX, tileZ, rotation}, createdAt).
   - `save_build(name)` snapshots the caller's current island board.
   - `load_build(id)` works only for the island's owner, only in the Lobby, and replaces the board.
   - Cap the number of builds per account (around 10) and the build size.
5. **Tests.** Sync tests for requests, visibility, join-a-friend, and save/load (including rejections). Then a browser check with two tabs.

## Then ship (each step needs the user's explicit OK)
1. **Maincloud publish.** The schema change is breaking, so it needs `--delete-data`, which wipes the live database (only test and bot data today). Command: `npm run stdb:publish -- --delete-data=always`, with `SPACETIME_CLI` set (see below). After the wipe, `configure_timing` is back to its defaults (30 120 4 25 12).
2. **Push** `main`; this triggers the Pages deploy via `.github/workflows/pages.yml`. Then load the live URL and check that it connects.
3. **Docs.** Finish the README (friends and saved builds), `summary.md`, and `progress.md`.
4. **Real phone.** Ask the user to test the landscape layout on a real phone. Only emulation has been verified so far.

## Decisions waiting on the user
- **Starting M8c:** the user chose to stop after M8b, so confirm before starting.
- **Maincloud publish with `--delete-data`, and the push:** after M8c.

The local dev database `coop-builder` was wiped and republished with the islands schema (approved). The dev site on port 5173 connects again, and round timing there is back to the defaults (30 s lobby auto-start).

## Rules (non-negotiable)
- **Git:**
  - Ask before **every** commit and every push.
  - Push only to `arinb44/SpacetimeDemoMHacks`.
  - Never force-push or rewrite history.
  - Conventional Commits.
- **No Claude/AI markers** in commit messages or PRs: no `Co-Authored-By: Claude`, no "Generated with Claude Code", no 🤖, no claude.com links. Before pushing, check `git log -1 --format=%B`.
- **Destructive data steps** (any `--delete-data` other than the throwaway test DB) need explicit approval.
- **Tone:** narrate each step for the user; show the files and the commit message before asking.

## How to run (this Windows machine)
- **Node:** at `C:\Program Files\nodejs`. Prepend it to PATH: `export PATH="/c/Program Files/nodejs:$PATH"`.
- **SpacetimeDB CLI:** the `spacetime` launcher fails through the `bin\current` junction. Always set `SPACETIME_CLI="$LOCALAPPDATA/SpacetimeDB/bin/2.10.2/spacetimedb-cli.exe"`; the npm `stdb:*` scripts and the sync tests use it.
- **Local server:** `"$SPACETIME_CLI" start` (port 3000). It may already be running as a background task.
- **Local databases:**

  | Database | Purpose |
  |---|---|
  | `coop-builder` | dev; islands schema since the approved wipe; Main Island is id 1 |
  | `coop-builder-test` | republished with `--delete-data=always` by every `npm run test:sync` |
  | `coop-builder-preview` | made for the M8b browser check while `coop-builder` waited; safe to ignore or delete |

- **Dev client:** `npm run dev` (Vite, port 5173, uses `.env.development`). To point a second Vite at the preview database:
  1. Create a gitignored `.env.islandpreview.local` containing `VITE_SPACETIMEDB_DB_NAME=coop-builder-preview` and `VITE_SPACETIMEDB_HOST=ws://127.0.0.1:3000`.
  2. Run `node node_modules/vite/bin/vite.js --mode islandpreview --port 5174`.
- **Tests:** `npm test` (unit, then sync). Sync tests need the local server.
  - Each sync test makes its own island with `newIsland()` in `tests/sync/helpers.ts`, which creates a throwaway account and island.
  - Test clients subscribe to **all** tables, so filter by `islandId` in assertions.
- **Bindings:** `npm run stdb:generate` after any schema or reducer change; the sync global setup also regenerates them. If a reducer was removed, delete its stale `src/module_bindings/*_reducer.ts` by hand, because the generator's delete prompt answers "no" when run non-interactively.
- **Format:** `npx prettier --write .`
- **Bots:** `npm run bots -- --count 9 --target local --seconds 30`. They enter the Main Island; `--island <id>` picks another.
- **Admin:** `"$SPACETIME_CLI" call <db> skip_phase <islandId> --server local`, and the same pattern for `reset_game <islandId>` and `configure_timing l b s v r`.

## Gotchas
- **Unique indexes on the client:** the generated typings call them range indexes, but at runtime they have `find`, not `filter`. `src/net/queries.ts#pieceAt` casts `piece.cellKey` for this. Primary keys (for example `gameState.islandId.find`) are fine.
- **Backticks in bash:** template-literal backticks in bash heredocs or `node -e` strings get mangled. Edit TS files with the Edit or Write tools, or a Python script written with Write.
- **Vite on Windows:** it can miss rapid successive edits; `touch` the file if the served module is stale.
- **ServerClock:** only sample server timestamps that were *just* created (live transitions, changed `lastMoveAt`). Cached rows make the countdown run long.
- **Browser pane:** it shares tabs with the user, so test in separate tabs (`?slot=N` gives each tab its own identity) and close them afterwards.
- **Free tier:** Maincloud pauses when idle. Open the site about 2 minutes before a demo.

## Key files
- `spacetimedb/src/`:
  - `schema.ts`: tables
  - `index.ts`: reducers, lifecycle, view
  - `rounds.ts`: per-island phase machine
  - `islands.ts` and `accounts.ts`: helpers
  - `logic/`: pure shared rules (`islands.ts`, `accounts.ts`, `pieces.ts`, `plots.ts`, `themes.ts`, `scoring.ts`, …)
- `src/net/`: `connection.ts` (global subscription), `island.ts` (per-island subscription), `queries.ts` (`myIslandId`, `myGameState`, `pieceAt`, `resultFor`, `myPlot`)
- `src/game/game.ts`: scene and HUD wiring
- `src/ui/`: `home.ts` (main screen), `hud.ts`, `lobby.ts`, `battle.ts`, `results.ts`, `players.ts`, `palette.ts`, `settings.ts`
- `tests/unit/` and `tests/sync/`: `helpers.ts`, `islands.test.ts`, `accounts.test.ts`, …
