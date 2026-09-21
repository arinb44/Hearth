# Plan: coop-builder

## Project Title
**Coop Builder:** a low-poly 3D multiplayer game where up to 10 players race the clock to complete building challenges together. All shared state and game logic run in SpacetimeDB.

## Objective
Build a browser game where up to 10 players on laptops join a shared low-poly island. They walk around as avatars and place prefab pieces (houses, trees, rocks, paths, and so on) on a tile grid. Each round runs in one of two modes, chosen by a live lobby vote:
- **Co-op Challenge:** everyone builds together toward a preset target list, and the server scores the result.
- **Build Battle:** a popular theme or a player-submitted idea. Each builder works in a personal plot, then everyone votes for the best build.

SpacetimeDB is the entire backend:
- Every player, piece, round, timer and score is a table row.
- Every action is a server-validated reducer.
- Round timing runs on scheduled reducers.
- Every client renders only what its live subscriptions deliver.

The module is hosted on the Maincloud free tier, and the static web client is hosted for free.

## Requirements
1. **State in SpacetimeDB.** All shared game state lives in SpacetimeDB tables: players, avatar positions, pieces, game phase, timers, scores and activity events. Clients change state only by calling reducers, never locally.
2. **Joining and identity.** A player joins with a nickname and is given a color. Their identity survives a page reload through a stored auth token. The player list shows who is online, live.
3. **Live movement.** Each player's avatar movement appears on every other client, interpolated so it looks smooth. The server rejects positions outside the island and movement faster than the speed limit.
4. **Building.** Players place, rotate and remove pieces on the tile grid. The server enforces: inside bounds, one piece per tile, a valid piece kind, and the phase rules. Rejected actions show visible feedback on the client.
5. **Race on the same tile.** When several players place on the same tile at the same moment, exactly one placement succeeds, the others are rejected, and every client converges on the same state.
6. **Rounds run on the server.** Co-op rounds go Lobby → Building (120 s countdown) → Scoring → Results → Lobby. Battle rounds go Lobby → Building → Voting → Results → Lobby. Every transition is driven by scheduled reducers. All clients show the same phase, and countdowns agree within about 1 second.
7. **Co-op challenges and scoring.** There are four preset challenges, each a theme plus targets: Cozy Village, Forest Camp, Castle Lookout, Flower Park.
   - Live target progress is visible to everyone.
   - The server computes the team score: up to 100 for target completion, plus up to 50 time bonus when every target is met early, which ends the round right away.
   - The results screen shows the score and what each player contributed.
8. **Activity feed.** Feed entries and placement effects ("Sam placed a House") come from an event table (new in 2.0), not from client-side guesses.
9. **10 players.** 10 concurrent players on Maincloud with no visible lag. Verified with a 10-bot script plus real devices.
10. **Laptops and phones.** On laptops: WASD to move, mouse to place and remove, keys to rotate and select pieces. On phones, played in **landscape**: a touch joystick, tap to place, Turn and Remove buttons, and a piece palette. Holding a phone upright shows a 'turn your phone sideways' card; Android also gets fullscreen with a landscape lock. Must work in current Chrome, Edge and Safari, including iOS Safari and Android Chrome. *(Dropped on 2026-10-04 for Build Battle, then restored the same day because the schedule was well ahead.)*
11. **Reconnecting.** A client that drops and reconnects sees the correct current state and keeps its identity.
12. **Hosting.** The module runs on the Maincloud free tier and the client is reachable at a public URL. No paid services.
13. **Look and feel.** A consistent low-poly look: one palette, sky and lighting, soft shadows, simple animations.
14. **Tests.** Vitest unit tests cover the game rules. An automated sync test with several clients covers convergence, the same-tile race, rounds and reconnecting. All tests pass.
15. **README.** Covers setup, local development, deployment, how players join, and asset credits.
16. **Lobby theme vote and player ideas.**
    - In the Lobby, every player can vote (one vote each, changeable) for the next theme: the 4 co-op challenges, popular battle themes (Haunted Forest, Royal Castle, Zen Garden, Seaside Village, Tiny Town), or player ideas.
    - Any player can submit one free-text idea (cleaned up, at most 40 characters), and it becomes a vote option for everyone.
    - The tally updates live on every client. When the round starts (Start button or 30 s auto-start), the most-voted option wins, and the server breaks ties at random.
