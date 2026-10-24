# Our fork-only mechanisms (merge-critical)

Who this is for: **a future upstream merge** and **a newcomer maintaining this fork**. Everything below is
**ours — not upstream**. It exists so that (a) a merge knows these mechanisms are here and must be preserved, and
(b) a maintainer can change them without re-deriving them from the code.

> **Contents.** §1 Custom operators (`CUSTOM_CHESS`) · §2 The two-tier battle-effect system · §3 The local-art pipeline · §4 Asset sources (mirrors) · §5 Our carried decisions · §6 Publishing (GitHub primary + Gitee mirror) · §7 Lobby community data · §8 Post-0.3.0 surface (feedback7 R22 / R23) · §9 Title-screen surfaces · Appendix: fork-only merge checklist.
> See also [`docs/QUERY-INDEX.md`](QUERY-INDEX.md) (lookup).

Read this together with:

| Read this | For |
|---|---|
| [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) | the repository map; §12 points here |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) §22–§37 | the **decision record**: why each of these exists, the evidence, the honest caveats |
| [`docs/ASSETS.md`](ASSETS.md) "Battle effects" / local-client sections | the asset-side detail this file summarises |
| [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) | the end-to-end recipe for a custom operator |
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | the merge discipline, the GitHub/Gitee push, the deploy order |

> Convention for this file: every mechanism carries a **我们独有，非上游；合并时不得丢失** note. During an upstream
> merge, resolve hunk-by-hunk keeping both sides (never `git checkout --ours/--theirs` on a source file) and treat
> any change that would drop one of these as a stop-and-ask-`d星空之下` item (`docs/AI-WORKFLOW.md` (e)).

---

## 目录

> 导航用；每节正文才是准的（按标题里的编号 grep 更快）。

- 1. Custom operators (`CUSTOM_CHESS`)
- 2. The two-tier battle-effect system (procedural + optional local art)
- 3. The local-art pipeline (`tools/local-extract/`)
- 4. Asset sources (mirrors) and the local-client-first rule
- 5. Our carried decisions (the §22 blacklist, traits and rules)
- 6. Publishing (the GitHub primary + Gitee mirror and the deploy order)
- Appendix: fork-only surface — a merge checklist
- 7. Lobby community data (`server/community.js`)
- 8. Post-0.3.0 surface from the feedback7 merge (R22 / R23)
- 9. Title-screen surfaces from another deployment (announce / about / install)
- 10. Local asset cache (`public/sw.js` + `public/js/assetCache.js`)
- 11. OUR difficulty layer (`data/tuning.json` `boost`)

## 1. Custom operators (`CUSTOM_CHESS`)

> **我们独有，非上游；合并时不得丢失** — the eight custom shop operators and their data/kit/art wiring are added by
> this fork and are absent from upstream `master`. Upstream has (or has had) a *different* feature: the
> 补位/自选 (stand-in / DIY) pool. The two must not be confused (see §5).

**What it is.** Eight operators not in the official season roster are injected into the generated season tables as
formal shop chess, each with a data entry, a hand-written kit, and (usually) art/voice. They are added through
`CUSTOM_CHESS` in `tools/build-data.mjs`, merged into the official `activity_table` season tables by
`applyCustomChess(act, charTable)` **before** the normal build runs, so every downstream rule (shop, bonds,
garrisons, tokens, counts) applies unchanged.

| Operator | charId | Tier | Kit file (`server/sim/content/kits/ops/`) | Record |
|---|---|---|---|---|
| 阿斯卡纶 | `char_4132_ascln` | 3 | `chess_char_4132_ascln-ascln.js` | `docs/MATCHMAKING.md` §23 |
| 结城理 | `char_4217_makoto` | 3 | `chess_char_4217_makoto-makoto.js` | §24, §29, §35.3 |
| 予愿安洁莉娜 | `char_1015_aglna2` | 3 | `chess_char_1015_aglna2-aglna2.js` | §25 |
| 望 | `char_2027_wang` | 6 | `chess_char_2027_wang-wang.js` (+ `wangStone` in `server/sim/content/tokens.js`) | §30, §35.8 |
| 澄闪 | `char_377_gdglow` | 3 | `chess_char_377_gdglow-gdglow.js` | §31 |
| 娜仁图亚 | `char_4138_narant` | 3 | `chess_char_4138_narant-narant.js` | §32 |
| 凯尔希·思衡托 | `char_1052_kalts2` | 4 | `chess_char_1052_kalts2-kalts2.js` | §34, §35.1, §35.7, §35.9 |
| 克莱门莎 | `char_4231_clemnt` | 6 | `chess_char_4231_clemnt-clemnt.js` | §37 |

**Where the code lives.**

- **Data injection** — `tools/build-data.mjs`:
  - `CUSTOM_CHESS` (the table, ~line 303): one record per operator (`charId`, `baseId`/`goldenId`, `tier`,
    `identifier`/`shopLevelSortId`, `defaultSkillIndex`, `defaultUniEquipId`, `bonds`, `normal`/`golden` status,
    `garrison`/`garrisons`, optional `tokenIds`). The golden form's 盟约/属性类 trait is `eliteGarrison` /
    `eliteGarrisons`; it doubles those effect values (not the trigger conditions), so the elite text and blackboard
    agree. Non-bond prep effects (澄闪's purchase price, 凯尔希·思衡托's equipment count) keep the normal value.
    `applyCustomChess` writes the separate `_a` / `_b` garrison records.
  - `applyCustomChess(act, charTable)` (~line 494) merges each record into `charChessDataDict`,
    `charShopChessDatas`, `chessNormalIdLookupDict`, `bondInfoDict.chessIdList` and `garrisonDataDict`, and injects
    the `tokenIds` summon records.
  - `CUSTOM_BASE_IDS` (~line 491) = the base ids of `CUSTOM_CHESS`.
- **The custom-only exception** (the reason `CUSTOM_BASE_IDS` exists): the stand-in validator at the end of the
  build (`buildBackups`-adjacent, ~line 4050) composes each shop chess into its 补位 stand-in from
  `data/backups.json` and errors when none exists. `if (CUSTOM_BASE_IDS.has(c.baseId)) continue;` **exempts the
  custom chess** — they are always-owned and have no official stand-in character. This is the one place the build
  knows about our operators; keep it.
- **Kits** — one file per operator in `server/sim/content/kits/ops/`, registered in
  `server/sim/content/kits/index.js` `KIT_FILES` (our tier-3, tier-4 and tier-6 entries are marked
  `// custom (tools/build-data.mjs CUSTOM_CHESS)` in the list). Naming, contract and registration rules:
  `server/sim/content/kits/README.md`; enforced by `test/content/kits_layout.test.js`.
- **Engine carve-outs some of them rely on** (documented in `docs/DEVELOPMENT.md` §6): `stalker` (阿斯卡纶),
  `dollkeeper` (结城理), `skywalker` (予愿安洁莉娜), `traper` + `wangStone` (望), `funnel` (澄闪), `loopshooter`
  (娜仁图亚), `watchman` (凯尔希·思衡托), `primguard` (克莱门莎 — 放逐 / 传送 `Battle.banishEnemy` / `banishGroup`,
  强制缴械 `disarmForce`；`docs/SIM.md` §8).

**How to extend.** Follow [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) end to end: (0) confirm the operator is not in
the roster; (1) cache the official tables; (2) add a `CUSTOM_CHESS` entry and rebuild; (3) hand-write the kit
(reuse the shared tier helpers; only add an engine flag in `server/sim/` when there is genuinely no existing
profile); (4) add art/voice (`docs/research/07-assets.json` + `fetch-assets`, or the local-client extract); (5)
update the **count assertions** listed in NEW-OPERATOR §5; (6) record a `docs/MATCHMAKING.md` section. The worked
example is 阿斯卡纶 (§23).

**Tests that pin it.**

