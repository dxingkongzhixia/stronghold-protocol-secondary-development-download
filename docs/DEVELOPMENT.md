# Development guide

Who this is for: anyone (human or AI) changing this fork. It is the map of **how the repository, the build, the
content, the server, the tests and the asset pipeline fit together**, plus where our own content lives. It does not
restate the upstream design — it points at it:

> **Navigation.** §1 The two trees · §2 Repository layout · §3 The build / data pipeline · §4 The kit structure · §5 How `sim/` and `content/` fit together · §6 Professions and our engine carve-outs · §7 Running the server · §8 Running the tests · §9 The asset pipeline · §10 Where our custom content lives · §11 Publishing · §12 Our fork-only mechanisms (merge-critical) · §13 Lobby community data + match statistics.
> See also [`docs/QUERY-INDEX.md`](QUERY-INDEX.md) (lookup).

| Read this | For |
|---|---|
| [`docs/HANDOVER.md`](HANDOVER.md) | **the entry point / handover** (repo map, run locally, build/verify, content, upstream merges, publish/deploy, known issues) — read this first |
| [`README.md`](../README.md) | what the game is, how to run it |
| [`docs/DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) | the same map in Chinese, plus recipes and a prioritized optimization list |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | the module overview and import boundaries |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | conventions, tests, PR flow |
| [`docs/DESIGN.md`](DESIGN.md) → [`docs/design/`](design/) + [`docs/history/`](history/) | the authoritative rules (index + per-release revisions) |
| [`docs/DATA.md`](DATA.md) · [`docs/SIM.md`](SIM.md) · [`docs/META.md`](META.md) · [`docs/ASSETS.md`](ASSETS.md) · [`docs/BALANCE.md`](BALANCE.md) | generated data, the combat engine, the match engine, assets, difficulty |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) | **our** features and every decision record (§22 merge blacklist, §23–§37 the custom operators, §0–§49 total (the file opens with a 目录)) |
| [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) | **the fork-only mechanisms catalog** (what is ours, where it lives, how to extend it, the tests that pin it, and the merge "must not be lost" note) — see §12 |
| [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) | the end-to-end recipe for adding a custom operator |
| [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) | the authoring handbook for bonds / strategies / bounty leaders / operators and the 资料库 (CODEX) browser (Chinese) |
| [`docs/PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) | **plugin development guide** (Chinese): manifest, classes, cosmetic/content/ui/script, local checks, pack and publish |
| [`docs/FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) | **Forge pack development guide** (Chinese): pack layout, clean-import rules, scripts, UI panels, report and verification |
| [`docs/FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) | the Forge compatibility matrix and the explicit unsupported list |
| [`docs/PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) | plugin architecture, security boundaries, admin console and residual risks |
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | how we research/change/test/deploy, the merge discipline, and the GitHub/Gitee push |
| [`docs/DEPLOY.md`](DEPLOY.md) | upstream deployment (Windows host, Docker, proxy) |

> Conventions kept from upstream: code/comments/identifiers in English, player-facing strings in Simplified Chinese.
> `package.json` / `shared/constants.js APP_VERSION` / `CHANGELOG.md` are the single version source (checked by
> `test/version.test.js`).

---

## 1. The two trees (read this first)

| Tree | What it is | Has `.git`? |
|---|---|---|
| `D:\DOTK\_merge-scratch` | **the git store — the single source of truth** (branch `ours`): the history and the committed files, including the upstream merges. | yes |
| `D:\DOTK\Stronghold-Protocol` | **the working project — a byte-for-byte mirror of the store.** The app runs here. | no |

The two are kept **byte-for-byte identical for every tracked file** (`git ls-files`). The store's `node_modules`,
`.cache` and the asset trees (`public/assets`, `public/fonts`, `public/vendor`) are junctions onto the working
project, so builds and assets are shared and never duplicated — the asset trees themselves are **tracked in git**
now (see §9). (See `docs/PROJECT-STATE.md` §2.)

Rules:

- **The store is the source of truth.** Commits, merges and pushes happen in `_merge-scratch`; the working project
  follows.
- **The direction is one-way: store → remotes → working project.** `node tools/push-gitee.mjs` pushes the store and
  mirrors it into the working project. It **never overwrites the store with the working project** — a stale working
  project must not revert the store's newer commits.
- If you edited the working project and want those edits published, that is the explicit, opt-in reverse sync:
  `node tools/push-gitee.mjs --from-dev` (off by default). Without it the helper warns that the tree diverged and
  restores it from the store.
- **Publish the same way every time**: `node tools/push-gitee.mjs` (or `node tools/push-gitee.mjs -m "…"`).
  It commits what you staged in the store, pushes the store's `HEAD` to the **`github` remote (primary)** and then the
  **`gitee` remote (国内下载镜像)** (fast-forward, never forced), then mirrors the store's tracked files into the
  working project. See
  [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) for the credential setup and the convention (`之后每次有更新都提交下`).

Verifying the mirror without copying anything:

```powershell
# Run inside _merge-scratch. Empty output = the working project equals the store's HEAD.
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

Game art/audio is copyrighted (c) Hypergryph / Yostar and **is committed** to this (public) repository as of
2026-10-08: `public/assets/**` (~570 MB, ~9600 files), `public/fonts/**` and `public/vendor/**`, so a plain clone
runs with no fetch step. `data/local-assets.json` (the per-machine local-client manifest) is still git-ignored.
Refreshing art is now optional — fetch/extract only the files that changed upstream and commit them.

```powershell
npm run assets                                      # optional refresh: vendor + fetch-assets
node tools/fetch-assets.mjs                          # download from the public mirrors per docs/research/07-assets.json
node tools/fetch-assets.mjs --asset-source=mirror    # prefer the gh-proxy mirror when direct GitHub is blocked
node tools/fetch-assets.mjs --asset-source=gitcode   # prefer the GitCode raw mirror of the yuanyan icon dump (avatars/portraits/skill/enemy icons)
node tools/setup.mjs                                 # end-user setup (checks env, downloads assets, offers local extract)

# local-client extraction (optional, from an installed game client; needs .venv-extract / Python 3.14 — 3.8 is too old for UnityPy; see docs/OUR-FEATURES.md §3)
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "<…/StreamingAssets/AB/Windows>"
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --only spine/token
.venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py [--dub jp] [--voice-dir …\voice_cn]
```

- `tools/fetch-assets.mjs` + `tools/assets/**` write `public/assets/**`, `public/fonts/**` and the manifest
  **`data/assets.json`**. It has a **shrink guard**: a new manifest that would drop entries is refused unless
  `--allow-shrink`/`--prune` is passed. **Mirror selection:** `--asset-source=direct|mirror|gitcode` (also
  `SP_ASSET_SOURCE`), `SP_GITHUB_PROXY` for the prefix proxy. `direct` (default) = raw GitHub, then jsDelivr; `mirror` =
  the `SP_GITHUB_PROXY` prefix first (default `https://gh-proxy.com/`); `gitcode` = the read-only GitCode raw mirror of
  `yuanyan3060/ArknightsGameResource` first (the avatars/portraits/skill/enemy icons; no other repo of ours is mirrored
  there, so Spine/AA2 fall back to direct + jsDelivr). All three are anonymous and never look up the public IP.
- `tools/local-extract/extract.py` writes the per-machine **`public/assets/local/**`** and **`data/local-assets.json`**
  (what only a real game client has: the 3D board, some UI icons, several enemy/caller models). The game runs without
  it, with documented fallbacks (`docs/DEPLOY.md` §6). Spell/skill/voice art for new operators is usually added to
  `docs/research/07-assets.json` first so the mirror fetch picks it up.
- `data/assets.json` is a generated file but is **committed**; when a change updates it, commit it together with the
  change (the packer checks it).

### 9.1 Battle-effect art: the official-effects runtime, then a procedural + an optional local tier

**Primary path (upstream 0.3.0, in `master` since 2026-10-16): the official battle effects.** `public/js/render/vfx/**`
replays the official client's own effect **prefabs** for a unit's attacks, skills, talents, funnels, mount points and
status loops — the fx extraction (`tools/local-extract/extract.py --only fx --fx-set used`) inside
`public/assets/local/fx/**` + the per-machine `data/local-fx.json` (index v3). Per client that is
`settings.officialFx` (`auto | off | lite | full`), shown only when the client has the manifest; with it off (or no
extraction) nothing new is laid out. The dev viewer is `public/dev/fx-viewer.html` (`?attack=<opId>` /
`?skilldemo=<opId>&s=<slot>` / `?key=<prefab>`; it draws the unit's Spine with live bones, `&model=0` to turn it off).
Our own additions inside that upstream runtime are listed in [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §2 (they must
survive merges); the batch record is [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0.

**Then the fork's two tiers**, every battle fx kind resolved at render time per client (`docs/ASSETS.md` "Battle effects"):

1. the **procedural tier** (`FX_KINDS` `a` + `c` + `r`, `public/js/render/fx/kinds.js`) is drawn at run time and is
   mandatory — every kind must have one, and it is what a client without any local art sees;
2. the **optional local-art tier**: a kind's `local` spec (`{ group, layers: [{ name, scale? }], tint?, dur? }`) names
   official pictures in `data/local-assets.json`. `public/js/render/fx/localart.js` resolves them (per client) and
   `public/js/render/fx/simfx.js` draws them instead of the procedural archetype only when every layer is listed AND
   loaded; a listed layer still loading is prefetched, and the fallback never touches the network — no blank frame.

**An official picture is an in-place effect at the anchor, size-capped to ~one body.** `simfx.js` `_fxLocal` scales every
layer's drawn radius (`r × layer.scale`) down together so the largest is at most `LOCAL_FX_MAX_R` (= 1.1 tiles,
`localart.js`), preserving the authored ratios.
Before this, the archetype's own area radius (a `tide` r=2, an `aoe` behind
a wide skill) times a layer scale of 1.5 painted a 2–3-tile flat image over the board — the owner's "many operators
paint a big flat picture" report. **The generated table (`render/fx/official.js`, `tools/build-fx-official.mjs`) only
carries soft in-place effect pictures** (the `flow` / `ray` / `glow` / `ring` / `star` / `light` / `smoke` / `aura` /
`halo` families — `EFFECT_TEX`; walls, decals, patterns and object / prop / icon-looking textures are never used) **and
only AREA / SELF kinds** (archetypes `blast` / `zone` / `healAoe` / `wave` + `buff` / `shield` / `shatter` / `summon` /
`vanish` / `lift` / `sleep` / `heal` / `down` / `counter` / `dodge` / `dp` / `coin` / `sp` — `KIND_ARCH`). Per-attack /
impact kinds (`crit` / `strike` / `slash` / `beam` / `bolt`) and per-target / instant / unit-attached kinds (`volley` /
`shell` / `move` / `blink` / `mark` / `reticle` / `flame` / `wall` / `chill` / `telegraph`) are drawn procedurally — a
ground field on them just litters the board. A bundle with no qualifying picture, or a kit with no in-place kind, gets
no entry (procedural stays).

**Kill switch:** `render/fx/localart.js` exports `LOCAL_ART_ENABLED` (default `true`). Set it to `false` and the whole
local tier goes inert in one edit — `fxLocalFor` / `fxLocalSource` return null, so the generated table and the hand-wired kinds all fall back to procedural (nothing is resolved or fetched). That is the
source-level switch; `settings.localFx === false` is the per-client run-time one.

To add an effect the right way: write the procedural archetype first (always), then, only if the official art is
obtainable, extract it (`tools/local-extract/extract.py`, e.g. the `fx/kalts2` job) and add the `local` layers. A `local`-only kind is a bug: a join without the art would show nothing. The 驭械术师 浮游单元 (`PROJ.drone`) stays procedural because its textures live in unresolvable external CABs. `settings.localFx === false` opts the official tier off like a quality tier.

**The normal-attack impact is deliberately procedural for the whole roster.** It is `render/fx/projectiles.js` `_impact` (a
ranged shot) and `render/fx/numbers.js` `damage` (a melee blow), not a `local` kind: the official per-attack hit is a
particle-system effect prefab each projectile prefab names in `_effectsWhenHit` (`common_hit_01` / `<op>_hit_01` …), a
cluster of `ParticleSystem`s and transforms — **not** the operator's one signature Texture2D. An earlier design drew
that signature texture as a ground field at the victim (`render/fx/official.js` kind `'hit'`, `fxOfficialHit`); it was
removed because it was visibly misplaced (wrong texture, wrong anchor/scale). The generated table (`FX_OFFICIAL`) now
carries only the fx kinds a kit actually emits — no `hit` or other attack / impact kind (`crit` / `strike` / `slash` /
`beam`), and no animation-grid (flipbook / sprite-sheet) layer — and no **roster** operator's normal attack consults the
manifest. **Our custom operators are no exception any more (owner, 2026-10-16):** the fork's hand-authored `FX_HITS` and their per-operator `FX_OFFICIAL` / `local.byOp` art were dropped — they take the official battle effects like every other operator and fall back to this same procedural hit.
See `docs/OUR-FEATURES.md`, docs/ASSETS.md "Battle effects". Reproducing the
official impacts faithfully for every operator would need a particle-system importer plus a per-operator projectile
mapping, which the bundles do not give as a single sprite — **recorded as a planned future task** in
`docs/OUR-FEATURES.md` §2 (docs/ASSETS.md "Battle effects"); do not start it without the owner.

### 9.2 Browser asset delivery: the local cache first, then the relay → CDN mirrors → this server

The server's uplink is small (~2.3 MB/s) but a cold load pulls ~104 MB of art, so delivery is layered. **The rule is:
the local cache answers first; only a miss walks a source chain.** The owning document is
[docs/ASSETS.md](ASSETS.md) "Local asset cache & CDN mirror download chain" + "Without a Service Worker" + "The relay"
(fork-only — [docs/OUR-FEATURES.md](OUR-FEATURES.md) §10, decisions: [docs/MATCHMAKING.md](MATCHMAKING.md) §42 and §43):

1. **The cache.**
   - **With a Service Worker** (HTTPS) — `public/sw.js` + `public/js/assetCache.js` keep `public/assets`, `public/fonts`
     and `public/vendor` in Cache Storage (`sp-assets`): `handle()` returns a `cache.match` hit immediately.
   - **On the plain-HTTP production site** the worker never registers, so the browser's own HTTP cache plays that role —
     `public/js/assetMirror.js` rewrites the manifest **image** URLs to the chosen origin with `?h=<hash>` (cached for a
     week) — and `public/js/assetIdb.js` (IndexedDB) covers what the page fetches through its own code: the **audio**
     (`js/audio.js`) and the **battlefield scene bundles** (`render/board3d/load.js`). `main.js` enables the IDB layer
     only when the worker cannot register.
2. **On a miss, the source chain — and only an error advances it, never a successful load** (advancing on load made a
   cold visit pull every image from the relay, then gh-proxy, then this server — measured 2026-10-14):
   - **Plain HTTP:** `public/asset-mirrors.json` (a plain file, so the list changes without a restart) — **the owner's
     relay (`123.57.150.185`) first**, then GitHub and its mirrors (gh-proxy → jsDelivr) — then **this server**.
   - **Service Worker:** the player's own machine (when `assetSource.js` found one at the same `revision`), then
     `/asset-index.json` `sources` — the same relay → gh-proxy → jsDelivr order (`server/assetindex.js`
     `assetSources()` builds it from the relay plus the CDN templates) — then this server. Images are walked by the
     capture-phase error listener; the audio / scene / clip routes by their own candidate lists.
   - **A hashed request is asked for as the real path + `?h=<hash>`** in both paths: the served manifests carry a
     `~<hash>` segment, but the plain-file mirrors have no such directory (only the relay and this server strip it), so
     `sw.js` (`sourcePath`) and `assetCache.js` (`mirrorPath`, plus every `index.files` lookup through `unhashedUrl`)
     normalize it — the relay, the CDNs and this server all answer the same URL, and the byte check actually runs.
3. **Paced server fallback** — the server paces `public/assets`, `public/fonts` and `public/vendor` bodies with a token
   bucket (`SP_ASSET_RATE_KBPS`, default **1.2 MB/s**; `0` off) so a pre-cache never starves live matches.
4. **Optional local origin** — `public/js/assetSource.js` probes `127.0.0.1` for the same `revision` and points the
   worker at a player's own machine.

The boot `preloadArt` (main.js) uses the cache in `cache` mode and caps how long it may hold the title (60 s); the
first-visit chooser and the 设置 row are `public/js/ui/assetMode.js`. Tests: `test/ui/asset-cache.test.js`,
`test/asset-index.test.js`, `test/asset-rate-limit.test.js`, `test/asset-mirror.test.js`, `test/asset-idb.test.js`,
`test/ui/preload.test.js`. Config: `public/asset-mirrors.json` (the origins — the ONLY place they live; the console's 来源配置 view edits it live), `SP_ASSET_RELAY` (override the full origin), `SP_ASSET_REF=''` (turn the origins off), `SP_ASSET_RATE_KBPS` (fallback pace).

---

## 10. Where our custom content lives

Relative to the upstream, this fork adds the account/matchmaking/spectate/admin features, the lobby community
(更新日志 / bug提交 / 公开房间, §13) and **eight** custom shop
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
| 克莱门莎 | `char_4231_clemnt` | 6 | `chess_char_4231_clemnt-clemnt.js` (+ `primguard` in `professions.js`) | §37 |

Related custom mechanisms: the leave/takeover seat rules (`server/lobby.js removeMember` → `handSeatToAI` →
`Match.aiTakeOver`, §35.5), the 联防 arena (§35.4), the 余音 re-entrancy fix (§35.6), and the added data-layer
handlers (`act1autochess_gar_event_dollswap_self`, `act1autochess_gar_event_airweight_fear_ammo`, `pool_equip_all`).

**Merge blacklist** (`docs/MATCHMAKING.md` §22): the upstream 盟约条折叠 (#149) and our own removed 最近的同盟
**must never come back**. When merging upstream, resolve hunk-by-hunk keeping both sides and honour the blacklist —
the exact procedure is in [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md).

---

## 11. Publishing (GitHub primary + Gitee mirror)

The canonical copy is the git store; the **`github` remote (primary)** and the **`gitee` remote (国内下载镜像)** mirror
it, and the working project is a local mirror of the store. After any change:

```powershell
node tools/push-gitee.mjs -m "what changed"
```

The helper commits what you staged in the store, pushes the store's `HEAD` to every configured remote, the GitHub
primary first and then `gitee/master` (fast-forward, never forced; `--remote`, `--all-remotes` and `--tags` steer it),
and then mirrors the store's **tracked** files into the working project (`.gitignore` respected; dev-tree-only
files are left alone). The flow is **one-way — store → remotes → working project**; the helper **never overwrites the
store with the working project**. Copying the working project into the store is the explicit, opt-in `--from-dev`
(otherwise the helper warns when the trees diverge and restores the working project from the store). The owner's
convention is **之后每次有更新都提交下**. Credentials: GitHub uses the owner's configured git credential helper (or
per-run `GITHUB_TOKEN`); Gitee uses the ASCII login `marseille1` + a personal access token via `--interactive` or
per-run `GIT_USERNAME` / `GIT_PASSWORD` (the helper writes them to a temp file outside the repo). Neither is ever
committed — the full instructions, the merge discipline and the production deploy procedure are in
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md).

---

## 12. Our fork-only mechanisms — the merge-critical catalog

The account/matchmaking/spectate/admin features and the custom operators exist **only in this fork**. Before merging
upstream (or when a newcomer asks "what is ours?"), work from
[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) — the catalog that gives, **per mechanism**, what it is, where the code
lives, how to extend it, the tests that pin it, and an explicit **我们独有，非上游；合并时不得丢失** note:

| § | Mechanism |
|---|---|
| 1 | Custom operators (`CUSTOM_CHESS` + `applyCustomChess`, the `CUSTOM_BASE_IDS` stand-in exemption, the 8 kits) |
| 2 | The two-tier battle-effect system (procedural + optional local art; the generated `FX_OFFICIAL` table; the committed manifest) |
| 3 | The local-art pipeline (`tools/local-extract/extract.py`, the `.venv-extract`, the committed manifest bridge) |
| 4 | Asset sources (`--asset-source=direct|mirror|gitcode`) and the local-client-first rule |
| 5 | Our carried decisions (the §22 blacklist, funnel hits, 望's pieces, kalts2, 克莱门莎, leave→AI, the notice convention, golden attribution) |
| 6 | Publishing (the GitHub primary + Gitee mirror, the byte-for-byte tree discipline, the notice-first deploy order) |

It points at — and does not duplicate — [`docs/MATCHMAKING.md`](MATCHMAKING.md) §22–§41 (the decision record) and
[`docs/ASSETS.md`](ASSETS.md) (the asset detail). Its appendix is the merge checklist of fork-only files.

## 13. Lobby community data + match statistics (our SQLite schema, `server/community.js` / `server/stats.js`)

The lobby's 更新日志 panel and the bug提交 panel (opened from the 设置 dialog since 2026-10-11 — see `docs/MATCHMAKING.md`
§36.8; the server side of 公开房间, whose directory is a full screen now —
`screens/rooms.js`, not a panel) live in the **same `node:sqlite` database as accounts**
(`server/db.mjs`, now schema **v5**). The `migrate()` step adds three tables — `changelog`, `bug_reports`,
`bug_uploads` — under the same `PRAGMA user_version` discipline (v3); v4 adds `changelog.summary` / `source` /
`minor_seq` for the one-line gist and the notice-appended minor versions; **v5 adds `match_stats`** (the server-side
match statistics, `server/stats.js`, docs/MATCHMAKING.md §40): one normalized record per finished match, keyed to an
**owner** — `account_id` for a registered player, `guest_id` for a guest's session `playerId` (exactly one set). `CommunityService` /
`StatsService` mirror `AuthService`: one
`DatabaseSync` handle, prepared statements, synchronous methods; `openMemoryDb()` gives tests the schema.

Bug-report images are **files** under `var/bug-uploads/` (git-ignored, never statically served); the database keeps
only the relative path + mime + byte count + uploader + time. The real content type is sniffed from the bytes
(png / jpeg / webp only — no svg / html), never a filename. See
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §36 for the endpoints, limits and the client panels.

The schema now holds `accounts`, `sessions`, `changelog`, `bug_reports`, `bug_uploads` and `match_stats`:
**the room text chat (docs/MATCHMAKING.md §38) is deliberately NOT in the DB** —
a message is validated and broadcast as a transient `m.chat` frame (`server/lobby.js` `chat()`), shown as a short-lived
bubble on the client; it is never buffered, never written to `var/*.db` or disk, and is gone as soon as it is displayed.
Do not add a `chat` table to `server/db.mjs` / `CommunityService`.

The server-side account system (`server/auth.js`) and the `match_stats` statistics are **our fork's divergence** from
upstream — mainline ships neither, only the local (browser-only) statistics page of PR #323. The design summary written
for upstream developers (owner key, the 2× caps, the `localStorage` offline fallback, the privacy scope and the
"optional backend" recommendation) is in [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) — 「账号与统计：与主线的设计差异」.

---

## 14. Upstream features carried in by the v0.2.6 merge

The **whole-branch merge of mainline v0.2.6** (2026-10-14, `sganggs/Stronghold-Protocol` `488db49f`, 380 commits) brought
upstream's **own** subsystems into this fork. They are upstream code, not ours, but they now live here — keep them green and
do not revert them by accident. The full record is [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §11.

| Feature | Where | Notes |
|---|---|---|
| 潜能 / 练度 (per-operator potential + level; R21P / R22-LOADOUT) | `shared/potential.js`, `shared/loadoutRecord.js`, `server/match/player/{basics,diy}.js`, `public/js/ui/loadoutModel.js`, `public/js/screens/cultivation.js` | upstream's; the fork **keeps and adapts** it. The default is **潜能 1 / 未精英化** (2026-10-15, the owner's decision — the official baseline for an operator the player does not own; full potential / 精英2 Lv.60 was the default before), so content tests are pinned at those numbers |
| 文字大小 (text-size scaling) | `public/js/ui/gameLogic/settings.js`, `public/css/*.css` (`calc(NN * var(--t))`) | every font size is `calc(… * var(--t))`, driven by the 设置 rows; a few test-pinned plain selectors stay literal |
| 弹药数量 (ammo count on the unit strip; #552) | `public/js/render/app.js`, `public/js/render/units.js` (`ammoCount`) | |
| Spine clip bounds / impostor sizing (#542) | `public/js/render/spine.js` (`clipBounds`, `CLIP_SAMPLE_*`), `public/js/render/units.js` | sizes a unit's slot from the clips it actually plays |
| Device slabs on the official 3D scenes (#569) | `public/js/render/board3d/scene.js` (`M.raised`) | |
| Deploy replay / landing sounds (#416) | `public/js/render/` + `server/sim/` | |
| Content-hashed asset URLs, brotli, traffic counters | `server/http/assetIndex.js`, `server/http/files.js`, `server/http/traffic.js` | the delivery chain is §9.2 |
| Per-character voice dubs (设置 → 语音语言) | `public/js/voicePrefs.js` (`VOICE_LANGS`, `sanitizeVoiceOverrides`), `public/js/ui/gameLogic/settings.js` | |

**Removed from upstream on purpose:** the standalone 克莱门莎 `op-clemnt.js` kit (we ship our own
`chess_char_4231_clemnt-clemnt.js`) — the never-merge list, [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0.


## 15. v0.3.1 / v0.3.2 mainline plugin-stack catch-up (2026-10-19)

This branch is a **feature-level port**, not a literal whole-history merge of mainline. The mainline tip
`d905c146` / `c9d804f4` (0.3.1 → 0.3.2) was folded in selectively: plugin/Forge files and their tests were
taken together where they form one unit, while files owned by the fork (accounts, community, stats, training,
the 8 custom operators, the 3D board/scene stack and the 0.4.0 version) stayed ours. The full decision log is
`docs/UPSTREAM-MERGES.md` §13.10; this section is the developer map.

### 15.1 What came from mainline

| Area | Mainline source | Where it lives here | Tests / notes |
|---|---|---|---|
| Plugin system P0–P4 | P0 `c57c78b`, P1a `83b89cf`, P1b `fc768aa`, P1c `4f82d2f`, P2 `7dc4c846`, P4 `ba352f1` | `server/plugins/`, `shared/plugins/`, `schemas/`, `server/studio/`, `public/studio/`, `server/http/{routes,static}.js` | `test/plugins/`, `test/studio/`, `test/schemas/`; content identity `cs`, room content sets, DSL-lite, sandbox UI |
| W1–W5 / U-Forge | W1–W5, U1–U6 / Forge | `shared/plugins/{theme,notices,rules,records,errors,surface}.js`, `server/plugins/{registry,contentData,forgeImport,pack}.js`, `public/js/ui/{pluginTag,pluginPanel,notices}.js` | `test/plugins/forgeImport.test.js`, `test/plugins/...`; Forge packs, rules, records and official-skill binding |
| Offers | W2 offers | `public/js/ui/offerOverlay.js`, `public/js/ui/gameActions.js` (`offer`), `public/js/screens/game.js`, `public/css/screens/game-panels.css` | `test/ui/plugin-offers.test.js` |
| Plugin settings UI | upstream plugin panel | `public/js/ui/pluginSettings.js`, `public/js/ui/numberInput.js`, `public/js/ui/pluginPanel.js`, `public/js/ui/pluginTag.js` | UI/plugin tests; range/step validation, rule line |
| Test console + `SP_TEST_MODE` | upstream 0.3.1 test console | `public/js/ui/{testConsole,testDock,testAudit}.js`, `server/lobby.js` (`room.test`, `setTestHost`), `server/match/{testCommands,testTrace,testReplay}.js`, `shared/testMode.js` | `test/test-mode.test.js`; create/join/spectate consent, `g.test`, audit, timers, replay, results excluded from stats |
| Skins | #685 / #686 | `shared/protocol.js` (`room.skins`, `SKIN_LIMITS`), `server/match/{PlayerState,player/basics,player/views,player/round,views}.js`, `public/js/assets.js`, `public/js/render/{app,units,app/info}.js`, `public/js/ui/{skins,skinPicker}.js`, `public/js/screens/{loadout,diy}.js` | `test/skins.test.js`, `test/lobby-skins.test.js`, `test/ui/{skin-picker,fieldHost-skins}.test.js`, `test/render/skin-presentation.test.js`; `docs/SKINS.md` |
| Seven official 0.3.1 `op-*` kits | 0.3.1 official packs | `server/sim/content/kits/ops/op-{ascln,gdglow,narant,aglna2,wang,kalts2,clemnt}.js` | `diy.officialPool` keeps them compatible with our custom shop operators; `test/diy.test.js`, `test/content/{kits_layout,chess_kalts2}.test.js` |
| 7 UI PRs | #695 / #696 / #698 / #699 / #703 / #704 / #705 | `public/js/ui/{matchPopups,protocolBoot,turnPopup,bossPlates,downedPlate}.js`, `public/js/screens/{lobby,sweep,settle,game}.js` | already merged before the plugin stack; this branch keeps them green |
| VFX remainder | `e7bad52b`, `094ca50a`, `2b461767`, `06e49fa7`, `f37dc893` | `public/js/render/vfx/{effect,geom,wiring,skillfx,skills,yuwall}.js`, `public/js/render/{spine,units,skillAttack,manifold}.js` | `test/render/{vfx-orient,vfx-areas,vfx-psys,vfx-reported031,skill-attack-mode}.test.js` |
| Stats | P1c `withModded` | `public/js/screens/stats.js` | overview switch; test results and modded matches excluded by default |
| Setup / local extraction | 0.3.1 plugin art + 0.3.2 `#728` | `tools/setup.mjs`, `tools/local-extract/{operators.py,plugin-art.mjs,extract.py}`, `server/plugins/artReferences.js`, `server/http/assetViews.js` | `test/setup-plugin-art.test.js`, `test/render/plugin-official-art.test.js`, `test/local-extract-operators.test.js`, `test/setup-assets.test.js` |
| `#670` | `043d7959` | `test/assets-env-proxy.test.js` | exact two first-hop forms, local-only relay |
| Admin plugin/content operations console (fork) | fork improvement, 2026-10-19 | `server/admin.js` (`buildPluginSnapshot`, `rooms[].content`), `server/index.js` | `test/admin.test.js`: read-only installed plugins, policy, room `cs`/`vs`, script/trusted, consent and plugin notices |
| Mainline 0.3.x app-range compatibility (fork) | 2026-10-19 | `shared/plugins/manifest.js` (`appVersionCompatible`, `PLUGIN_COMPAT_APP`, `PLUGIN_COMPAT_CLASSES`), `shared/plugins/catalog.js`, `server/plugins/contentSet.js` / `roomSets.js` | `test/plugins/manifest.test.js`: lang/cosmetic/ui accept 0.3.x ranges; content/script/trusted strict by default, owner `allowIncompatible` opt-in |

### 15.2 Fork adaptations that must survive

- Plugin manifests accept our **0.4.0**: app range `>=0.3.0 <0.5.0`.
- `shared/plugins/validate.js` has the **`skipStandIn`** hook (our custom operators have no official stand-in).
- `shared/constants.js` carries the **8 plugin rejection codes** the fork's error table requires.
- The seven official `op-*` packs are **official-DIY picks of the same charIds** as our custom shop operators, separated by
  `diy.officialPool`; do not merge `ownedPool` and `officialPool`, and do not replace the custom `chess_char_*` kits.
- `server/match/player/items.js` keeps equipment debt out of the fork; item stock tests are intentionally fork-shaped.
- Skins/test paths and local-extraction Windows cases use the fork's Windows-safe test adaptations.
- The fork keeps **0.4.0** version metadata; 0.3.1/0.3.2 `package.json` / README / CHANGELOG version changes are not taken.

### 15.3 Run the relevant suites

```powershell
node --test test/plugins test/studio test/schemas
node --test test/test-mode.test.js
node --test test/skins.test.js test/lobby-skins.test.js test/ui/skin-picker.test.js test/render/skin-presentation.test.js
node --test test/ui/plugin-offers.test.js test/ui/fieldHost-skins.test.js
node --test test/render/vfx-orient.test.js test/render/vfx-areas.test.js test/render/vfx-reported031.test.js
node --test test/setup-plugin-art.test.js test/render/plugin-official-art.test.js test/local-extract-operators.test.js
npm run ci
```

A dedicated engineering review of this plugin stack — architecture, security boundaries, residual risks and the verification blind spots — is in [`PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md).

### 15.4 Plugin development and Forge-pack handbooks

- **Normal plugins** (cosmetic / content / ui / script / lang): read [`PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md). It starts from `node tools/plugin.mjs new …`, explains the manifest and each class, the sandbox script lock/consent gates, local checks, packaging and the browser E2E.
- **Forge packs**: read [`FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md). It explains the pack layout, the products an import produces, the clean-import field rules, the scripts/panels/i18n boundaries, and how to read `IMPORT-REPORT.md` / `--json`.
- **What cannot be imported**: the field-level matrix is [`FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md). In short, `server` / `routes` / `assets` / `forms` / `fx` / `behaviour` / `combat` / `layer` are refused by design; modules, potentials, summons and some base fields are dropped with a report entry.
- **Operations checks**: `/admin` → 插件与内容 shows installed plugins, compatibility, skipped plugins and warnings; the full snapshot is read-only.