17. **Build Battle.**
    - The island splits into 9 plots (3×3, each 8×8 tiles), and each builder is assigned one at round start.
    - If a player's idea won, its author **hosts**: they don't build, but they vote. Players beyond 9 builders spectate and vote.
    - During Building, players can only place pieces in their own plot (enforced by the server).
    - Then comes a 25 s **Voting** phase: each player votes for one plot that isn't their own, and can change the vote.
    - The server tallies the votes. The most votes wins, and ties share the win. The results show winners and vote counts.

## Scope
**In scope**
- A new project in `spacetime-market\`: the TypeScript SpacetimeDB module, the TypeScript + Three.js web client, tests, a bot script, deployment config and the README.
- One shared world with a repeating round loop, in two modes (Co-op Challenge, Build Battle), plus a lobby theme vote and player ideas.
- Laptop controls (keyboard + mouse).
- Publishing to Maincloud and to a free static host.

**Out of scope**
- Moderation of player-submitted ideas beyond cleanup and the length limit.
- Paid services, accounts with passwords (SpacetimeDB's anonymous identity plus a nickname is used instead), and chat.
- Multiple simultaneous lobbies or rooms, matchmaking, and saving worlds between rounds (unless decision D4 chooses that).
- C++, Rust or C# modules. AI or third-party APIs.
- Anything outside `spacetime-market\`. The existing `LICENSE` in the repo is left unchanged.

## Technical Approach

### Architecture
```
 Browser (laptop)                              SpacetimeDB on Maincloud (free tier)
 ┌───────────────────────────┐   WebSocket     ┌───────────────────────────────────────┐
 │ Three.js scene            │ ◄─subscriptions─│ tables: player, piece, game_state,    │
 │  renders ONLY from the    │                 │         activity (event), phase_timer │
 │  client cache (conn.db.*) │ ──reducers────► │ reducers: join, set_name, move,       │
 │ Input → reducer calls     │                 │   place_piece, rotate_piece,          │
 │ HUD (HTML/CSS overlay)    │                 │   remove_piece, start_round           │
 └───────────────────────────┘                 │ scheduled: advance_phase (one-shot)   │
   static host (free)                          │ lifecycle: init, client_connected,    │
                                               │   client_disconnected                 │
                                               └───────────────────────────────────────┘
