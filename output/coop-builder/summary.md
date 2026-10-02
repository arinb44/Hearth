# Coop Builder: Implementation Summary

**Prepared by:** Coop Builder Agent
**Date:** 2026-10-04
**Status:** Partially complete. Every planned feature (plan revisions 1–6) is built and tested. Two checks still need real hardware: a real phone, and about 10 human players on separate devices at once.

## 1. Overview
Coop Builder is a low-poly 3D multiplayer building game for the MHacks "Best use of Spacetime" track. SpacetimeDB is the entire backend:
- **Tables** hold every account, island, player, piece, round, vote, result, friendship and saved build (19 tables).
- **Reducers** make every change, inside server-validated transactions.
- **Scheduled reducers** drive each island's round clock and the battle showcase.
- **Unique columns** settle races (one piece per tile and layer).
- **An event table** feeds the activity stream.
- **A per-user view** delivers each player's recovery code only to them.
- **Client visibility filters** keep friend requests, friendships and saved builds private to their owners.
- **Filtered subscriptions** give each client only its island, and during a battle only its own board.

Players make an account (username plus recovery code), add friends, and play on the shared Main Island or on islands of their own, with up to 10 players per island. Each round is picked by a live lobby vote:
- **Co-op round:** everyone builds together on a theme. There are no objectives: every piece scores 1 point, or 2 with its combo partner (bridge by water, lamp or bench by a path, well or flowers by a house, fence by greenery, wall by a tower, fireflies over greenery). Stars come at 25, 50 and 100 points.
- **Build Battle:** each builder works on a private, island-sized board. Then every screen tours the builds in sync, and everyone votes for the best one.

The client (TypeScript, Three.js, Kenney CC0 models) runs on laptops and on phones held sideways:
- 17 piece kinds. Fences, walls, paths, water and bridges join their neighbours, and fireflies can float over other pieces.
- A personal time of day and fog.
- An Esc menu with tabs for islands, friends, builds and profile.

- **Play:** https://arinb44.github.io/SpacetimeDemoMHacks/
- **Database dashboard:** https://spacetimedb.com/coop-builder-mhacks

