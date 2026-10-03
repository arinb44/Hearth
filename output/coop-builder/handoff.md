# Handoff: coop-builder (MHacks "Best use of Spacetime")

**Written:** 2026-10-04, after Revision 6 shipped (M9a–M9d), replacing the M8b handoff.
**Read first:** this file, then `progress.md` (status log), `plan.md` (Revision 6 is the latest), `decisions.md`, and `summary.md` (the full feature summary). The project follows `C:/Users/arins/Arin/Claude/Agents/programAgents.md` (the `/program-agent` skill). Never write anything into `C:/Users/arins/Arin/Claude/Agents`.

## What this is
A low-poly 3D multiplayer building game on SpacetimeDB:
- **Backend:** a TypeScript SpacetimeDB module in `spacetimedb/`.
- **Client:** Vite, TypeScript and Three.js in `src/`.
- **Play:**
  - Players make an account (username plus recovery code), add friends, and enter the shared Main Island or their own islands (up to 10 players each).
  - Rounds are picked by lobby vote. **Co-op** is a free build on a theme, scored 1 point per piece, ×2 with a combo partner. **Build Battle** gives each builder a private board, then a synced showcase tour and a vote.
  - Esc opens a tabbed menu.

| | |
|---|---|
| Repo | https://github.com/arinb44/SpacetimeDemoMHacks (branch `main`) |
| Live site (GitHub Pages) | https://arinb44.github.io/SpacetimeDemoMHacks/ |
| Maincloud database | `coop-builder-mhacks` (dashboard: https://spacetimedb.com/coop-builder-mhacks) |
| Project root | `C:\Users\arins\Arin\School\UMich\MHacks\spacetime-market` |

## Where things stand
- **Live:** everything through Revision 6. The last pushed commit is `6a9c9da`; the Pages deploy succeeded, and the bundle targets Maincloud.
- **Maincloud:** republished with `--delete-data=always` (approved), so the database is fresh. Main Island id 1; timing defaults `30 120 4 25 12 8`.
- **Tests:** 134/134 (101 unit, 33 sync). The build and the type-checks are clean.
- **Still open, needs the user:**
  1. Try a real phone in landscape. Only emulation has been checked.
  2. Ideally, a session with about 10 real players.

  The user confirmed on 2026-10-05 that the live site connects and works.
- **Possibly uncommitted:** this handoff file (check `git status`).

## Rules (non-negotiable)
- **Git:**
  - Ask before **every** commit and every push.
  - Push only to `arinb44/SpacetimeDemoMHacks`.
  - Never force-push or rewrite history.
  - Conventional Commits.
  - Repo-local identity `arinb44`.
- **No Claude/AI markers** in commits or PRs. Before pushing, check `git log -1 --format=%B`.
- **Destructive data steps:** Maincloud `--delete-data` always needs explicit approval. Local preview and dev DBs could be wiped during Revision 6 (approved); ask again for new work.
- **Push only after the matching Maincloud publish** whenever the schema changes; otherwise the live client breaks.
- **Tone:** narrate each step; show the files and the commit message before asking.

## How to run (this Windows machine)
- **Node:** `export PATH="/c/Program Files/nodejs:$PATH"`.
- **SpacetimeDB CLI:** always set `SPACETIME_CLI="$LOCALAPPDATA/SpacetimeDB/bin/2.10.2/spacetimedb-cli.exe"`. The `spacetime` launcher fails through the `bin\current` junction.
- **Local server:** `"$SPACETIME_CLI" start` (port 3000). As a background task it gets killed at its time limit, so pass the 2 h maximum and restart it when needed.
- **Local databases:**

  | Database | Purpose |
  |---|---|
  | `coop-builder` | dev, current schema, default timing |
  | `coop-builder-test` | republished by every `npm run test:sync` |
  | `coop-builder-r6` | Revision 6 browser checks (Vite `--mode r6` on 5174 via gitignored `.env.r6.local`) |
  | `coop-builder-m8c`, `coop-builder-preview` | old previews; safe to delete |

- **Dev client:** `npm run dev` (5173, `.env.development`).
- **Tests:** `npm test` (unit, then sync; sync needs the server). Test timing: lobby 0, build 4, showcase 30 (battle tests step with `skip_phase`).
- **Bindings:** `npm run stdb:generate` after schema or reducer changes.
- **Format:** `npx prettier --write .`
- **Admin:** `"$SPACETIME_CLI" call <db> skip_phase <islandId> --server local|maincloud`, the same for `reset_game <islandId>`, and `configure_timing lobby build scoring voting results showcase`.
- **Bots:** `npm run bots -- --count 9 --target local --seconds 30`.

## Gotchas
- **Unique indexes on the client** have `find`, not `filter`, despite the typings (`queries.ts#pieceAt`).
- **Same-tile replacement in one transaction** (loading a build): inserts can arrive before deletes, so `PieceLayer` removes by row id.
- **`hidden` vs CSS `display`:** any element with a CSS `display` rule needs its own `[hidden] { display: none }` rule (`.home-form`, `#round-targets`).
- **Bash heredocs** mangle backticks and quotes. Edit TS with the Edit or Write tools, or a Python script written to the scratchpad.
- **Browser pane:**
  - It shares tabs with the user; use `?slot=N` per tab and close tabs afterwards.
  - Real-time phases outrun the tools, so use long phases plus `skip_phase`.
  - `confirm()` dialogs block, so stub `window.confirm` when testing Load or Delete.
- **Free tier:** Maincloud pauses when idle. Open the site about 2 minutes before a demo.

## Key files
- **`spacetimedb/src/`:**
  - `schema.ts`, `index.ts`
  - `rounds.ts`: phases, the showcase, scoring
  - `friends.ts`, `builds.ts`: reducers and visibility filters
  - `islands.ts`, `accounts.ts`: helpers and presence
  - `logic/`: shared rules: `pieces` (layers), `scoring` (combos), `plots` (battle boards), `islands` (`cellKey`), …
- **`src/net/`:** `island.ts` (board-filtered piece subscription), `queries.ts` (`myBuildBoard`, `shownBoard`, `tileContents`)
- **`src/game/game.ts`:** the board on show, private building, Esc
- **`src/ui/`:** `home.ts` (tabbed menu), `friends.ts`, `builds.ts`, `hud.ts` (live score), `battle.ts` (preview and vote), `results.ts`