- `test/data.test.js` — the roster counts (`chess: 280 records, 119 visible non-DIY`, `visible.length`, per-tier
  counts, DIY/diy interplay).
- `test/content/chess_kalts2.test.js` — the 凯尔希·思衡托 custom chess, including "not a 自选 pick".
- `test/content/feedback-wang.test.js` — 望's 棋子 mechanic.
- `test/content/kits_alt_t3.test.js` / `kits_alt_t4.test.js` / `kits_alt_t6.test.js` — per-tier kit audits.
- `test/content/kits_layout.test.js` — the KIT_FILES naming/registration contract.
- `node tools/kit-coverage.mjs` — every chess has a kit and every skill is covered.
- Plus the loadout/pool counts in `test/{ui,match,sim}/loadout.test.js`, `test/match/pool.test.js`.

**Merge self-check.** `grep -c "char_4132_ascln\|char_4217_makoto\|char_1015_aglna2\|char_2027_wang\|char_377_gdglow\|char_4138_narant\|char_1052_kalts2\|char_4231_clemnt" tools/build-data.mjs` must stay at 8; the eight kit files must be present in `KIT_FILES`; `node tools/build-data.mjs --offline` must be error-free.

---

## 2. The two-tier battle-effect system (procedural + optional local art)

> **我们独有，非上游；合并时不得丢失** — the procedural/local two-tier model, the per-client resolution and the
> generated `FX_OFFICIAL` roster table are ours. Upstream draws battle fx one way.

**What it is.** Every battle-fx **kind** has two tiers, resolved **per client at render time**:

1. **the procedural tier** (`a` + `c` + `r` in `FX_KINDS`) — drawn at run time from the FX atlas
   (`public/js/render/textures.js`). It is **mandatory**, offline, and needs no local client. It is what a client
   without any local art sees.
2. **the optional local-art tier** — a kind's `local` spec (`{ group, layers: [{ name, scale? }], tint?, dur? }`,
   plus `bySkill` / `byOp` attribution) names official pictures in the local-client manifest
   (`data/local-assets.json`, or the committed `data/local-assets.committed.json`). It is drawn **only** when the
   client lists **every** layer **and** it has loaded; otherwise the procedural tier is drawn. Every layer is drawn as
   an **in-place ground field at the anchor, size-capped to ~one body**: `simfx.js` `_fxLocal` scales the layer set's
   drawn radii (`r × layer.scale`) down together so the largest is at most `LOCAL_FX_MAX_R` (= 1.1 tiles,
   `localart.js`), preserving the ratios. An official picture never covers the board.

So the same effect is never a blank frame and the fallback never touches the network — the owner's
"graceful degradation" rule (the Minecraft-shader analogy). A listed-but-still-loading layer is prefetched and a
listed-not-loading layer is retried on a later event; a layer the manifest does not list is **never fetched**.

**Where the code lives** (`public/js/render/fx/`):

- `kinds.js` — `FX_KINDS`: every kind's procedural archetype and (optionally) its `local` spec. A kind shared by
  many operators keys its layers by `local.bySkill` (an explicit label) or `local.byOp`
  (`<spine|defId>` — the emitting operator, e.g. `token_10064_wang_stone1` for 望's 棋子).
- `localart.js` — the resolver: `fxLocalLayers` / `fxLocalFor` (base + `bySkill` + `byOp` merge, then the
  `FX_OFFICIAL` fallback), `fxLocalSource` (which layers are listed **and** loaded), `fxOfficialFor`.
- `simfx.js` — `FxSim.simFx` / `_fxLocalOp`: attributes the event to a `spine`/`defId` and draws the official
  layers as size-capped ground fields **instead of** the procedural archetype.
- `rings.js` — `ring()` accepts a PIXI texture (scaled by the picture's own size, not the atlas 128²).
- `system.js` — installs the method containers onto `FxSystem`.
- `official.js` — **generated** `FX_OFFICIAL`: `opId → { group, kinds, layers }`.

**The generated roster table.** `tools/build-fx-official.mjs` reads `data/chess.json` (the visible roster), the fx
kinds each operator's kit actually emits (by scanning `kits/ops/*.js`) and the committed manifest
(`data/local-assets.committed.json`), and picks up to two signature Texture2D layers per operator — only **soft
in-place effect pictures** (the `flow` / `ray` / `glow` / `ring` / `star` / `light` / `smoke` / `aura` / `halo`
families, `EFFECT_TEX`; walls, decals, patterns and object / prop / icon-looking textures are never used, and a bundle
with no qualifying picture is absent). It never picks an animation grid (a `flipbook*` / sprite-sheet / atlas image
packs many frames, so drawing it as one layer shows a whole sheet of images) nor a denied kind: only **AREA / SELF**
kinds (archetypes `blast` / `zone` / `healAoe` / `wave` + `buff` / `shield` / `shatter` / `summon` / `vanish` / `lift` /
`sleep` / `heal` / `down` / `counter` / `dodge` / `dp` / `coin` / `sp`, `KIND_ARCH`) are listed — per-attack / impact
kinds (`crit` / `strike` / `slash` / `beam` / `bolt`) and per-target / instant / unit-attached kinds (`volley` /
`shell` / `move` / `blink` / `mark` / `reticle` / `flame` / `wall` / `chill` / `telegraph`) are drawn procedurally,
because a ground field on them just litters the board. An operator whose usable art is all sheets / non-effect
pictures, or whose kit emits only denied kinds, is absent. It writes
`public/js/render/fx/official.js`; `--check` fails when the committed file is stale, `--print` prints the table.
An operator may be pinned by hand in `tools/local-extract/fx-official-overrides.json` (the pin is filtered the same way;
the file is created on demand — it does not ship). Our `CUSTOM_CHESS` operators are skipped before the pin lookup
(`identifier ≥ 900`), so a pin cannot put one back. Because the table is data, a registered operator supersedes the
procedural archetype **without editing any kit or kind**. Only the kinds a kit actually emits are listed (an operator
with no attributable skill fx is absent).

**The normal-attack impact is procedural for the whole roster (our operators included).** The official per-attack hit is
a particle-system effect prefab each projectile prefab names in `_effectsWhenHit` (`common_hit_01` / `<op>_hit_01` …), a
cluster of `ParticleSystem`s, materials and transforms, **not** the operator's one signature Texture2D. An earlier design
gave every operator a shared `hit` kind drawn from that signature texture as a ground field at the victim; it was removed
as visibly wrong (wrong texture, wrong anchor/scale). A later design **hand-authored** the impact of our seven custom
operators (`render/fx/hits.js` `FX_HITS`, keyed by `charId`, anchored at the impact / body, read from their `_*_hit_*`
prefab). The owner dropped it (2026-10-16): our operators now behave exactly like the roster. `render/fx/projectiles.js`
`_impact` (ranged) and `render/fx/numbers.js` `damage` (melee) draw the **procedural** hit for everyone and never consult
the manifest; with the official battle effects on, the official hit is drawn instead (`render/vfx/wiring.js` `noSpark`).
The `hit` kind, `fxOfficialHit` and `OFFICIAL_HIT_KINDS` stay gone.

**Our custom operators use the official battle effects too (owner, 2026-10-16).** The 8 `CUSTOM_CHESS` operators
(阿斯卡纶, 结城理, 予愿安洁莉娜, 澄闪, 娜仁图亚, 凯尔希·思衡托, 克莱门莎, 望) are official characters whose extracted prefabs
exist, so the official layer (`render/vfx/**`) draws their attacks and skills like any other operator's (verified
per-operator, `docs/UPSTREAM-MERGES.md` §4). They are deliberately **absent** from the fork's per-operator local tiers:
no `FX_OFFICIAL` entry (`tools/build-fx-official.mjs` skips `identifier ≥ 900`, i.e. `CUSTOM_CHESS`), no hand-wired
`local.byOp` kind art, no `FX_HITS`. Without the official effects (official fx off, or a clone with no extraction) they
fall back to the **plain procedural archetype** — exactly the same fallback as the rest of the roster.

**Planned future task — the official particle-system importer (not implemented; do not start without the owner).** The
honest limit above is that we approximate each official impact instead of replaying it. To replace the procedural /
hand-authored tier with faithful per-attack impacts for **every** operator, we would need:
1. a **Unity particle-system importer** for the effect prefabs under `battle/prefabs/effects/<stem>.ab` — decode each
   hit prefab's `ParticleSystem` cluster (InitialModule startLife/Size/Colour/Speed, ShapeModule type+radius,
   EmissionModule bursts/rate, material `_MainTex` + `_TintColor`, renderer renderMode, sub-emitters) and replay it in
   the Pixi fx system; and