```
- **The server has final say.** Every rule is checked inside reducers, which run as transactions. The clients only display state.
- **Movement uses client prediction (see D2).** The local avatar moves immediately on screen. The client sends `move(x, z, heading)` at about 10 Hz, and only while the avatar is actually moving. The server clamps the position to the island and to the maximum speed allowed for the time since the last update. Other clients interpolate smoothly between updates.
- **Round timing lives entirely in the database.** `game_state` stores the current phase and `phase_ends_at`, a server timestamp. A one-shot row in the `phase_timer` schedule table fires `advance_phase` when the timer runs out. Clients draw the countdown from `phase_ends_at`, corrected by an estimated offset between their clock and the server's. No client controls the timing. The `advance_phase` reducer only accepts calls from the scheduler: it rejects any call where `ctx.sender` is not the database's own identity.
- **One piece per tile, guaranteed by the database.** Each piece row stores `tile_key = x * GRID + z`, and that column is marked `.unique()`. Two players placing on the same tile at the same moment cannot both succeed, because the database transaction rejects the second one. That gives requirement 5 a clean, demoable story.
- **Event table for effects.** Reducers insert rows into `activity` (declared with `event: true`). Clients handle each new row to update the activity feed and play effects. This follows the 2.0 replacement for broadcast reducer callbacks.

### Data model (draft; finalized in M1)
| Table | Key columns | Notes |
|---|---|---|
| `player` (public) | `identity` (PK), `name`, `color`, `online`, `x`, `z`, `heading`, `last_move_at`, `pieces_placed` | One row per identity; `online` flips on connect/disconnect |
| `piece` (public) | `id` (PK autoInc), `tile_key` (unique), `tile_x`, `tile_z`, `kind`, `rotation` (0–3), `placed_by`, `placed_at`, `round` | Board state |
| `game_state` (public) | `id` = 0 (singleton), `phase` (enum), `round`, `challenge_id`, `phase_started_at`, `phase_ends_at`, `team_score` | Drives HUD and round flow |
| `round_result` (public) | `round` (PK), `challenge_id`, `team_score`, per-target breakdown | Results screen and history |
| `activity` (public, **event**) | `kind`, `actor`, `text`, `tile_x`, `tile_z` | Feed and effects; not stored long-term |
| `phase_timer` (schedule) | `scheduled_id`, `scheduled_at`, `round`, `phase` | One-shot timer that fires `advance_phase`; ignored if the round or phase has already moved on |
| `config` (public) | singleton: lobby / build / scoring / voting / results seconds | Round timing; only the admin can change it |
| `admin` (private) | `identity` | The publisher's identity, recorded in `init`; can change timing, skip a phase, reset |
| `idea` (public) | `id`, `author` (unique), `author_name`, `text` | Player-submitted battle ideas, one per player |
| `theme_vote` (public) | `voter` (PK), `option` (e.g. `challenge:0`, `battle:2`, `idea:17`) | Live lobby vote |
| `plot` (public) | `builder` (PK), `plot_index` (unique) | Battle plot assignment for the current round |
| `plot_vote` (public) | `voter` (PK), `plot_index` | Battle voting |

The `game_state` row also gets `mode` (Coop / Battle), `theme_title`, `challenge_id`, an optional `host`, `phase_started_at`, an optional `phase_ends_at`, and `team_score`. The `Phase` enum adds `Voting`.

Piece kinds and challenge definitions are typed constants in `spacetimedb/src/logic/`. Each challenge has a theme, a target list such as "≥ 4 houses, ≥ 6 trees, 1 well, every house next to a path", and a time limit.

### Pure logic shared with tests
`spacetimedb/src/logic/*.ts` (grid, pieces, movement, challenges, scoring, phases) holds plain TypeScript functions that do **not** import `spacetimedb/server`. The reducers call these functions. Vitest tests them directly. The client imports the same constants (piece catalog, grid size, speed limit) so the two sides never disagree.

### Client (see D1)
- Built with Vite, plain TypeScript and Three.js.
- `net/` sets up the connection and stores the auth token in `localStorage`.
- `scene/` contains the terrain, water, sky and lights; avatars with interpolation; piece meshes with object pooling; a ghost preview for placement; and particle effects.
- `input/` handles desktop controls (WASD, mouse raycast to pick a tile, Q/E to rotate, 1–9 to pick a piece, right-click to remove).
- `ui/` is an HTML/CSS overlay: join screen, challenge card, countdown, team score, player list, activity feed, piece palette, results screen, quality toggle.
- The database URI and name come from Vite environment variables: `VITE_STDB_URI`, plus `VITE_STDB_DB`, the database name.

## Files Affected
All files are new except the two already in the repo.

| Path | Reason |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.prettierrc`, `.env.example` | Client build, test and format setup |
| `spacetimedb/package.json`, `spacetimedb/tsconfig.json` | Server module package (scaffolded by the `spacetime` CLI) |
| `spacetimedb/src/index.ts` | Schema, reducers, lifecycle and scheduled reducers |
| `spacetimedb/src/logic/{grid,pieces,movement,challenges,scoring,phases}.ts` | Pure, unit-tested game rules shared with the client |
| `src/main.ts` | Client entry point and app wiring |
| `src/net/connection.ts` | `DbConnection` setup, token storage, subscriptions, reconnect |
| `src/scene/{world,terrain,avatars,pieces,effects,quality}.ts` | Three.js rendering |
| `src/input/{desktop,pointer}.ts` | Keyboard movement and mouse tile picking |
| `spacetimedb/src/logic/{challenges,scoring,themes,plots,phases}.ts` | Co-op challenges and scoring, theme vote options and tally, battle plots, phase timing |
| `src/ui/{hud,lobby,results,battle}.ts` | Countdown + challenge checklist, theme vote and ideas, results screen, plot labels and voting |
| `src/ui/{join,hud,palette,feed,results}.ts`, `src/ui/styles.css` | HTML overlay |
| `src/module_bindings/**` | **Generated** by `spacetime generate`; never edited by hand |
| `public/assets/**`, `public/assets/CREDITS.md` | Low-poly models, if D5 picks downloaded CC0 assets |
| `tests/unit/*.test.ts` | Vitest rule tests |
| `tests/sync/*.test.ts` | Multi-client sync tests against local SpacetimeDB |
| `scripts/bots.ts` | 10-bot load and rehearsal script (local or Maincloud) |
| `.github/workflows/pages.yml` | Only if D6 picks GitHub Pages |
| `README.md` | **Modified:** expands the existing one-line README |
| `LICENSE` | Unchanged |

## Dependencies
Each one is installed only after you approve it. Nothing paid.

| Item | Why |
|---|---|
| **Node.js LTS** (via `winget install OpenJS.NodeJS.LTS`) | Runs the client tooling, the tests and the module build (Node 18+ required; LTS includes the built-in `WebSocket` the Node test clients need) |
| **SpacetimeDB CLI** (official Windows installer from spacetimedb.com) | Local server, build, publish, generating bindings |
| `spacetimedb` (npm) | Server module library (`spacetimedb/server`) and TypeScript client SDK |
| `three`, `@types/three` | 3D rendering |
| `vite`, `typescript` | Client dev server and bundler |
| `vitest` | Unit and sync tests |
| `tsx` | Runs `scripts/bots.ts` |
| `prettier` (dev) | Formatting, per the coding standards |
| *(Possibly)* CC0 low-poly model packs, e.g. Kenney or Quaternius | Better visuals, depending on D5; each download needs your OK |

**You must do one step yourself:** `spacetime login` opens a browser sign-in for Maincloud. I can't enter credentials, so you run that command once.

## Testing Strategy
- **Unit tests (Vitest), `npm run test:unit`.** Grid bounds and `tile_key`. Placement validation (occupied tile, invalid kind, wrong phase). Movement clamping (bounds, speed limit). Phase transitions. Challenge scoring for each target type, including edge cases (empty board, over target, adjacency rules).
- **Sync tests (Vitest + Node SDK clients), `npm run test:sync`.** These publish the module to a throwaway local database (`spacetime publish --delete-data`), then connect several real clients through the generated bindings and check that:
  1. Joining and moving show up on every client.
  2. N clients placing on the **same tile** at once produce exactly one piece and errors for the rest, with identical client caches afterwards.
  3. Many distinct placements from many clients at once are all present on every client.
  4. A short full round (Lobby → Building → Scoring → Results) gives every client the same phase, the same `phase_ends_at` and the same score.
  5. A reconnect with the saved token keeps the identity and sees current state.
  6. Theme vote: ideas and votes show up on every client, and Start picks the most-voted option.
  7. A short Build Battle round: plots are assigned, building outside your own plot is rejected, the host can't build, the voting tally lands in `round_result` with the correct winner, and nobody can vote for their own plot.

  The sync tests shorten round timing through the admin-only `configure_timing` reducer. The test setup calls it with the CLI (publisher) identity, and auto-start is turned off so rounds never start in the middle of other tests.

  The sync tests need a local server started with `spacetime start`. If none is running they **fail loudly**; they never skip silently.
- **`npm test`** runs both suites. Results, with pass and fail counts, are reported after every milestone.
- **Load and rehearsal (manual, M4 and M7).** `npm run bots -- --count 10 --target maincloud` moves bots around and has them build, while I watch for lag and errors in `spacetime logs`. Then a check with several laptops and tabs.

## Milestones
Time estimates total about 11.5 hours with a small buffer. **Cut line:** M0–M4 give a working, deployed game with both modes. M6–M7 add polish and hardening, and get trimmed first if time runs short.

| # | Milestone | Ends with (working + tested) | Est. |
|---|---|---|---|
| **M0** | **Setup:** install Node and the CLI (approved), set up git on top of the existing `main` (D7), scaffold the module and the Vite + Three.js client, add Vitest and Prettier, run one smoke test | `npm test` runs; local server works; empty scene renders | 0.75 h |
| **M1** | **Presence and movement:** `player` and `game_state` tables, lifecycle reducers, `join` / `set_name` / `move`; client connects, saves its token and renders the island with placeholder avatars; local prediction plus interpolation of others | Unit tests (movement) and sync tests 1 and 5 pass; two browser tabs see each other move | 1.5 h |
| **M2** | **Building:** piece catalog, `place_piece` / `rotate_piece` / `remove_piece` with the unique `tile_key`; palette, ghost preview, raycast tile picking; `activity` event table driving the feed and effects | Unit tests (placement) and sync tests 2 and 3 pass | 1.5 h |
| **M3a** | **Round engine + co-op challenges:** phase state machine on one-shot scheduled reducers, `config`/`admin` tables, the 4 challenges, server scoring with early completion, `round_result`; HUD with countdown, live challenge checklist, results screen | Unit tests (phases, scoring) and sync test 4 pass | 1.75 h |
| **M3b** | **Theme vote + Build Battle:** `idea`/`theme_vote` tables and lobby vote UI; battle mode with `plot` assignment, plot-only building, plot labels, `Voting` phase with `plot_vote`, winners in `round_result` | Unit tests (plots, tally, battle rules) and sync tests 6–7 pass | 2 h |
| **M4** | **Deploy:** environment config, publish to Maincloud (after your `spacetime login`), frontend on the free host (D6), README; 10-bot run against Maincloud | Public URL plays end to end; bots run without errors | 1 h |
| — | *Cut line: demoable game with both modes* | | |
| **M5** | **Phones (restored 2026-10-04), landscape only (user request):** touch joystick, tap to place, Turn/Remove tools, rotate-to-landscape card, compact landscape HUD, low-power rendering | Tested on a phone-sized viewport and a laptop together | 1.25 h |
| **M6** | **Visual polish:** final low-poly assets (D5), lighting, water, particles, avatar walk cycle, results celebration | Looks consistent on laptops | 1.5 h |
| **M7** | **Demo hardening:** reconnect UX, cleanup of idle and offline players, host-only reset / skip-phase reducer, full rehearsal (10 bots + devices), demo script in the README | All tests pass; rehearsal checklist done | 0.75 h |

Each milestone ends with: tests run and reported → list of changed files and a Conventional Commit message → commit after your OK → push to `arinb44/SpacetimeDemoMHacks` (`main`) after your OK.

## Decision Points
I'll ask about these with options and a recommendation. D1, D2, D5, D6 and D7 shape M0–M2, so I'll ask about them right after this plan is approved.

| # | Decision | Options (my recommendation first) |
|---|---|---|
| D1 | Client stack | **Plain TS + Three.js + Vite** (simplest, full control over performance) / React + react-three-fiber (uses `spacetimedb/react` hooks, more abstraction) |
| D2 | Movement sync model | **Client prediction + server-validated position updates** (smooth, cheap) / server-authoritative input with a server tick (strictest, but needs a ~20 Hz scheduled tick, which costs more energy and adds input latency) |
| D3 | Challenge scoring | **Objective targets computed on the server** (counts, adjacency) / players vote at the end / both |
| D4 | Board between rounds | **Clear the board each round, keep results in `round_result`** / one persistent island where each round adds to it |
| D5 | Where the 3D assets come from | **CC0 packs (Kenney / Quaternius GLB)** (best look, needs downloads) / shapes built in code (no downloads, plainer) / Blender-made assets (custom, slowest) |
| D6 | Frontend hosting | **GitHub Pages via Actions on your repo** (free; you enable Pages in repo settings) / Netlify or Vercel free tier (needs an account) / served from your laptop (risky on venue Wi-Fi) |
| D7 | Git setup with the existing `README.md` + `LICENSE` commit | **`git init`, add `origin`, fetch, and build local `main` on top of `origin/main`** (keeps your commit, no force-push) / clone the repo into a fresh folder and move the docs over |
| D8 | Who starts rounds | **Any player presses "Start" in the lobby, with an auto-start after 30 s if anyone is present** / host only (first player) / fully automatic loop |
| D9 | Commit the `output/coop-builder/` docs to the repo? | Commit them / keep them local (add to `.gitignore`) |
| D10 | How the theme is chosen | **Live lobby vote** (chosen) / host picks / random |
| D11 | How player-idea battles are judged | **Personal plots + everyone votes** (chosen) / host judges / co-op build then rate |
| D12 | What gives way for the extra ~2 h | **Drop phone support** (chosen; reversed later the same day because the schedule was ahead) / trim polish / use buffer |

## Risks & Limitations
- **SpacetimeDB 2.0 is new.** TypeScript modules and event tables are recent features, so details in the docs may not match the installed version. *Mitigation:* scaffold from the official template, build against the generated bindings, and check behavior in M0–M1 before building on it.
- **Maincloud free tier:**
  - Databases **pause after inactivity**, and the first connection wakes them up. *Mitigation:* open the game a few minutes before judging.
  - The exact energy cost per reducer is unknown (the free tier gives 2,500 TeV per month). *Mitigation:* movement updates only while moving, at about 10 Hz; no server tick; measure during the bot run.
- **Venue network.** Hackathon Wi-Fi or cell latency can make movement look jumpy. Interpolation hides most of it. Confirmed reads are on by default in 2.0, which adds a little latency; client prediction keeps local movement instant.
- **Player ideas are free text shown to everyone.** *Mitigation:* cleanup, a 40-character limit, one idea per player, and an admin `reset` reducer. No profanity filter (out of scope).
- **Low-end laptops.** Shadows can cost frame rate. *Mitigation:* shared geometry, a small grid (24×24), a pixel-ratio cap.
- **Clock skew** between laptops and the server could shift countdowns. *Mitigation:* use server timestamps plus an estimated offset; never let the client decide when a phase ends.
- **Time budget.** About 12 hours solo for a 3D game is tight. *Mitigation:* the cut line, with both modes deployed first; M6 polish shrinks before anything else.
- **Windows tooling.** Installers might need a new terminal for `PATH` changes or admin rights. I'll report errors rather than work around them.
- **Existing remote commit.** It must be built on, not overwritten. Never force-push.

## Open Questions
1. Is it OK to install **Node.js LTS** and the **SpacetimeDB CLI** at the start of M0? I'll show each command before running it.
2. Can you run **`spacetime login`** yourself when we reach M4? It's a browser sign-in for Maincloud.
3. **Game title and Maincloud database name?** Suggestion: title "Coop Builder" (or your pick), database `coop-builder-mhacks` (it must be available on Maincloud).
4. Any **challenge themes** you want, e.g. "Cozy Village", "Lighthouse Harbor", "Forest Camp"? Otherwise I'll draft 3–4 for you to approve in M3.

---
**Status:** Revision 1 approved on 2026-10-04 (D1–D8 per recommendations). **Revision 2 approved on 2026-10-04.** **Revision 4 (2026-10-04, user requests):** environment effects (personal day/dusk/night and fog, cloud shadows, stars, glow), six new pieces (Water, Stone Tile, Bridge, Grass, Fireflies, Bench), categorized palette with collapsible sections, and connected fences/paths/water. **Revision 3 (2026-10-04, chosen by the user):** phone support restored (requirement 10, M5 back after M6); M6 uses Kenney CC0 packs (D5). It adds a lobby theme vote, player ideas and Build Battle (requirements 16–17, M3b; D10–D11), and drops phone support (requirement 10, M5 removed; D12).
