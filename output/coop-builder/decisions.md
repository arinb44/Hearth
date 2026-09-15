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
