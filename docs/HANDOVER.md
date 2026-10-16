# HANDOVER — read this first

Audience: **the next maintainer** of this project, human or AI agent. This is the entry point: read it
top-to-bottom and you can run, change, verify, merge and (when the owner says so) deploy this fork safely.
For a topic → file lookup table, use [`docs/QUERY-INDEX.md`](QUERY-INDEX.md); for the machine entry point,
[`AGENTS.md`](../AGENTS.md).

It is an **orientation + map**, not a duplicate. Where a topic needs detail it points at the owning
document — the authoritative sources are, in order: [`docs/DESIGN.md`](DESIGN.md) (the design index —
current rules in [`docs/design/`](design/), per-release revisions in [`docs/history/`](history/)),
[`docs/MATCHMAKING.md`](MATCHMAKING.md) (the fork's decision record, §1–§47),
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (the operational contract — research → change → merge → push →
deploy), [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) (the repository map) and
[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) (what is ours and must survive an upstream merge).

> **Status today (2026-10-14).** Version `0.4.0` (single source: `package.json` /
> `shared/constants.js APP_VERSION` / `CHANGELOG.md`, pinned by `test/version.test.js`). **Everything is in
> sync at `d5a6412c`**: the store's `ours` (in a single-tree checkout: `master`) == `github/master` ==
> `gitee/master`, and production serves the same content (spot-checked 2026-10-14: the live
> `/js/*`, `/shared/clip.js`, `/shared/scene.js`, `/sw.js` were byte-identical to the tree). The owner's
> instruction is **先不上线 — do not deploy** unless the owner explicitly asks (the 2026-10-14 deploy was
> such a request). Other agents may be working in the same repository at the same time: work on your own
> branch/worktree, commit only your own paths, and rebase onto the latest `ours` (or `master`) before you
> push.

---

## 0. The 10-minute cheat sheet

```powershell
# THE TWO MACHINES — use the one you are on (details in §2):
#   laptop  — ONE tree: .git at the root, branch `master`, remotes `github` (primary) + `gitee`
#             D:\Git本地库\stronghold-protocol-secondary-development-download
#   desktop — TWO trees: the store D:\DOTK\_merge-scratch (branch `ours`) + the git-less run tree
#             D:\DOTK\Stronghold-Protocol
# Every D:\DOTK\... path in these docs assumes the desktop; on the laptop translate them as
# store <-> this checkout, dev tree <-> this checkout.

# 1. Run it locally
cd D:\Git本地库\stronghold-protocol-secondary-development-download
node server/index.js            # http://localhost:3000   (npm run dev = --watch)
#    admin: http://localhost:3000/admin?token=<contents of var/admin-token.txt>
#    the dev pages (3D board, sim check) live under /dev/, e.g. /dev/render-demo.html?scene=prep&stage=act1autochess_m01&board=3d

# 2. Verify (this checkout has .git + node_modules, so the whole suite runs here)
node tools/build-data.mjs --offline   # must leave data/ byte-for-byte unchanged
node --test                            # the full suite (~6670; 0 failures on the desktop store — the laptop's environment-only failures are explained in PROJECT-STATE.md §9)
node tools/kit-coverage.mjs --missing  # every chess has a kit, every skill covered
node tools/i18n.mjs check en --strict  # English UI pack complete
node tools/doctor.mjs                  # environment diagnosis, exit 0
node tools/check-upstream.mjs          # is there new mainline work, and what will it conflict with
node tools/check-delivery.mjs --live   # the asset chain + the cache-first path, against the live site

# 3. Publish — THE ART RELAY FIRST, then the two mirrors (owner's order, 2026-10-14)
node tools/push-assets-relay.mjs       # deploys 123.57.150.185, the box every client loads art from first
node tools/push-gitee.mjs -m "what changed"
```

**If you only remember one thing:** clients load their art from **the relay** (`docs/ASSETS.md` "The relay"), so publish
there **before** the mirrors — a push deploys it. Everything else in these docs that mentions the store / dev tree pair
still applies on the owner's machine; in a single checkout the two are the same directory.

### 接手清单 — taking this over (first afternoon)

| # | do this | expect |
|---|---|---|
| 1 | Read **this file**, then [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) (the one-page state) and [`docs/QUERY-INDEX.md`](QUERY-INDEX.md) (question → doc → file) | ~30 minutes; you now know where everything is |
| 2 | `npm install` then `node server/index.js` | <http://localhost:3000> serves; `GET /healthz` returns the version + build hash |
| 3 | `node --test` (needs `.git` + `node_modules`) | 6670 tests / 6655 pass / **0 fail** / 15 skipped on the desktop store (2026-10-14); the laptop sees 4 **environment-only** failures, explained in `PROJECT-STATE.md` §9 — read that before chasing a red run |
| 4 | `node tools/doctor.mjs`, `node tools/kit-coverage.mjs --missing`, `node tools/i18n.mjs check en --strict` | exit 0 / no gaps (the gates in §5) |
| 5 | `node tools/check-delivery.mjs --live` | the asset chain order + cache-first, measured in a real browser (needs the live site reachable) |
| 6 | Read §9 (the traps) **before** touching rendering, assets or deployment | each row is a mistake that already cost a debugging session |

**The three things not to break:** the **licence** (§1), the **one-way** store → remotes → run-tree direction (§2, never
`--from-dev` by accident), and **relay-first** publishing (§0, §8). Everything else is negotiable with the owner.

---

## 1. What this project is

An **independent, non-official web remake / fork** of Arknights' seasonal auto-chess tower-defense mode
**卫戍协议：盟约 / Stronghold Protocol: Alliance**, played in the browser: solo, or **1–4 player co-op**
(no PvP). The battle is simulated **deterministically in each player's browser** from the same code the
server ships; the Node server only owns the lobby, the economy, the rounds and validation, so one small
host can run it.

- **Mainline project (主线项目)** — [`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol).
  We are a **branch project (分支项目)** forked from the mainline: our code base, design document, data pipeline
  and asset manifest all start there. We credit it and **periodically merge it** (selectively — §7). It is
  **not** the same project as ours, and it is where the game's own issues are tracked.
- **This fork's own additions** (ours, absent from upstream — see [`docs/OUR-FEATURES.md`](OUR-FEATURES.md)):
  - **Eight custom shop operators** (自造干员) injected by `CUSTOM_CHESS` in `tools/build-data.mjs`:
    阿斯卡纶, 结城理, 予愿安洁莉娜, 望, 澄闪, 娜仁图亚, 凯尔希·思衡托, 克莱门莎. Their decision record is
    [`docs/MATCHMAKING.md`](MATCHMAKING.md) §23–§37; the recipe is [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md).
  - **Server-side accounts + matchmaking + spectator/seat-takeover AI + the `/admin` page** (a `node:sqlite` DB).
  - **The lobby community**: 更新日志 (changelog) / bug提交 (bug reports) / 公开房间 (public-room directory)
    and a room text chat that is **deliberately never persisted**.
  - **Server-backed match statistics** (owner-keyed; caps are 2× the mainline's).
  - **The two-tier battle-effect system** (a mandatory procedural tier + an optional local-client art tier).
  - The **Japanese voice dub** (`audio.voiceJp`), a set of carried rule decisions, and the deploy/notice workflow.
- **Two repositories, two roles** (`git remote -v` in the store):

  | remote | role | URL |
  |---|---|---|
  | `github` | **PRIMARY** (main distribution) | `github.com/dxingkongzhixia/stronghold-protocol-secondary-development-download` |
  | `gitee` | **国内下载镜像** (mirror for mainland China) | `gitee.com/marseille1/stronghold-protocol-secondary-development-download` |
  | `origin` | the **mainline** (`sganggs/Stronghold-Protocol`), not ours | `github.com/sganggs/Stronghold-Protocol` |

  Both our remotes receive the store's branch `ours` as their `master`. `push-gitee.mjs` pushes the
  primary first, then the mirror (fast-forward only, never forced).

### Licence / copyright — do not get this wrong
- **Our own code is GPL-3.0-or-later** ([`LICENSE`](../LICENSE)); third-party components keep their own
  licences ([`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md)).
