# AGENTS.md — entry point for an AI agent working in this repository

This is the machine-readable entry point (OpenCode reads it automatically). It is a **map, not a
duplicate**: every fact is owned by a document below. Read this top-to-bottom before touching
anything, then follow the pointer for the topic at hand.

Human-oriented twin: [`docs/HANDOVER.md`](docs/HANDOVER.md). Current state: [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md).

## 1. What this project is

An **independent, non-official browser remake / fork** of Arknights' seasonal auto-chess tower-defense
mode **卫戍协议：盟约 / Stronghold Protocol: Alliance** — solo, or **1–4 player co-op** (no PvP).

- Node server (lobby, economy, rounds, validation) + browser client (native ES modules).
- The battle is simulated **deterministically in each player's browser** from the same code the
  server ships; the server only owns the lobby, economy, rounds and validation.
- **Mainline project (主线项目)**: [`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol). We are a **branch project (分支项目)** forked from the mainline and **periodically merge it selectively**; our code, the design doc, the data pipeline and the asset manifest all start there.
- Licence: our code is **GPL-3.0-or-later**; all Arknights art/audio/text/data is © Hypergryph /
  Yostar and is **NOT** GPL — non-commercial fan project, remove on request of the rights holders.
  See [`NOTICE.md`](NOTICE.md).

## 2. The one operational rule (get this right or lose work)

This repository lives on **two of the owner's machines**, in **two different layouts** — work out which one
you are in before committing:

| layout | machine | what it is | `.git` |
|---|---|---|---|
| **two-tree** | the owner's **desktop** (`D:\DOTK`) | a **git store** plus a byte-for-byte **mirror** the app runs from | store `D:\DOTK\_merge-scratch` (branch `ours`); dev tree `D:\DOTK\Stronghold-Protocol` (no `.git`) |
| **single-tree** | the owner's **laptop** (`D:\Git本地库\stronghold-protocol-secondary-development-download`; the `masai` commits) | **one tree** that is both the store and the run tree | `.git` at its root, branch `master` |

Both are the same repository, and `tools/push-gitee.mjs` derives both roles from its own location: the store's
`ours` ↔ the single checkout's `master`. **On the laptop, read every `D:\DOTK\...` path below as
*store ↔ this checkout*, *dev tree ↔ this checkout*.** Quick check: `git rev-parse --abbrev-ref HEAD` prints
`ours` on the desktop and `master` on the laptop.

The table below is the **desktop (two-tree)** layout:

| tree | role | `.git` |
|---|---|---|
| `D:\DOTK\_merge-scratch` | **the git store — the single source of truth** (history *and* committed files; branch `ours`) | **yes** |
| `D:\DOTK\Stronghold-Protocol` | **the working project — a byte-for-byte mirror of the store**; the app runs here | **no** |

- **Commit, merge and push in the store.** The dev tree follows.
- The direction is **one-way: store → remotes → dev tree**. `tools/push-gitee.mjs` **never** overwrites
  the store with the dev tree (`--from-dev` is the explicit, off-by-default reverse sync).
- Inside the store, `.cache`, `public/assets`, `public/fonts` and `public/vendor` are **junctions into
  the dev tree** — the ~600 MB of art lives in one copy. **Never delete the dev tree on its own**, and
  do not `rmdir` the store's `public/assets`.
- Verify the mirror without copying anything (run inside the store; empty output = in sync):
  ```powershell
  git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
  ```
- **Stage only your own paths** (`git add -- <paths>`); the store is shared and may hold unrelated work.
  Work on your own branch/worktree and rebase onto the latest `ours` before you push.

## 3. Where to look things up

| I need … | go to |
|---|---|
| what this is / how to run / player features | [`README.md`](README.md) |
| **start here for anything** — repo map, run, build, test, merge, deploy, traps | [`docs/HANDOVER.md`](docs/HANDOVER.md) |
| **where are we now** — deployed build, env switches, backups, known issues | [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) |
| **a topic → doc → code-file index** | [`docs/QUERY-INDEX.md`](docs/QUERY-INDEX.md) |
| which file implements what (code map) | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) · [`docs/DEV-GUIDE-ZH.md`](docs/DEV-GUIDE-ZH.md) |
| the **normative game rules** | [`docs/DESIGN.md`](docs/DESIGN.md) → [`docs/design/`](docs/design/) (current) + [`docs/history/`](docs/history/) (per-release) |
| the **battle engine** (units, buffs, damage, hooks, skills) | [`docs/SIM.md`](docs/SIM.md) |
| the **match/meta engine** (rounds, economy, 联防, views) | [`docs/META.md`](docs/META.md) |
| **generated game data** (`data/*.json` fields) | [`docs/DATA.md`](docs/DATA.md) |
| **assets** (sources, layout, manifest, battle-fx) | [`docs/ASSETS.md`](docs/ASSETS.md) · the official FX format: [`docs/design/vfx-format.md`](docs/design/vfx-format.md) |
| **difficulty model** | [`docs/BALANCE.md`](docs/BALANCE.md) |
| **languages / i18n** | [`docs/I18N.md`](docs/I18N.md) |
| player-facing rules guide (中文) | [`docs/PLAYING.md`](docs/PLAYING.md) |
| **our fork-only mechanisms** (must survive merges) | [`docs/OUR-FEATURES.md`](docs/OUR-FEATURES.md) |
| the **decision record** §0–§49 (accounts, matchmaking, the 8 custom operators, community; the file opens with a 目录) | [`docs/MATCHMAKING.md`](docs/MATCHMAKING.md) |
| **upstream merge log** + the never-merge list (§0) | [`docs/UPSTREAM-MERGES.md`](docs/UPSTREAM-MERGES.md) |
| **is there new upstream work, and what will it conflict with** (run before every merge) | `node tools/check-upstream.mjs` (`npm run check:upstream`) |
| add a **custom operator** (end-to-end recipe, 中文) | [`docs/NEW-OPERATOR.md`](docs/NEW-OPERATOR.md) |
| author **content** (bonds / strategies / bounty enemies / CODEX / 3D themes) | [`docs/CONTENT-AUTHORING.md`](docs/CONTENT-AUTHORING.md) |
| **how we work**: research → change → merge → push → deploy | [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) |
| **deployment** (firewall, autostart, reverse proxy, Docker) | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| zero-install **Windows portable bundle** | [`docs/WINDOWS.md`](docs/WINDOWS.md) |
| the **content-pack** format | [`docs/PACKS.md`](docs/PACKS.md) |
| official-data **research** (machine-readable) | [`docs/research/00-INDEX.md`](docs/research/00-INDEX.md) |
| release history | [`CHANGELOG.md`](CHANGELOG.md) |

## 4. Run, build and verify

```powershell
# run — in the RUN tree (desktop two-tree layout: the dev tree D:\DOTK\Stronghold-Protocol; laptop single-tree: the checkout itself)
cd <this checkout>              # e.g. D:\DOTK\Stronghold-Protocol  or  D:\Git本地库\stronghold-protocol-secondary-development-download
node server/index.js            # http://localhost:3000  (npm run dev = --watch)
#   admin: http://localhost:3000/admin?token=<var/admin-token.txt>
#   health: GET /healthz    read-only public API: GET /online/api

# verify — where `.git` + node_modules are (desktop: the STORE; laptop: the checkout itself;
#          the full suite needs .git, so it cannot pass in a git-less dev tree)
cd <the same directory as above, or D:\DOTK\_merge-scratch on the desktop>
node tools/build-data.mjs --offline     # must leave data/ byte-for-byte unchanged
node --test                             # the whole suite  (~6828 registered cases, 7193 with loops; 15 skipped on the desktop store; 0 fail — §4)
node tools/kit-coverage.mjs --missing   # every chess has a kit, every skill covered (must be empty)
node tools/i18n.mjs check en --strict   # English UI pack complete (0 missing, 0 errors)
node tools/doctor.mjs                   # environment diagnosis (exit 0)
node tools/check-upstream.mjs           # new mainline work + predicted conflicts + §0 never-merge hits
node tools/check-delivery.mjs --live    # the asset chain + the cache-first path, against the live site
```

- **Dev-tree caveat:** `test/docs-paths.test.js` and `test/package.test.js` shell out to `git ls-files`,
  so they **cannot pass in the git-less dev tree** and always fail there. Run the full suite in the store.
- More gates: `npx eslint .` · `npm run check:imports` · `npm run typecheck` · `npm run ci` (local CI mirror).
- Browser / E2E suites are opt-in: `SP_E2E=1`, `SP_REAL_E2E=1`, `RENDER_E2E=1`, `SIM_E2E=1`.
- **Docs guards** (keep green for any docs change):
  `node --test test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js`.

## 5. Publishing and deploying

- **Publish (every change)**: the **art relay first** — `node tools/push-assets-relay.mjs` deploys
  `123.57.150.185`, the box clients load art from first ([`docs/ASSETS.md`](docs/ASSETS.md) "The relay") — then
  `node tools/push-gitee.mjs -m "what changed"` — commits what *you*
  staged in the store → pushes to the **`github` primary** → the **`gitee` mirror** (fast-forward,
  never forced) → mirrors the store's tracked files into the dev tree.
  Remotes: `github` = primary, `gitee` = 国内镜像, `origin` = the **mainline** (`sganggs/Stronghold-Protocol`, not ours).
- **Credentials are never in the repo** — GitHub uses the owner's credential helper / `GITHUB_TOKEN`;
  Gitee uses `marseille1` + a personal token via `GITEE_USERNAME` / `GITEE_TOKEN`. Never commit a token.
- **Deploy (only when the owner says so)**: notice-first runbook in [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) (d).
  Push a signed in-game notice (`sign: d星空之下`) → wait ~30 s → upload the delta → restart only if
  `server/**` or `shared/**` changed → verify `/healthz`.

## 6. Guardrails — stop and ask the owner (d星空之下 / owner-keyed)

- **Never deploy / restart production / change env, the admin token or the firewall without an explicit go-ahead.**
  The standing instruction is 先不上线 (do not deploy) unless the owner asks.
- A change that would drop anything in [`docs/OUR-FEATURES.md`](docs/OUR-FEATURES.md), or re-add anything
  in the **never-merge list** ([`docs/UPSTREAM-MERGES.md`](docs/UPSTREAM-MERGES.md) §0), is a stop-and-ask item.
- **Golden corpus**: any change that moves a stored number in `test/golden/*.json` must be **attributed**
  (revert only your change → zero diff), then regenerated in its own commit. Never hand-edit golden output,
  never loosen an engine guard to make it pass.
- **Never hand-edit `data/*.json`** — change `tools/build-data.mjs` and rebuild offline.
- Commit messages: one line, what changed, with the issue number; **no** `Co-Authored-By:` / `Generated with`
  trailers (the maintainers' convention).