2. a **per-operator projectile → `_effectsWhenHit` mapping** — read `battle/prefabs/[uc]projectiles.ab` (2,858 prefab
   objects, ~2,173 with `_effectsWhenHit`), resolve each `projectile_<op>` / `projectile_<op>_s*` prefab's
   `_effectsWhenHit` list (the generic `common_hit_01` / `common_heal_hit_01`, or `<op>_hit_01` /
   `<op>_attack_*_hit`), and map it onto the sim's emitted attack (kind + skill), distinguishing `common.ab` (shared)
   from `<op>.ab` (per-operator).
Both are readable today with the existing UnityPy venv (`.venv-extract` at the repo root, UnityPy 1.25.4 +
`aklz4.py`). What it would unlock: faithful per-attack impacts for the whole roster, retiring the procedural hit.
Evidence / paths (client `.../StreamingAssets/AB/Windows`): `battle/prefabs/[uc]projectiles.ab`
(2,858 prefabs; `common_hit_01` = 5 ParticleSystems, `gdglow_hit_01` ≈ 12, `kalts2_skill_01_hit_01` = 14); the effects
in `battle/prefabs/effects/*.ab` (`common.ab` shared vs `<op>.ab` per operator; `fx/<stem>` groups in
`data/local-assets.committed.json` carry the extractable Texture2D only).

**The committed local manifest (so a clone gets it).** `tools/local-extract/extract.py` writes the per-machine
`data/local-assets.json`, which is git-ignored. The art under `public/assets/local/**` **is** committed, so
`tools/local-extract/committed-manifest.mjs` walks it and emits `data/local-assets.committed.json` in the same
`{ groups: { group: { name: { path, kind, w?, h? } } } }` shape. `server/http/static.js` serves the committed
manifest in place of an absent per-machine one, so a fresh clone gets the official tier with no extraction step.
Re-run it after changing the committed art.

**How to add a new effect.**

1. **Always** write/keep the procedural archetype first (`FX_KINDS` `a` + `c` + `r`). A `local`-only kind is a bug.
2. Only if the official art is obtainable, extract it (`tools/local-extract/extract.py`, the relevant fx job) and add
   the `local` spec (or rely on the generated `FX_OFFICIAL` table for a **roster** operator — our `CUSTOM_CHESS`
   operators are deliberately excluded: they use the official battle effects and fall back to the procedural archetype).
   The 驭械术师 浮游单元 (`PROJ.drone`) stays procedural because its textures live in unresolved external CABs (see §3).
3. `settings.localFx === false` opts the official tier off like a quality tier (on by default). To disable the whole
   local tier in one place, set the source-level `LOCAL_ART_ENABLED` (`public/js/render/fx/localart.js`) to `false` —
   then every operator (generated table, hand-wired kinds, hit flashes) falls back to procedural.

**Tests that pin it.**

- `test/render/fx-local.test.js` — the resolver, the per-client resolution (missing → procedural and no crash; present
  → local; listed-not-loaded → procedural this event / local next), the generated `FX_OFFICIAL` table (no `hit` kind),
  the normal-attack impact staying procedural for the roster and never consulting the manifest, our custom operators
  being **absent** from the table and from every kind's `local` spec (their shared kinds stay procedural, no fetch), and
  that the `fx/*` groups are committed on disk.
- `test/render/fx-kalts2.test.js` — the kalts2 S2 archetypes / colours / radii (no local art).
- `test/local-extract.test.js` — `node tools/build-fx-official.mjs --check` is up to date.
- `test/render/token-wang-stone.test.js` — 望's 棋子 burst kind.

**Merge self-check.** `public/js/render/fx/{kinds,localart,simfx,rings,system,official}.js` and
`tools/build-fx-official.mjs` must survive; run `node tools/build-fx-official.mjs --check`.

**我们的增量在「上游自己的文件」里（合并时必须活过）.** The official-effects runtime
(`public/js/render/vfx/**`) and the model code (`render/spine.js`, `render/units.js`) are **upstream's**
(upstream 0.3.0); our additions inside them are small and are exactly what a hunk-by-hunk mount drops:

