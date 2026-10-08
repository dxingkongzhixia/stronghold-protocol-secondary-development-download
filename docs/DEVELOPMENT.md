# Development guide

Who this is for: anyone (human or AI) changing this fork. It is the map of **how the repository, the build, the
content, the server, the tests and the asset pipeline fit together**, plus where our own content lives. It does not
restate the upstream design — it points at it:

| Read this | For |
|---|---|
| [`README.md`](../README.md) | what the game is, how to run it |
| [`docs/DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | the same map in Chinese, plus recipes and a prioritized optimization list |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | the module overview and import boundaries |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | conventions, tests, PR flow |
| [`docs/DESIGN.md`](DESIGN.md) → [`docs/design/`](design/) + [`docs/history/`](history/) | the authoritative rules (index + per-release revisions) |
| [`docs/DATA.md`](DATA.md) · [`docs/SIM.md`](SIM.md) · [`docs/META.md`](META.md) · [`docs/ASSETS.md`](ASSETS.md) · [`docs/BALANCE.md`](BALANCE.md) | generated data, the combat engine, the match engine, assets, difficulty |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) | **our** features and every decision record (§22 merge blacklist, §23–§35 the custom operators) |
| [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) | the end-to-end recipe for adding a custom operator |
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | how we research/change/test/deploy, the merge discipline, and the Gitee push |
| [`docs/DEPLOY.md`](DEPLOY.md) | upstream deployment (Windows host, Docker, proxy) |

> Conventions kept from upstream: code/comments/identifiers in English, player-facing strings in Simplified Chinese.
> `package.json` / `shared/constants.js APP_VERSION` / `CHANGELOG.md` are the single version source (checked by
> `test/version.test.js`).

---

## 1. The two trees (read this first)

| Tree | What it is | Has `.git`? |
|---|---|---|
| `D:\DOTK\Stronghold-Protocol` | **the working project — the single source of truth.** Every edit lands here. | no |
| `D:\DOTK\_merge-scratch` | **the git store / worktree** (branch `ours`) with the whole history, including the upstream merges. | yes |

The two are kept **byte-for-byte identical for every tracked file** (`git ls-files`). The store's `node_modules`,
`.cache` and `public/assets` are junctions onto the working project, so builds and assets are shared and never
duplicated or committed. (See `docs/PROJECT-STATE.md` §2.)

Rules:

- **Edit the working project only.** Never edit files inside `_merge-scratch` directly — the next sync overwrites them.
- **Commit from the store.** Because the working project has no history, commits, merges and pushes happen in
  `_merge-scratch`.
- **Push to Gitee the same way every time**: `node tools/push-gitee.mjs` (or `node tools/push-gitee.mjs -m "…"`).
  It mirrors the working project into the store (tracked files only — `.gitignore` respected), commits and pushes to
  the `gitee` remote. See [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) for the credential setup and the convention
  (`之后每次有更新都提交下`).

Verifying the mirror without copying anything:

```powershell
# Run inside _merge-scratch. Empty output = the store's HEAD equals the working project.
git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
```

---

## 2. Repository layout

| Path | Contents |
|---|---|
| `server/` | Node platform + match engine + **combat simulator** (see §4–§6). `server/index.js` is the entry point. |
| `shared/` | Code shared by server and browser (pure ESM, no Node API): `constants.js`, `protocol.js` (the wire contract), `loadoutRecord.js`, `forms.js`, `bandBonds.js`. |
| `public/` | The browser client (native ESM, no bundler): `js/` screens, UI, render (PixiJS 2D + three.js 3D), battle runner; `css/`; `i18n/`; `dev/` local toys. |
| `data/` | **Generated** JSON (see §3): `chess.json`, `tokens.json`, `enemies.json`, `stages.json`, `items.json`, `bonds.json`, `bands.json`, `garrisons.json`, `choices.json`, `waves.json`, `config.json`, `factions.json`, `bosses.json`, `emotes.json`, `assets.json`, `tuning.json`, `i18n/*.json`. |
| `docs/` | This documentation set, `docs/design/` + `docs/history/` (the split design doc), `docs/research/` (official-data research, machine-readable), `docs/img/`. |
| `tools/` | Build/data/assets/golden/i18n/balance tooling (see §3, §8, §9). `tools/local-extract/` extracts from a local game client. |
| `test/` | `node:test` suites: `content/`, `sim/`, `match/`, `ui/`, `render/`, `e2e/`, and the root integration suites (see §8). |
| `scripts/` | Launch/install helpers (Windows service, `start.sh`). |
| `packs/` | Content packs (see `docs/PACKS.md`); the index is generated, the sources are committed. |
| `types/`, `eslint.config.js`, `jsconfig.json` | Lint / typecheck config (CI runs `npm run lint`, `npm run check:imports`, `npm run typecheck`). |

---

## 3. The build / data pipeline

**One command regenerates the data; never hand-edit `data/*.json`.**

```powershell
node tools/build-data.mjs             # regenerate data/*.json from the cached official tables
node tools/build-data.mjs --offline   # no network: use the already-cached tables (deterministic rebuild check)
node tools/build-data.mjs --refresh   # re-download the official tables first
```

Flow of `tools/build-data.mjs`:

1. Read the official zh_CN client tables from `.cache/gamedata/` (plus `docs/research/*.json` for the hand-verified
   facts the tooling does not parse), selected via `SP_GAMEDATA_BASE` when the default is unreachable.
2. Fold in our own content: `CUSTOM_CHESS` (§10) is merged into the official season tables by `applyCustomChess`
   before the normal build logic runs, so every downstream rule (shop, bonds, garrisons, tokens) applies unchanged.
3. Generate every `data/*.json` **deterministically** (no timestamps), running many cross-file validations
   (counts, references, board geometry, trigger drift…). The report lands in `.cache/build-data-report.json`.
4. Fixed roster counts live in this script and are asserted by `test/data.test.js` — adding/removing a chess means
   updating the expected counts there and in the other count assertions listed in `docs/NEW-OPERATOR.md` §5.

Exceptions (edited/generated by other tools, not by `build-data.mjs`):

| File | Produced by |
|---|---|
| `data/tuning.json` | hand-maintained override layer, applied at read time by `server/match/gamedata.js` |
| `data/emotes.json` | `node tools/build-emotes.mjs` |
| `data/assets.json` | `node tools/fetch-assets.mjs` (the asset manifest, §9) |
| `data/i18n/*.json` | `node tools/build-i18n.mjs` |
| `data/local-assets.json` | `tools/local-extract/extract.py` (git-ignored, per-machine, §9) |

`node tools/kit-coverage.mjs [--missing]` reports which skills still have no hand-written kit (they fall back to the
generic kit — see §4).

---

## 4. The kit structure

A **kit** is the hand-written behaviour (skills, talents, trait wiring) of one operator. Kits are one file per
operator, registered in `server/sim/content/kits/index.js`:

| Registry | File pattern (`server/sim/content/kits/`) | Key | Meaning |
|---|---|---|---|
| `KIT_FILES` | `ops/chess_char_<id>-<codename>.js` | `chess_char_<id>_a` / `_b` | a formal shop chess, grouped by tier 1…6 |
| `STANDIN_KIT_FILES` | `ops/standin-<codename>.js` | the stand-in's `charId` | 补位 (stand-in) characters |
| `OPERATOR_KIT_FILES` | `ops/op-<codename>.js` | the operator's `charId` | 自选 (own-6★ pick) operators |

- `KITTED_CHARS` is derived from those three and is the set a 自选 pick may field with a faithful kit.
- Each file `export default { [chessId]: (bb, chess, def) => Kit }`. A kit declares `skill`/`skills`, `talents`,
  `trait`, and `install(battle)` (the engine hooks). Read the full contract, naming and registration rules in
  [`server/sim/content/kits/README.md`](../server/sim/content/kits/README.md); `test/content/kits_layout.test.js`
  enforces it.
- Shared helpers live in `server/sim/content/kits/shared/tier1.js` … `tier6.js` (plus `summoner.js`). **Reuse them**
  (`onHitBy`, `makeZone`, `statBuff`, `once`, `installAura`, …) instead of re-deriving engine glue.
- Files load with a guarded dynamic `import`; a kit that throws is logged and skipped, and its chess falls back to the
  generic kit (`server/sim/content/generic.js`), so the server and page never break.

Tests and tools: `test/content/kits_t<N>.test.js`, `test/content/kits_alt_t<N>.test.js`, `test/content/kits_layout.test.js`,
and `node tools/kit-coverage.mjs`. The recipe for a new operator (data → kit → art/voice → counts/tests → release) is
[`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md).

---

## 5. How the `sim/` and `content/` directories fit together

`server/sim/` is the deterministic combat engine (shared verbatim with the browser via the `/sim/` static path).
`server/sim/content/` is everything content-shaped, installed into the engine through a **two-sided** model
(`server/sim/content/index.js`):

| Side | Entry point | When | Registers |
|---|---|---|---|
| **battle** | `install(battle)` | each `new Battle(...)` | engine hooks, buffs, timers |
| **meta (prep)** | `registerMeta(registry)` | server startup | prep-phase hooks (economy, shop, bond layers…) |

Content domains (each may export one or both sides):

```
server/sim/content/
  index.js          installs all content / registerAllMeta
  kits/             §4
  tokens.js         summons, 炎佑, map characters (incl. 望's 棋子 `wangStone`)
  bonds/            core.js + addon/{battle,meta}.js
  items/            {battle,meta}.js
  bands/            {battle,meta}.js
  garrisons/        {battle,meta}.js   (特质)
  enemies.js · bosses.js · devices.js · choices.js · generic.js
  support/{index,meta}.js             membership / layers / contentInfo handoff
```

The two sides talk through `PlayerBattleInput.contentInfo` (`support/meta.js` writes it, `support/index.js` reads it).
The engine API content is allowed to touch is the list of helpers on `Battle` (`dealDamage`, `heal`, `applyStatus`,
`addBuff`, `spawnToken`, `spawnEnemy`, `addProjectile`, `push`/`pull`, `enemiesInRadius`, `alliesFor`, `addLayers`,
`fx`, …) — see `docs/SIM.md`. Never reach into engine internals; never use a random source other than `sim/rng.js`.

`server/match/` (the platform/match engine) sits above: `Match.js`/`PlayerState.js` are thin façades whose methods
live in `server/match/match/*` and `server/match/player/*`; `fields.js` runs client- or server-side battles;
`gamedata.js` is the typed read-only view of `data/*.json`.

---

## 6. Professions and our engine carve-outs

`server/sim/professions.js` `resolveProfile()` maps each sub-profession id to its attack/heal profile. Most operators
are pure data; a few sub-professions carry **hand-written behaviour**, and several of ours touch them:

| Sub-profession | Where | Note |
|---|---|---|
| `funnel` (驭械术师) | `installFunnel`, `resolveProfile` | 澄闪's drones: all lock the same enemy, each hits full ATK; the `'bolt'`→`'drone'` projectile fix lives here (§35.2) |
| `watchman` (守望者) | `SUB.watchman` | 凯尔希·思衡托 heals **and** can take off; single-target like `physician` (§35.7) |
| `dollkeeper` (傀儡师) | `installDollkeeper`, `dollForm()`, `nextDoll()` | 结城理's per-skill 〈替身〉 forms + `dollLives`/`dollKeepSkill` (§24/§29/§35.3) |
| `stalker` (伏击客) | `installStalker` | 阿斯卡纶: AoE + 50 % dodge + taunt −1 |
| `loopshooter` (回环射手) | `installLoopshooter` | 娜仁图亚: boomerang must return before the next attack |
| `traper` (陷阱师) | kit + `wangStone` | 望's 棋子 / 跟子 / S3 ammo (§30) |

When a sub-profession needs a new flag, add it in `professions.js` (and the status/flag tables in `buffs.js`) rather
than special-casing inside a single kit, so other operators on the same sub-profession stay consistent.

---

## 7. Running the server locally

```powershell
npm install            # postinstall runs tools/vendor.mjs (copies front-end libs into public/vendor)
node server/index.js   # http://localhost:3000   (or: npm start / npm run dev for --watch)
```

| Thing | Value |
|---|---|
| Port | `3000` (`PORT` env overrides) |
| Bind | `0.0.0.0`; set `HOST=127.0.0.1` behind a proxy |
| Health | `GET /healthz` (reports the `build` hash) |
| Admin | `http://localhost:3000/admin?token=<var/admin-token.txt>` (the token is also printed in the startup log) |
| Read-only public API | `GET /online/api` |
| Combat mode | `SP_COMBAT=client` (default; browser simulates) or `server` |
| Verification | `SP_VERIFY=off|sample|all` (re-simulate client results) |

Windows convenience: `server-start.cmd` (sets `SP_VERIFY=sample`), `server-stop.cmd`, `scripts/start-windows.bat`.
On Linux the upstream `scripts/start.sh` works. See `docs/DEPLOY.md` for firewalls, reverse proxies and Docker, and
`docs/AI-WORKFLOW.md` for **our** production deploy procedure.

---

## 8. Running the tests

```powershell
node --test                              # the whole suite (CI: ~5k tests)
node --test test/sim/ test/match/        # the engine
node --test test/content/                # content coverage (kits, bonds, items, …)
node --test test/ui/                     # client logic
node --test test/data.test.js            # generated-data integrity + offline rebuild
node tools/kit-coverage.mjs              # every chess has a kit and every skill is covered
```

Browser / E2E suites gate themselves on environment variables and are **off in CI**:

```powershell
SP_E2E=1      node --test test/ui/mock.e2e.test.js     # mocked browser
SP_REAL_E2E=1 node --test test/ui/real.e2e.test.js     # needs downloaded assets
RENDER_E2E=1  node --test "test/render/*.browser.test.js"  # needs a local Chrome (puppeteer-core)
```

### The golden corpus and its attribution discipline

`test/golden/*.json` is a stored corpus of deterministic matches/simulations (`tools/golden.mjs`). It is a
regression net: any change that moves a stored number must be **explained**, not just re-blessed.

- Check: `node tools/golden.mjs` (or `npm run golden`).
- Update: `node tools/golden.mjs --update`, and **only after** the diff is fully attributed.
- **Attribution rule**: to prove a golden diff comes from *your* change and nothing else, revert only your change
  (keep everything else), recompute → expect **zero** diff; restore your change → expect **exactly** the diff you saw.
  Record the result in the change's `docs/MATCHMAKING.md` section (see §35.1 for a worked example).
- Never raise an engine guard to make golden go green. A triggered re-entrancy guard (`hookDepth:*`) is a content
  bug — fix the content (SIM.md's re-entrancy rules; §35.6 is the precedent).

> **Dev-tree caveat**: `test/docs-paths.test.js` and `test/package.test.js` shell out to `git ls-files`, so they
> **cannot pass in the git-less working project** and always fail there. Run the full suite in `_merge-scratch` (or
> expect exactly those two to fail in the working project) — see `docs/MATCHMAKING.md` §33.6.

---

## 9. The asset pipeline

Game art/audio is copyrighted and **never committed** (`.gitignore` excludes `public/assets/`, `public/fonts/`,
`public/vendor/`, `data/local-assets.json`). It is fetched or extracted per machine.

```powershell
npm run assets                                      # vendor + fetch-assets
node tools/fetch-assets.mjs                          # download from the public mirrors per docs/research/07-assets.json
node tools/fetch-assets.mjs --asset-source=mirror    # prefer the gh-proxy mirror when direct GitHub is blocked
node tools/setup.mjs                                 # end-user setup (checks env, downloads assets, offers local extract)

# local-client extraction (optional, from an installed game client; needs .venv-extract / Python 3.12)
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "<…/StreamingAssets/AB/Windows>"
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --only spine/token
.venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py [--voice-dir …\voice_cn]
```

- `tools/fetch-assets.mjs` + `tools/assets/**` write `public/assets/**`, `public/fonts/**` and the manifest
  **`data/assets.json`**. It has a **shrink guard**: a new manifest that would drop entries is refused unless
  `--allow-shrink`/`--prune` is passed. Mirror selection: `--asset-source=direct|mirror`, `SP_ASSET_SOURCE`,
  `SP_GITHUB_PROXY`.
- `tools/local-extract/extract.py` writes the per-machine **`public/assets/local/**`** and **`data/local-assets.json`**
  (what only a real game client has: the 3D board, some UI icons, several enemy/caller models). The game runs without
  it, with documented fallbacks (`docs/DEPLOY.md` §6). Spell/skill/voice art for new operators is usually added to
  `docs/research/07-assets.json` first so the mirror fetch picks it up.
- `data/assets.json` is a generated file but is **committed**; when a change updates it, commit it together with the
  change (the packer checks it).

---

## 10. Where our custom content lives

Relative to the upstream, this fork adds the account/matchmaking/spectate/admin features and **seven** custom shop
operators (injected via `CUSTOM_CHESS` in `tools/build-data.mjs`), each with a data entry, a kit, and (usually) art
and voice:

| Operator | charId | Tier | Kit file (`server/sim/content/kits/ops/`) | Record |
|---|---|---|---|---|
| 阿斯卡纶 | `char_4132_ascln` | 3 | `chess_char_4132_ascln-ascln.js` | `docs/MATCHMAKING.md` §23 |
| 结城理 | `char_4217_makoto` | 3 | `chess_char_4217_makoto-makoto.js` | §24, §29, §35.3 |
| 予愿安洁莉娜 | `char_1015_aglna2` | 3 | `chess_char_1015_aglna2-aglna2.js` | §25 |
| 望 | `char_2027_wang` | 6 | `chess_char_2027_wang-wang.js` (+ `wangStone` in `tokens.js`) | §30, §35.2 |
| 澄闪 | `char_377_gdglow` | 3 | `chess_char_377_gdglow-gdglow.js` | §31 |
| 娜仁图亚 | `char_4138_narant` | 3 | `chess_char_4138_narant-narant.js` | §32 |
| 凯尔希·思衡托 | `char_1052_kalts2` | 4 | `chess_char_1052_kalts2-kalts2.js` | §34, §35.1, §35.7 |

Related custom mechanisms: the leave/takeover seat rules (`server/lobby.js removeMember` → `handSeatToAI` →
`Match.aiTakeOver`, §35.5), the 联防 arena (§35.4), the 余音 re-entrancy fix (§35.6), and the added data-layer
handlers (`act1autochess_gar_event_dollswap_self`, `act1autochess_gar_event_airweight_fear_ammo`, `pool_equip_all`).

**Merge blacklist** (`docs/MATCHMAKING.md` §22): the upstream 盟约条折叠 (#149) and our own removed 最近的同盟
**must never come back**. When merging upstream, resolve hunk-by-hunk keeping both sides and honour the blacklist —
the exact procedure is in [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md).

---

## 11. Pushing to Gitee

The canonical copy is the git store; the Gitee remote (`gitee`) mirrors it. After any change:

```powershell
node tools/push-gitee.mjs -m "what changed"
```

The helper syncs the working project → `_merge-scratch` (tracked files only), commits and pushes `HEAD` to
`gitee/master`. The owner's convention is **之后每次有更新都提交下**. Credentials (Gitee username + personal access
token) are supplied through a credential helper or environment, never committed — the full instructions, the merge
discipline and the production deploy procedure are in [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md).