- **All Arknights art, audio, text and data are © Hypergryph / Yostar and are NOT covered by the GPL.**
  This is a **non-commercial fan project**; the runtime art is redistributed in this (public) repository
  as a community convenience **by the owner's explicit decision**, and must be removed on request of the
  rights holders. Full terms: [`NOTICE.md`](../NOTICE.md).

---

## 2. Layout — where the repo is, and the store/mirror convention

This repository is checked out on **two of the owner's machines**, in two different layouts.

**The laptop** — one tree, which is also the run tree:

| path | role | `.git` |
|---|---|---|
| `D:\Git本地库\stronghold-protocol-secondary-development-download` | **the repository and the run tree** — history, files and the running app | **yes** (branch `master`; remotes `github`, `gitee`) |
| `D:\Git本地库\stronghold-protocol-mainline` | the **mainline project at `488db49f`** (v0.2.6, the commit we last folded in) — a read-only reference to open side by side | a **worktree** of the checkout above (`.git` is a file; no second object store) |

The reference checkout needs no network and costs nothing to keep: the mainline's history is already inside our
repository (the `aec85c5d` merge brought it in), so it is materialised from what we have with
`git worktree add --detach D:\Git本地库\stronghold-protocol-mainline 488db49f`. Note it carries **no `public/assets`**
(the mainline does not commit art), so it is for reading and diffing, not for running.

The comparison worth making is usually not the two folders but **our whole delta against upstream**:

```powershell
git diff --stat 488db49f HEAD -- server/ public/js/    # 137 files, +13512 / -3006 as of 2026-10-15
git diff 488db49f HEAD -- server/sim/skills.js         # one file, side by side
git log --oneline 488db49f..HEAD                       # every fork commit on top of v0.2.6
```

When the mainline moves (`node tools/check-upstream.mjs` says so), fetch it **through the proxy** and re-point the
worktree — `SP_UPSTREAM` overrides the URL if the mainline ever moves:

```powershell
git fetch https://github.com/sganggs/Stronghold-Protocol.git master
git worktree remove D:\Git本地库\stronghold-protocol-mainline
git worktree add --detach D:\Git本地库\stronghold-protocol-mainline FETCH_HEAD
```

**The desktop** — the same repository kept as a **store + mirror pair**, which is what `tools/push-gitee.mjs` is
written for (it derives both trees from its own location; `SP_SCRATCH` / `SP_DEV_TREE` override). On the laptop,
translate *store ↔ this checkout*, *dev tree ↔ this checkout*, *branch `ours` ↔ `master`*:

| tree | role | `.git` |
|---|---|---|
| `D:\DOTK\_merge-scratch` | **the git store — the single source of truth** (history *and* the committed files; branch `ours`) | **yes** |
| `D:\DOTK\Stronghold-Protocol` | **the working project — a byte-for-byte mirror of the store**; the app runs here | **no** |

- Commit, merge and push **in the store**; the dev tree follows. The direction is **one-way: store →
  remotes → dev tree**. `tools/push-gitee.mjs` never overwrites the store with the dev tree
  (`--from-dev` is the explicit, off-by-default reverse sync).
- **Shared asset junctions (do not duplicate):** inside the store, `.cache`, `public/assets`,
  `public/fonts` and `public/vendor` are **junctions into the dev tree**
  (`public/assets -> D:\DOTK\Stronghold-Protocol\public\assets`), so the ~600 MB of art lives in **one**
  copy that both trees see. Consequences:
  - Deleting either tree must go through the junction-aware tooling — **do not delete the dev tree on its
    own**, and do not `rmdir` the store's `public/assets` thinking it is a copy.
  - Verify the mirror *without* copying anything:
    ```powershell
    # run inside _merge-scratch; empty output = the dev tree equals the store's HEAD
    git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
    ```

---

## 3. Where everything lives

Root layout (both trees are identical for every tracked file; §2 explains the shared asset junctions):