| file | our addition | pinned by |
|---|---|---|
| `render/vfx/talents.js` | `LOOP_BUFF_BOUND` (+ each binding's `follow`) — a passive loop that must end with the buff the sim reports (空弦's 铁弦 shield) | `test/render/vfx-buff-layers.test.js`, `vfx-skills.test.js` |
| `render/vfx/talentfx.js` | `status()` and the `follow` branch of `_inForce` | same |
| `render/vfx/wiring.js` | `_fly`'s `AdvancedMovement.comeBack` return leg (the 回环射手's recovery animation) | `test/render/vfx-origins.test.js` |
| `render/spine.js` | `SpineActor.strikePose()` (the shot leaves at the clip's OnAttack frame), `attackAhead()` and the begin → loop → end attack timing | `test/render/vfx-strike-pose.test.js`, `attack-begin.test.js` |
| `render/units.js` | `boneOffset(..., strike)` and `_predictWindUp` (the rhythm wind-up) | `test/render/vfx-origins.test.js`, `attack-rhythm.test.js` |
| `dev/fx-viewer.{html,js}` | draws the unit's Spine with live bones so effects can be judged against the weapon (`&model=0` off) | the browser suites pass `&model=0` |

Mount those files as §6 says (hunk by hunk), then `npx eslint .` + `npm run typecheck`, **and compare the file's
symbols against upstream** — `app.js` `NO_SPARK` and `spine.js` `strikePose` were each a *use* mounted without its
*definition*, and one test stub hid the second (see [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0).

---

## 3. The local-art pipeline (`tools/local-extract/`)

> **我们独有，非上游；合并时不得丢失** — the local-client extraction pipeline, its job table, the committed
> manifest bridge and the dependency-loading model are ours.

**What it is.** A host-side extractor that pulls the art only a real game client has (the official 3D board, some
UI, the per-operator battle-effect textures, several enemy/token Spine models, the ported map effects) out of a
locally installed CN/JP client, writing `public/assets/local/**` plus a manifest. It is **optional** — the game
runs without it, with documented fallbacks (`docs/DEPLOY.md` §6).

**Where the code lives.**

- `tools/local-extract/extract.py` — the extractor. The `JOBS` table (~line 139) is `(bundle, output subdir,
  object kinds[, name filter])`: map themes, the autochess UI bundles, the emoticon themes, the guidebook, the
  projectiles, one fx bundle per visible operator, module icons, the board meshes and their prefabs, the gate /
  objective map effects and the shared water textures. `EFFECT_FX_BUNDLES` (~line 103/135) is the custom operators
  plus `roster_fx_bundles()` (every visible chess read from `data/chess.json`; `FX_BUNDLES` env overrides).
  `ENEMY_SPINES`, `TOKEN_SPINES`, `MESH_BUNDLES`, `DERIVED`, `WEBP` are the other tables.
- `tools/local-extract/committed-manifest.mjs` — the bridge from the committed art to
  `data/local-assets.committed.json` (§2).
- `tools/local-extract/extract-voice.py` — the per-operator voice extractor (JP from a local client, or PRTS for
  CN-only / new operators; see `docs/NEW-OPERATOR.md` §4).
- `tools/setup.mjs` — end-user entry point (creates `.venv-extract`, offers local extraction).

**The Python environment.** Extraction needs UnityPy, so the interpreter must be new enough: the project venv is
**Python 3.14** (`.venv-extract` at the repo root, `requirements.txt` = `UnityPy>=1.25`, `lz4>=4`,
`Pillow>=10`). **Python 3.8 is too old for the UnityPy build we use** — do not point the tooling at an old
system interpreter. Invoke the venv explicitly:

```powershell
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --game "<AB root>" [--only <subdir prefix>]
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --print-jobs   # the job table as JSON (no deps)
.venv-extract\Scripts\python.exe tools\local-extract\extract.py --webp          # only the WebP copies (existing PNGs)
```

**Client paths (CN/JP).** `--game` points at the client's `.../StreamingAssets/AB/Windows`. Defaults probed by
`extract.py` `CANDIDATES` (macOS CrossOver/iOS and the default Windows launcher installs). The installs this fork
has used:

- JP: `D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP\Arknights_Data\StreamingAssets\AB\Windows`
- B站国服 (often newer): `…\B站鹰角启动器\Arknights bilibili\Arknights_Data\StreamingAssets\AB\Windows`
  (the autochess bundles live under the same AB root).

A newer CN install may carry art the JP one lacks (new season tokens) and vice versa; extraction is per-machine,
so different machines can end up with different subsets — the committed manifest is the union that ships.

**The extract jobs, manifests and commits.**

- Output: `public/assets/local/**` + the per-machine **`data/local-assets.json`** (git-ignored). The extracted
  battlefield scenes (`public/assets/local/scene/**`) are **committed** too since 2026-10-14 — the owner lifted the
  old git-ignore so the CDN mirrors can serve them (ASSETS.md "The relay").
- The art under `public/assets/local/**` **is committed**; `node tools/local-extract/committed-manifest.mjs`
  regenerates **`data/local-assets.committed.json`** (committed). Re-run it whenever the committed art changes.
- `--only <subdir prefix>` re-extracts only matching jobs and **merges** their groups into the existing manifest
  (every other group is kept), so a refresh does not drop art this machine did not re-extract.

**How to extend.** Add a `(bundle, subdir, kinds[, keep])` row to `JOBS` (or an entry to the relevant table), run
`--print-jobs` to check, extract, then re-run `committed-manifest.mjs` and (if it feeds fx) `build-fx-official.mjs`.
`test/local-extract.test.js` pins the job table shape and the `--check` of the generated table.

**External-CAB dependency resolution.** A bundle's `Material`/Spine references can point into **external CABs** (a
dependency bundle), and some operator art was previously thought unobtainable because it lives there. The current
mechanism is minimal: `dep_bundles()` (~line 428) loads the `shaders/*.ab` bundles **beside a job that exports
`Material`s** so shader references resolve to a name (nothing is exported from them), and `_pptr_name()`
(~line 362) tolerates an **unloaded** external (returns `None` instead of throwing). Anything that genuinely lives
in an external CAB therefore used to fall back (e.g. the 驭械术师 funnel drone kept the procedural tier, §2).

> ⚠️ **In flight / not yet documented here.** A concurrent task is implementing **external-CAB dependency
> resolution** in `tools/local-extract/extract.py` (loading the referenced dependency bundles so art previously
> thought unobtainable — e.g. the funnel-drone textures — can be extracted). That work will write its own notes in
> this section. Until they land, treat the mechanism above as the whole story and do not assume the
> `dep_bundles` shader set is the only dependency set. **Read `extract.py` before changing dependency handling.**
> When the in-flight work lands: document the new dep-loading entry point, the job(s) it unblocks, the manifest
> groups and the tests it adds, and update §2's "funnel drone stays procedural" note accordingly.

**Tests that pin it.**

- `test/local-extract.test.js` — the job table (`--print-jobs`: map/material jobs, the per-operator `fx/<stem>`
  jobs, the token/enemy Spine jobs), the `--only` merge, the helpers (`dep_bundles`, `material_info`,
  `prefab_node`, `merge_alpha`, `pick_spine_node`, `atlas_pages`), and `build-fx-official.mjs --check`.
- `test/local-token-models.test.js` — the token-model manifest side.

**Merge self-check.** `tools/local-extract/extract.py`, `committed-manifest.mjs`, `extract-voice.py`,
`data/local-assets.committed.json` and the `EFFECT_FX_BUNDLES_CUSTOM` list must survive.

---

## 4. Asset sources (mirrors) and the local-client-first rule

> **我们独有，非上游；合并时不得丢失** — the `--asset-source` selection (in particular the `gitcode` mirror) is
> ours.

**What it is.** `tools/fetch-assets.mjs` downloads upstream art/audio/fonts from public community dumps. Because
GitHub is blocked on some of our networks, a **source selector** chooses the mirror:

| `--asset-source` | Order tried | Covers |
|---|---|---|
| `direct` (default) | raw GitHub, then jsDelivr | everything |
| `mirror` | the `SP_GITHUB_PROXY` prefix first (default `https://gh-proxy.com/`), then fall back | everything (a general GitHub proxy) |
| `gitcode` | the read-only GitCode raw mirror of `yuanyan3060/ArknightsGameResource` first, then direct + jsDelivr | **only** the yuanyan dump: avatars / portraits / skill icons / enemy icons. Spine (fexli), AA2 and Ark-Models have **no** GitCode mirror, so those still go direct + jsDelivr |

All three are anonymous and never look up the public IP. `SP_ASSET_SOURCE` sets the default; `SP_GITHUB_PROXY`
sets the mirror prefix (empty disables it). Mirror attempts have a header timeout; after a few consecutive
failures the mirror is disabled for the run and the original sources are used (`tools/assets/network.mjs`,
`tools/assets/sources.mjs`).

**The local-client-first rule.** Where a picture exists both locally and on a mirror, the client takes the
**local** copy first, then the mirrored/web copy, then a neutral fallback — the project's usual
"local → mirror → neutral" order. Examples: emotes / guidebook pages (`public/js/data.js artUrls`), module type
icons, enemy/token Spine overlays, and the battle fx (`local → procedural`, §2). `docs/ASSETS.md` has the full
fallback table.

**How to extend.** Add a new source in `tools/assets/sources.mjs` (`downloadUrls` / `isGitcodeUrl`) and
`validateSource` / `selectDownloadSource` in `tools/assets/network.mjs`, then document it in `docs/ASSETS.md` and
this table. Keep `direct` as the default and keep the mirror opt-in.

**Tests that pin it.** `test/fetch-assets-shrink.test.js` (the shrink guard and source handling),
`test/assets.test.js` / `test/assets-diy.test.js` (manifest/plan), and `node tools/doctor.mjs`.

**Merge self-check.** `tools/fetch-assets.mjs`, `tools/assets/network.mjs` and `tools/assets/sources.mjs` must
survive with the three sources intact.

---

## 5. Our carried decisions (the §22 blacklist, traits and rules)

> **我们独有，非上游；合并时不得丢失** — these are decisions/behaviours we deliberately keep. **Do not duplicate
> the prose here**: the authoritative record is [`docs/MATCHMAKING.md`](MATCHMAKING.md) §22–§37. This section is
> the index plus the mechanical self-checks.

| Decision | Where recorded | The rule, in one line |
|---|---|---|
| **Merge blacklist** | §22 | The upstream **#149 盟约收起** (foldable bond bar) and our own removed **最近的同盟** (recent-alliance chips) **must never come back**. |
| **干员默认 潜能 / 练度** | §45, `UPSTREAM-MERGES.md` §0 | The DEFAULT is **潜能 1 / 未精英化** (the official baseline for an operator the player does not own — owner, 2026-10-15) — a merge must **not** restore a 满潜 / 满练度 default. Self-check: `POTENTIAL_DEFAULT === POTENTIAL_MIN`, `CULTIVATE_DEFAULT === 0`, and `loadoutRecord` composes a default loadout (only 潜能 6 skips it). |
| **Free `<获得时>` / strategy grants are never item-stock-gated** | §39.2, `UPSTREAM-MERGES.md` §0 | 缪尔赛思's `<获得时>` and 变形者集群's R5/10/15 变形同构体 are free grants: our `acquireItem` has no `itemPool` check (upstream `6bfc08270c` drops `requirePool` → GitHub #488). |
| **Funnel-hits model** | §31, §35.2 | 澄闪's 浮游单元 all lock the **same** enemy and each deals her **full** ATK (not split); the `'bolt'`→`'drone'` projectile fix lives in `professions.js`. |
| **望's pieces** | §30, §35.8 | 棋子 placement / linkage: auto-placement only on orthogonally adjacent tiles so pieces link, latch on deploy, S3 ammo accounting, 跟子 priority. |
| **Kalts2 traits / behaviour** | §34, §35.1, §35.7, §35.9 | 整备能力 `pool_equip_all`, default skill S2, 守望者 heals (single-target) **and** attacks, S2 red/green feedback kinds. |
| **克莱门莎** | §37 | Custom tier-6 本源近卫: `primguard` branch (block 2, can hit air, blocked-first), the two talents, S1/S2/S3 verbatim from the blackboards, and the engine additions they need (放逐 `banishGroup`, 漩涡, 强制缴械 `disarmForce`). |
| **Leave → AI takeover / room disposal** | §35.5 | A human leaving a running match while others remain → seat handed to a fresh AI; only when **all** humans are gone is the room dissolved. Short disconnects use the reconnect grace, not takeover. |
| **Notice convention** | §28 | Every restart / server-file upload is preceded by an in-game notice signed **`d星空之下`**. |
| **Golden-attribution discipline** | §35.1 (worked example), `docs/DEVELOPMENT.md` §8 | Any `test/golden/*.json` move must be proven by reverting only your change → zero diff; never re-bless, never raise an engine guard. |
| **素材包 / 完整素材下载（#628）** | §22, `UPSTREAM-MERGES.md` §0 | 标题页**不提供**「下载完整素材 / 导入素材包」（owner 2026-10-17）：我们的素材链是**自有中继 → CDN 镜像 → 游戏服务器兜底**，客户端按实测速度选源并缓存，不需要玩家额外提供资源。 |

**The §22 self-checks (run after every upstream merge):**

```powershell
# #149 盟约收起 must not return:
grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server
# our removed 最近的同盟 must not return:
grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test
# #488: a free <获得时> / strategy grant must not be item-stock-gated — `acquireItem` itself has no pool check
# (the pool still filters what the SHOP / reward offers can generate: that is allowed):
node -e "const s=require('fs').readFileSync('server/match/player/acquire.js','utf8');const i=s.indexOf('acquireItem(');const j=s.indexOf('\n  }',i);process.exit(/itemPool|canGain|requirePool/.test(s.slice(i,j))?1:0)"
# #628: the title-screen full-asset download / asset-pack import must not return:
grep -rn --exclude=check-upstream.mjs "assetPack\|assetDownload\|下载完整素材\|导入素材包" public/js public/i18n server tools
```

All of them must be **empty** (the last one: no file and no string; `public/js/assetCache.js` is our own cache layer and is
not part of this). `git log -S bondsCollapsed -- public/js/screens/game.js` shows whether upstream re-added
it. The merge procedure and the blacklist are in `docs/AI-WORKFLOW.md` (b).

---

## 6. Publishing (the GitHub primary + Gitee mirror and the deploy order)

> **我们独有，非上游；合并时不得丢失** — the two-tree mirror discipline, the push helper and the
> notice-first deploy order are ours.

**What it is.** The git store `_merge-scratch` (branch `ours`) is the **single source of truth**: the history and
the committed files. The working project `Stronghold-Protocol` has **no `.git`** and is a byte-for-byte **mirror**
of the store. `tools/push-gitee.mjs` commits what is staged in the store, pushes the store's `HEAD` to the **GitHub
primary** and then the **Gitee 国内下载镜像**, and then mirrors the store's **tracked** files into the working project
(respecting `.gitignore`).

**The direction is one-way: store → remotes → working project.** The helper **never overwrites the store with the
working project** — a stale working project must not revert the store's newer commits. `--from-dev` is the explicit,
opt-in reverse sync (working project → store) and is **off** by default; without it the helper warns that the tree
diverged and restores it from the store.

**The byte-for-byte tree discipline.** The two trees must stay identical for every tracked file (`git ls-files`).
Verify without copying:

```powershell
# run inside _merge-scratch; empty output = the working project equals the store's HEAD
git --work-tree=D:\DOTK\Stronghold-Protocol status --short --untracked-files=all
```

The store's `node_modules`, `.cache` and the `public/assets`, `public/fonts`, `public/vendor` trees are junctions
onto the working project, so builds/assets are shared and not duplicated. **The store is the source of truth**;
the helper keeps the working project in step, and the mirror skips the shared junctions so files are never copied
onto themselves.

**The push.** Remote **`github`** (PRIMARY) →
`https://github.com/dxingkongzhixia/stronghold-protocol-secondary-development-download.git`, then remote **`gitee`**
(国内下载镜像) → `https://gitee.com/marseille1/stronghold-protocol-secondary-development-download.git`, branch
**`master`** (`HEAD:refs/heads/master`), fast-forward only and **never forced**. A run pushes every configured remote,
primary first; `--remote <name>` restricts it, `--all-remotes` forces both, `--tags` pushes the tags too. `origin`
stays the GitHub **mainline (主线项目)** (`sganggs/Stronghold-Protocol`).

Credentials are **never** in the URL or the repo. **GitHub (primary)** uses the owner's configured git credential
helper (or per-run `GITHUB_TOKEN`); **Gitee (mirror)** uses the ASCII login **`marseille1`** (the Chinese name is
only a display name) plus a personal access token (账号设置 → 私人令牌, scope `projects`). Supply either per run:

```powershell
$env:GITHUB_TOKEN="<pat>"; node tools/push-gitee.mjs -m "message"                                    # GitHub
$env:GIT_USERNAME="marseille1"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs -m "message"  # Gitee
```

The helper writes a supplied credential to a **temp credential file outside the repo**, resets the helper list for
the push (so a stale system `credential.helper=manager` cannot shadow the token), and deletes the temp file
afterwards. Never write a token into the repository.

**Stage only your own paths.** The store is shared, so it can hold unrelated work-in-progress. The helper commits
what you staged (or, with `--only`, just those paths); it never sweeps the working project into the store:

```powershell
git -C D:\DOTK\_merge-scratch add -- docs/OUR-FEATURES.md docs/DEVELOPMENT.md
node tools/push-gitee.mjs -m "docs: ..." --only docs/OUR-FEATURES.md --only docs/DEVELOPMENT.md ...
```

`--only <path>` (repeatable, comma-separated allowed) restricts the staging and the mirror; it is already
supported by `tools/push-gitee.mjs`. `--dry-run` reports only (nothing written anywhere), `--no-push` skips the
push (commit + mirror stay local), and `--from-dev` is the opt-in reverse sync described above.

**The deploy order (hard order — never reorder).** The full procedure is
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (d); the essentials:

1. **推通知 FIRST**, with the server still up — `POST /admin/api/notify?token=…` with
   `{"text":…,"sign":"d星空之下"}` (signature **`d星空之下`** by default).
2. Wait ~30 s so clients render the notice.
3. Upload the delta (`public/**` needs no restart; `shared/**` or `server/**` does).
4. Restart (only when server/shared changed and the owner approved).
5. Verify (`/healthz`, the changed endpoints).

**Never deploy without the owner's go-ahead** (`d星空之下`): restarting, uploading server files, changing env /
`SP_VERIFY` / the admin token / firewall are all stop-and-ask items (`docs/AI-WORKFLOW.md` (e)). Pure static
changes still get a notice first.

**Tests that pin it.** `test/docs-paths.test.js` and `test/package.test.js` shell out to `git ls-files`, so they
**only pass in the git store** — in the git-less working project expect exactly those two to fail
(`docs/DEVELOPMENT.md` §8). `test/version.test.js` pins the single version source and the notice files.

---

## Appendix: fork-only surface — a merge checklist

| Area | Files that must survive the merge |
|---|---|
| Custom operators | `tools/build-data.mjs` `CUSTOM_CHESS` + `applyCustomChess` + `CUSTOM_BASE_IDS`; the 8 `kits/ops/chess_char_*-*.js`; their `KIT_FILES` entries; `test/content/clemnt.test.js` |
| Battle effects | `public/js/render/fx/{kinds,localart,simfx,rings,system,official}.js`; `tools/build-fx-official.mjs` |
| Local-art pipeline | `tools/local-extract/{extract.py,committed-manifest.mjs,extract-voice.py}`; `data/local-assets.committed.json` |
| Asset sources | `tools/fetch-assets.mjs`; `tools/assets/{network,sources}.mjs` |
| Decisions | the §22 blacklist; the traits/rules in §5 (see `docs/MATCHMAKING.md` §22–§37) |
| Publishing | `tools/push-gitee.mjs`; the notice-first deploy order |
| Statistics page (record v2 + the official template) | `shared/stats.js` (`STATS_VERSION = 2`, `creditedKills`, `maxima`, peak-bond retention), `public/js/screens/stats.js` + `ui/stats.js`, `public/assets/ui/statistics/` (37 files), `data/assets.json` (`ui['statistics/*']`), `tools/fetch-stats-assets.mjs`; see `docs/UPSTREAM-MERGES.md` §13.9 |
| Field-silence watchdog (client combat) | `server/match/match/clientCombat.js` (`_armFieldWatch` / `_checkFieldSilence`, `FIELD_WATCH_MS`), `server/match/fields.js` (`FIELD_SILENCE_MS`), the `phase/round/fields` rows of `server/admin.js`; see `docs/META.md` §1.3b — a merge of upstream's client-combat code must keep the 12 s takeover |
| 分血救援 (revive) | `shared/constants.js` `REVIVE`; `server/match/player/round.js` `down`/`revive`; `server/match/match/{settle,intents}.js`; the `downed/revive*` view fields; `test/match/revive.test.js` (see `docs/MATCHMAKING.md` §50) |

Honour the blacklist, run the full `node --test` in the store, and only then mirror back to the working project.
If a merge would force a choice between our behaviour and upstream's beyond the blacklist, **stop and ask
`d星空之下`**.

## 7. Lobby community data (`server/community.js`)

The 更新日志 / bug提交 panels, and the 公开房间 directory (owner's request of 2026-10-09; since 2026-10-09 改版 it is a
full **screen** — `public/js/screens/rooms.js` — reached from the lobby's 公开房间 button, listing each room as a bar
with its 4 seat squares), are **fork-only**, on the accounts SQLite
(schema v3: `changelog`, `bug_reports`, `bug_uploads`; v4 adds `changelog.summary` / `source` / `minor_seq`, so every
entry carries a one-line 概要 and a pushed notice appends the next `<major.minor>.<seq>` as `source: notice`; v5 adds
`match_stats` — the server-side match statistics, see §8 and `docs/MATCHMAKING.md` §40). Bug reports are TEXT plus at most four raster images stored
as files under `var/bug-uploads/`; the database holds paths + metadata only, and the type is verified from the bytes.
玩家留言 (the guestbook) is deliberately absent: the owner dropped it, and this fork never shipped one. See
`docs/MATCHMAKING.md` §36. **我们独有，非上游；合并时不得丢失。**

| Area | Files that must survive the merge |
|---|---|
| Lobby community | `server/community.js`; `server/db.mjs` (schema v3 / v4); `server/lobby.js` `bugReport` + `broadcastNotice` → `recordNotice`; `server/index.js` `/community/api/*` + `/admin/api/bug/*`; `server/admin.js` (`buildPublicSnapshot` `seats` / `full` / `freeSeats`, the 「玩家反馈」panel + export); `public/js/ui/community.js`; `public/js/screens/rooms.js`; `public/js/screens/lobby.js` (顶栏入口 + `consumeRoomsReturn`); `public/js/store.js` (`ui.roomsReturn` / `setRoomsReturn` / `consumeRoomsReturn`); `public/css/screens/lobby.css` (`.rooms-*`); `test/community.test.js`; `test/ui/rooms.test.js`; `test/ui/room-origin.test.js` |
| Room text chat (等待室 + 局内, 临时气泡) | `shared/constants.js` (`CHAT_MAX` / `CHAT_RATE_WINDOW_MS` / `CHAT_RATE_LIMIT` / `CHAT_BUBBLE_MS`, `ERR.BAD_CHAT`); `shared/protocol.js` (`room.chat` C2S, `m.chat` S2C); `server/lobby.js` (`chat()`); `server/http/config.js` (`chatRate*` options); `public/js/ui/chat.js` (`chatMessage` / `activeChatBubbles` / `ChatBubble` / `ChatComposer` / `ChatDock`); `public/js/screens/room.js` (seat + spectator bubbles, `.room-chat` composer); `public/js/screens/game.js` (`ChatDock`, spec-dock bubbles); `public/js/ui/teamPanel.js` (row bubble); `public/js/main.js` (`m.chat`); `public/js/store.js` (`chat` events); `public/css/screens/room.css` (`.room-chat` / `.seat__chat` / `.cbubble`); `public/css/screens/game.css` (`.gm-chat` / `.team__chat`); `test/lobby-chat.test.js`; `test/ui/chat.test.js` |

## 8. Post-0.3.0 surface from the feedback7 merge (R22 / R23)

> **我们独有 / 合并时不得丢失** — the pieces below were produced by the selective feedback6 / feedback7 merge
> (see [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)). Where an upstream commit was `SKIP`ped because our file
> differs, the fork's implementation is the one that must survive — not upstream's. Where a feature is a
> player-facing *fork* choice (the JP voice switch, the stats page, the drag-snap rule, the capsule count), treat
> it as ours.

**The Japanese voice dub.** A second voice tree beside the Chinese one, selected at 设置 → 语音语言 = 中文 /
日本語 (**default 日本語** — the owner's JP-first rule, not tied to the interface language; a stored 中文 choice still
wins). **The selected dub is authoritative per line and the other is its fallback in BOTH directions**: 中文 plays the
CN line and falls back to the JP one when the CN tree lacks it, 日本語 plays the JP line and falls back to the CN twin.
Files: `audio.voiceJp` wiring in `shared/` / `public/js/audio*` and the asset plan; the full zip
ships both dubs via one switch (`tools/package.mjs` `FULL_ZIP_JP_VOICE`), the lite zip stays art-free. This is our
packaging — upstream's `ddf8c39e` was `SKIP`ped. See [`docs/ASSETS.md`](ASSETS.md) "Voice".

**The match statistics (server-backed).** The record schema + pure logic live in `shared/stats.js` (strict
normalization, bounded storage, the "left right away does not count" rule, replay dedupe), re-exported by
`public/js/ui/stats.js` with the localStorage I/O; `public/js/ui/statsSync.js` uploads each finished match (deduped,
marked) and the login backlog; `public/js/screens/stats.js` (+ `public/css/screens/stats.css`) reads `stats.list` /
`stats.view` from the server with localStorage as the offline fallback, and the 在线玩家 overlay opens another online
player's public records. Server side: `server/stats.js` `StatsService` on `match_stats` (schema v5), the `stats.*`
protocol, and the owner resolution in `server/lobby.js` (`account_id`, else the guest session `playerId`). Our caps
are 2× the mainline (`shared/constants.js` `STATS_*`). A login merges the local backlog into the account (the
guest keeps uploading under its own identity), and the cross-player view (`stats.view` → the 在线玩家 row) carries
**only** the record's own in-game fields plus the owner's public `{ name, role, guest }` — never an account id, email,
token or session key. Fork-only; see `docs/MATCHMAKING.md` §40 (schema, owner rule, privacy rules).

**The achievements page (成就统计).** `public/js/ui/achievements.js` (card + full-screen panel) over the pure
aggregates in `public/js/ui/achievementModel.js`; the design is the owner's 0.3.0 fork's port of Stardust-minus
`d6e96f4` / `70875f41` (GPL-3.0-or-later), restyled onto this tree's `--ui-unit` / `--utility-text` in
`public/css/screens/achievements.css`. Progress is **derived from the same match records** the statistics page
reads — `countsTowardStats` / `selfRowOf` / `roundsOf` from `shared/stats.js`, gameplay-plugin records excluded —
so nothing is persisted twice and clearing 统计数据 clears the progress. Records come from `stats.list` merged with
the local `sp.pref.stats` copy by record id (server rows not on this device, local rows not uploaded yet), with the
local copy as the offline answer; `ui/stats.js` `subscribeStats` notifies the panel after every successful write.
The 0.3.0 fork's player card / avatar picker does not exist here: the plate uses the lobby `AvatarFrame`. Entries:
the Hub's left rail and the classic lobby's left column; the footer's 统计数据 link opens `screens/stats.js`.

**The drag-snap rule (R23-DRAGSNAP).** `public/js/render/drag.js` (`dragStandTile`, `DRAG_HOLD_TILES`): a dragged
operator stands on the tile under the pointer while it is a legal target (a board tile or a bench slot) and is held
under the pointer elsewhere; the pick / highlight / tileHover / wheel / drop all stay the pointer's tile. The
pointer tile also drives the unit-tap UX pinned in `test/docs-consistency.test.js`.

**失衡 (UNBALANCE) + the push/pull slide (R22-UNBAL / R22-RENDER).** The engine holds a pushed / pulled enemy for
the push's 位移时间 or the pull's force window (no walking / normal attack; a static body gets the 0.1 s floor);
`server/sim/battle/displacement.js` + the render slide (`public/js/render/units.js`, the sample anchoring in
`interp.js`) take the same game time; enemy facing is preserved through the slide. The slide + UNBAL stack lives in
`ours` as `20ae5ac2` → `5f78eb63` → `453a4e81` → `6e71870d` → `c59aab17` → `5616d9b7` (see UPSTREAM-MERGES §4/§7).

**R23 whole-frame timing.** `shared/` / `server/sim/constants.js`: an attack interval or a time-SP cost of a whole
number of frames takes exactly that many (1 s = 30 frames, not 31). The engine constants and the
`gameLogic` display constants must stay in step (the pre-merge value was the 31-frame round).

**Interface pieces to keep.** The 观战席 capsule + host remove-spectator (`ui/combatHud.js`, the server already
accepts `room.removeSpectator` mid-match); the 设置 entry in the lobby / room (`ui/settings.js` `SettingsButton`);
准备就绪 folding the shop (`gameLogic` `readyShopFold`); the device-tooltip card (阻隔工事 / 双眼皮 / 射击台 /
源石流发生装置); the EMPTY new shop slot after a 调度中心 upgrade (`EmptyCard`, `scard--sold` inert); the
top-bar capsule's `resolved` count (killed + leaked among the round's scheduled enemies, with
`inTotal` / `killedInTotal` / `leakedInTotal` on the snapshot / result / `m.public progress`).

**Data.** `data/enemies.json` must stay reproducible: `node tools/build-data.mjs --offline` then `git status` is
empty (rebuilt in `2cab8b6b` / `f26a4837` after the 克莱门莎 cache merge left a one-line drift).

| Area | Files that must survive the merge |
|---|---|
| Voice dubs: **JP + CN only** | the owner's decision of 2026-10-16: upstream 0.3.0's English / Korean / own-language dubs (`audio.voiceEn` / `audio.voiceKr` / `audio.voiceNative`, `8eb7f701` / `d93d6d30`) are **not merged** — 设置 → 语音语言 keeps 中文 / 日本語 only (see [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0) |
| Japanese voice | the `audio.voiceJp` wiring (`shared/` + `public/js/`), the 设置 → 语音语言 switch, `tools/package.mjs` (`FULL_ZIP_JP_VOICE`); [`docs/ASSETS.md`](ASSETS.md) "Voice" |
| Match statistics (server-backed) | `shared/stats.js`; `shared/constants.js` (`STATS_*`); `public/js/ui/stats.js` + `public/js/ui/statsSync.js`; `public/js/screens/stats.js`; `public/css/screens/stats.css`; the title / lobby / room entries; the 在线玩家 overlay row → `openPlayerStats` (`public/js/screens/lobby.js`); `server/stats.js`; `server/db.mjs` (schema v5 `match_stats`); `server/lobby.js` (`stats.*`); `server/index.js` (StatsService wiring); `docs/MATCHMAKING.md` §40; `test/ui/stats.test.js` + `test/ui/statsSync.test.js` + `test/server-stats.test.js` |
| Drag snap | `public/js/render/drag.js` (`dragStandTile` / `DRAG_HOLD_TILES`); `test/docs-consistency.test.js` (the pointer-tile UX) |
| 失衡 / slide | `server/sim/battle/displacement.js`; `public/js/render/units.js`; `public/js/render/interp.js`; `test/sim/unbalance.test.js`; `test/sim/displace-fx.test.js`; `test/render/unitview.test.js` |
| R23 timing | the whole-frame attack-interval / SP constants (`server/sim/constants.js`, `shared/`) and the `gameLogic` display constants |
| Interface | `ui/combatHud.js` (观战席 + capsule); `ui/settings.js` (`SettingsButton`); `gameLogic` `readyShopFold`; the device-tooltip card; the empty-shop-slot `EmptyCard`; the capsule `resolved` fields |
| Data | `data/enemies.json` (offline byte-for-byte); `data/*.json` reproduced by `node tools/build-data.mjs --offline` |

During an upstream merge, resolve hunk-by-hunk keeping both sides; a change that would drop one of these is a
**stop-and-ask-`d星空之下`** item ([`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (e)). The per-batch skip reasons (which
upstream commit was *not* taken and why) are in [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §4.

## 9. Title-screen surfaces from another deployment (announce / about / install)

**我们独有 / 合并时不得丢失.** Three small title-screen entries were copied from another deployment
(`wei.linxia.dev`, 0.2.4) into our own style, wired to our own data — **not** upstream, and **not** its resource-preload
(PRELOAD) panel (our `public/js/preload.js` is the unrelated boot-time image warm-up):

- **公告 banner + 公告 entry** — the newest changelog entry with `source: 'notice'` (our `server/community.js`, served
  by `GET /community/api/changelog`) shown top-centre, dismissable; the seen id persists in `loadPref`/`savePref`
  (`noticeSeen`), and nothing to show / offline hides it. The title's 公告 entry opens the same 更新日志 overlay
  (`ChangelogOverlay` `title=` prop) — one store, no duplicate.
- **关于本服务器** — the version / `/healthz` build tag / mode list / README primary+mirror framing / the footer
  attribution, all factual about this project.
- **添加到桌面** — the browser install prompt (`beforeinstallprompt`), hidden when unavailable. The installability
  half is now merged from upstream 0.2.3 (the mint-rook `public/manifest.json` + `public/icons/`; see
  [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §8), so Chromium / Edge 112+ can actually offer the install; the install
  needs no service worker (Chrome 108/112+ dropped it) — the fork's opt-in local asset cache registers `public/sw.js`
  (see §10). Off-Chromium (or
  already installed / standalone) the button stays a graceful no-op, and iOS shows the manual hint. A stale served
  `index.html` cannot keep it hidden — `public/js/ui/ensureManifest.js` re-links the manifest at boot.

| Area | Files that must survive the merge |
|---|---|
| Title surfaces | `public/js/ui/announce.js` `public/js/ui/about.js` `public/js/ui/install.js`; `public/js/screens/title.js` (the mounts); `public/js/ui/community.js` (`ChangelogOverlay` `title`); `public/js/ui/components.js` (`homePlus` icon); `public/css/screens/title.css` (`.title-announce*` / `.title-about*` / `.title-rail*` / `.title-install*` / `.title-group*`); `test/ui/title-surfaces.test.js` (+ `.e2e.test.js`) |
| PWA install assets (upstream 0.2.3, mint rook) | `public/manifest.json`; `public/icons/` (`app.svg`, `app-192/512.png`, `app-maskable-192/512.png`, `favicon-16/32/48.png`, `favicon.ico`, `apple-touch-icon.png`); the `<link rel="manifest">` + icon tags in `public/index.html`; `public/js/ui/ensureManifest.js`; `test/ui/pwa-assets.test.js` (+ `ensure-manifest.test.js`) |

## 10. Local asset cache (`public/sw.js` + `public/js/assetCache.js`)

**我们独有 / 合并时不得丢失.** A returning player can keep the art on their own device so the public box is not asked
for ~104 MB on every cold load — the fork's answer to the VPS uplink being the bottleneck. Upstream has no such cache
(and deliberately ships no service worker — see §9).

- **Server**: `GET /asset-index.json` (`server/assetindex.js`, route in `server/http/static.js`) → `{ version, app,
  revision, count, bytes, files }`, where `revision` is a hash of the `{ url: size }` map; `no-cache` (it must track
  the server's current art). Asset / font responses carry `Access-Control-Allow-Origin: *` (`server/http/files.js`)
  so a player's own machine can serve them.
- **Worker + policy**: `public/sw.js` (cache-first for `/assets|/fonts|/vendor`; **on a miss it also tries the mirrors
  first (15 s, byte-verified) and the game server last**, so on-demand art is offloaded too; Range requests and non-GET
  pass through) and `public/js/assetCache.js` (register; `syncPlan` / `cacheIsCurrent` are pure and unit-tested — a
  per-file diff against the index, revision-keyed; a **revision change is incremental**). `public/js/assetSource.js`
  probes a local origin (127.0.0.1) serving the same `revision` and points the worker at it.
- **Download chain (the server-uplink offload)**: `GET /asset-index.json` also returns `sources` — CORS-capable CDN
  mirrors of the primary repo's `public/` tree, read **straight from `public/asset-mirrors.json`** (the same file the
  plain-HTTP path uses, `server/mirrors.js`; the console's 来源配置 view edits it live). `js/assetCache.js fetchArtFile`
  tries each origin FIRST (15 s timeout each) and the game server LAST, accepting a source only when its bytes match
  `index.files[url]`. **Gitee / GitLab
  raw are deliberately NOT used** — they send no `Access-Control-Allow-Origin`, so a browser `fetch` is blocked (and
  Gitee Releases 403s hotlinks); tested 2026-10-13.
- **The plain-HTTP chain picks the origin by MEASURED THROUGHPUT (2026-10-15)**: on the production site the Service
  Worker cannot register (plain HTTP), so `public/js/assetMirror.js` rewrites the manifests' **image** URLs to a chosen
  origin instead. It times the origins on **six committed operator portraits (~110 KB each) fetched in parallel** — the
  way the boot preload pulls art — so the measured rate is the throughput a player actually gets, not one stream's
  latency (a single small file made a fixed relay look slow). **The relay is probed first** (the healthy case costs one
  round of samples; the other sources are probed in parallel only when it misses its bar) and installs the **first**
  source that clears its bar — the owner's relay **1.2 MB/s** (`RELAY_MIN_BPS`), a plain-file GitHub mirror **0.5 MB/s**
  (`MIRROR_MIN_BPS`) — otherwise the URLs stay on this server. A fresh reading is reused for `SPEED_CACHE_MS` (2 min,
  `cacheMs: 0` re-measures every call), and the whole list stays as the per-file error fallback. Measured 2026-10-15
  (domestic vantage): the relay's egress was ~0.05-0.4 MB/s before Aliyun lifted the restriction, then **7.1 MB/s
  sustained / 21.7 MB/s at 8-way** - ~18x the game box's 1.18 MB/s at the same width, so the same rule picks it back
  up with no code change; the box's `immutable, max-age=31536000` headers still make a return visit free.
- **Server fallback is paced**: a server fetch is the last resort and is throttled so a bulk pre-cache never starves
  live matches — a process-wide token bucket on `public/assets|fonts|vendor` bodies (`server/http/files.js`
  `RateLimiter`), default **1.2 MB/s**, `SP_ASSET_RATE_KBPS` overrides (0 disables). Non-art paths are never paced.
- **UX**: `public/js/ui/assetMode.js` — the first-visit chooser (**default 缓存到本地**) and the 设置 row (mode /
  usage / 立即缓存 / 清除缓存 / 优先使用本机资源). `main.js preloadArt` syncs the missing / changed files, skipping the
  boot gate for a local hit.
- **Storage**: `sp.pref.assetMode` (`stream` | `cache`), `sp.assetCache.revision` / `sp.assetCache.sizes`,
  `sp.pref.assetLocalSource`. The mode is **opt-in per browser**; an unchosen visitor behaves exactly as before
  (HTTP-cache warm-up + the boot gate).

| Area | Files that must survive a merge |
|---|---|
| Asset index (server) | `server/assetindex.js`; `server/http/static.js` (`/asset-index.json`); `server/http/files.js` (asset CORS); `test/asset-index.test.js` |
| Local cache (client) | `public/sw.js`; `public/js/assetCache.js`; `public/js/assetSource.js`; `public/js/ui/assetMode.js`; `public/js/main.js` (the preloadArt branch); `public/js/ui/settings.js` (the row); `public/css/screens/game.css` (`.asset-*` / `.set-asset`); `public/i18n/en.json` (the strings); `test/ui/asset-cache.test.js`; `test/ui/title-surfaces.test.js` (allows `public/sw.js`) |
## 11. OUR difficulty layer (`data/tuning.json` `boost`)

The official tables stay the BASE (BALANCE §3 / §4); this layer is our own deliberate bump on top of them (owner
2026-10-16, [`docs/MATCHMAKING.md`](MATCHMAKING.md) §47):

* enemies of round ≥ `boost.fromRound` (5): max HP × 1.3, ATK × 1.3 — DEF / RES / speed untouched;
* leaders: the shared pool × 1.4 and their own ATK / DEF / RES × 1.4, parts and mid-fight summons included;
* the 8 formal modes only (`mode.inScope`) — 入门协议 (`mode_training_1`) stays official. `enabled: false` (or every
  factor 1) restores the official numbers.

Where: `shared/constants.js` (`BOOST_FROM_ROUND`, `ENEMY_BOOST_*`, `BOSS_BOOST_*`), `server/match/gamedata.js`
(`boostOf` + `enemyBoost` / `bossBoost` / `bossEnemyScale` / `bossHpMul`), `server/match/waves.js` (the tag-`boss` /
tag-`part` spawn mods), `server/match/match/bossRounds.js` (the boss field's `flags.enemyScale`),
`server/sim/content/bosses.js` (`summonMods` DEF / RES). Tests: `test/match/boost.test.js` (the layer itself) — every
file that pins the OFFICIAL numbers runs on `withoutTuning(DATA)`. Measurements and the golden note:
[`docs/BALANCE.md`](BALANCE.md) §8. **It must survive a merge**: [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0.