## 2. Requirements Checklist
| # | Requirement | Status | Note |
|---|---|---|---|
| 1 | All shared state in SpacetimeDB; changes only through reducers | Done | 19 tables; the client never mutates state locally |
| 2 | Join with a name and color; identity survives reload | Done | Accounts (req. 18) replaced the nickname prompt; `?slot=N` for several players in one browser |
| 3 | Live movement, interpolated, validated by the server | Done | Token-bucket speed limit plus island bounds; prediction with snap-back |
| 4 | Place, rotate and remove with server rules and feedback | Done | Shared rules in `logic/pieces.ts`; toasts on rejection |
| 5 | Same-tile race produces exactly one winner | Done | Unique `cell_key` (island, board, layer, tile); sync tests with 8 and 6 clients |
| 6 | Rounds driven by scheduled reducers; clients agree on the countdown | Done | One-shot `phase_timer` per island; stale timers ignored; server-clock offset |
| 7 | Co-op rounds, live progress, server score, results | Done | Revision 6: themes and combo scoring replace the challenge checklists (req. 26–27) |
| 8 | Feed and effects from an event table | Done | `activity`, with a board column so private battle builds stay private |
| 9 | 10 concurrent players without visible lag | Partial | 10 bots on Maincloud: 0 errors, round trip p50 29 ms; not yet tried with 10 real devices |
| 10 | Laptops and phones (landscape) | Partial | Phones checked in emulation only (including the new menu at 740×360) |
| 11 | Reconnect keeps identity and current state | Done | Sync test; automatic reload with backoff; you return to your island |
| 12 | Maincloud free tier plus a public URL; no paid services | Done | `coop-builder-mhacks` and GitHub Pages |
| 13 | Consistent low-poly look | Done | Kenney models, sky, clouds with shadows, waves, connected pieces, day/dusk/night, glow |
| 14 | Unit and sync tests pass | Done | 134 passing (101 unit, 33 sync) |
| 15 | README: setup, run, deploy, join, credits | Done | Also covers architecture, admin controls and the demo script |
| 16 | Lobby theme vote and player ideas | Done | Live tally, one idea per player, random tie-break |
| 17 | Build Battle with voting | Done | Revision 6: private boards plus a showcase tour (req. 28) |
| 18 | Accounts with recovery codes | Done | Case-insensitive unique usernames; a code moves the account to a new device and is replaced |
| 19 | Profile and stats | Done | Rounds, wins, pieces placed |
| 20 | Islands | Done | Main Island plus up to 3 per account; 10 players each; per-island rounds; filtered subscriptions |
| 21 | Friends with presence and Join | Done | Visibility filters; online status and island; ask-back accepts |
| 22 | Saved builds | Done | Up to 10 per account, owner-only; load on your own island in the lobby; player islands don't auto-start |
| 23 | Navigation between main screen and island | Done | Menu button and Esc (req. 29) |
| 24 | Fireflies stack on non-buildings | Done | Overlay layer; buildings refuse them with a message |
| 25 | Stone Wall joins towers | Done | Connected model drawn in code |
| 26 | Co-op without objectives; nothing stops building until time is up | Done | No checklist, no early finish; reach and the post-time pause stay (user's choice) |
| 27 | Combo scoring | Done | Approved table; live score card; combos on the results |
| 28 | Private battle boards and a synced tour | Done | Your own board only while building; Showcase phase steps every client through each build |
| 29 | Escape menu | Done | Back to game, Exit to main menu; tabs Islands (live status), Friends, Builds, Profile |

## 3. Changes Made
All in `spacetime-market\`, built on the repo's existing README and LICENSE.
- **Server module (`spacetimedb/src/`):**
  - `schema.ts`: tables.
  - `index.ts`: reducers, lifecycle hooks, admin controls, the recovery-code view.
  - `rounds.ts`: per-island phase machine, round choice, scoring, the battle showcase and tally.
  - `islands.ts`, `accounts.ts`: helpers, including presence.
  - `friends.ts`, `builds.ts`: reducers and visibility filters.
  - `logic/`: pure shared rules: `grid`, `movement`, `players`, `pieces`, `challenges` (themes), `scoring` (combos), `phases`, `themes`, `plots` (battle boards), `islands`, `accounts`, `friends`, `builds`.
- **Client (`src/`):**
  - `game/`: game wiring (board on show, private building), local player, builder.
  - `scene/`: world, avatars, pieces (layers), model library, connected models (fences, walls, paths, water, tiles, bridges), glow, effects.
  - `net/`: connection, island subscription (board-filtered pieces), queries, clock, reconnect.
  - `ui/`: main screen and menu with tabs, friends, builds, HUD with live score, lobby, battle vote with preview, results, palette, settings, feed, toast.
  - `module_bindings/`: generated.
  - Removed in Revision 6: the 8×8 battle plots (`scene/plots.ts`).
- **Assets:** 22 Kenney CC0 GLB models, a colormap and the license files in `public/assets/models/`.
- **Tests:** 12 unit files and 9 sync files in `tests/`.
- **Tooling:** `scripts/spacetime.mjs`, `scripts/bots.ts`, the Pages workflow, env files, and Vite, Vitest and Prettier config.
- **Docs:** `README.md`, plus `output/coop-builder/` (agent definition, plan revisions 1–6, decisions, progress, this summary).

## 4. How to Use / Run
- **Play:** open the Pages URL and create an account. Then:
  - Press Play on the Main Island, or make your own island.
  - Walk with WASD or the joystick. Pick pieces from the palette and click a tile; right-click removes.
  - Esc opens the menu.
- **Local development:**
  ```bash
  npm install
  cd spacetimedb && npm install && cd ..
  npm run stdb:start            # local SpacetimeDB on port 3000
  npm run stdb:publish:local
  npm run dev                   # http://localhost:5173
  ```
- **Deploy:** `spacetime login`, then `npm run stdb:publish` (a breaking schema change needs `-- --delete-data=always`). Every push to `main` redeploys Pages.
- **Admin (publisher identity):** `spacetime call coop-builder-mhacks skip_phase <island> | reset_game <island> | configure_timing <lobby> <build> <scoring> <voting> <results> <showcase>`.
- **Load test:** `npm run bots -- --count 9 --target maincloud --seconds 60`.
- **Demo script:** see the README.

## 5. Testing
- **Command:** `npm test` (unit, then sync; the sync tests need a local server).
- **Final results:** 134 passed, 0 failed (101 unit, 33 sync).
- **Covered:**
  - Every pure rule: grid, movement, names, placement and stacking, wall joins, battle boards and showcase order, every combo, stars, timing, theme tally, islands, accounts, friends, builds.
  - Multi-client sync on real SDK clients:
    - movement, the same-tile race on each layer, rounds and combo scoring
    - accounts and recovery, island isolation
    - friends: visibility to a third account and to a late subscriber, presence and Join
    - saved builds: owner-only, load restoring every client's board
    - a full private battle: one board per subscription while building, the synced showcase, votes, the winner
- **Not covered by automated tests:** rendering and touch input. These were checked by hand in the browser with two tabs, plus an emulated phone layout.

## 6. Commits
| Hash | Message |
|---|---|
| `807d92e` | chore: scaffold SpacetimeDB module and Three.js client |
| `8cf2d7d` | feat: add live player presence and synced movement |
| `103355a` | feat: add shared building with server-validated placement |
| `dfeaf30` | feat: add timed co-op rounds driven by scheduled reducers |
| `7c80c3f` | feat: add lobby theme vote, player ideas, and Build Battle mode |
| `0cc6ead` | chore: add GitHub Pages deploy, Maincloud config, and load-test bots |
| `bebfd79` | feat: polish visuals with Kenney low-poly models and scene effects |
| `d452336` | feat: add landscape phone support with touch controls |
| `aa1f820` | feat: join fences and paths with neighbours; auto-reconnect |
| `7a2e862` | feat: add environment effects, new pieces, and sectioned palette |
| `e70df6f` | feat: add accounts with recovery codes and a main screen |
| `b286649` | feat: add islands with separate boards, rounds, and subscriptions |
| `ce66b91` | feat: add friends, presence, and saved builds |
| `07c03f9` | docs: describe friends and saved builds; plan revision 6 |
| `917bf28` | feat: stack fireflies over pieces and add connecting stone walls |
| `d4cc0a3` | feat: score co-op rounds by pieces with combo multipliers |
| `8f1f9b9` | feat: private battle boards with a synced showcase tour |

All are authored as `arinb44`, with no AI markers. The M9d commit (Escape menu) and the docs commit for this summary come next, each with approval.

## 7. Decision Log
Full log: `decisions.md`.
- **Game and stack:**
  - A co-op builder in low-poly 3D, with walking avatars and prefab pieces.
  - A TypeScript module on Maincloud's free tier.
  - Plain TypeScript, Three.js and Vite on the client; Kenney CC0 assets; GitHub Pages.
- **Rounds:**
  - Lobby theme vote with player ideas.
  - Co-op rounds now have no objectives and use combo scoring.
  - Build Battles use private boards and a showcase tour.
  - Only the Main Island auto-starts rounds.
- **Social:**
  - Username plus recovery code accounts.
  - Multiple islands.
  - Presence stored on the public account row (friends see online status and island).
  - Saved builds that load on your own island in the lobby.
- **Building:** fireflies stack on non-buildings; stone walls join towers; the reach limit stays.
- **Operations:**
  - Repo-local identity `arinb44`; planning docs committed.
  - Maincloud republished with `--delete-data` when the schema changed (only test data was there).
  - Pushes held back until the matching Maincloud publish.

## 8. Known Issues & Next Steps
- **Real-device checks are still needed:** a real phone in landscape, and a session with about 10 real players.
- **Battle privacy is client-side.** The official client only subscribes to its own board while building, but a modified client could still request other boards. Enforcing it would need a phase-aware visibility filter.
- **Presence is public.** Anyone can see whether a username is online and which island it's on (a choice made for simplicity and low cost).
- **Breaking schema changes wipe the live database,** including any accounts players made.
- **Maincloud free tier:** the database pauses when idle, so open the site about 2 minutes before a demo.
- **Generated typings** call unique indexes range indexes; `src/net/queries.ts#pieceAt` works around this.
- **Moderation:** ideas and names are cleaned and length-limited, but there is no profanity filter.
- **Possible follow-ups:** a QR code to join, a spectator camera, sound effects, and code-splitting the ~810 KB bundle.