| path | one-line purpose |
|---|---|
| `server/` | the Node process: `index.js` entry, `http/` (static + `/ws` + `/healthz`), `net.js` (sessions), `lobby.js` (rooms/seats), `match/` (rounds, economy, views), `sim/` (the deterministic battle simulator, **shared verbatim with the browser**), `community.js` / `stats.js` / `auth.js` / `db.mjs` (our fork-only persistence). |
| `shared/` | ESM imported by **both** server and browser: `protocol.js` (the normative wire contract), `constants.js` (the version + global constants), `i18n.js`, `stats.js`, `bandBonds.js`, `standIn.js`, `diy.js`, `highGround.js`, `loadoutRecord.js`. |
| `data/` | **generated** game JSON (`chess.json`, `enemies.json`, `bonds.json`, `config.json`, `assets.json`, `i18n/*.json`, …). Never hand-edit; rebuild with `tools/build-data.mjs`. |
| `public/` | the browser client (native ES modules, no bundler): `js/screens/` (title→lobby→room→game), `js/ui/`, `js/render/` (PixiJS 2D + three.js 3D board), `css/`, `i18n/`, and the tracked asset trees `assets/`, `fonts/`, `vendor/`. |
| `tools/` | maintainer tooling: `build-data.mjs`, `fetch-assets.mjs` + `tools/assets/`, `local-extract/` (art from a local game client), `golden.mjs`, `i18n.mjs`, `kit-coverage.mjs`, `doctor.mjs`, `package.mjs` (release zips), `push-gitee.mjs` (the publishing helper). |
| `scripts/` | launch/install helpers: `start-windows.bat`, `start.sh`, `install-service-windows.ps1`, `make-windows-bundle.mjs`, `launch.mjs`. |
| `packs/` | content packs (language packs live under `public/i18n/`); [`docs/PACKS.md`](PACKS.md). |
| `types/` | JSDoc typedefs of the type-checked slice (`npm run typecheck`). |
| `test/` | `node:test` suites: `content/`, `sim/`, `match/`, `ui/`, `render/`, `e2e/`, `golden/` (stored digests), plus the root integration suites (including the doc guards). |
| `docs/` | this documentation set, plus `docs/design/` + `docs/history/` (the split design document), `docs/research/` (official-data research, machine-readable), `docs/img/`. |

### The documentation map (which doc covers what)

