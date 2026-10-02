# Decisions: coop-builder

| Date | # | Decision | Options considered | User's choice |
|---|---|---|---|---|
| 2026-10-04 | — | Project root | MHacks folder / new subfolder | New subfolder `MHacks\spacetime-market` |
| 2026-10-04 | — | Game type | Real-time arena / territory painting / co-op builder | Co-op builder |
| 2026-10-04 | — | Art style | Neon / pastel / pixel art / low-poly 3D | Low-poly 3D |
| 2026-10-04 | — | Hosting for the demo | Maincloud / laptop LAN / tabs on one machine | Players' own devices; module on Maincloud free tier |
| 2026-10-04 | — | Server module language | Keep C++ / TypeScript / Rust | TypeScript (switched from C++ to cut toolchain risk) |
| 2026-10-04 | — | Build model | Voxel blocks / prefab pieces on terrain / both | Prefab pieces on terrain |
| 2026-10-04 | — | Presence | Walking avatars / floating cursors | Walking avatars |
| 2026-10-04 | — | Devices | Laptops only / laptops and phones | Laptops and phones |
| 2026-10-04 | — | Game loop | Free sandbox / timed build challenges / sandbox + world events | Timed build challenges |
| 2026-10-04 | — | Testing | Vitest + sync test / Vitest only / manual | Vitest + multi-client sync test |
| 2026-10-04 | — | Commits | Conventional Commits / short imperative; `main` / feature branch | Conventional Commits on `main` |
| 2026-10-04 | — | GitHub repository | (user supplied) | `https://github.com/arinb44/SpacetimeDemoMHacks` |
| 2026-10-04 | D1 | Client stack | Plain TS + Three.js + Vite / React + react-three-fiber | Plain TS + Three.js + Vite (recommendation) |
| 2026-10-04 | D2 | Movement sync model | Client prediction + server-validated positions / server-authoritative tick | Client prediction + server-validated positions (recommendation) |
| 2026-10-04 | D3 | Challenge scoring | Objective targets on the server / player voting / both | Objective targets computed on the server (recommendation) |
| 2026-10-04 | D4 | Board between rounds | Clear each round + `round_result` / persistent island | Clear the board each round; keep results in `round_result` (recommendation) |
| 2026-10-04 | D5 | 3D asset source | CC0 packs / shapes built in code / Blender-made | CC0 packs (Kenney / Quaternius); each download still needs approval (recommendation) |
| 2026-10-04 | D6 | Frontend hosting | GitHub Pages / Netlify or Vercel / laptop | GitHub Pages via Actions (recommendation); the user enables Pages in repo settings |
| 2026-10-04 | D7 | Git setup with existing remote commit | Build on `origin/main` / clone and move docs | `git init`, add `origin`, fetch, local `main` on top of `origin/main` (recommendation); exact commands still confirmed before running |
| 2026-10-04 | D8 | Who starts rounds | Anyone + 30 s auto-start / host only / automatic loop | Any player presses Start; auto-start after 30 s (recommendation) |
| 2026-10-04 | — | Game title / database name | (plan open question 3) | "Coop Builder" / `coop-builder-mhacks` (recommendation) |
| 2026-10-04 | — | Challenge themes | (plan open question 4) | Agent drafts 3–4 themes in M3 for user approval |
| 2026-10-04 | D9 | Commit `output/coop-builder/` docs to the repo? | Commit / keep local | Commit them |
| 2026-10-04 | — | Commit identity | Global `arinb45` / repo-local `arinb44` | Repo-local `arinb44` (`323401710+arinb44@users.noreply.github.com`); global config untouched; commands confirmed before running |
| 2026-10-04 | — | Tool installs (M0) | Agent installs / user installs | Agent installed Node.js 24.19.0 (winget) and SpacetimeDB CLI 2.10.2 (official script) with approval |
| 2026-10-04 | — | Git setup (D7 commands) | — | Approved and run: `git init -b main`, add `origin`, fetch, `main` tracks `origin/main` at `1c99efa` |
| 2026-10-04 | — | Building phase length | 90 / 120 / 180 s | 120 s (recommendation); lobby auto-start 30 s, scoring 4 s, results 12 s |
| 2026-10-04 | — | Challenge themes | Approve drafted 4 / tweak | Keep the 4 drafted co-op challenges, and add a popular-theme pick plus player ideas that others compete on |
| 2026-10-04 | D10 | How the theme is chosen | Lobby vote / host picks / random | Live lobby vote (recommendation) |
| 2026-10-04 | D11 | How player-idea battles are judged | Plots + everyone votes / host judges / co-op then rate | Personal plots (3×3 of 8×8) + everyone votes, not for their own plot (recommendation) |
| 2026-10-04 | D12 | What gives way for the extra ~2 h | Trim polish / use buffer / drop phones | **Drop phone support** (user's choice; recommendation was trim polish). Requirement 10 and success criteria updated; M5 removed |
| 2026-10-04 | — | Publish to Maincloud | Publish / hold | Published as `coop-builder-mhacks` after the user's `spacetime login` |
| 2026-10-04 | — | Local DBs owned by the lost local identity | Wipe local data / new local DB names | Wipe local server data (recommendation); dev + test DBs recreated |
| 2026-10-04 | D5 | 3D assets for M6 | Kenney CC0 packs / refine procedural | Kenney CC0 packs (recommendation); downloads approved individually |
| 2026-10-04 | — | Restore phone support (we were ahead of schedule) | Restore M5 / laptops only | Restore phones: M5 back after M6; requirement 10 and success criteria reinstated |
| 2026-10-04 | — | Phone orientation | Portrait / landscape | **Landscape** (user request). Portrait shows a rotate card; Android tries fullscreen + orientation lock (iOS cannot lock) |
| 2026-10-04 | — | Compact UI: collapse the assets | (user request) | Collapsible piece palette: the toggle shows the current piece; starts collapsed on compact layouts and re-collapses after a pick; expanded by default on large desktops; Turn/Remove stay visible |
| 2026-10-04 | — | Fences do not join at intersections; paths should connect | (user request) | Connection-aware rendering (client only): each fence/path tile draws arms toward same-kind neighbours (post + rails / dirt patch), reusing the Kenney wood and dirt materials; lone pieces keep their rotation |
| 2026-10-04 | — | Environment effects + new pieces + menu subheadings | (user request) | Personal Day/Dusk/Night and fog (Off/Light/Heavy), saved per device; cloud shadows; stars; lamp halos and fireflies glow at night. New pieces: Water, Stone Tile, Bridge, Grass, Fireflies, Bench, grouped by fit: Buildings (House, Tower, Well, Bridge), Greenery (Tree, Pine, Flowers, Grass), Furniture (Fence, Lamp, Bench), Environment (Path, Stone Tile, Water, Rock, Fireflies) |
| 2026-10-04 | — | Collapse each palette section | (user request) | Accordion: each section folds into one button; one open at a time; the section of the current piece opens |
| 2026-10-04 | — | Water squares not merging | (user report) | Fill the corner between two arms when the diagonal tile connects too (water banks and paths); redraw all 8 neighbours |
| 2026-10-04 | — | Ship the environment round before accounts | Ship now / hold | Ship now (recommendation): Maincloud republish + commit `7a2e862` |
| 2026-10-04 | — | Accounts | Username + recovery code / SpacetimeAuth / password | Username + recovery code (recommendation) |
| 2026-10-04 | — | Joining friends | Multiple islands / one shared island | Multiple islands (recommendation) |
| 2026-10-04 | — | Saved data | Profile & stats / friends / saved builds / last island | Profile & stats, friends list, saved builds |
| 2026-10-04 | — | When to ship M8a | Commit + push now / commit only, ship after M8c | Commit only (`e70df6f`); publish to Maincloud and push after M8c (recommendation) |
| 2026-10-04 | — | M8b island design details | (agent, within the approved plan) | A shared **Main Island** (created in `init`, owner account 0) plus up to 3 islands per account; anyone (even a guest) may enter, only accounts may create. 10 online players per island. Ownership by account id, so it survives account recovery. `player.island_id` (0 = main screen); leaving an island or moving withdraws your votes, but your idea stays. A player who reconnects is still on their island, and the client goes straight back in. `island.player_count` is recounted by every reducer that moves a player. Admin `skip_phase` / `reset_game` now take an island id |
| 2026-10-04 | — | Local dev DB needs a breaking publish | Wipe and republish / keep it and use `coop-builder-preview` | Wipe and republish (user's choice, recommended); browser checks had run against `coop-builder-preview` until then |
| 2026-10-04 | — | After M8b | Continue with M8c / stop here | Stop here (user's choice); handoff written to `output/coop-builder/handoff.md` |
| 2026-10-04 | — | Start M8c | Continue / stop | Continue (user resumed from `handoff.md`) |
| 2026-10-04 | — | Where friends' presence comes from | Presence columns on public `account` / private `my_friends` view | `online` + `islandId` on `account`, updated only on connect, disconnect and island changes (never on movement); the client joins it with `friendship` and `island` (recommendation). Anyone can see whether a username is online and which island it is on |
| 2026-10-04 | — | Saved builds vs. the round wipe and 30 s auto-start | No auto-start on owned islands / loading pauses auto-start / leave as is | Only the Main Island auto-starts rounds; player-owned islands stay in the Lobby until someone presses Start, so a loaded build stays. Starting a round still clears the board (D4) (recommendation) |
| 2026-10-04 | — | Commit M8c | Commit / not yet | Commit |
| 2026-10-04 | — | When to ship M8a–M8c | Ship now / after Revision 6 | Ship now: Maincloud republish with `--delete-data` (live DB held only test/bot data) and push `main` (recommendation) |
| 2026-10-04 | — | Revision 6: Build Battle on a private island | Private full board + tour / private board + browse / private 8×8 plot | Each builder gets a private full 24×24 board (others hidden); at Voting everyone is shown each build in turn (~10 s each), then votes (recommendation) |
| 2026-10-04 | — | Revision 6: "don't stop building unless time is up" | Only the early finish / remove reach / bigger reach | Only the early finish goes (with the objectives); the 4.5-tile reach and the pause after time is up stay (recommendation) |
| 2026-10-04 | — | Plan Revision 6 (stacking, Stone Wall, combo scoring, private battles + tour, Escape menu) | Approve / approve with the 8×8 battle fallback | Approve as written, including the combo table and stars at 25/50/100 |
| 2026-10-04 | — | Docs commit | Commit and push / commit only / not yet | Commit and push |
| 2026-10-04 | — | Fireflies aimed at a building (found in the M9a browser check) | Rotate the building (old click rule) / show why it can't stack | Show the "can't share a tile with a building" message (agent fix within the approved plan; the old rule turned towers silently) |
| 2026-10-04 | — | Commit M9a | Commit locally / not yet | Commit locally; push with the Revision 6 Maincloud publish (pushing earlier would deploy a client the live schema can't serve) |
| 2026-10-04 | — | Local databases during Revision 6 | Wipe and republish as needed / ask each time | Wipe and republish local preview and dev DBs (`coop-builder-r6`, `coop-builder-m8c`, `coop-builder-preview`, `coop-builder`) as needed; Maincloud still needs its own approval |
| 2026-10-04 | — | Commit M9b | Commit and continue / commit and stop / not yet | Commit locally and continue with M9c |
| 2026-10-04 | — | Commit M9c | Commit and continue / commit and stop / not yet | Commit locally and continue with M9d |
| 2026-10-04 | — | Commit M9d and the ship docs | Commit / not yet | Commit both |
| 2026-10-04 | — | Ship Revision 6 | Publish and push / push nothing yet | Maincloud republished with `--delete-data=always` (approved; live data wiped), then push `main` |
| 2026-10-04 | — | Refreshed handoff after Revision 6 | Commit and push / keep local | Commit and push |
