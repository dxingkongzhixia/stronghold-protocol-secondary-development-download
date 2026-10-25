# AGENTS.md — entry point for an AI agent working in this repository

This is the machine-readable entry point (OpenCode reads it automatically). It is a **map, not a duplicate**:
the hard rules are here; the detailed operating manual is [`docs/AI-AGENT.md`](docs/AI-AGENT.md).
Human-oriented entry: [`docs/DEVELOPER.md`](docs/DEVELOPER.md). Current state: [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md).

## 1. What this project is

An **independent, non-official browser remake / fork** of Arknights' seasonal auto-chess tower-defense
mode **卫戍协议：盟约 / Stronghold Protocol: Alliance** — solo, or **1–4 player co-op** (no PvP).

- Node server (lobby, economy, rounds, validation) + browser client (native ES modules).
- The battle is simulated **deterministically in each player's browser** from the same code the
  server ships; the server owns the lobby, economy, rounds and validation.
- **Mainline project (主线项目)**: [`sganggs/Stronghold-Protocol`](https://github.com/sganggs/Stronghold-Protocol). We are a **branch project (分支项目)** forked from the mainline and **periodically merge it selectively**.
- Licence: our code is **GPL-3.0-or-later**; Arknights art/audio/text/data is © Hypergryph / Yostar and is **NOT** GPL — non-commercial fan project. See [`NOTICE.md`](NOTICE.md).

## 2. The one operational rule (get this right or lose work)

This repository lives on **two of the owner's machines**, in **two different layouts** — work out which one
you are in before committing:

| layout | machine | what it is | `.git` |
|---|---|---|---|
| **two-tree** | owner's **desktop** (`D:\DOTK`) | **project body** `D:\DOTK\Stronghold-Protocol` + a separate **git store** `D:\DOTK\_merge-scratch` | store has `.git` (current branch `prts-plugin`); project body has none of its own |
| **single-tree** | owner's **laptop** | **one tree** that is both the store and the run tree | `.git` at its root, branch `master` |

**`Stronghold-Protocol` is the project body / run tree. `_merge-scratch` is only its git store** — it holds the
commit history and a tracked-file mirror, and is not a temporary folder to delete. `D:\DOTK\.git` is an **empty
parent repository**; do not commit from inside `Stronghold-Protocol` (git would walk up to it).

Both layouts are the same repository. `tools/push-gitee.mjs` derives both roles from its own location. **On the
laptop, read every `D:\DOTK\...` path as *store ↔ this checkout*, *dev tree ↔ this checkout*.** Quick check:
`git rev-parse --abbrev-ref HEAD` prints the store's branch (`prts-plugin` on the desktop, `master` on the laptop).

- **Commit, merge and push in the git store.** The project body follows.
- Direction is **one-way: store → remotes → project body**. Never overwrite the store from the project body.
- Inside the store, `.cache`, `public/assets`, `public/fonts` and `public/vendor` are **junctions** into the project body.
  **Never delete the project body on its own**, and do not `rmdir` the store's `public/assets`.
- Verify the mirror without copying (run inside the store; empty output = in sync):

  ```powershell
  git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
  ```

- **Stage only your own paths** (`git add -- <paths>`); the store is shared and may hold unrelated work.
- Local deploy artefacts belong under `%TEMP%` and are disposable; a finished deploy removes its staging folder.
  Remote staging is `/root/sp-stage-*`; code/DB backups (`/root/sp-backup-*`) stay.

## 3. Where to look things up

| I need … | go to |
|---|---|
| **AI agent operating manual** (workflow, recipes, traps) | [`docs/AI-AGENT.md`](docs/AI-AGENT.md) |
| **human developer handbook** | [`docs/DEVELOPER.md`](docs/DEVELOPER.md) |
| **game rules entry** | [`docs/RULES.md`](docs/RULES.md) |
| **plugin development entry** | [`docs/PLUGIN-DEV-GUIDE.md`](docs/PLUGIN-DEV-GUIDE.md) |
| the documentation system / authority | [`docs/README.md`](docs/README.md) |
| topic → doc → code lookup | [`docs/QUERY-INDEX.md`](docs/QUERY-INDEX.md) |
| code map | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| current deploy / env / backups | [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) |
| research → change → merge → push → deploy | [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) |
| normative game rules | [`docs/DESIGN.md`](docs/DESIGN.md) → [`docs/design/`](docs/design/) |
| battle engine | [`docs/SIM.md`](docs/SIM.md) |
| match/meta engine | [`docs/META.md`](docs/META.md) |
| generated data | [`docs/DATA.md`](docs/DATA.md) |
| assets | [`docs/ASSETS.md`](docs/ASSETS.md) |
| fork-only mechanisms | [`docs/OUR-FEATURES.md`](docs/OUR-FEATURES.md) |
| merge log / never-merge list | [`docs/UPSTREAM-MERGES.md`](docs/UPSTREAM-MERGES.md) |
| plugin spec / SDK / DSL | [`docs/PLUGINS.md`](docs/PLUGINS.md) · [`docs/PLUGIN-API.md`](docs/PLUGIN-API.md) · [`docs/PLUGIN-DSL.md`](docs/PLUGIN-DSL.md) |

## 4. Run, build and verify

```powershell
# run — in the RUN tree (desktop: D:\DOTK\Stronghold-Protocol; laptop: this checkout)
cd <this checkout>
node server/index.js            # http://localhost:3000
#   admin: http://localhost:3000/admin?token=<var/admin-token.txt>
#   health: GET /healthz

# verify — where .git + node_modules are (desktop: the STORE; laptop: this checkout)
node tools/build-data.mjs --offline     # must leave data/ byte-for-byte unchanged
npm test                                # full suite; use npm test, not bare node --test
node tools/kit-coverage.mjs --missing   # every chess has a kit
node tools/i18n.mjs check en --strict   # English UI pack complete
node tools/doctor.mjs                   # environment diagnosis
node tools/check-upstream.mjs           # new mainline work + predicted conflicts
npx eslint . && npm run typecheck && npm run check:imports
```

- **Dev-tree caveat:** `test/docs-paths.test.js` and `test/package.test.js` shell out to `git ls-files`, so they
  **cannot pass in the git-less dev tree**. Run the full suite in the store.
- Browser / E2E suites are opt-in: `SP_E2E=1`, `SP_REAL_E2E=1`, `RENDER_E2E=1`, `SIM_E2E=1`.
- **Docs gates**: `node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js`.

**Docs are part of the change.** When behavior, status or commands change, update the owning reference doc
(see the matrix in [`docs/AI-AGENT.md`](docs/AI-AGENT.md) §7), plus `docs/PROJECT-STATE.md` / `docs/QUERY-INDEX.md`
when current state or discoverability moved.

## 5. Publishing and deploying

- **Publish (every change)**: the **art relay first** — `node tools/push-assets-relay.mjs` deploys
  `103.205.254.40` (ssh `-p 57435`), the box clients load art from first — then `node tools/push-gitee.mjs -m "what changed"`
  commits what *you* staged → pushes to the **`github` primary** → the **`gitee` mirror** → mirrors tracked files
  into the dev tree.
- Remotes: `github` = primary, `gitee` = 国内镜像, `origin` = the **mainline** (`sganggs/Stronghold-Protocol`).
- **Credentials are never in the repo.** Never commit a token, password or private key.
- **Deploy only when the owner says so** (default: 先不上线). Notice-first runbook in
  [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) (d): signed in-game notice (`sign: d星空之下`) → backup → upload delta
  → restart only if `server/**` or `shared/**` changed → verify `/healthz`.

## 6. Guardrails — stop and ask the owner (d星空之下 / owner-keyed)

- **Never deploy / restart production / change env, the admin token or the firewall without an explicit go-ahead.**
- A change that would drop anything in [`docs/OUR-FEATURES.md`](docs/OUR-FEATURES.md), or re-add anything in the
  **never-merge list** ([`docs/UPSTREAM-MERGES.md`](docs/UPSTREAM-MERGES.md) §0), is a stop-and-ask item.
- **Golden corpus**: any change that moves a stored number in `test/golden/*.json` must be **attributed**
  (revert only your change → zero diff), then regenerated in its own commit. Never hand-edit golden output,
  never loosen an engine guard to make it pass.
- **Never hand-edit `data/*.json`** — change `tools/build-data.mjs` and rebuild offline.
- Commit messages: one line, what changed; **no** `Co-Authored-By:` / `Generated with` trailers.

## 7. After finishing

Report: what changed, how it was verified, remaining risks, and whether anything was deployed.
Leave the store → remotes → dev-tree mirror clean; do not leave temporary scripts in the repo.