| doc | covers |
|---|---|
| [`README.md`](../README.md) | player/host facing intro: what it is, how to run, the fork's features, the doc index. |
| [`AGENTS.md`](../AGENTS.md) | machine entry point (OpenCode reads it): the one rule, the lookup table, the guardrails. |
| [`docs/HANDOVER.md`](HANDOVER.md) | **this file** — the entry point and map. |
| [`docs/QUERY-INDEX.md`](QUERY-INDEX.md) | **question → doc → code file** lookup table. |
| [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) | the one-page current state (中文): what's deployed, env switches, backups, known issues. Start here for "where are we now". |
| [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) | the repository map, build/data/asset pipeline, test running, the fork-only catalog pointer (English). |
| [`docs/DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | the same map in Chinese + recipes + an optimization list. |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | the code map: what runs where, the WebSocket protocol, the directory layout, data flow, safety nets. |
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | the operational contract: the request loop, merge discipline, commit/push, the **production deploy runbook**, and when to stop and ask the owner. |
| [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) | **fork-only mechanisms** (what is ours, where it lives, how to extend it, the tests that pin it, the merge "must not be lost" note). |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) | the **decision record** §1–§47 (accounts, matchmaking, the custom operators, the community surface, the merge blacklist §22, #488 §39.2, stats §40). |
| [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) | the chronological upstream-merge log + the **never-merge list (§0)** + the per-batch skip reasons. |
| [`docs/DESIGN.md`](DESIGN.md) → [`docs/design/`](design/) + [`docs/history/`](history/) | the normative game rules (index + current rules + per-release revisions). |
| [`docs/DATA.md`](DATA.md) | every `data/*.json` field and how it is generated. |
| [`docs/SIM.md`](SIM.md) | the battle engine reference (`server/sim`): units, buffs, damage, hooks, skills, professions. |
| [`docs/META.md`](META.md) | the match/meta engine (`server/match`): flow, effect registry, 联防, views, assumptions. |
| [`docs/ASSETS.md`](ASSETS.md) | asset sources, layout, the manifest, the battle-fx allow-list, licensing/credits. |
| [`docs/BALANCE.md`](BALANCE.md) | the difficulty model and how it was measured (official numbers, no custom tuning). |
| [`docs/I18N.md`](I18N.md) | languages: UI strings (`t()`), game texts, server messages, adding a language. |
| [`docs/PLAYING.md`](PLAYING.md) | the player-facing rules guide (中文). |
| [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) | the end-to-end recipe for adding a custom operator (中文). |
| [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | the content-authoring handbook: bonds / strategies / bounty enemies / the CODEX browser / the 3D-board theme colours + gotchas (中文). |
| [`docs/DEPLOY.md`](DEPLOY.md) | the deployment guide (firewalls, autostart, reverse proxy, Docker) — mostly the upstream host story; **our** production runbook is [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (d). |
| [`docs/WINDOWS.md`](WINDOWS.md) | the zero-install Windows portable bundle. |
| [`docs/PACKS.md`](PACKS.md) | the content-pack format and tooling. |
| [`docs/RELAY.md`](RELAY.md) | the external server-directory site we are listed on (not part of our deployment). |
| [`CHANGELOG.md`](../CHANGELOG.md) | the release history. |

---

## 4. How to run it locally

### Start the dev server
```powershell
cd D:\Git本地库\stronghold-protocol-secondary-development-download   # on the owner's machine: D:\DOTK\Stronghold-Protocol
node server/index.js        # http://localhost:3000   (npm start; npm run dev = --watch)
```

| thing | value |
|---|---|
| Port / bind | `3000` (`PORT` overrides); binds `::` (one dual-stack socket for IPv6 + IPv4). Set `HOST=127.0.0.1` behind a proxy. |
| Health | `GET /healthz` (app version + build hash + online count) |
| Admin page | `http://localhost:3000/admin?token=<var/admin-token.txt>` — the token is generated on first start, stored in `var/admin-token.txt` (git-ignored), and printed in the startup log. |
| Read-only public API | `GET /online/api` |
| Combat mode | `SP_COMBAT=client` (default: the browser simulates) or `server` (older: the server streams snapshots) |
| Verification | `SP_VERIFY=off\|sample\|all` — whether the server re-simulates client results |
| Asset cache pacing | `SP_ASSET_RATE_KBPS` (default `1200` ≈ 1.2 MB/s; `0` off) throttles server-side `/assets\|fonts\|vendor` bodies; `SP_ASSET_REF` pins the CDN-mirror git ref (`''` disables the mirrors) |
| Windows helper | `server-start.cmd` (sets `SP_VERIFY=sample`), `server-stop.cmd` |

**State is in memory**: rooms and matches vanish when the server restarts. The fork additionally
persists accounts / changelog / bug reports / match stats in `var/*.db` (SQLite) and bug images under
`var/bug-uploads/` (both git-ignored). The room text chat is **not** persisted (see §9).

### Prerequisites
- **Node.js 22 or 24** (`package.json` `engines` requires `>= 22`). `npm install` runs `tools/vendor.mjs`,
  which copies `pixi` / `preact` / `three` into `public/vendor/`.
- **The runtime art is tracked in the repo** (`public/assets`, `public/fonts`, `public/vendor`, ~600 MB),
  so a plain clone runs with **no fetch step**. `node tools/fetch-assets.mjs` is optional (refresh upstream art).

### Optional: local-client extraction (official 3D board, some UI/icons, some models, battle-fx textures, official scenes)
The game **runs without it**, with documented fallbacks (2D procedural board, near-look icons, recoloured
源石虫, token portraits). What only a real game client has is extracted by `tools/local-extract/`:

- **Python venv**: `.venv-extract\Scripts\python.exe` at the **repo root** (git-ignored). This machine:
  **Python 3.14.6 + UnityPy 1.25.4** (see `tools/local-extract/requirements.txt`; **Python 3.8 is too old**
  for the UnityPy build we use — do not point the tooling at an old system interpreter). Invoke the venv
  explicitly:
  ```powershell
  .venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "<…/StreamingAssets/AB/Windows>"
  .venv-extract\Scripts\python.exe tools\local-extract\extract.py --only spine/token
  .venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py --dub jp --voice-dir "<…\sound_beta_2\voice_cn>"
  ```
- **ffmpeg is not on `PATH` on this machine.** `extract-voice.py` therefore **must** be given `--ffmpeg "<path to ffmpeg.exe>"`.
- **Output / git rules** ([`docs/DEPLOY.md`](DEPLOY.md) §6, [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §3):

  | path | tracked? | meaning |
  |---|---|---|
  | `public/assets/local/**` | **committed** (the fork tracks `public/assets/**`) | the extracted local art that ships. |
  | `data/local-assets.json` | **git-ignored, per-machine** | this machine's extraction manifest. |
  | `data/local-assets.committed.json` | committed | the union manifest of the committed local art; `server/http/static.js` serves it when the per-machine one is absent, so a fresh clone still gets the official tier. Regenerate with `node tools/local-extract/committed-manifest.mjs`. |
  | `public/assets/local/scene/**` | **committed since 2026-10-14** (they were git-ignored; the owner lifted it so the CDN mirrors can serve the 74.8 MB scene bundles) | the 11 extracted official scenes; `.cache/official-scenes/` holds the downloaded bundles (still ignored). See §8. |

- **A clean clone / CI needs none of this**: `node tools/setup.mjs` offers to create the venv and extract;
  on a server without a client you can copy `public/assets/local/` + `data/local-assets.json` from the
  **same-version** full zip.

---

## 5. Build & verify

### Data: one command, deterministic, never hand-edit
```powershell
node tools/build-data.mjs             # regenerate data/*.json from the cached official tables + CUSTOM_CHESS
node tools/build-data.mjs --offline   # no network: deterministic rebuild check
node tools/build-data.mjs --refresh   # re-download the official tables first (fails loudly on a download error)
```
- **Offline byte-reproducibility rule:** `node tools/build-data.mjs --offline` must leave `data/`
  **byte-for-byte unchanged** (`git status data/` clean). If it drifts, the cache and the committed data
  disagree — fix it, don't hand-edit. The build report lands in `.cache/build-data-report.json`.
  `test/data.test.js` pins this.
- `data/tuning.json`, `data/emotes.json`, `data/assets.json`, `data/i18n/*.json` and `data/local-assets.json`
  are produced by other tools, not `build-data.mjs` (see [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §3).
- Fixed roster counts are asserted by `test/data.test.js` and a set of hard-coded assertions listed in
  [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) §5 — the build errors loudly if they drift.

### Tests
```powershell
node --test                              # the whole suite (the README's "约 N 项" tracks this; a guard checks it)
node --test test/sim/ test/match/        # the engine
node --test test/content/                # kits / enemies / bonds / items
node --test test/ui/                     # client logic
node --test test/data.test.js            # generated-data integrity + the offline rebuild
```
- **Dev-tree caveat:** `test/docs-paths.test.js` and `test/package.test.js` shell out to `git ls-files`, so
  they **cannot pass in the git-less dev tree** and always fail there. Run the full suite **in
  `_merge-scratch`** (or expect exactly those two to fail in `Stronghold-Protocol`). This is not a bug.
- Browser / E2E suites are **opt-in** (off in CI): `SP_E2E=1` (mock browser), `SP_REAL_E2E=1` (needs
  downloaded assets), `RENDER_E2E=1` (needs a local Chrome via `puppeteer-core`).
- The three doc guards you must keep green for **any docs change**:
  `node --test test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js`.

### The other gates
```powershell
node tools/kit-coverage.mjs --missing   # every chess has a kit and every skill is covered (must be empty)
node tools/i18n.mjs check en --strict   # the English UI pack is complete (0 missing, 0 errors)
node tools/doctor.mjs                   # environment diagnosis (Node, deps, assets, port, firewall); exit 0
npx eslint .                            # correctness-only lint (npm run lint): warnings allowed, errors not
npm run check:imports                   # import boundaries (server/sim may not touch match/lobby/node builtins)
npm run typecheck                       # the JSDoc-checked slice
npm run ci                              # tools/ci.mjs: lint + imports + data + tests, the local CI mirror
npm run check:upstream                  # the mainline: new commits, predicted conflicts, §0 hits (docs/UPSTREAM-MERGES.md)
npm run check:delivery                  # the asset chain + the cache-first path (--live adds two browser visits)
node tools/push-assets-relay.mjs --dry-run   # what publishing to the art relay would carry
```

### The golden corpus and its attribution discipline — non-negotiable
`test/golden/*.json` is a stored corpus of deterministic matches/simulations (`tools/golden.mjs`). It is a
regression net: any change that moves a stored number must be **explained**, not re-blessed.

1. Check: `node tools/golden.mjs` (or `npm run golden`; `GOLDEN_FULL=1` checks everything).
2. **Attribution rule before updating:** revert **only your change** (keep everything else) → `node
   tools/golden.mjs` shows **zero** diff; restore your change → the diff is **exactly** the scenarios you
   expect. Record the proof in your `docs/MATCHMAKING.md` section (see §35.1 for a worked example).
3. Only then `node tools/golden.mjs --update`, in its own commit, naming the scenarios that moved.
4. **Never hand-edit golden output. Never loosen an engine guard to make it pass.** A re-entrancy guard
   firing (`hookDepth:*`) is a **content** bug — fix the content (§35.6 is the precedent).

---

## 6. How to develop content

Two handbooks, both the authoritative recipes:

- **[`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md)** — a custom operator end to end: cache the official tables
  (with the §1.1 "minimal cache merge" trick when the cache predates the operator), add a `CUSTOM_CHESS`
  entry and rebuild, hand-write the kit, add art/voice, update the count assertions, record a
  `docs/MATCHMAKING.md` section. Worked examples: 阿斯卡纶 (§23) and 克莱门莎 (§37).
- **[`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md)** — new **bond**, new **strategy (band)**, new
  **bounty enemy / leader**, the **CODEX (资料库) browser**, the **3D-board theme colours**, and the
  gotchas. Every data field, the runtime handler, the tests and the CODEX wiring, per content type.

Key structural facts:
- **Kits**: one file per operator under `server/sim/content/kits/ops/`, registered in
  `server/sim/content/kits/index.js` (`KIT_FILES` / `STANDIN_KIT_FILES` / `OPERATOR_KIT_FILES`). Contract,
  naming and registration are in `server/sim/content/kits/README.md`, enforced by
  `test/content/kits_layout.test.js`. A kit that throws is logged and skipped (the chess falls back to the
  generic kit), so the server never breaks — but `kit-coverage.mjs --missing` will report it.
- **Content is two-sided** (`server/sim/content/index.js`): a **battle** side (`install(battle)`) and a
  **meta/prep** side (`registerMeta(registry)`). Never reach into engine internals; never use a random
  source other than `server/sim/rng.js`; illegal client input returns `{error, code}` and never throws.
- **Engine carve-outs** (add a flag in `professions.js` / `buffs.js`, not in a single kit): `stalker`,
  `dollkeeper`, `skywalker`, `traper` (+ `wangStone`), `funnel`, `loopshooter`, `watchman`, `primguard` —
  see [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §6.

### The battle-FX system: the official-effects runtime, then the two-tier fallback

Three layers, resolved **per client at render time** ([`docs/ASSETS.md`](ASSETS.md) "Battle effects",
[`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §9.1; the upstream design: [`docs/history/0.3.0.md`](history/0.3.0.md) §32 +
[`docs/design/vfx-format.md`](design/vfx-format.md) §33):

1. **Official battle effects — the primary path (upstream 0.3.0, in `master` since 2026-10-16).**
   `public/js/render/vfx/**` replays the official client's own effect **prefabs** (particle systems, materials,
   animators) for a unit's attacks, skills, talents, funnels, mount points and status loops. Its data is the fx
   extraction (`tools/local-extract/extract.py --only fx --fx-set used` → the per-machine `data/local-fx.json` +
   the committed art under `public/assets/local/fx/**`, index v3). Details that had to be right:
   a shot leaves the **muzzle bone at the attack clip's OnAttack frame** (`SpineActor.strikePose`), a
   projectile's `AdvancedMovement.comeBack` flies it back home (the 回环射手's recovery animation), and a
   talent's shield loop ends with the buff the sim reports (`TalentFx.status` + `talents.js` `LOOP_BUFF_BOUND`).
   - **Setting:** 官方特效 `auto | off | lite | full` (`settings.officialFx`, `OFFICIAL_FX_MODES`), shown only
     when this client has the fx manifest. Turned off, or without an extraction, the client lays nothing new
     out — the tiers below carry the battle as before.
   - **See it:** `public/dev/fx-viewer.html` — `?key=<prefab>`, `?attack=<opId>` (the wiring demo: casts,
     projectile, hits), `?skilldemo=<opId>&s=<slot>`. It draws the unit's Spine **with live bones** so an
     effect can be judged against the weapon; `&model=0` draws without the model (the headless browser suites
     pass it, and pin the static mount point).
   - **Deploy:** the fx art is committed, `data/local-fx.json` is **per-machine** and gitignored — a machine
     without it serves an empty fx list and the client falls back to the tiers below (extract there, or copy
     that file; [`docs/DEPLOY.md`](DEPLOY.md) / [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0).
2. **Procedural tier — mandatory fallback.** `public/js/render/fx/kinds.js` `FX_KINDS` (`a` + `c` + `r`) draws it at
   run time from the FX atlas. It is offline, needs no client, and is what a client without any local art
   sees. **Every kind must have one; a `local`-only kind is a bug.**
3. **Optional local-art tier (the fork's softer tier).** A kind's `local` spec (`{ group, layers: [{ name, scale? }], tint?, dur? }`,
   plus `bySkill` / `byOp` attribution) names official pictures in the local manifest;
   `public/js/render/fx/localart.js` resolves them and `simfx.js` draws them **only when the client lists
   every layer AND has loaded it**; otherwise the procedural tier is drawn. A listed-but-loading layer is
   prefetched, and **the fallback never touches the network — never a blank frame.**

**Caps and allow-lists** (so a bad pick never litters the board):
- **Size cap:** each drawn layer is an **in-place ground field at the anchor, scaled to ≈ one body** — the
  layer set's drawn radii (`r × layer.scale`) are scaled down together so the largest is at most
  `LOCAL_FX_MAX_R` = **1.1 tiles** (`localart.js`).
- **Picture allow-list: only soft in-place effect pictures** — the `flow` / `ray` / `glow` / `ring` /
  `star` / `light` / `smoke` / `aura` / `halo` families (`EFFECT_TEX`). Walls, decals, patterns and
  object/prop/icon-looking textures (`char_*`, `object_*`, `bg_*`, `pattern_*` …) are **never** used.
  **No animation grid** (`flipbook*` / sprite sheet / atlas) — drawing one layer would show a whole sheet.
- **Kind allow-list: only AREA / SELF kinds** (archetypes `blast` / `zone` / `healAoe` / `wave` + `buff` /
  `shield` / `shatter` / `summon` / `vanish` / `lift` / `sleep` / `heal` / `down` / `counter` / `dodge` /
  `dp` / `coin` / `sp`). Per-attack / impact kinds (`crit` / `strike` / `slash` / `beam` / `bolt`) and
  per-target / instant kinds (`volley` / `shell` / `move` / `blink` / `mark` / `reticle` / `flame` /
  `wall` / `chill` / `telegraph`) stay procedural.
- **The generated roster table** `public/js/render/fx/official.js` (`FX_OFFICIAL`, built by
  `tools/build-fx-official.mjs`) maps each visible operator to its signature layers for the kinds its kit
  emits. `--check` fails when the committed file is stale; an operator may be pinned by hand in
  `tools/local-extract/fx-official-overrides.json` (created on demand). Our 8 `CUSTOM_CHESS` operators are
  skipped (`identifier >= 900`), so they are absent on purpose.
- **The normal-attack impact is procedural for the whole roster (our operators included).** The fork's
  hand-authored `FX_HITS` was dropped (owner, 2026-10-16): our 8 `CUSTOM_CHESS` operators use the official
  battle effects and fall back to the same procedural hit. Faithful per-attack impacts for
  the whole roster need a particle-system importer + a per-operator projectile mapping; that is a
  **planned future task — do not start it without the owner** ([`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §2).
- **Kill switches:** run-time `settings.localFx === false` (per client); source-level `LOCAL_ART_ENABLED`
  in `public/js/render/fx/localart.js` (default `true`).

---

## 7. Upstream merges

Full procedure: [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b); per-batch records:
[`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) (append a new `## N.` section for every batch).

**The default for a feedback batch is the selective cherry-pick, not a whole-branch merge:**
1. Make both trees agree first (`node tools/push-gitee.mjs --no-push`, or the `git --work-tree` check).
2. `git fetch origin`, write the ordered upstream commit list to a scratch note, then triage each commit:
   `OK` / `OKg` (moves golden) / `SKIP` **with a reason** (already ours / our file differs / doc-only /
   owner-excluded).
3. Cherry-pick the `OK`/`OKg` set onto `ours` **preserving the upstream author and subject**, adapting to
   the fork.
4. **Resolve hunk-by-hunk, keeping both sides.** **Never** `git checkout --ours` / `--theirs` on a source
   file; never blanket-accept a file. When a block genuinely conflicts on one line, take **our behaviour**
   and fold in the upstream improvement.
5. **Golden: attribute first, then regenerate** (§5).
6. Preserve everything in [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) — a hunk that would drop one of those
   mechanisms is a **stop-and-ask-the-owner** item. Run the full `node --test` in the store, then publish.

### The merge blacklist / 永不合并 list
Authoritative: [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 and `docs/MATCHMAKING.md` §22. These must
**never** come back:

| never merge | why |
|---|---|
| **#149 盟约收起 (a foldable/collapsible bond bar)** | the bond strip stays **permanently shown and centred**. |
| **最近的同盟 (recent-alliance chips)** | our own removed feature (commit `6d27d583`). |
| **Upstream 克莱门莎 (Clementia)** (`2e122873` / `0b0ce4fb` / `ba5b998a`) | we keep **our** `char_4231_clemnt`; upstream's is a different operator and would collide. |
| **R21P 满潜 / R22-LOADOUT (潜能 / 练度)** | **kept since the v0.2.6 whole-branch merge (2026-10-14)**: the merge brought the per-operator potential/level loadout in and the owner chose to keep it. **The default is 潜能 1 / 未精英化 since 2026-10-15** (the owner's decision — the official baseline for an operator the player does not own; 满潜 / 精英2 Lv.60 was the default 2026-10-08 → 2026-10-15). The earlier exclusion is withdrawn — **do not revert the loadout feature back out**; [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 / §11. |
| **设置 → 问题反馈 / DIAGNOSTICS (copy local diagnostics)** | our own 设置 dialog's bug提交 already covers it; the duplicate section was dropped. |
| **Upstream's 设置-button placement** | we place 设置 in the top bar's right-hand group (lobby: before the 档案 chip; room: beside the invite key). |
| **Upstream's item-stock gate on free `<获得时>` / strategy grants** (`6bfc08270c`, GitHub #488) | a grant is not a shop purchase; our `acquireItem` has **no** `itemPool` check. |
| **本局禁用 bond forced inert** | the owner's rule (2026-10-11): the ban only stops a bond being **offered**; a banned bond whose members still reach its threshold **does take effect**. |

**Self-checks after every merge** must come back empty:
```powershell
grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server
grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test
grep -rn "itemPool\|canGain" server
```
`git log -S bondsCollapsed -- public/js/screens/game.js` shows whether upstream re-added it.

---

## 8. Publish & deploy

### Publish (one-way, every change)
```powershell
node tools/push-gitee.mjs -m "what changed"                     # commit what you staged, push, mirror
node tools/push-gitee.mjs -m "docs: ..." --only docs/HANDOVER.md --only docs/DEVELOPMENT.md
```
What it does, in order: commit what **you** staged in the store → push the store's `HEAD` to the **`github`
remote (primary)** → then the **`gitee` remote (国内镜像)** (branch `master`, **fast-forward only, never
forced**) → mirror the store's **tracked** files into the dev tree (`git ls-files`; `.gitignore` respected;
dev-tree-only files are **not** deleted). Flags: `--remote`, `--all-remotes`, `--tags`, `--dry-run`
(report only), `--no-push`, `--only`, `--interactive`, `--from-dev` (opt-in reverse sync, **off** by default).

- **Stage only your own paths.** The store is shared and may hold unrelated work — `git add -- <your paths>`
  then `--only`, and never sweep the dev tree into the store.

### Credentials are NEVER in the repo
- **GitHub (primary)** uses the **owner's** configured git credential helper (Git Credential Manager /
  `gh auth login`), or a per-run `GITHUB_TOKEN` (`GH_TOKEN`; PAT with `repo` scope).
- **Gitee (mirror)** uses the **ASCII login `marseille1`** (a display name only) + a personal access token
  (账号设置 → 私人令牌, scope `projects`): `GITEE_USERNAME` / `GITEE_TOKEN` (aliases `GIT_USERNAME` /
  `GIT_PASSWORD`), or `--interactive` once.
- The helper writes a supplied credential to a **temp credential file outside the repo**, resets the helper
  list for the push (so a stale system `credential.helper=manager` cannot shadow the token) and deletes it
  afterwards. **Never paste a token into a commit, doc, script or log.**
- **The production SSH password/key is not in the repo either** — the owner holds it outside the repo; ask
  at deploy time.

### Production deploy runbook — the hard order, and never without the owner
Authoritative: [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (d). Production: `http://183.66.27.19:20522`
(NAT → internal `:3000`) on a RainYun Debian KVM host.

1. **推通知 FIRST** (server still up): `POST /admin/api/notify?token=…` with `{"text":"…","sign":"d星空之下"}`
   — say what is updating, roughly how long, and to refresh. (Admin panel `/admin` → 通知 does the same;
   the history is in `/admin/api/state`.)
2. **Wait ~30 s** so clients render the notice.
3. **Upload the delta** (back up first): `public/**` needs no restart but **must be uploaded**; `shared/**`
   or `server/**` needs a restart. New art/voice/Spine for a new operator must be uploaded in full (all
   files the manifest lists).
4. **Restart** (only when server/shared changed): find the `:3000` pid (`ss -ltnp`) → `kill -TERM` →
   `su -s /bin/bash www -c 'setsid /www/server/nodejs/vhost/scripts/server.sh'`.
5. **Verify:** `curl http://127.0.0.1:3000/healthz` (+ the public URL), spot-check the changed endpoints,
   and confirm the notice history recorded the push.

- Pure static (`public/**`) changes **still get a notice first** — the client version guard reloads open pages.
- **Rollback:** `/root/sp-backup-*.tgz` (snapshot `server shared public docs data` on the host before
  deploying) is unpacked over `/www/wwwroot/Stronghold-Protocol`, then redeploy + restart. Locally, every
  change batch is snapshotted under `D:\DOTK\_optim-backup-<date>-<topic>\`.
- **SSH details (safe to record — no secret):** `ssh root@183.66.27.19 -p 45217`; project
  `/www/wwwroot/Stronghold-Protocol` (user `www`); process script
  `/www/server/nodejs/vhost/scripts/server.sh`; logs `/www/wwwlogs/nodejs/server.log`. See
  [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) §4.

### Revert points (git)
| tag / branch | points at | purpose |
|---|---|---|
| `backup/pre-3d-scenes` | `fc06debda36da1f7c735ed10be04d9ddf7625bdd` (pre-3D-scenes `ours`) | revert the 0.2.5 official-scene merge (runbook in [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §9). |
| `backup-pre-groupA` | `a4e11922830434c174ca9d6192c77359788c74fc` (pre-Group-A tip) | revert the post-0.3.0 Group A combat fixes. |
| branch `backup/ours-pre-reconcile-20261013` | a recent snapshot | the pre-reconcile state. |

### Official-scene assets (committed since 2026-10-14)
The 11 official battlefield scenes live in `public/assets/local/scene/**` — **tracked in the repository** since
2026-10-14 (the owner lifted the old git-ignore so the CDN mirrors can serve the 74.8 MB scene bundles); the
downloaded season bundles stay in `.cache/official-scenes/` (still git-ignored). Because they are committed now,
a `git revert` / `reset --hard` onto a commit from before 2026-10-14 **does** drop them — re-extract with
`node tools/setup.mjs --scenes --game "<CN AB root>"` (then `python tools/local-extract/extract.py --only scene`)
if that happens; the season bundles are **not** in an off-season client. Older local-only backups (2026-10-12,
taken while they were still untracked):
- `C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip` (67,603,003 bytes; the 92
  extracted files + the 33 bundles) — restore with `Expand-Archive` then `robocopy` back into
  `public/assets/local/scene` and `.cache/official-scenes`.
- `C:\Users\31273\AppData\Local\Temp\opencode\sp-backup-pre-3d-scenes.bundle` (582,104,649 bytes; the tag +
  `refs/heads/ours`) — an offline last resort. Re-extract with
  `node tools/setup.mjs --scenes --game "<CN AB root>"` (then `python tools/local-extract/extract.py --only scene`);
  the season bundles are **not** in an off-season client.

---

## 9. Known issues / traps (the gotchas the docs record)

| gotcha | the rule |
|---|---|
| **Stale deployed `index.html`** | a served `index.html` that predates a change can hide a new stylesheet/link. New `public/css/**` stylesheets must be `<link>`ed in `public/index.html` (`test/client-static.test.js` asserts it; `devices.css` last), and overlays self-`ensureStylesheet(href)` / `ensureManifest()` at boot. See [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §6. |
| **Item stock #488** | a free `<获得时>` / strategy grant is **not** a shop purchase: our `acquireItem` has **no** `itemPool` check. If a future merge brings the upstream shared card pool, forward `requirePool` through `grantItem` → `acquireItem` and pass `requirePool: false` at the grant sites. `grep -rn "itemPool\|canGain" server` must stay empty. |
| **Banned-bond rule** | `config.modes[*].inactiveBondIds` only stops a bond being **offered** (pool / strategy draft / bots). A banned bond whose members still reach its threshold is **active and takes effect**; below threshold it stays inert and shows the grey 本局禁用 disc. (`drawnDisabledBonds` is a different, per-match draw.) |
| **FX caps** | official-effect pictures only on AREA/SELF kinds, allow-listed families only, no flipbook/sheet, every layer size-capped to ≈ one body (`LOCAL_FX_MAX_R` = 1.1 tiles). See §6. |
| **官方特效的 per-machine 清单** | the official-effects runtime reads `data/local-fx.json` (**per-machine, gitignored**) + the committed `public/assets/local/fx/**`. A machine without that file serves an **empty** fx list: the client silently keeps the fallback tiers (no error, no blank frame), so "特效没了" on one box is usually this, not code. Extract there (`tools/local-extract/extract.py --only fx --fx-set used`) or copy the file — see [`docs/DEPLOY.md`](DEPLOY.md). |
| **`data/local-assets.json` is a union, and the tests read it directly** | the served manifest is **committed ∪ per-machine** (`server/http/static.js`), so a partial per-machine file loses only the art it alone carries (on the laptop: the extracted scenes) — but the *tests* read that file **directly** and go red (`test/render/board3d-scene.test.js`, the token canary `test/render/token-wang-stone.test.js:48`). Add missing groups with the extractor (it merges); **never** point `tools/local-extract/committed-manifest.mjs` at it (its key rule folds `scene.json` + `scene.bin` onto one key and a scene loses its JSON). [`docs/ASSETS.md`](ASSETS.md) "The committed manifest and the served manifests". |
| **A merged hunk can reference what it did not bring** | mounting an upstream file hunk-by-hunk has twice kept a *use* while dropping its *definition*: `app.js` `NO_SPARK` (2 eslint errors) and `spine.js` `SpineActor.strikePose` (the strike-frame read silently fell back to the drawn pose — a stub in one test hid it). After mounting any upstream file, run `npx eslint .` + `npm run typecheck` **and** diff the file's *symbols* against upstream, not just its hunks. [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0. |
| **Stats 2× caps** | the server-side statistics caps are **2×** the mainline's (`STATS_MAX_RECORDS` / `STATS_FULL_KEEP` / `STATS_MAX_CHARS` in `shared/constants.js`). Change them in one place and keep the client in step. |
| **Merged-chunk self-shadowing limitation** | on the official 3D board, the ground (tiles + gentle dunes) is merged per material + lightmap page into one mesh, and it **does not cast a real-time shadow into itself** — its shading is baked in the lightmap's shadowmask. Only the split-out **props** (rocks, crates, cacti, grass; `load.js splitSceneProps`) cast real shadows. ([`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8.2) |
| **Off-season client & scene bundles** | the official scenes only ship while the season is open; an off-season client has no `scenes/activities/act1autochess` bundles. Fetch them from the official CDN (`fetch_scenes.py`) and keep the materials/textures from the client. |
| **The chat has no DB** | room text chat is validated and broadcast as a transient frame and **never** buffered or written to disk. **Do not add a `chat` table** to `server/db.mjs` / `CommunityService`. ([`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §13) |
| **The merge blacklist** | §7 — #149, 最近的同盟, upstream 克莱门莎, LOADOUT, the diagnostics section, the item-stock gate, the bond-inert rule. Re-check after every merge. |
| **3D 高台 / device slabs are a settled look, not a known issue** | we do **not** build the official raised blocks: `theme.platforms` is off (a plain `MeshStandardMaterial` gets no baked light, so it rendered as a flat pale plate over the dunes) and the `slab` material was reverted (it painted every act1 map's device slabs sand — the owner pointed at act2autochess_m02's look instead). The device slabs use the procedural board's material; act2autochess_m03 alone carries a theme linear `gain`. See [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8.2 / §8.5. |
| **The board's IndexedDB entries round-trip by kind** | `render/board3d/load.js` `fetchScene` stores `json` encoded but `text` / buffers **verbatim** (`idbBodyFor` / `idbValueFrom`). v1 encoded `text` too, which corrupted the gate meshes: `parseObj` found no mesh and the **红门/蓝门 vanished from the second visit on**. Changing that encoding also means bumping `assetIdb.js` `IDB_VERSION` **and dropping the store on upgrade**, or a cached browser keeps the broken bytes. [`docs/ASSETS.md`](ASSETS.md) (local asset cache). |
| **IDM steals the scene** | Internet Download Manager sniffs local HTTP and grabs the 2–6 MB `scene.bin`, silently dropping the board to the procedural metal tiles. Add `127.0.0.1` to IDM's exceptions. |
| **`SP_VERIFY` is off on Linux** | `SP_VERIFY=sample` is only set by the Windows `server-start.cmd`; production (Linux) runs `off` unless the BT `server.sh` exports it (the panel rewrites that script — be careful). |
| **3D battlefield themes** | the official boards' own `ShaderMaterial` runs no tone mapping, so `theme.exposure` is inert; a map that measures darker than its official screenshot is fixed with the per-theme `gain` (act2autochess_m03). `platforms` / `slab` are off — see `docs/CONTENT-AUTHORING.md` §8. |
| **Spine must stay same-origin** | mirroring `.skel`/`.atlas` adds `?h=`, `assets.js validSpine` then rejects the entry and **every unit falls back to its placeholder diamond**. The atlas PAGES are images and ride the mirror; the skeleton/atlas do not. |
| **The mirror chain advances on ERROR only** | the preload walked to the next origin on `load` too, so every image was re-fetched from gh-proxy and this server and the browser cache held the fallback's URL. `tools/check-delivery.mjs --live` is the regression check. |
| **The relay's nginx config comes from the repository** | a push installs `tools/relay/sp-relay.nginx.conf` (only if `nginx -t` accepts it). Editing `/etc/nginx/sites-available/sp-relay` on the box drifts and is overwritten by the next push. |
| **The art origins are in ONE file** | `public/asset-mirrors.json` is the only place a relay / mirror address exists: `server/assetindex.js` keeps no repository slug, no fallback IP and no CDN template any more (`server/mirrors.js` owns the file). The operations page's **来源配置** view edits it live — validated, previous version kept as `var/asset-mirrors.backup.json`, effective on the **next request** (the asset index keys its cache on the file's mtime, so no restart). `SP_ASSET_RELAY` overrides the full origin; `SP_ASSET_REF=''` turns the whole tier off (it no longer pins a git ref — the ref is in the URL). |
| **Never deploy without the owner** | restarting, uploading server files, changing env / `SP_VERIFY` / the admin token / firewall are all **stop-and-ask** items. |

---

## 10. If something breaks

| symptom | likely cause | what to do |
|---|---|---|
| **The server won't start** | port 3000 already in use, or a bad env value | `node tools/doctor.mjs`; another server running? change `PORT` (`scripts\start-windows.bat --port 3001`); check `EADDRINUSE`. |
| **An asset 404s** | that asset is not in the manifest / not on disk | confirm it is in `data/assets.json` and on disk; `node tools/doctor.mjs`; `node tools/fetch-assets.mjs` refreshes upstream art; for local-client art, re-extract or copy from a same-version full zip. |
| **A scene doesn't render (metal board instead)** | no `scene/<stageId>` in the manifest, a load failure, an unknown version, or IDM stole `scene.bin` | check `data/local-assets.json` lists `scene/<stageId>`; add `127.0.0.1` to IDM exceptions; re-extract (`node tools/setup.mjs --scenes`). |
| **The client shows stale JS/CSS** | the browser cached the SPA | **Ctrl+Shift+R**. The server's build tag reloads open pages when it changes, but a hard refresh is the reliable fix. |
| **A test fails in the dev tree but passes in the store** | `test/docs-paths.test.js` / `test/package.test.js` need `git ls-files` | expected — they only pass in the git store (`_merge-scratch`). Run the suite there. |
| **GitHub is unreachable on push** | transient network / proxy | retry; `push-gitee.mjs` pushes the primary then the mirror, so a later run retries the failed remote. `--remote gitee` restricts a run. |
| **A golden number moved and you can't explain it** | you need the attribution proof | revert only your change → expect zero diff; if not, something else moved — stop and investigate; never re-bless. |
| **`build-data --offline` changes `data/`** | the cache and committed data disagree | fix the cache/build, do **not** commit a hand-edit; compare with `git diff data/`. |

---

## 11. Cross-references

If you are new, read in this order: this file → [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) →
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) → [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) →
[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) → [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) → the owning
doc for whatever you are about to change ([`docs/SIM.md`](SIM.md) / [`docs/META.md`](META.md) /
[`docs/DATA.md`](DATA.md) / [`docs/ASSETS.md`](ASSETS.md) / [`docs/DESIGN.md`](DESIGN.md)). For a
topic → file lookup, use [`docs/QUERY-INDEX.md`](QUERY-INDEX.md).

**Before you push, the minimum bar:** `node tools/build-data.mjs --offline` clean, `node --test` green
**in the store**, `node tools/kit-coverage.mjs --missing` empty, `node tools/i18n.mjs check en --strict`
green, `node tools/doctor.mjs` exit 0 — and, if the owner asked for it, the notice-first deploy runbook
in §8.
