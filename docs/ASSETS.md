# Assets: sources, layout, manifest, credits

Owner: `tools/fetch-assets.mjs` and `tools/assets/*`. Research background: `docs/research/07-assets.md`.

All art, Spine models and audio are **committed to this (public) repository** (GitHub primary + Gitee mirror) as of 2026-10-08, so a plain clone runs
with no fetch step (`public/assets/**`, `public/fonts/**`, `public/vendor/**`). They used to be git-ignored and
downloaded at install time; that fetch is now optional, for pulling upstream art that changed after the last commit.
The art is (c) Hypergryph / Yostar.
Everything the client needs is listed in **`data/assets.json`**. The client should only request URLs that appear in that manifest.

> **Navigation.** Running · What is downloaded · Post-processing · Manifest schema (`data/assets.json`) · Verification · **Local asset cache & CDN mirror download chain** (incl. *Without a Service Worker* and *The relay*) · 本地客户端来源 · Licensing and credits. Battle effects: see the "Battle effects" section (the two-tier FX system).
> See also [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §2 / §3 (the fork-only FX and local-art pipeline) and [`docs/QUERY-INDEX.md`](QUERY-INDEX.md).

## 目录

> 导航用；每节正文才是准的（按标题里的编号 grep 更快）。

- Running
- What is downloaded
- Post-processing
- Manifest schema (`data/assets.json`)
- The committed manifest and the served manifests
- Verification
- Local asset cache & CDN mirror download chain
- 本地客户端来源（owner 提供，2026-10-06）
- Licensing and credits

## Running

```bash
npm install          # also vendors pixi / pixi-spine / preact / three (tools/vendor.mjs; three.js is fetched by
                     # browsers only when data/local-assets.json lists the board atlas — the 3D board, DESIGN §15)
npm run assets       # = node tools/vendor.mjs && node tools/fetch-assets.mjs
```

| Option | Effect |
|---|---|
| `--concurrency=N` | Parallel downloads (default 16). |
| `--force` | Re-download everything. |
| `--offline` | No network. Re-runs post-processing (atlas fixes, skeleton parsing, WOFF2) on what is already on disk, then rebuilds `data/assets.json`. |
| `--dry-run` | Print the plan (file and model counts, alias notes) and exit. |
| `--refresh-index` | Re-download the upstream indexes: `audio_data.json`, `charword_table.json` (the 干员战斗语音 slots) and `models_data.json`. |
| `--voice-lang=cn` | The dub of `audio.voice` (the 中文 voice setting): `cn` (default) | `jp` | `en` | `kr` — the same file names under `voice_cn/`, `voice/`, `voice_en/`, `voice_kr/`. `audio.voiceJp` (the 日本語 setting) is **always** the JP dub (`voice/`): both trees are planned every run. |
| `--voice-all` | Plan every official voice slot, including the prep-only lines no battle plays (干员报到 / 编入队伍 / 任命队长 — 360 files, one per operator and slot). Off by default: nothing requests them, so planning them only makes every run download more. |
| `--prune` | Delete files under `public/assets/` that the manifest no longer references, for example after a mapping change. Without this flag they are only listed in the report. `public/assets/local/` (written by `tools/local-extract`) is never pruned. Implies `--allow-shrink`. |
| `--allow-shrink` | Write `data/assets.json` even when it loses entries the current one has (see "The manifest never shrinks by accident" below). |
| `--strict` | Exit 1 when a leaf was dropped for having no file on disk, instead of only reporting it (see "A dropped leaf is reported" below). The same as the environment variable `SP_ASSETS_STRICT=1` — for CI and packaging builds. |
| `--add-only` | For a checkout whose `public/assets/` and `public/fonts/` are shared with another one (a git worktree with symlinked asset folders): download only the files missing on disk and never re-download, rewrite or delete an existing file — atlases already on disk are left as they are, the fonts are not rebuilt (the manifest keeps its current `fonts`). Not with `--prune` / `--force`. |
| `--local-spines` | Rewrite `tools/assets/local-enemy-spines.json` and `tools/assets/local-token-spines.json` (the metadata of the enemy and token models only the local client has, see "Enemy aliases" and "Token models from the local client") from the models `tools/local-extract/extract.py` extracted to `public/assets/local/spine/enemy/` and `public/assets/local/spine/token/`. Run it after a game update changed them; without it the committed files are used and a differing extraction only gets a warning. |

**The manifest never shrinks by accident.** An entry whose files are missing on this machine is left out of a rebuilt
manifest, so a run where some downloads failed (or whose upstream audio / model index lost them) would drop entries that
every other install still has from the committed `data/assets.json` (a pull request once carried such a manifest, 42
audio entries short — all 42 still resolve upstream; PR #7). When the rebuilt manifest lacks an entry of the current
one, the run keeps the current file, prints the entries it would drop (also in the report: `droppedEntries`,
`manifestWritten: false`) and exits 1. Re-run to retry the downloads, or pass `--allow-shrink` (or `--prune`) when the
smaller manifest is intended, for example after a mapping change. Build fields (`version`, `hash`, `generator`,
`stats`), new entries and a changed value are never a drop (`tools/assets/manifest.mjs droppedEntries`). A run whose
plan legitimately narrows — like the 干员战斗语音 default, which no longer plans the three prep-only slots (360 entries,
DESIGN §21.30) — reports exactly those entries and needs `--allow-shrink` once; the list it prints is the check.

**A dropped leaf is reported, never silent.** `resolveTemplate` leaves out every entry none of whose alternative files
is on disk — for a leaf that is an entry the client loses outright: a unit whose `attack` sound was never downloaded has
no `audio.sfx.units[charId].attack` at all, so the sound is simply missing (nothing falls back; there is no URL to
retry). That is a different thing from an entry whose *fallback* was used. The run therefore prints a summary naming at most eight such leaves
and records the complete list as `droppedLeaves` (a subset of `misses`, which also lists the
unresolved Spine models):

```
[assets] 1 leaf dropped: no alternative on disk (audio.sfx.units.some_char.attack)
```

A run with nothing dropped prints `[assets] no leaf dropped: every planned leaf has a file on disk`. This is only
observability: which files are planned, downloaded and written does not change. `--strict` (or `SP_ASSETS_STRICT=1`)
turns those drops into a failure (exit 1, the leaves named) so a CI or packaging run cannot ship a manifest with such
holes — the committed manifest's shrink guard cannot see them once the entry is already gone. The manifest may
already have been written before this check returns failure; strict mode does not roll it back.

The script is **idempotent**. A file on disk is kept, not re-downloaded, when any one of these holds:
- its size matches the ledger entry from a previous download (`.cache/assets-ledger.json`);
- its size matches the byte count recorded in research;
- no size is known, but the file passes format validation. Validation checks the PNG signature and `IEND`, the MP3 header, the sfnt header, the atlas page line, and that a skel is not an HTML error page.

Every download is written to a temp file, then renamed into place. A partial download therefore never reaches its final path.

How downloads are fetched:
- 16 connections at a time.
- Each source gets 3 attempts with exponential backoff.
- If `raw.githubusercontent.com` fails, the jsDelivr mirror (`cdn.jsdelivr.net/gh/…`) is tried.
- There is no mirror for the ArknightsAssets2 `voice` branch, because jsDelivr returns 404 for it.
- **Source selection** — `--asset-source=direct|mirror|gitcode` (or `SP_ASSET_SOURCE`), three explicit modes, none of which performs a public-IP lookup:
  - `direct` (default): `raw.githubusercontent.com` first, then jsDelivr.
  - `mirror`: the `SP_GITHUB_PROXY` prefix proxy (default `https://gh-proxy.com/`) first, then direct + jsDelivr.
  - `gitcode`: the **GitCode** raw mirror of `yuanyan3060/ArknightsGameResource` (the operator avatars/portraits, skill icons and enemy/token icons) first, then direct + jsDelivr. GitCode only mirrors that one repo of ours (checked 2026-10-08: fexli / Ark-Models / ArknightsAssets2 are absent), so `gitcode` is the mode to prefer when direct GitHub is blocked but the gh-proxy prefix is not wanted — the icon set still resolves, the Spine/AA2 sources fall back to direct + jsDelivr. It needs no credentials. Each mirror mode keeps its own 3-failure circuit breaker, an 8 s response-header deadline and one attempt per file (a tripped mirror never blocks the rest of the run).
- A manifest entry with fallbacks (for example an enemy icon that falls back to its base enemy's icon) only moves on to the next alternative after a **definitive 404**. When the primary fails transiently (network error, 5xx or an invalid payload after all retries), no fallback is fetched. The path is listed under `downloadErrors` in the report, and the next run retries the primary.
- A skeleton that fails to parse is deleted and removed from the ledger, so the next online run downloads it again.

The first run downloads about **548 MiB in 10,643 files** (`stats` of `data/assets.json` in 0.2.2: 574,449,900 bytes). The two 干员战斗语音 dubs are 2,674 files each, the twelve slots a battle plays for 191 operators: the Chinese one 65.6 MiB, the Japanese one 85.2 MiB (89,388,041 bytes; adding it took 107 s at about 1 MB/s from raw.githubusercontent.com). A re-run takes about 1 s. The three prep-only slots the official client uses elsewhere (干员报到 / 编入队伍 / 任命队长, 360 more files per dub, 18.4 MiB of them Chinese) are left out unless `--voice-all` is passed.

0.2.2 adds the Japanese dub beside the Chinese one (`audio.voiceJp`, settings 语音语言): the same lines from the dump's `voice/` folder into `audio/voice/jp/` — 2,702 more files. A run that fetches them from the mirror downloads about 85 MB; a machine with the local JP client can extract the compressed tree instead (`tools/local-extract/extract-voice.py --dub jp`, ~127 MiB of 96 kbps MP3s), so the committed `public/assets/audio/voice/jp/` here is that larger local encoding. The full release zip ships both dubs unless `tools/package.mjs` `FULL_ZIP_JP_VOICE` is set to `false`.

Outputs:
- `data/assets.json`: the manifest (committed).
- `public/assets/**`: art and audio (tracked in the repository since 2026-10-08).
- `public/fonts/*`: fonts and `fonts.css` (tracked too).
- `.cache/assets-report.json`: misses, fallbacks, `droppedLeaves` (the leaves left out of the manifest for having no file
  on disk) and notes from the last run.
- `.cache/spine-info.json`: skeleton parse cache.

The run exits with code 1 if any pool operator is missing its avatar, its portrait or its Front Spine, and — with
`--strict` / `SP_ASSETS_STRICT=1` — if any leaf was dropped for having no file on disk.

Upstream indexes are cached under `.cache/`. They are downloaded when missing:
- `.cache/gamedata/excel/audio_data.json`, from `Kengxxiao/ArknightsGameData` (zh_CN).
- `.cache/ark-models/models_data.json`, from `isHarryh/Ark-Models`.

The research JSONs in `docs/research/` (03, 05, 07) define **which** ids are needed.

## What is downloaded

| Class | Source | Local path (under `public/assets/`) |
|---|---|---|
| Operator avatars, 180×180. Base, plus E2 when it exists. | yuanyan3060/ArknightsGameResource `avatar/` | `char/avatar/{charId}.png`, `char/avatar/{charId}_2.png` |
| Operator half-body portraits, 180×360 | yuanyan `portrait/` | `char/portrait/{charId}_1.png`, `_2.png` |
| Operator full-body illustrations, the seat card's 立绘 (owner 2026-10-24). E0/E1 first, E2 fallback; cropped to a head-and-torso 3:5 window, resized to 1100 px high and encoded as WebP. A dump miss is a normal fallback to `portraitE2`. | Aceship/Arknight-Images `characters/{charId}_1.png` / `_2.png` (jsDelivr first, then the GitHub proxy; `tools/illust.mjs`) | `char/illust/{charId}.webp` |
| Skill icons: every skill index of every planned operator (DESIGN §16 loadouts, 自选 picks) | yuanyan `skill/` | `skill/{iconId sanitized}.png` |
| Module type icons: the `typeIcon` of every module of `data/chess.json` and `data/backups.json` (the 干员调配 / 自选 module tiles when the local-client art lacks them) | AA2 `cn` `arts/ui/uniequiptype/{typeIcon}.png` (else its lower-case name: `WAH-Y` → `wah-y.png`) | `module/{typeIcon in lower case}.png` — one file per type: the official data spells one DEC X module `dec-X` and the others `dec-x`, and paths that differ only in case are one file on Windows / macOS and in a release zip |
| Enemy icons | yuanyan `enemy/`. Fallbacks: the handbook id, then the base id. | `enemy/icon/{enemyId}.png` |
| Token avatars | yuanyan `avatar/` | `token/avatar/{tokenId}.png` |
| Bond icons (the real autochess glyphs) | ArknightsAssets2 `cn` `ui/autochess/[uc]autochesscommon/arts/bondicon/`. Fallback: the camp logo. | `bond/{bondId}.png` |
| Shop item icons | AA2 `…/arts/shopitemicon/` | `item/{trapId}.png` |
| Band (strategy) icons | AA2 `…/arts/bandicon/` | `band/{bandId}.png` |
| Profession, sub-profession and battle-card icons | AA2 `arts/profession_hub`, `arts/ui/subprofessionicon`, `ui_battle_new/battlecard` | `prof/icon_{p}.png`, `prof/large_{p}.png`, `prof/battlecard_{p}.png`, `prof/sub/{subProfessionId}.png` |
| UI sprites (see below) | AA2 `ui/autochess/**`, `arts/**`, `activity/[uc]act2autochess/**`, `battle/[pack]common/sprites` | `ui/{group}/{key}.png` |
| The 36 battle emotes and the 19 玩法说明 (tutorial) pages, which `tools/local-extract` also extracts (GitHub issue #42: without the local client a server showed default emote icons) | AA2 `cn` `ui/emoticon/theme/[uc]{themeId}/icon/{picId}.png` (`shared/constants.js EMOTE_CATALOG`) and `arts/guidebookpages/[pack]autochess/{key}.png` (1024², shown at 16:9 like the local copies) | `ui/emoticon/{dir}/{picId}.png`, `ui/guide/{key}.png` |
| Operator battle Spine (Front, Back) | fexli/ArknightsResource `spine/{id}/{id}/{Front,Back}/` | `spine/op/{charId}/{front,back}/{stem}.{skel,atlas,png}` |
| Token Spine | fexli: the default model, or else the first skin variant (`spine/{tokenId}/{variant}/Spine/`) | `spine/token/{tokenId}/{stem}.*` |
| Enemy Spine (PC build, premultiplied alpha) | isHarryh/Ark-Models `models_enemies/{key}/`, file names from `models_data.json` | `spine/enemy/{enemyId}/{stem}.*` |
| Enemy Spine that no dump carries (灼热源石虫 / 炽焰源石虫) | the local client only (`tools/local-extract/extract.py ENEMY_SPINES`, optional); never downloaded and never required: an overlay of the web alias (`enemies[id].spineLocal`) | `local/spine/enemy/{enemyId}/{stem}.*` (listed in `data/local-assets.json`) |
| Token Spine that no dump carries (40 summons: most 自选 summons, 凯瑟琳's 爬行号·防护单元, 凛御银灰's 风雪之眼, 乌尔比安's 从不混淆的方向) | the local client only (`tools/local-extract/extract.py TOKEN_SPINES`, optional); never downloaded and never required: an overlay (`tokens[id].spineLocal`; without it the avatar diamond) | `local/spine/token/{tokenId}/{stem}.*` (listed in `data/local-assets.json`) |
| Official trap models: 射击台 and 阻隔工事 (`trap_1105_accrate` = renderer `crate`, #663) | `arts/maps/common/trap/trap_110.ab`, `tools/local-extract/extract.py --only mesh/trap_110`; only `trap_1106_achplat` and `trap_1105_accrate`, their materials and textures. Crate: 636 vertices / 344 triangles, own UVs, 1024² DXT1 texture; battle prefab scale 0.01, X rotation −90°. Texture copies use lossy WebP quality 95. Without the crate mesh or texture the 3D board keeps `s_common_box_01` + atlas (procedural box if that mesh is absent); 2D keeps its atlas crops | `local/mesh/trap_110/{trap_1106_achplat,trap_1105_accrate}.obj`, `TX_*.png` / `.webp`, `materials.json`, `prefab.json` (listed in `data/local-assets.json`) |
| Official battlefield scenes (one per battlefield: meshes, lightmaps, albedo + normal / roughness / emission maps; load.js `loadScenePack`) | the scene bundles `scenes/activities/<season>/level_<stage>/…` (`tools/local-extract/extract.py --only scene`, optional). The client carries them only while the season runs; off season `tools/local-extract/fetch_scenes.py` downloads the bundles of the in-season version `26-04-13-12-31-42_e9b560` from the official CDN into `.cache/official-scenes/` (33 bundles, 22,801,308 bytes compressed on the Android list, md5-checked), and the materials / textures still come from the local client's theme bundles. Beside each albedo the material's normal, metallic-gloss and emission maps are exported too (`tools/local-extract/derived.py` rebuilds the RGB normal `_rgb` from Unity's two-channel BC5 / DXT5nm packing and the roughness `_rough` from the gloss A), and `render/board3d/materials.js` `sceneMaterial` shades the board with them: albedo × `_Color` × the lightmap and the key light, the normal map, a roughness sheen and the emission. Each battlefield theme is then graded by `render/board3d/theme.js` — a global default row plus a per-theme override (`exposure` = the renderer's tonemap exposure, `ambient` = the neutral probe fill, `sun` = the key-light gain, `tint` / `saturate` = the finish; the sand row also carries an `apron` = a soft band of the scene's own sand texture blending out from the field, `scene.js` `_buildApron`, its inner edge held a `gap` clear of the last playable row — the earlier raised ring/lane `platforms` was a wrong read of the official and is gone; the sand row's `platforms` now authors the official's **localised raised blocks** (the field's left-middle terrace + the corner blocks, flat-topped sandstone boxes shaded by the scene's own key light, `scene.js` `_buildPlatforms`), `CONTENT-AUTHORING.md` §8.3); a scene's standing props (rocks / crates / cacti) are split out of its merged terrain by triangle-connected component (`load.js` `splitSceneProps`), each becoming its own mesh so it casts a crisp realtime shadow on the ground, while the terrain keeps its baked lightmap shadow and does not re-cast it; the theme comes from the scene doc's albedo-texture family (`THEME_MARKERS`), never from taste. `_HG_VERTEX_COLOR_BLEND_ON` is deliberately NOT applied (the material's `_Color2` is a dark red-brown; blending the field's vertex colours to it red-shifted the board away from the official's pale sandstone). The extracted files live under `public/assets/local/scene/` — **git-ignored in this fork** (`.gitignore`), so the repository never stores the bundles or the extracted files; keep a copy aside before reverting the 3D-scenes merge (`docs/UPSTREAM-MERGES.md`). A full release zip includes them when the packaging machine extracted them (`npm run package` prints a `battlefield scenes` line); a lite zip and a source install fetch and extract them with `node tools/setup.mjs --scenes`. Without a scene the 3D board draws its procedural metal tiles | `local/scene/{stageId}/scene.json`, `scene.bin`, `lm{i}.*`; `local/scene/tex/{texture}.*` (listed in `data/local-assets.json`) |
| BGM | AA2 `voice` branch `audio/sound_beta_2/music/**` (大厅/休整期 `act1autochess`, 开战 `act13side/m_bat_kazimierz2_{1,2}` — 骑士之日 / 无畏者; the 开战 track follows the round: `_2` 无畏者 rounds 1–7, `_1` 骑士之日 from round 8) | `audio/bgm/{file}.mp3` |
| 主界面音乐 (Hub 音乐, owner 2026-10-25) | AA2 `voice` `audio/sound_beta_2/music/**`, resolved from the official `excel/audio_data.json` → `musics[]` catalogue by the ids in `tools/assets/lobby-music.mjs` (name / bank / intro / loop; `bankAlias` followed like the BGM banks). `node tools/lobby-music.mjs` downloads the 24 主界面 / 活动 / 联动 / 危机合约 themes; `fetch-assets` plans the same leaves | `audio/music/<musicId>_{intro,loop}.mp3` |
| SFX (UI, battle, per unit) | AA2 `voice` `audio/sound_beta_2/**`, mapped from `audio_data.json` banks | `audio/sfx/{same sub-path}.mp3` |
| 干员战斗语音 (中文) | AA2 `voice` `audio/sound_beta_2/voice_cn/{charId}/cn_nn.mp3` — the lines `charword_table.json` lists (`placeType` = when the game plays one, `voiceAsset` = the path); the local **CN** client's `voice_cn/` bundles when a machine has it (`tools/local-extract/extract-voice.py --dub cn`); `--voice-lang=jp\|en\|kr` takes the same file names from `voice/`, `voice_en/`, `voice_kr/` | `audio/voice/{lang}/{charId}/{cn_nn}.mp3` |
| 干员战斗语音 (日本語, `audio.voiceJp`) | the same lines from ArknightsAssets2 `voice/` (`voice/{charId}/cn_nn.mp3`, the JP dub); the local JP client's `voice/` bundles when a machine has it (`tools/local-extract/extract-voice.py --dub jp`) | `audio/voice/jp/{charId}/{cn_nn}.mp3` |
| Fonts: Bender Regular and Light, Novecento Wide | TimWangZi/The-font-of-Arknights | `public/fonts/*.{otf,ttf,woff2}`, `public/fonts/fonts.css` |
| 统计页官方模板（标题六边形遮罩、计数辉光、纪录图标、盟约/策略框、成员与成就阶级、标题栏、数字/标签字体） | `web.hycdn.cn` `arknights/webview/act1autochess.*.css`（内嵌 base64 图）+ 同站 `assets/img`、`assets/fonts`；单独跑 `node tools/fetch-stats-assets.mjs`（`tools/assets/stats-template.mjs` 定义 37 个任务，CSS 缓存在 `.cache/stats-template-*.css`） | `ui/statistics/{title-mask.svg,count-glow.png,record-*.png,member-tier-*.png,achievement-*.png,heading-*.png,*-frame.png,number-font.woff2,label-font.woff2,fonts.css}`，登记为 `data/assets.json` 的 `ui['statistics/*']`；页面读不到时按缺省样式降级 |

The operator avatars, operator portraits, skill icons and the enemy/token icons (the `yuanyan` rows) all come from
**yuanyan3060/ArknightsGameResource** — the one dump GitCode mirrors. `--asset-source=gitcode` fetches them through
`https://raw.gitcode.com/gh_mirrors/ar/ArknightsGameResource/raw/main/…` when direct GitHub is blocked and the gh-proxy
prefix is not wanted (`docs/DEVELOPMENT.md` §9, "Mirror selection"). It is a read-only anonymous mirror; the file is
byte-identical to the GitHub raw copy (`avatar/char_377_gdglow.png`, 58,987 B, checked 2026-10-08).

The **full-body seat art** (`chars[charId].illust`, owner 2026-10-24) comes from **Aceship/Arknight-Images**
`characters/{charId}_1.png` (E0/E1 first; `_2`, whose E2 art often carries a huge effect, is the fallback).
`node tools/illust.mjs` downloads it through jsDelivr (the GitHub proxy and direct raw are fallbacks), crops a
head-and-torso 3:5 window around the character's alpha box, resizes it to 1100 px high and encodes WebP with Pillow,
then updates the manifest's `illust` entries and its hash. `fetch-assets` plans the same leaf
(`char/illust/<charId>.webp`), converts the newly downloaded PNG in place and drops a file Pillow could not encode —
the card then falls back to `portraitE2` / `portrait`. The core skin catalogue's own `illust` files are separate
(`docs/SKINS.md`).

The **主界面音乐** library (owner 2026-10-25) is the official game's own 主界面 music list: `tools/assets/lobby-music.mjs`
names the 24 catalogue ids (主题 / 活动 / 联动 / 危机合约), `tools/assets/audio.mjs` `indexAudio().music(id)` resolves each id's
bank — following `bankAlias`, like the BGM banks — to its intro / loop under AA2 `voice` `sound_beta_2/music/`.
`node tools/lobby-music.mjs` downloads `<id>_{intro,loop}.mp3` through gh-proxy (curl, like `tools/illust.mjs` uses its
own sources) into `public/assets/audio/music/`, verifies the MP3 frame, writes `audio.lobbyMusic` and updates the
manifest hash; `--offline` only rewrites the manifest from files on disk. The plan declares the same leaves, so a later
`node tools/fetch-assets.mjs` keeps them. The default Hub theme is the mode's own `bgm.lobby` and is not duplicated here.

### Music pack (optional, not committed)

The PC client's `Arknights_Data/StreamingAssets/AB/Windows/audio/sound_beta_2/music/<act>/<stem>.ab` holds the whole
official 音乐鉴赏 catalogue as one Unity AssetBundle per recording (client-specific LZ4AK compression; `aklz4.py`
registers the decoder). `tools/local-extract/music.py` extracts all **218 unique recordings / 241 catalogue entries**
(8.4 h, 349 intro+loop AudioClips, 44.1 kHz stereo PCM), loudness-normalises each to **-14 LUFS / -1 dBTP**
(`ffmpeg loudnorm`, the owner's 2026-10-25 音量 report) and encodes MP3 160 kbps into `var/music/`:

```
py -3.14 tools/local-extract/music.py --game "<client>/Arknights_Data/StreamingAssets/AB/Windows" \
  --out "<run tree>/var/music"
```

It writes `var/music/index.json` (`{ entries: { [id]: { name, group, intro?, loop } } }`, group = theme / event /
collab / contract / rogue / sandbox / story / other) and is resumable (`--only=…`, `--force`). Empty official names
(the act29side camp variants, internal story/activity themes, ED sizes) are filled from
`tools/assets/music-titles.json` — PRTS's 音乐鉴赏 titles plus the camp variants — so the picker never shows a raw
`music_…` id. The pack is **not in the repository** (~580 MB, and the repo is already ~1 GB); `var/` is git-ignored. `server/index.js` serves it at
`/music/index.json` and `/music/<id>_{intro,loop}.mp3`; `public/js/ui/musicLibrary.js` merges it over the committed
`audio.lobbyMusic` for the picker (pack wins for the same id). Without the pack the Hub keeps the 24 committed tracks.

**Deploying the pack:** upload `var/music/` beside the code (it is excluded from the usual `tar` — docs/AI-WORKFLOW.md
(d)). The app server serves it at `/music/`; `audio.js` treats that route as server-local (it does not try the art
relay/CDN first) — add a `/music/` route to the relay only if you also point the client there.
`py -3.14 -m pip install --user UnityPy lz4 imageio-ffmpeg` are the optional local-extract requirements.

The Hub's **剧情背景** theme (owner 2026-10-25) uses 54 story CGs from the owner's folder. `tools/assets/hub-story.py
--src <folder>` resizes them to ≤1920 px, encodes WebP q85 (~7.7 MB total) into `public/assets/ui/hub/story/story-NN.webp`
and writes the list `public/js/ui/hub/storyImages.js`; the settings dialog offers one tile, and clicking it opens a
chooser with the source image names. The chooser's thumbnails load through an `IntersectionObserver` (only the visible
rows), and the chosen file is stored in the backdrop preference. These files are deliberately **not in
`data/assets.json`** — the boot art preloader would fetch all of them otherwise (`docs/UI-HUB.md`).

The `stem` of a Spine model is the upstream file name. Two examples: `char_107_liskam` has the stem `char_107_liskarm`, and `enemy_9032_aclionk` uses `enemy_1559_vtlionk`. The skel and atlas of a model always share one stem. pixi-spine locates the atlas by swapping the extension, so this matters.

### Id scope

- **Operators:** all 138 pool charIds from `activity_table` (`charShopChessDatas[*].charId ∪ backupCharId`), including hidden chess and backup operators; plus every unit of `data/backups.json` research 07 does not list — the 72 自选 owned-6★ picks (`diy.ownedPool`, DATA.md §18; the collab operators are not in the data, and 焰狐龙梓兰's entries left the manifest when she left the pool in 0.2.0) — planned from 07's URL patterns (`tools/assets/plan.mjs patternOperator`, `tools/fetch-assets.mjs dataExtras`): avatar and portrait (E0–E1 and E2), the default-skin battle Spine Front / Back, the icon and skill sound of each skill, the sub-profession icon. 209 operators in all (206 with a Back model).
- **Tokens:** the 20 pool tokens, and the 38 summons of the 自选 picks (`data/backups.json tokens`) as extra tokens (below): their avatars; no dump carries the battle Spine of the 自选 summons (upstream has at most skin variants, which the default locations miss), so the web manifest has no model for them — 35 of them, and 4 pool summons, have the official model as an optional local-client overlay ("Token models from the local client"); 3 have no model in the game at all.
- **Enemies:** 253 ids planned, 252 in the manifest (心烛 has no assets). The set is the union of:
  - the 07 enemy list;
  - every enemy in the `act1autochess_*` wave, boss and 联防 levels that act2 modes use (from `05-maps.json`; the tutorial is excluded);
  - the bosses (`boss_1..10`);
  - the closure of their summons (`randomEnemyAttribute` spawns and blackboard `enemy_key` references);
  - every key of `data/enemies.json` (built by `tools/build-data.mjs`, when present), which adds for example the enemies swapped in by 机变 effects;
  - the bosses' handbook/model ids, such as `enemy_1559_vtlionk`;
  - enemy units spawned by operator kits (research 03 skills/talents). For example, 隐德来希's default S3 summons 心烛 `enemy_5601_entlec` through the talent key `take_extra_enemy_key`. 心烛 has no icon and no Spine in any dump, so it has no manifest entry: it is reported as a miss, and the client must draw a glyph.
- **Extra tokens:** any `token_*` key of `data/tokens.json` that research does not list gets the default avatar and Spine locations.
  - The non-token summons in that file (`enemy_9012_acloon` 炎佑, `char_605_cmedic`, `char_613_acmedc`) are found under `enemies` and `chars`.
- **Skill icons:** every skill index of every planned operator (the default one first; DESIGN §16 loadouts, the 自选 picks' three skills): 522 icons.
- **UI:**
  - every group from `07-assets.json → autochessUi`: rarity, elite and chess-level sprites, the shop panel and cards, HUD, bond board, equip slot, round dialog, band choose, settlement, prepare backdrop;
  - `arts` (rarity stars, elite icons, the camp logos of pool nations, the loading illustrations used by the act2 modes, battle common sprites, act2 entry backdrops and season logo, item rarity frames);
  - extras (`tools/assets/plan.mjs UI_EXTRAS`): mode choice art, battle-ready backdrops, battle UI (speed, pause, HP slider, attack range, boss avatar frame, skill ready), `empty_skill`, the 机变 panel and cards, the equip-replace dialog, the bond detail dialog, the prep-ready panel, stage-info titles, the 36 battle emotes (`emoticon/{dir}/{picId}`) and the 19 玩法说明 pages (`guide/{key}`) — these two keyed by the group and name of `data/local-assets.json`.

## Post-processing

- **Atlases** (research 07 §5.3):
  - Insert `size: W,H` right after each page name. fexli atlases omit it; the value is read from the PNG header. An existing size that disagrees with the PNG is corrected.
  - Ark-Models enemy atlases get `pma: true`, because their textures are premultiplied. pixi-spine reads this and sets `ALPHA_MODES.PMA`.
  - Page names are sanitized to safe file names.
  - All of this is idempotent.
- **Skeletons:** every `.skel` (Spine 3.8.99 binary) is parsed in Node with `@pixi-spine/runtime-3.8`, the parser the client ships.
  - The parse extracts animation names and durations, event names, `OnAttack` times per animation, and bounds.
  - Attachment paths are checked against the atlas regions.
  - Then the animation-role resolver runs. See `tools/assets/anim-roles.mjs` and research 07 §5.4.
  - Runtime skill attacks (§34.31) distinguish a cast from a strike. Blemishine S2 uses the verified official
    mode's Attack / Attack_Down, S3 Skill_3; this does not request the optional effects index. Her Skill_2 has
    OnAttack and therefore needs that verified mapping even without the index. Every other skill keeps its
    existing role logic (held loops, own strikes, skill idles), with or without the index.
    Raw effects-index animKey values are not generally skeleton clip names: mode `_replaceAnimPairs` and skin
    `_animations` are not exported by the current index. Other indexed skills retain their existing roles until
    those mappings are available [ASSUMED]. No manifest or skeleton metadata is rewritten.
  - A web enemy model whose clip names mislead the resolver gets the roles of its official battle prefab
    (`tools/assets/spine.mjs PREFAB_SPINE_ROLES`, read from the local client's `battle/enm_pfb_*.ab`: the prefab's anim
    key → clip table and the clip its Spine starts on): 普通囚犯 / 老练囚犯 start on their grey `*3` set (【禁锢】), not
    the unnumbered red one (【解放】) the names point to. **Operators** are fixed the same way from their client prefab's
    `_animations` table (`chararts/<id>.ab`): 澄闪's attack is the `Attack_Start → Attack → Attack_End` sequence (her
    skeleton alone has no `Attack_Loop`), and 结城理's 本体 `Die` is the `Stun` clip (he has no `Die`; `SwitchOut` is
    leaving a 替身).
  - Only the role resolution changes (a resolver rule, a fix entry)? `node tools/refresh-anim-roles.mjs --write`
    re-derives every manifest role **offline** from each entry's own committed `animations` (the skeleton's clip names
    and durations — all `resolveRoles` reads), leaving the URL plan and every other field untouched. `test/asset-anim-roles.test.js`
    asserts the committed roles already match the resolver + the fix tables.
- **Fonts:** OTF/TTF files are converted to WOFF2 by a built-in encoder (`tools/assets/woff2.mjs`: Brotli with null transforms).
  - Its output was verified lossless against Google's reference `woff2` decoder.
  - `fonts.css` lists WOFF2 first and falls back to the original file.
- Images stay PNG. WebP conversion is not done: it would need a native dependency. The local-client board textures are the exception: `tools/local-extract/extract.py` (Python, where Pillow is already a dependency) writes WebP copies of the 14 textures the 3D board downloads (`WEBP`: colour maps lossy at quality 95 with the alpha and the RGB under transparent texels kept, normal and data maps lossless) and `data/local-assets.json` lists the copies; the PNGs stay beside them for `tools/crop-board-atlas.mjs`. The 19 local 玩法说明 pages get a WebP copy too (`GUIDE_WEBP_MODE`, lossy quality 90 since the maintainer's side-by-side look of 2026-10-12: 25.6 MB → 4.2 MB on the CN client's pages; lossless would be 17.4 MB), listed in place of the PNG, which stays beside it; the mirror copies under `ui/guide/` stay PNG. `extract.py --webp` adds the copies to an existing extraction without the client.

## Manifest schema (`data/assets.json`)

All paths are URL paths relative to the site root, for example `/assets/char/avatar/char_002_amiya.png` — in the committed file; a server hands them out with a content-hash segment ("The committed manifest and the served manifests" below). **Only entries whose files exist on disk are emitted.** When a key is missing, the client should use its fallback (research 07 §5.6).

```js
{
  version: 1,                       // schema version
  hash: 'a1b2c3d4e5f6',             // content hash (cache busting)
  generator: 'tools/fetch-assets.mjs',
  stats: { files, bytes, chars, charsWithBack, enemies, enemiesWithSpine, tokens, tokensWithSpine,
           spineModels, bonds, items, bands, skills, modules, ui, sfxUnits, voiceChars, voiceJpChars },
  chars:   { [charId]: { avatar, avatarE2?, portrait, portraitE2?, illust?, spine: { front: Spine, back?: Spine } } },
  enemies: { [enemyId]: { icon, spine?: Spine, spineAliasOf?: enemyId,
                          spineLocal?: { group, skel, atlas, textures, …Spine } } },
                          // spineLocal: an optional local-client model; file names in a data/local-assets.json group,
                          // not URLs, and always emitted (independent of the disk) — "Enemy aliases" below
  tokens:  { [tokenId]: { owner: charId|null, avatar?, spine?: Spine, spineVariant?: string,
                          spineLocal?: { group, skel, atlas, textures, …Spine } } },
                          // spineLocal: as for enemies — "Token models from the local client" below
  bonds:   { [bondId]: url },       // white glyphs; tint in CSS/canvas
  items:   { [trapId]: url },
  bands:   { [bandId]: url },
  skills:  { [iconId]: url },       // iconId = skill_table iconId ?? skillId
  skillsById: { [skillId]: iconId },
  modules: { [typeIcon]: url },     // module type icon (uniequip typeIcon, e.g. 'sol-x'): public/js/screens/loadout.js
                                    // moduleIconOf after the local-client art
  ui:      { ['group/key']: url },  // e.g. 'hudPanel/icon_hp', 'shopCard/frame_lv1', 'loading/loading_ac_core';
                                    // 'emoticon/basic/pic_happy_battle', 'guide/autochess_home_1': the data/local-assets.json
                                    // group + name of the same picture (the client takes the local one first)
  prof:    { icon: {caster…warrior}, large: {…}, battlecard: {…, token}, sub: {[subProfessionId]: url} },
  audio: {
    bgm:     { lobby, prep, combat, combatAlts?: [{ intro?, loop }, …], unite?: { intro?, loop }, boss: { intro?, loop } },
             // intro then crossfade to loop (1 s); combatAlts = the 开战 tracks of the mode's own act, chosen by the
             // round, not drawn: [0] = m_bat_kazimierz2_1 骑士之日 (rounds 8–13), [1] = m_bat_kazimierz2_2 无畏者
             // (rounds 1–7) — audio.js combatTrackFor / bgmKeyFor 'combat:<i>', the same on every client;
             // `unite` = 联防's own track — the official escaped_single / escaped_multi levels declare
             // `bgmEvent = corrosion` (卡西米尔 act13d5d0), so the rescue phase does not reuse the 作战's track
             // (audio.js bgmKeyFor 'unite', falling back to `bgm.combat` for a manifest that lacks it)
    bossBgm: { [bossId]: { intro?, loop } },                   // per-boss track of its R14/R15 level
    lobbyMusic: { [musicId]: { name, group, intro?, loop } },
                           // 主界面音乐 picker (tools/assets/lobby-music.mjs; UI-HUB.md): the official 音乐鉴赏
                           // `musics[]` ids. `name` = the official Chinese title, `group` = theme|event|collab|contract
                           // (the picker's tabs). The client's save is a setting (settings.lobbyMusic, localStorage);
                           // resolveBgm ('lobby:<id>') falls back to `bgm.lobby` when the manifest lacks the pick
    voice:   { [charId]: { start, faceEnemy, select, place, skill1…skill4,
                           resultFour, resultThree, resultTwo, resultLose } },
                           // 干员战斗语音: an operator's official battle lines (charword_table.json placeType → slot,
                           // tools/assets/audio.mjs VOICE_SLOTS); a slot with several lines is an array and the client
                           // draws one (public/js/audio.js voice); a slot whose lines are all missing on disk is left
                           // out (an operator with none has no entry), never an empty array. Only these twelve ever play (DESIGN §21.30): the
                           // prep-only slots 干员报到 / 编入队伍 / 任命队长 are left out of the plan by default —
                           // nothing requests them and they cost 360 files (19.3 MB) per run — and `--voice-all` adds
                           // them (audio.mjs VOICE_PREP_SLOTS) for the complete official set
    voiceJp: { [charId]: { …the same slots } },
                           // the Japanese dub (audio.voiceJp, the owner's request of 2026-10-08 「全套的日配语音」): the
                           // same slots and file names as `voice`, under audio/voice/jp/ (Voices from the local JP
                           // client, else ArknightsAssets2 voice/). The 设置 → 语音语言 switch picks `voiceJp` (日本語,
                           // the default) or `voice` (中文, not tied to the interface language); a JP line the manifest
                           // or the host lacks falls back to the Chinese line of the same name (audio.js voiceLine)
    sfx: {
      ui:     { click, back, confirm, tab, pick, drop, error, buy, sell, income, refresh, freeze, levelup,
                merge, equip, itemMerge, bondUp, artPlace, ready, timer, draft, yourTurn, yourTurnCircle,
                target, broadcast, danger, emote, roundStart, rest, battleStart, battleStartBoss,
                bossRoundTeam, bossRoundSingle, bossRoundSecret, killBoss, killBossAll, killBossNormal,
                defenceStart, defenceUnite, battleOverReduce, battleOverNoReduce, battleOverNormal, goFirst,
                disconnect, settlementSucceed, settlementFail, settlementTeam, settlementBossSign,
                goodEvaluation, load, start, matchSucceed, matchFail, matchCancel, joinRoom },
      battle: { deploy, tokenDeploy, charDie, enemyDie, enemyDieHeavy, enemyHit, heal, leak, win, lose, killCoin },
      units:  { [charId|tokenId|enemyId]: { attack?, hit?, skill?, skills?: {[skillIndex]: url}, attacks?: {[skillIndex]: url}, hits?: {[skillIndex]: url}, die?, born?,
                attackMix?: {[skillIndex]: {p?, vol?}}, hitMix?: {[skillIndex]: {p?, vol?}},
                mix?: { [attack|hit|die|born]: { p?, vol? } },
                pools?: { [attack|hit]: bankId }, attackPools?: {[skillIndex]: bankId}, hitPools?: {[skillIndex]: bankId} } },
      pools: { [bankId]: { maxSoundAllowed, popOldest,
                sounds: { [pathUnderSoundBeta2]: { minPitch, maxPitch, delay } } } }
    }
  },
  // units' mix (tools/assets/audio.mjs bankMix; community report #30): the official bank of a role's sound — `p` = the weight
  // of its sounds that have a file over all weights (an empty asset is a chance of silence: 猎狗pro / 深池侦察犬 0.2), `vol` =
  // the played file's volume (妖怪 0.7); only values other than 1. public/js/audio.js plays the role with chance p at its
  // base gain × min(1, vol)
  // units' attack / hit (tools/assets/audio.mjs pickUnitSfx): operators get normal-mode banks only — the plain
  // `attack` / `combat` ability first, never a bank holding a skill-mode file (`_d` / `_h` / `_s`; the normal attack's end
  // in `_n`) — with their own projectile banks (ON_PROJECTILE_BORN / _HIT.projectile_chr_<name>) as fallbacks
  // (DESIGN §18.4: 纯烬艾雅法拉's S3 impact used to be her `hit`); an operator with such a plain bank (its default mode is
  // the unsuffixed ability) never takes a numbered variant `attack.N` — a skill mode's, whatever its file name (银灰's S3
  // swing p_atk_silver_n, community report of 2026-10-06); one that numbers its default mode (`attack.0` …) keeps the
  // numbered order; enemies and tokens take the first attack-like bank
  fonts: { css: '/fonts/fonts.css', faces: { [name]: { family, weight, woff2?, original } } }
}
```

Attack/hit pool metadata is generated by `tools/assets/audio.mjs indexAudio().poolOf` → `tools/assets/plan.mjs`
from `excel/audio_data.json soundFXBanks` (GitHub #680, UPSTREAM-MERGES §13.10). Bank aliases retain the canonical bank id;
different banks sharing a file remain separate. `sounds` keys are lower-case paths under `sound_beta_2`, with `.mp3`,
not download URLs; the actual selected alternative supplies its pitch range and delay (seconds). Only
`data/assets.json` grows; no game media is added. The client uses the selected normal/mode reference, draws the
pitch in that range and schedules the delay on Web Audio's clock. Limits/takeover and the retained [ASSUMED]
remake anti-spam rules are specified in [design/client.md](design/client.md#skill-mode-sound-and-delayed-models-2817-2822).

### The `Spine` object

```js
{
  skel, atlas, textures: [url],       // load with PIXI.Assets.load(skel); atlas/png sit next to it
  pma: boolean,                       // true for enemies (atlas already carries `pma: true`)
  anims: Roles,                       // resolved roles, below
  animations: { [name]: seconds },    // every animation with its duration
  events: [name],                     // e.g. ['OnAttack', 'OnStart']
  hits: { [animName]: [seconds] },    // OnAttack event times (apply damage / spawn projectile)
  bounds: { x, y, width, height } | null  // skeleton AABB (setup pose, skeleton units)
}
```

The enemies' attack clip lengths are also a data input: `tools/build-data.mjs` copies each enemy model's
`anims.attack.loop` length and first `hits` time into data/enemies.json `attackAnim` (the sim stands an unblocked
ranged enemy for that clip, GitHub #58, and strikes every enemy attack at that frame, 0.2.0; docs/DATA.md §9) — rebuild the data after a manifest change that touches them.

### The `Roles` object

```js
Clip      = { begin: string|null, loop: string, end: string|null, via?: 'combat'|'attackAny'|'skill'|'idle'|'attack' }
SkillClip = Clip & { index: number /* 0-based skill index */, idle: string|null /* Skill_n_Idle */ }
Roles = {
  idle: string, deploy: string,
  attack: Clip,            // play begin once, loop per attack, end when stopping; `via:'idle'` ⇒ add a flash
  attackDown: Clip|null,   // _Down variants (target below the unit)
  skill: SkillClip|null,   // for the chess's default skill (primary index)
  skills?: { [index]: SkillClip },   // when the char is used with several default skills (backups); an enemy: every
                           //   numbered skill clip (Skill_01..04 of 盐风主教昆图斯 — the slot a sim `cast` event names, PR #275)
  die: string|null,        // null ⇒ a Back model gives way to the Front model's Die (DESIGN §22.1); any other
                           //   skeleton holds its idle's first frame while it fades out
  move: Clip|null,         // enemies: Move_Begin|Move_Start + Move_Loop|Move + Move_End → Run_*
  run?: Clip,              // the model's own Run cycle (Run_Begin/Loop/End): an enemy faster than moveSpeed 1 moves on it
  stun: Clip|null          // Stun | Stun_1 | Dizzy_Loop (+ *_Begin / *_End); null ⇒ freeze the track (timeScale 0)
}
```

`via` marks a fallback:

| `via` | The attack is actually… |
|---|---|
| `combat` | `Combat` |
| `attackAny` | a numbered attack such as `Attack_01`, possibly framed by `Attack_Begin`/`Attack_End` (`char_1045_svash2`) |
| `skill` | `Skill_1_Loop` (pure supporters) |
| `idle` | `Idle` (no attack animation at all) |

On a skill clip, `via: 'attack'` means the model has no skill animation, so the attack clip is reused.
A skill clip may also come from directional-only animations when a model has no undirected ones: for example `Skill_Right_Loop` (`char_279_excu`) or `Skill_Loop_Up` (the Back model of `char_431_ashlok`).

The resolver's full precedence list is in the header of `tools/assets/anim-roles.mjs`.

The manifest roles describe a unit's first form. Units whose skeleton holds another form's clip set get it from
`public/js/render/units.js FORMS` (keyed by Spine id, switched by the `form` of the sim's 'phase' / 'ember' / 'revive'
/ 'telegraph' / 'stone' / 'liberate' / 'substitute' / 'swap' / 'dollEnd' fx — `shared/protocol.js fxForm`; no client stage drops these fx: the runner keeps them through
catch-up frames and hidden tabs (`keepsState`), the game screen's pre-entry buffer (`keepEarly`) and the render engine's
event queue (`render/interp.js isCosmeticEvent`) too — or, for a view built mid-battle, UnitInfo `form`, which `render/app/info.js renderInfo` passes to the view; a
`change` clip plays once first, an `end` clip is timed from the fx's `dur` to finish as that state ends, keeping the
current form's death clip until the next form's fx). A blocked or revealed 隐匿 enemy is drawn solid: the sim sends the
stealth bit only while its 隐匿 is on — and 假想敌：骨刺 changes model with that bit, not with an fx (`STEALTH_FORMS`, GitHub
#296, PR #365): the manifest's `*_A` (the three-headed snake) while the bit is on, its `*_B` set (form `revealed`) the
moment it is blocked or revealed, `*_A` again when its 隐匿 is back; no change clip, a running attack, stun or freeze
pose carried over (`render/spine.js syncFormPose`). The forms:
- 掠海漂移体's crawl (`Change`, then `*_02`);
- 假想敌：骨刺 (`*_A` / `*_B`, above);
- 转译基底·α's three forms (`A_Die_B` / `_C` / `_D`, 2 s each, then `B_*` 寻仇者, `C_*` 幽灵, `D_*` 特战术师);
- the 深池逐火 embers (`Die`, then `Idle_2` / `Move_2` / `Die_2`; `Revive` ends as it stands up) and 假想敌：再生's puppet
  (`A_Die`, then `B_*`; `B_Revive`);
- the leaders' 重生: 锏 (`Revive1`, `Revive2` held, `Revive3`, then `B_*`), 扎罗 (`A_revive_1` / `_2` / `_3`, then `B_*`),
  “复仇者” (`Revive_Begin` / `_Loop` / `_End`), 杰斯顿 (`C1_Die`, then `C2_*`);
- 守墓石像 (the statue on `Sleep` [ASSUMED by name], then the flyer's `*_2`).
- the 孤岛风云 prisoners, as their official prefabs' modes: confined on the manifest's grey set, `warning` (mode R, the
  warning before the last confined attack) on the blinking orange set, `liberty` (【解放】) on the red set — 普通囚犯 /
  老练囚犯 `Idle3` → `Idle2` → `Idle`, 强壮囚犯 `Idle` → `Idle2` → `Idle3`, 拳师囚犯 / 重犯 / 传奇重犯 `*_grey` → `*_orange` →
  `*_red` (Move / Attack / Die alike; no change clip).
- the 傀儡师 operators' <替身> (form `doll` of the sim's 'substitute' / 'swap' / 'dollEnd' fx, DESIGN §22.11; the `*_B`
  clips draw the 替身's own slots and hide the 本体's): 归溟幽灵鲨 `Start_B` (it fades in), `Idle_B`, `Die_B` over its last
  second (it breaks apart and fades), `Die_B_2` when it is knocked out (it collapses), and the 本体 back on `Start_2` (a
  form's `leave` clip); 风丸 `Start_B`, `Idle_B` / `Attack_B` / `Die_B`, the 本体 back on `Start`. Facing up, 归溟幽灵鲨's
  Back skeleton has only `Idle_B` and `Start_2`, 风丸's `Start_B`, `Idle_B` and `Attack_B`: the missing clips are skipped.
  Neither Back skeleton has the 替身's death clip, so a 替身 knocked out lies on the Front model (like every knocked-out
  operator facing up, DESIGN §22.1) with its `Die_B_2` / `Die_B`: the view keeps the form it died in for that model and
  for one rebuilt while it lies down, although the sim resets the form right after the knock-out.

Not mapped (clip names ambiguous): “自在”, “巨大的丑东西”, 主角阵营角色 and “余音” (`*_A` / `*_B`: which of its two forms is A
is not known) keep their manifest clips.

Other renderer rules from research 07 §5.4–5.5:
- **Choosing the model:** Front when the unit faces right or down; Front mirrored when facing left; Back when facing up — while it stands: a dead or knocked-out operator falls and lies with the Front model unless its Back skeleton has a Die clip of its own (131 of the 135 have none; DESIGN §22.1, GitHub issue #25).
- **Attack speed:** set the attack `timeScale` to `duration / attackInterval`.
- **Model size:** every skeleton is drawn at one `UNIT.modelScale` (render/style.js, 320 skeleton units per tile), which stands for the official standard. The official client also scales each enemy model in its battle prefab: the Graphic / FaceSwitcher / Spine transforms multiply to 0.27 for most enemies and for the operators' battle skins, but not for all of them. For example, 威龙 is 0.16, 妖怪 0.20 and 青铜镜 0.6. The skeletons themselves carry no such scale, because every enemy SkeletonDataAsset uses 0.01. So an enemy is drawn × data/enemies.json `modelScale` (its prefab's product ÷ 0.27, see docs/DATA.md; user playtest #6: 威龙 used to be drawn 1.35× a 妖怪 instead of 1.08×), and its HP bar sits on that model: at its setup-pose bounds' height × the same factors, or, for a skeleton without bounds, at the chibi headroom × `modelScale` (bosses 2.2 tiles). `tools/local-extract/enemy_scales.py` reads the products from a local client, and `tools/build-data.mjs MODEL_SCALES` keeps them. Two prefab quirks on top (PR #211 by @xcdoge; the owner's decision of 2026-10-06; docs/research/12 §3.1): the two 帝国炮火先兆者 are stretched vertically (`modelScaleY` 1.263: their Graphic scale is (0.19, 0.24, 0.24)) and 木制瑞印 is mirrored (`mirrorX`: a negative Graphic X scale) — `tools/local-extract/enemy_model_offsets.py` reads them, `tools/build-data.mjs MODEL_STRETCH_Y` / `MIRRORED_PREFABS` keep them.
- **Flying units** hover `FLY_HOVER` = 1.3 tiles up (render/units.js; the client's single fly offset 0.35 in its character space, whose unit is the standard prefab scale 0.27 — docs/research/12) — an enemy flyer above the road whatever tile it crosses (a high-ground or forbidden block under it is no step, GitHub #277), an operator or summon above its tile: the body, its HP bar, damage numbers and hits ride the lift, the shadow stays on the ground tile (the block top under an enemy flyer crossing one), on the 2D and the 3D board alike (one camera drives both).
- **Enemy aliases:** `enemies[id].spineAliasOf` means the model belongs to another enemy. Two cases:
  - `_2` variants whose official prefab is the base one (鸭爵, 高普尼克, 流泪小子, 圆仔, 假想敌：胄, 假想敌：铳): the base model, as in the game.
  - an enemy whose own model no dump carries: 灼热源石虫 / 炽焰源石虫 (`enemy_1305_mhslim` / `_2`) use the plain 源石虫 on
    the web (`plan.mjs ENEMY_SPINE_ALIAS`). The reason is upstream: isHarryh/Ark-Models *indexes* `1305_mhslim` /
    `1305_mhslim_2` but with an **empty `assetList`** — registered, never uploaded — so `arkModel()` finds no files for
    them and the alias chain drops to `enemy_1007_slime`, a different enemy rather than a variant of it, which is why
    the renderer tints that alias toward the slug's own colours. The official prefab draws the slug's OWN skeleton: its
    Graphic / FaceSwitcher / Spine points at that slug's `enemy_1305_mhslim[_2]_SkeletonData` (audited with UnityPy:
    `C_Body_*` / `C_Rock_*` regions, not the plain slug's `Body` / `Thorn_*`), so the intended look is each slug's own
    model, and the extraction below is what the game is meant to show; the plain-slug alias is only the fallback for a
    client without the local art. Their official skeletons exist in the client's
    enemy art bundles (`refs/arts/enm_art_*.ab`); the *mobile* build also ships them as
    `enemy_spine/<enemyId>/<enemyId>.{skel,atlas,png}` (straight-alpha pages: no `pma: true` line), but its only public
    mirror is a community wiki rather than a GitHub dump, so it is deliberately **not** an asset source — a third-party
    site is not added to `sources.mjs` for two models, and the tinted alias stays the web model until a GitHub dump
    carries them. The same official model from the local client is the optional **overlay**,
    `enemies[id].spineLocal` = `{ group, skel, atlas, textures, pma, anims, animations, events, hits, bounds }` (file
    names in the `data/local-assets.json` group `spine/enemy/{enemyId}`; the rest as a `spine` entry):
    - `tools/local-extract/extract.py` writes the model to `public/assets/local/spine/enemy/{enemyId}/` (page textures
      with their `[alpha]` texture merged in: premultiplied RGB + A like Ark-Models; the atlas gets `size:` and
      `pma: true`) and lists its files in `data/local-assets.json`.
    - The metadata comes from the committed `tools/assets/local-enemy-spines.json` (`fetch-assets --local-spines`
      parses the extracted models into it), never from the disk: `data/assets.json` is byte-identical with or without
      the extraction, it has no `/assets/local/` URL, and setup / doctor / the manifest tests never miss these files.
    - The client (`assets.js spineEntry`, with `assets.local()`, which `createFieldView` awaits with the manifest) draws
      the official model when the local manifest lists every file of it; otherwise, or when it fails to load
      (`UnitView`: the entry's `fallback`), the web alias, tinted toward the slug's own lava colours
      (`render/units.js ALIAS_TINT`: 灼热 orange, 炽焰 red-orange; research 07 §5.6 "a hue shift", [ASSUMED] look) so a
      source install without the extraction still tells them from the plain 源石虫. The two models are committed
      (`public/assets/local/spine/enemy/enemy_1305_mhslim[_2]/`, listed by `data/local-assets.committed.json` via
      `node tools/local-extract/committed-manifest.mjs`), so a clone without a per-machine `data/local-assets.json`
      still draws them — see `.gitignore` / the committed manifest. A release bundle carries the
      models only when it is zipped from a checkout where the extraction ran with the `spine/enemy` job (an extraction
      made with 0.1.0 lacks it: `node tools/setup.mjs --local` again, then check that `data/local-assets.json` lists
      `spine/enemy/enemy_1305_mhslim` and `spine/enemy/enemy_1305_mhslim_2`).
    User feedback after 0.1.0 (D3: "所有特殊源石虫的模型全表现为普通源石虫"): the ELEMENT faction spawns up to ten of them a
    round. A 2026-10-03 audit of every enemy of `data/enemies.json` (249) against the client's battle prefabs (the
    skeleton each prefab's Spine renderer draws) found no other enemy drawn with another enemy's model; 伊利昂的木驮兽
    (`enemy_10159_mntrjn`) starts on its `Full` skin (five passengers) in the game and is drawn with the `default` one.
- **Token models from the local client** (0.2.0): no dump carries the battle Spine of most 自选 summons (fetch-assets:
  "missing skel"), nor of 凯瑟琳's 爬行号·防护单元 and 凛御银灰's 风雪之眼, so they were drawn as the avatar diamond. The
  local client has them in its battle token packs (`pkgrps/btl_pfb_tokens_*.ab`, the Windows build carries all of them;
  the iOS build lacks `btl_pfb_tokens_0` and has ASTC pages), the same overlay as the enemies above:
  - `tools/local-extract/extract.py TOKEN_SPINES` (40 ids; `--only spine/token`) reads each token's battle prefab
    (`dyn/battle/prefabs/[uc]tokens/<id>.prefab`), takes the skeleton of its Front renderer — a directional token has
    Front / Back (/ Down) renderers, each with its own skeleton of the same name; the web tokens use Front too — and
    writes it to `public/assets/local/spine/token/{tokenId}/` like an enemy model (skeleton, sized `pma: true` atlas,
    premultiplied pages: the older tokens' `[alpha]` texture merged in, the newer RGBA pages kept with their own alpha).
  - `tokens[id].spineLocal` = `{ group: 'spine/token/{tokenId}', skel, atlas, textures, pma, anims, … }` from the
    committed `tools/assets/local-token-spines.json` (`fetch-assets --local-spines`), never from the disk;
    `assets.js spineEntry` draws the model when `data/local-assets.json` lists every file of it, else (or when it fails
    to load) the avatar diamond as before. The models are drawn like the web tokens: one `UNIT.modelScale`, no
    per-prefab factor (the official prefabs scale most tokens by the standard 0.27; W's 此面向敌 0.4, 令's “清平” 0.25 and
    “弦惊” 0.3, 傀影's 镜中虚影 0.26, 风雪之眼 and 淬羽赫默's 夜灯 0.25 — like the web tokens' 医疗探机 / 诅咒娃娃 0.4 and
    香槟炸弹 0.25).
  - Clip names the resolver cannot read are mapped in `tools/assets/spine.mjs LOCAL_SPINE_ROLES`: 电弧's 戴乌
    (`C_Skill1_*`, beside a 0 s `C_Default` pose), 酒神's 本能的召唤 (`Loop` / `End`) and 白铁's 多功能平台 (`End` as it
    goes) [ASSUMED: by the clip names], and 凯尔希·思衡托's 战术锚点, whose Start / Idle / Die clips hide its only
    attachment: it stays on its `Default` pose (a white anchor mark) [ASSUMED].
  - Not extracted: the tokens whose prefab draws nothing (an `EmptyAnimator` instead of a Spine renderer; no avatar in
    either install's asset index either): 乌尔比安's 从不混淆的方向, 圣聆初雪's 保护目标（冻结状态）, 酒神's 迷狂牢笼, 贝洛内's
    牵绊 and 予愿安洁莉娜's “一会儿见！” — the last three keep the token fallback picture (`tokenAvatarUrl`: no avatar, no
    owner in the manifest → the 召唤物 battle-card icon).

### Other fallbacks

- **Emotes and 玩法说明 pages** (`public/js/data.js artUrls / nextArtUrl`, `ui/guide.js guideStage`): the local-client picture (`data/local-assets.json`) first, then the mirror copy (`ui['emoticon/…']`, `ui['guide/…']`), each tried in turn when one fails to load; when none is left — none listed, or every copy failed (for example data/assets.json lists the downloaded pages but the files are not on disk yet: a `git pull` and restart without setup) — the neutral emote glyph, and for a page the official tips text (`config.tips`). The rest of the local-client art (the 3D board, the official HUD sprites, module type icons, the two enemy models and the 40 token models above) is not downloaded: the client looks it up in `data/local-assets.json` only (most of the HUD sprites are on the mirror too, DESIGN §22.5); docs/DEPLOY.md §6 lists what falls back without it.
- **Tokens:**
  - Without an avatar, use `chars[owner].avatar` with a 召唤物 badge, or `prof.battlecard.token` — except 圣聆初雪's 保护目标（冻结状态） (PRTS 无头像; the frozen gate), drawn as a procedural ice diamond (`render/units.js ICE_TOKENS`).
  - Without a Spine (and without its local-client model, "Token models from the local client"), draw the avatar sprite with a bob tween.
  - `spineVariant` names the skin-variant model that stands in for the missing default model.
- **Enemies without a spine** (for example `enemy_9016_acstmr`): draw `icon` in a diamond. Enemies with no manifest entry at all (`enemy_5601_entlec` 心烛): draw a procedural glyph.
- **Battle effects** (projectiles per kind, hit sparks and slashes, skill bursts and auras, 蕾缪安's lock reticles and shells, 回环射手 boomerangs — DESIGN §17.3) have **two tiers**, resolved at render time per client:
  - The **procedural tier** is drawn at run time (`public/js/render/textures.js`, the FX atlas) and is always available — the sim's `arrow` covers gun snipers too, so it is not tied to any one client. Every kind has one (`FX_KINDS` `a` + `c` + `r`, `render/fx/kinds.js`). It is the guaranteed fallback: no download, no local client, no network.
  - The **local-art tier** is optional: a kind's `local` spec (`{ group, layers: [{ name, scale? }], tint?, dur? }`) names pictures of the local client (`data/local-assets.json`, group + name). `render/fx/localart.js` resolves them and `render/fx/simfx.js` draws them **as in-place ground fields at the anchor, size-capped to about one body** (the layer set's drawn radii `r × layer.scale` are scaled down together so the largest is at most `LOCAL_FX_MAX_R` = 1.1 tiles, preserving the authored ratios; `render/fx/localart.js` / `render/fx/simfx.js` `_fxLocal`) **instead of** the procedural archetype only when the client has every layer listed AND loaded; otherwise — art not extracted, manifest/join not loaded yet, a load failure — the procedural tier is drawn. A listed layer still loading is prefetched, so a later event uses the official art; a layer the manifest does not list is not fetched at all. Never a blank frame, and the fallback never depends on the network. **Two switches opt the tier off:** `settings.localFx === false` at run time (like a quality tier, on by default; no mandatory user setting), and the source-level one-line kill switch `LOCAL_ART_ENABLED` in `render/fx/localart.js` (default `true`; set it to `false` and `fxLocalFor` / `fxLocalSource` return null, so **every** operator falls back to procedural — generated table and hand-wired kinds alike).
  - A kind **shared by many operators** (`aoe`, `strike`, `champagneBomb`, `takeoff`, …) attributes its layers to the event (`render/fx/localart.js` `fxLocalFor`, `render/fx/simfx.js` `_fxLocalOp`): `local.bySkill: { <extra.skill>: local }` for an explicit label and `local.byOp: { <spine|defId>: local }` for the emitting operator (the caster `src` first — a `strike` is anchored on its victim — else the anchor `id`, so a token's kind keys its token id). A `byOp` / `bySkill` entry merges over the base and may inherit `group` / `tint` / `dur`; a non-listed caster keeps the procedural tier and is never fetched.
  - **The season roster's generated table** (0.2.0; narrowed again after the "many operators paint a big flat picture" report): when a kind carries no layers of its own (or marks itself `official: true`), `fxLocalFor` falls back to `render/fx/official.js` `FX_OFFICIAL` — generated by `tools/build-fx-official.mjs` from `data/chess.json` (the visible roster), the kits' emitted fx kinds and the committed manifest. Each operator maps to its own effect bundle's signature Texture2D layers for **the kinds their kit actually emits**, so a registered operator's official art supersedes the procedural archetype without editing any kit or kind, and an operator whose kit emits nothing (or whose art is not extractable) is absent from the table and keeps the procedural tier. Four restrictions keep a bad pick off the board: (a) **only soft in-place effect pictures** — the `flow` / `ray` / `glow` / `ring` / `star` / `light` / `smoke` / `aura` / `halo` families (`EFFECT_TEX`); walls, decals, patterns and object / prop / icon-looking textures (`char_*`, `special_object_*`, `bg_*`, `pattern_*`, `water_*`, …) are **never** a layer, and a bundle with no qualifying picture gets no entry (procedural stays); (b) **no animation grid** (a `flipbook*` / sprite-sheet / atlas / sequence image packs many small frames, so one layer would show a whole sheet of images — `SHEET`); (c) **only AREA / SELF kinds** whose archetype is `blast` / `zone` / `healAoe` / `wave` (an area happens at a spot) or `buff` / `shield` / `shatter` / `summon` / `vanish` / `lift` / `sleep` / `heal` / `down` / `counter` / `dodge` / `dp` / `coin` / `sp` (it happens on the unit) — the per-attack / impact family (`crit` / `strike` / `slash` / `beam` / `bolt`, `IMPACT_KINDS`) and the per-target / instant / unit-attached archetypes (`volley` / `shell` / `move` / `blink` / `mark` / `reticle` / `flame` / `wall` / `chill` / `telegraph`) are drawn procedurally, because a ground field on them just litters the board during combat (`KIND_ARCH`); (d) every drawn layer is **size-capped to about one body** at run time (see the local-art bullet). An operator whose usable textures are all sheets, whose bundle has no qualifying effect picture, or whose kit emits only denied kinds is therefore absent and keeps the procedural tier. Re-run the generator after an extraction or a roster change; an operator may be pinned by hand in `tools/local-extract/fx-official-overrides.json` (created on demand). Our 8 `CUSTOM_CHESS` operators are **skipped before the pin lookup** (`identifier ≥ 900`, see the custom-operators bullet below), so they are absent from the table on purpose.
  - **The normal-attack impact is procedural — not taken from the official client (0.2.0 revision).** An earlier design gave every operator a shared `hit` kind drawn from their one signature Texture2D as a ground field at the victim; it was **removed as visibly wrong**. The official per-attack hit is *not* a per-operator texture: the projectile prefabs (`battle/prefabs/[uc]projectiles.ab`, 2,858 prefab objects) name a particle-system effect prefab in `_effectsWhenHit` (the generic `common_hit_01` / `common_heal_hit_01`, or `<op>_hit_01` / `<op>_attack_*_hit`), which resolves to a cluster of `ParticleSystem`s, materials and transforms in the operator's `battle/prefabs/effects/<stem>.ab`. Drawing the operator's largest bundle texture as a ground field put the wrong art at the wrong anchor and scale (e.g. 银灰's 512² `svrash_02` flow art smeared ~2.4 tiles across the floor under the victim, 隐现's `flipbook_215` bullet sheet as a ground band), so the normal-attack impact (`render/fx/projectiles.js` `_impact`, `render/fx/numbers.js` `damage`) is the procedural hit (glow + burst / crescent slash) for **the whole roster** — a correct procedural effect beats a wrong official one. The `hit` kind and `fxOfficialHit` / `OFFICIAL_HIT_KINDS` are gone, and no roster operator's normal attack consults the manifest. **Our custom operators are no exception any more (owner, 2026-10-16):** the fork's hand-authored `FX_HITS` was dropped; our 8 `CUSTOM_CHESS` operators take the official battle effects like every other operator and fall back to this same procedural hit (see `docs/OUR-FEATURES.md` §2). Faithful per-attack impacts for **every** operator — retiring the procedural hit — are a **planned future task**: a Unity particle-system importer for the `effects/*.ab` prefabs plus a per-operator projectile→`_effectsWhenHit` mapping (both readable with the existing UnityPy venv; see `docs/OUR-FEATURES.md` §1).
  - The colour order is the project's usual **local → mirror → neutral** (assets.js): the official picture first, then the procedural drawing (fx kinds have no mirrored web copy). This is the same per-client graceful degradation as the models and emotes (owner's analogy: Minecraft shader settings) — a friend joining without the local art sees the procedural effect.
  - **Applied:** `battle/prefabs/effects/kalts2.ab` carries its own Texture2D (38, extractable with UnityPy — `tools/local-extract/extract.py` job `fx/kalts2`, MATCHMAKING §35.9); the S2 bursts **are** ground fields in the official prefab. Since 2026-10-16 our operators carry **no local art** (owner): `FX_KINDS.kalts2Heal` / `kalts2Damage` draw their procedural green / red orbs and the official battle effects (`render/vfx/**`) stand for the burst. The 驭械术师 浮游单元 (the funnel `drone` pod, `PROJ.drone`) **stays procedural**: its textures live in unresolvable external CABs and no standalone sprite/spine ships in the client (`render/textures.js` `drone`).
  - **Adding a new effect:** write/keep its procedural archetype first (always present), then, only if official art is obtainable, add a `local` spec naming the extracted layers — never a `local`-only kind.
  - The S1 医疗单元 bundle `kalts2_skill_02_*` also has `indicator_*` / `start_*` / `trail_*` / `buff_01` prefabs; their textures are in the same `fx/kalts2` group for future kinds.
  - **The whole season roster** (0.2.0): `tools/local-extract/extract.py` reads the visible chess from `data/chess.json` and extracts **every** official operator's per-operator effect bundle `battle/prefabs/effects/<stem>.ab` into `fx/<stem>` (Texture2D only; `EFFECT_FX_BUNDLES`, still overridable with `FX_BUNDLES`). 119 of the 120 operators carry a bundle in the CN client (1,736 textures, ≈ 67 MB); 能天使 `char_103_angel` ships no `angel.ab` here, and 砾 / 石棉 / 白雪 / 花 / 亚叶 have an empty / art-less bundle — those keep the procedural tier. Our 8 `CUSTOM_CHESS` operators are **excluded** from the table and from every kind's local art (owner, 2026-10-16): they use the official battle effects and fall back to the procedural archetype, exactly like the roster. The generated table covers the roster (50 operators — those whose kit emits an attributable skill fx kind and whose bundle has a non-sheet single-frame effect). Five entries left it in the sheet / impact fix: `char_373_lionhd` (its whole `fx/lionhd` bundle is the one `flipbook_86` animation grid) and the four whose kit emits only impact kinds (`char_294_ayer` 'strike'; `char_145_prove` / `char_4100_caper` / `char_264_f12yin` 'crit') — all keep the procedural tier. The 2026-10 **size / texture / kind narrowing** then took the table from 86 to 50: it dropped every operator whose bundle has no soft effect picture (walls / decals / patterns / object-looking textures — e.g. `char_102_texas`'s `jian_01`, `char_196_sunbr`'s `meat_01`, `char_2027_wang`'s `char_wang_05`), and every operator whose kit emits only denied kinds (`char_126_shotst`, `char_4145_ulpia`, `char_264_f12yin`); an operator with a qualifying picture but no in-place kind is absent just the same. Their procedural tiers stay. Normal attacks are **not** in the table: their impact is procedural (see the "normal-attack impact" bullet above) — 克莱门莎's included (our custom operators carry no table entry at all any more).
  - **A clone gets the tier without extracting:** the art under `public/assets/local/**` is committed (.gitignore), but the per-machine `data/local-assets.json` is not. `tools/local-extract/committed-manifest.mjs` writes `data/local-assets.committed.json` (the same keys) and `server/http/static.js` serves it in place of an absent per-machine manifest, so a fresh clone's fx official tier, 3D board, local enemy/token spines and UI icons resolve.
  - **The served manifest is the UNION of the two — a partial per-machine file silently drops only what it alone carries.** `/data/local-assets.json` is answered with `data/local-assets.committed.json` **plus** the per-machine `data/local-assets.json` (`server/http/static.js`), so the committed art (tokens, enemies, UI, maps, meshes, fx) resolves on every machine whether or not that machine extracted anything. What the per-machine file alone provides is the art **not** in the committed manifest — here the extracted battlefield **scenes** (12 groups) — so a machine whose file is partial (e.g. replaced by an extraction that ran only one set) loses those extras: the scene tests (`test/render/board3d-scene.test.js`) and the token canary `test/render/token-wang-stone.test.js:48` read the file **directly** and go red, while the client keeps drawing the committed art (verified 2026-10-16: with the laptop's file cut back to its 12 scene groups, 望's 棋子 still resolved to `/assets/local/spine/token/token_10064_wang_stone1/…` through the union). Add the missing groups with the extractor (`tools/local-extract/extract.py --only spine/token`, `--only spine/enemy`, …) — it **merges** into the existing manifest (`merge_manifest`: a `--only` run keeps every other group) and writes each group's own `kind` / fields. Copying groups in by hand only works for the **spine** ones (the committed `TextAsset` / `Texture2D` entries match what the extractor writes); its `mesh/*`, `map/*`, `ui/*`, `emoticon/*` groups carry another `kind` vocabulary (`materials` / `prefab` / `webp`, from `tools/local-extract/committed-manifest.mjs`'s lowercase rule) and this file must carry **no** `fx/*` group at all (that file list is `data/local-fx.json`) — merging those makes `test/local-extract*.test.js` / `board3d-extract` / `emotes` fail. Do **not** point `committed-manifest.mjs` at `data/local-assets.json` either: its key rule folds `scene.json` and `scene.bin` onto one key, so a scene loses its JSON and `board3d-scene` fails. (2026-10-16: the laptop's file held 12 scene groups only; adding the 41 committed spine groups back made the token canary green and left the client behaviour unchanged.)
- **Spine memory** (`public/js/assets.js`): skeletons are refcounted in an LRU with an idle budget (`SPINE_IDLE_BYTES`, 48 MB) and a 15 s grace; eviction runs `SPINE_EVICT_DELAY_MS` (1 s) after a release, the "no scene on screen" budget (0 bytes) applies after `SPINE_QUIET_DELAY_MS` (3 s) with nothing referenced, and a skeleton whose unload is still in flight is never handed out again — a new load waits for the unload (DESIGN §17.1; it used to leave operators invisible after a battle → prep switch).

### Looking up `data/chess.json` asset ids

`data/chess.json` stores asset **ids** in `chess[*].assets` (docs/DATA.md). They map onto this manifest as follows (checked for all 274 chess that carry `assets` — every record except the 8 DIY filler ids):

| `assets` field | Example id | Manifest URL |
|---|---|---|
| `avatar` | `char_498_inside` / `char_498_inside_2` | `chars[id].avatar` / `chars[id minus "_2"].avatarE2` |
| `portrait` | `char_498_inside_1` / `char_498_inside_2` | `chars[id minus "_1"].portrait` / `chars[id minus "_2"].portraitE2` |
| `spine` | `char_498_inside` | `chars[id].spine.front` (and `.back`) |
| `skillIcon` | `skchr_inside_2` | `skills[id]` (the id is the skill's `iconId`) |
| `subProfIcon` | `sub_fastshot_icon` | `prof.sub[id minus "sub_" and "_icon"]` |
- **Missing unit SFX:** use `audio.sfx.battle.enemyHit` or a WebAudio blip (research 07 §6.4).
- **Bond icons:** if the real glyph ever fails, the stored file is the nation camp logo.

## The committed manifest and the served manifests

`data/assets.json` in git (and as `tools/fetch-assets.mjs` writes it) and `data/local-assets.json` (as
`tools/local-extract` writes it) hold plain URLs. Since 0.2.6 (host bandwidth, layer 1) the server hands out a view of
each (`server/http/assetIndex.js`, `server/http/assetViews.js`):

- Shortly after the start (1 s) the server hashes every file under `public/assets/` and `public/fonts/` in the
  background: SHA-256, the first 16 hex digits. The hashes are kept in `.cache/asset-hashes.json` by path + size +
  mtime, so a restart only stats the files and reads none of the unchanged ones (12,691 files / 724 MB on the
  maintainer's machine: 1.3 s for the first build, 0.25 s after that). A file whose size or mtime changed is hashed
  again; a re-extraction, `setup --force` or a Docker rebuild then costs the players only the files whose bytes changed.
- `GET /data/assets.json` and `GET /data/local-assets.json` answer with every art URL carrying its file's hash as the
  first segment: `/assets/char/avatar/char_003_kalts.png` → `/assets/~398f32e2ff78d9e6/char/avatar/char_003_kalts.png`,
  `/fonts/~<hash>/…`. Audio keeps its `/assets/~<hash>/audio/….mp3` form; `public/js/media.js` asks for it as
  `/media/~<hash>/…` (the download-manager route, `shared/media.js`).
- A Spine model's skeleton, atlas and pages carry one hash, the model's (SHA-256 of the files' hashes): pixi-spine finds
  the atlas by the skeleton's name and the pages next to the atlas, so the URLs share a folder. In `data/assets.json`
  every `{ skel, atlas, textures }` object is a model; in `data/local-assets.json` every `spine/…` group (the files a
  `spineLocal` record names).
- The server strips the segment and serves the file at the plain path. When the segment names the file's current bytes
  (its own hash, or its model's) the answer is `Cache-Control: public, max-age=31536000, immutable`; any other segment —
  a page loaded before an update, a URL derived from another file's — gets the current file with `no-cache`, so an old
  page keeps working. The ETag of every indexed file is its content hash (`"398f32e2ff78d9e6"`, plus `-br` / `-gz` when
  compressed), on the plain URL too.
- A path segment, never `?v=`: `assets.js validSpine` matches `/\.skel$/`, `audio.js SKILL_MODE_FILE` the `.mp3` ending,
  pixi-spine takes the atlas name from the skeleton's basename and resolves the pages against the atlas's folder — a
  query string survives none of that.
- A URL the index has no hash for (the file is missing, or not hashed yet) stays plain; plain URLs work as before
  (`public, max-age=86400`, revalidated after a day).
- Until the index is ready, with `SP_ASSET_INDEX=0`, or on a static host without this server, the manifests go out as
  committed. The views are rebuilt in memory when a manifest or the hashes change; neither file is ever written by the
  server, and the `hash` field is the committed one. The index lives in `.cache/` only and is never packaged.
- **Cosmetic plugins** (0.3.0, docs/PLUGINS.md §9, DESIGN §32): a room whose host switched cosmetic plugins on draws with
  the served `data/assets.json` above and the room's visual set over it, composed by the page itself
  (`public/js/assets.js` cosmetic layers, `public/js/content.js`): `GET /vs/<vs16>/overlay.json`
  (`server/plugins/visualSet.js`) carries only the set's composition — each plugin's id, version and file table, what
  `vs` hashes — and each plugin's writes (paths of its folder and references, no URL, no copy of this manifest). Every
  entry no plugin changes keeps its `/assets/~<hash>/…` URL; a whole-record or field reference (`{ "ref": "<key>" }`)
  copies the page's own entry; a plugin's own files are `/p/<id>/<hash8>/<path>`, built by the page from the file table:
  the first 8 hex digits of the file's SHA-256 — for a Spine model's skeleton, atlas and pages one hash, of the model's
  files' SHA-256s, for the same reason as above —, `immutable` at that hash, the current file with `no-cache` at another;
  nothing of a plugin folder but the files its overlay names is served. A player's personal plugins come the same way
  and are laid over whatever the page draws. Neither committed manifest, nor the views above, ever change with a plugin:
  without one a page loads exactly what it loaded before.

## Verification

`node --test test/assets.test.js` covers the pure helpers: the resolver, the atlas normalizer, the format sniffers, WOFF2, audio banks, the plan id sets, the downloader against a fake network, and the self-heal of corrupt skeletons.
When `public/assets` exists, the same file also checks the generated output:
- Every manifest path exists on disk.
- Every pool operator has an avatar, a portrait and a Front model.
- Every atlas has `size:` lines, plus `pma: true` for enemies.
- Every Spine model loads the way the client loads it — the local-client enemy and token models too, when `data/local-assets.json` lists them. That means pixi-spine's atlas reader with real page sizes, where a region outside its page throws, then `SkeletonBinary` with `AtlasAttachmentLoader`, where a missing region throws. Every resolved role is then posed.

`test/feedback1d-models.test.js` (enemies) and `test/local-token-models.test.js` (tokens) check the local-client overlays: the plan, the committed metadata, the manifest without `/assets/local/` URLs, the client's choice of model; `test/local-extract.test.js` the extractor's job table and helpers.

The 2026-09-27 verification pass also checked:
- **PNG:** all 2,211 PNGs pass a full CRC and inflate check.
- **Audio:** all 467 MP3s decode with ffmpeg without errors.
- **Browser:** headless Chrome loads and animates all 529 Spine models with the vendored PixiJS 7.4.2 and pixi-spine 4.0.6, with no console errors. Chrome's font sanitizer also accepts the three WOFF2 files.
- **Official data:** 771 provenance checks against the official data (`activity_table`, `skill_table`, `models_data.json`) all match: avatars, portraits, E2 art, bond, band and item icons, and enemy skeleton files.

## Local asset cache & CDN mirror download chain

**Why.** The box's uplink is ~2.3 MB/s and a cold load pulls ~104 MB of art, so the owner asked (2026-10-13) to move
that traffic off the server: (1) a returning player keeps the art locally and re-downloads **nothing**; (2) a first load
comes from a **CDN mirror**, not the box; (3) the box is only the **last resort**, and is **rate-limited** so live
matches keep their bandwidth. This is a **fork-only** feature — the merge-critical file list is in
[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §10, the decision record in [`docs/MATCHMAKING.md`](MATCHMAKING.md) §42.

**Server side.**
- **`GET /asset-index.json`** (`server/assetindex.js`; route in `server/http/static.js`) →
  `{ version, app, revision, count, bytes, files, sources }`:
  - `files` — `{ url: byteSize }` for every cacheable file that `data/assets.json` (plus the committed / per-machine
    local manifests) names under `/assets` and `/fonts` **and that exists on disk** (~14k files, ~828 MB here).
  - `revision` — a deterministic hash of `files` (`indexVersion`); an **equal revision means the client's cache already
    matches**, so nothing is downloaded. Rebuilt only when a source manifest changes (mtime-keyed cache).
  - `sources` — the fallback origins a cache miss may try, best first (`assetSources`): read straight out of
    `public/asset-mirrors.json`, **the ONE place the origins are written down** (`server/mirrors.js`; the console's
    来源配置 view edits that file, live — a save is picked up on the next request, no restart). Nothing is hardcoded any
    more: no repository slug, no relay constant, no CDN template. `SP_ASSET_RELAY` overrides the full origin a client
    installs, and **`SP_ASSET_REF=''` turns the whole tier off** (every class then stays on the game server). Served
    `no-cache` + `Access-Control-Allow-Origin: *`.
- **`server/http/files.js`** — asset / font responses carry `Access-Control-Allow-Origin: *` (so a player's own machine
  can serve them). A **process-wide token bucket** (`RateLimiter` + `assetRateBytesPerSec`) paces `public/assets` /
  `fonts` / `vendor` response **bodies** — the server fallback path — at **`SP_ASSET_RATE_KBPS` KB/s (default 1200 ≈
  1.2 MB/s; `0` disables)**; non-art paths are never paced. `server/http/media.js` (the extension-less `/media/…` audio
  route) is paced too.

**Browser side.**
- **`public/sw.js`** — the Service Worker: cache-first for same-origin `/assets|/fonts|/vendor` in Cache Storage
  (`sp-assets`). **On a miss it fetches from, in order: the player's own machine (`localBase`), then `/asset-index.json`
  `sources` — the owner's relay first, then gh-proxy / jsDelivr, 15 s each, byte-verified against the index — and only
  then the game server** (a hashed `~<hash>` request is asked for as the **real path + `?h=`**, because the plain-file
  mirrors have no `~<hash>` directory, and the size is looked up by that real path) — so
  **on-demand** art (spine, audio, anything the pre-cache did not cover) is offloaded too, and the server is the true
  **last resort**. The worker reads the index lazily and drops it when the page reports a new `revision`. Range
  requests and non-GET pass through.
- **`public/js/assetCache.js`** — the policy. Pure, unit-tested: `syncPlan` (per-file diff — download the missing /
  resized, remove the dropped), `cacheIsCurrent` (revision + per-file sizes), `candidatesFor` (mirrors first, server
  last) and `mirrorPath` (a hashed URL → the real path + `?h=`). Every `index.files` lookup goes through
  `unhashedUrl` — the index names the **real** paths while the manifests carry the `~<hash>` segment. Glue: `registerAssetWorker` (+ `navigator.storage.persist()`), `fetchAssetIndex`, `ensureAssets` (download the
  diff), `fetchArtFile` (**try each mirror with a 15 s timeout, verify the bytes against `index.files[url]`, store the
  first good source in the cache under the same-origin URL; else the server**), `assetCacheUsage`, `clearAssetCache`,
  `assetCacheInfo`. Storage keys: `sp.pref.assetMode` (`stream` | `cache`), `sp.assetCache.revision`,
  `sp.assetCache.sizes`.
- **`public/js/assetSource.js`** — the optional **local origin**: probe `127.0.0.1:3000` / `localhost:3000` for an
  `/asset-index.json` with the **same `revision`**, then point the worker at it (a player who also runs the game on
  their own machine touches the box not at all). Pref `sp.pref.assetLocalSource`.
- **`public/js/ui/assetMode.js`** — the first-visit chooser (`AssetModePrompt`, **default 缓存到本地**; the web-load
  option is labelled **不推荐**) and the 设置 row (`AssetCacheSection`: mode / usage / 立即缓存 / 清除缓存 /
  优先使用本机资源), backed by `js/ui/settings.js`.
- **`public/js/main.js`** `preloadArt` — in `cache` mode it syncs through the worker (and skips the boot gate); otherwise
  the HTTP-cache warm-up is unchanged.

**Behaviour matrix.**

| situation | what happens |
|---|---|
| never chose | web load (HTTP-cache warm-up + the boot gate) — **unchanged** from before this feature |
| chose cache, revision current | **nothing is fetched**; the worker serves every art request from the local cache |
| chose cache, revision changed | **incremental**: only the missing / resized files are downloaded (never the whole set); files the server dropped are removed |
| a file: a mirror answers | fetched from gh-proxy / jsDelivr (15 s each), size-verified, then cached |
| a file: every mirror fails | the **game server**, paced at `SP_ASSET_RATE_KBPS` |
| an on-demand file (spine, audio …) | the **same chain on its first request** — mirrors first, the server last |
| a same-revision server runs locally | the **local origin** (the box is not touched) |

**Failure modes.** No Service Worker / Cache Storage ⇒ the mode degrades to a web load; a mirror with a wrong byte size
is skipped and the next source is tried; a file that fails everywhere stays out of `sizes` and retries next boot; the
设置 清除缓存 (or clearing site data) simply re-downloads.

**Persistence.** Cache Storage survives reloads, browser restarts and even the server being down — **verified in a real
browser** (below). It is **not guaranteed permanent**: the browser may evict it under storage pressure, so
`navigator.storage.persist()` is requested (best-effort) to reduce that risk. It is not a release artifact and can be
cleared by the player or the browser.

**How the field test was run (2026-10-13).** Served the dev tree on `127.0.0.1:3100`; chose 缓存到本地; the cache filled
to **2461 files / 138 MB**, revision matching the server; then **stopped the server** and fetched a cached asset — it
still returned **200 / 56,617 B from the local cache**. The default pre-cache is the boot **image** set
(`collectArtUrls(manifest, 'all')`, ~104 MB); the full index is ~828 MB and stays **on-demand** (or 立即缓存).

**Testing.** `test/asset-index.test.js` (collection / version / disk pass / mtime cache), `test/ui/asset-cache.test.js`
(`syncPlan`, `cacheIsCurrent`, `candidatesFor`, `fetchArtFile` fallback + size check), `test/asset-rate-limit.test.js`
(the token bucket), `test/ui/title-surfaces.test.js` (allows `public/sw.js`).

### Without a Service Worker (the deployed site is plain HTTP, 2026-10-14)

The chain above is built on a Service Worker, which needs a **secure context**. The production box serves
`http://<ip>:<port>`, so the worker never registers there and every byte used to come from the box (the owner's
「此浏览器不支持本地缓存」). Three layers now cover that case, and all three stay dormant whenever the worker can
register — so the HTTPS future keeps the better chain.

- **The image manifests load from the CDN mirror** — `public/js/assetMirror.js` + the static
  `public/asset-mirrors.json` (a plain file: changing the list needs no restart). At boot it probes the mirrors with a
  GET of `/asset-mirrors.json` itself and, when one answers, prefixes the **image** URLs of `data/assets.json` /
  `data/local-assets.json` at load. `rewriteAssetPaths` moves the `~hash` serving segment to a `?h=` query: the CDNs
  cache an image for a week (`jsDelivr`: `max-age=604800`), so a URL without it could serve a stale image after an
  update, while a query is harmless here (only images are rewritten; a Spine atlas and its pages never are). A dev
  origin (`localhost` / `127.0.0.1`) and a mirror that does not answer leave every URL alone — the local 11-stage
  render is byte-identical.
- **An IndexedDB store for the files the page fetches itself** — `public/js/assetIdb.js`. A page cannot intercept a
  request without a worker, so this covers exactly what the game loads through its own code and can therefore serve
  from a `blob:` URL: the **audio** (`js/audio.js` `_buffer`: check the store, else fetch and store) and the
  **battlefield scene bundles** (`render/board3d/load.js`). A `blob:` URL cannot carry a Spine atlas (the atlas names
  its pages relatively), so the Spine models stay on the server / the mirror. Priority is the owner's: `main.js` sets
  the gate to `idbSupported() && !assetCacheSupported()` — the worker wins whenever it can register.

  **The stored encoding is part of the contract.** `fetchScene` writes three kinds and they are not interchangeable:
  `json` is stored as its JSON encoding, while `text` and the buffers go in **verbatim** (`idbBodyFor` / `idbValueFrom`,
  exported so the rule is pinned by a test). Getting that wrong is not a cache miss but silently corrupt data: v1 ran
  `JSON.stringify` over `text` too, so the official gate meshes — the `map/fx` `Start_*.obj` files, the only `text`
  entries the board fetches — came back as a quoted, escaped string, `parseObj` found no mesh, `_buildGates` drew
  nothing, and the **红门/蓝门 disappeared on every visit after the first** (owner report 2026-10-14; the dev harness
  never enables this layer, so `render-demo.html` renders the gates fine and only production was hit).
  **Changing the encoding therefore also means bumping `assetIdb.js` `IDB_VERSION` and dropping the store on upgrade** —
  a browser that cached the old bytes would otherwise keep the bug forever, since the IDB sits under the app.
- **The fallback chain (owner, 2026-10-14).** The order is the `sources` list of `public/asset-mirrors.json`, best
  first: **the owner's own relay** (`http://123.57.150.185`, Aliyun Beijing, 200 Mbps, nginx over a clone of this repo's
  `public/`; unmetered), then **GitHub and its mirrors** (gh-proxy → jsDelivr), then **this server** as the fallback.
  `js/assetMirror.js` installs the first origin that answers and rewrites the manifests' image URLs to it; a fetch that
  fails walks the rest of the chain — an `<img>` through the capture-phase error listener (`mirrorCandidates` /
  `nextMirrorCandidate`), the preload per image, and the audio / scene / clip routes through their own candidate lists
  (the relay's route → the CDN's plain file → this server's route → the file). **Only an error advances the
  chain, never a successful load**: advancing on load re-fetched every image from the next origin, so a cold visit
  pulled the same pictures from the relay, then gh-proxy, then this server, and left the browser cache holding the
  fallback's URL — the next visit re-downloaded everything (measured 2026-10-14: 2465 images from the relay PLUS 686
  from gh-proxy and 340 from this server; after the fix the same visit is 2465/2465 from the relay, and a warm visit
  costs the relay 30 requests instead of 2965 — the cache answers the rest). A **full origin** (`fullSources`) is one
  that also reimplements `/media`, `/scene` and `/clip`; the plain-file mirrors only ever get the files, so with them
  alone every route stays on this server.Verified 2026-10-14: one cold visit moved 95.3 MB / 1820 requests to the relay
  with no 404s (nothing fell back), and with the first two tiers dead a page image still loaded from this server.

  **Since 2026-10-15 the client picks the origin by MEASURED THROUGHPUT** (`js/assetMirror.js`), not by "who answers
  first": at boot it times the origins on **six committed portraits (~110 KB each) fetched in parallel** — the way the
  boot preload pulls art — so the rate is the throughput a player gets, not one stream's latency. **The relay is probed
  first** (the healthy case costs one round of samples) and the remaining sources are probed in parallel only when it
  misses its bar: the relay must clear **1.2 MB/s** (`RELAY_MIN_BPS`), a plain-file GitHub mirror **0.5 MB/s**
  (`MIRROR_MIN_BPS`), otherwise the manifest URLs are left on this server. A fresh reading is reused for
  `SPEED_CACHE_MS` (2 min; `cacheMs: 0` re-measures every call), and the whole list stays as the per-file error
  fallback. This is what demoted the relay when the owner's box measured ~0.05–0.4 MB/s (its plan's real egress, far
  under the advertised 200 Mbps); after Aliyun lifted the instance's restriction (2026-10-15: **7.1 MB/s sustained on a
  2.1 MB file, 21.7 MB/s at 8-way** — ~18× the game box's 1.18 MB/s at the same width) the same rule picks it back up
  with no code change.

  **Watch it from the console** (2026-10-15): the admin page's 「诊断 → 测速」 (`server/speed.js`,
  `GET /admin/api/speed`, `docs/MATCHMAKING.md` §12.2) times the same origins on the same samples and shows **two
  columns** — the game box's own view and the operator's browser, which is the vantage a player has — plus the origin
  the rule would install right now. That is the quickest way to catch a throttled relay or a dead mirror: each row has
  a bar against the same 1.2 / 0.5 MB/s bars, and `test/speed.test.js` re-reads `assetMirror.js` and fails if the
  samples, the bars or the budgets drift apart.

  > ⚠️ **An HTTPS site needs an HTTPS relay.** A page served over HTTPS may not fetch `http://…` subresources (the
  > browser blocks them as **mixed content**, silently), so on the filed domain `strongholdprotocolcsym.top` the chain's
  > first tier (`http://123.57.150.185`) would be dropped and every client would fall back to the CDN mirrors. Before the
  > site moves to HTTPS, give the relay a certificate on a subdomain of the filed domain (e.g.
  > `relay.strongholdprotocolcsym.top`) and list the `https://` origin first in `public/asset-mirrors.json` —
  > `server/assetindex.js` `assetSources()` reads that order, so the Service Worker's chain follows it too. See
  > `docs/DEPLOY.md` "域名与 HTTPS".

### The relay (the owner's own art origin)

Since 2026-10-14 the art is served from this fork's own relay rather than the game box. Everything needed to take it
over:

| | |
|---|---|
| host | `103.205.254.40` — 宿迁云 KVM, **Debian 12** (bookworm), 4 GB RAM / 30 GB disk, nginx from 宝塔 (1.26.3); **moved here on 2026-10-26** from the old Aliyun Beijing box `123.57.150.185` (that instance is gone). **Public entry: `https://relay.strongholdprotocolcsym.top:56148`** (the provider's NAT maps 56148 → the box's 8080). HTTPS is mandatory, not a preference: the game page is served over HTTPS and a browser blocks an http origin as mixed content |
| ssh | `ssh -p 57435 root@103.205.254.40` — the box has **no direct public IP**: the provider's NAT maps `57435 → 22`. Authorised by the deploy key `~/.ssh/sp-deploy`. The password was used once at provisioning; the key is the supported way in |
| serves | `/srv/sp/public` through 宝塔's nginx: config `/www/server/panel/vhost/nginx/sp-relay.conf` (included by `/www/server/nginx/conf/nginx.conf`), `listen 80` (internal) and `listen 8080 ssl` (the public entry), `Access-Control-Allow-Origin: *`, `Timing-Allow-Origin: *`. **Certificate**: Let's Encrypt for `relay.strongholdprotocolcsym.top` issued through **DNS-01** (an Aliyun TXT record; ports 80/443 are not reachable on this box). Renewal is **manual** — `certbot.timer` is off because the auth hook must wait for a human to add the TXT: run `/srv/renew-relay.sh` on the box, add the `_acme-challenge.relay` TXT it prints, `touch /srv/acme-go`; `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` reloads nginx. Automate it by installing a DNS API plugin (`certbot-dns-aliyun`) with a scoped Aliyun AccessKey. **Cache (2026-10-15): anything that carries the content hash is immutable for a year** — the `/…/~<hash>/…` paths, and the plain paths the client's mirror prefix rewrites (they carry the hash as `?h=`, `map $arg_h`); a plain path and the extension-less routes stay at the conservative week. Rationale in the "slows down" note below: the old blanket week made a regular player re-download the ~135 MB cold set whenever the copy lapsed |
| repo | `/srv/sp.git` — a **bare** repository whose `hooks/post-receive` checks the pushed branch out into `/srv/sp` (`git --work-tree=/srv/sp … checkout -f`), so **a push IS the deploy**. `/srv/sp` is that checkout, not a clone: do not `git pull` in it |
| history | fetched from gitee once (913 MB), so a push from the dev machine carries only the new objects. There is **no cron** — the push is the deploy |
| deploy | from the dev machine: `node tools/push-assets-relay.mjs` (host and NAT ssh port are the tool's defaults; `--host` / `--port` or `SP_RELAY_HOST` / `SP_RELAY_PORT` override) |
| config | versioned at [`tools/relay/sp-relay.nginx.conf`](../tools/relay/sp-relay.nginx.conf) **and installed by the
  hook**: a push copies it to `/www/server/panel/vhost/nginx/sp-relay.conf` when it differs, runs `nginx -t` and reloads
  only when nginx accepts it (a rejected config is restored from the `.bak` and says so). Editing the live file
  directly therefore drifts and is lost on the next push — edit the repository copy and push |

**Routes.** nginx answers the same paths the game server does, so any asset URL can be prefixed with the origin:

| path | file |
|---|---|
| `/assets/**`, `/fonts/**`, `/vendor/**` | the same path under `public/` |
| `/assets/~<hash>/**` (and `fonts` / `vendor` likewise) | the same file with the `~<hash>` segment dropped — it is a
  cache-buster, not a directory (`server/http/files.js` strips it; the client's mirror prefix turns it into `?h=`).
  The hashed rule must come **before** the plain one: nginx takes the first matching regex, and falling into the
  plain one 404s the asset (2026-10-14: that turned every image into a fallback fetch under a different URL, which
  is what kept the browser cache cold) |
| `/media/<path>` and `/media/~<hash>/<path>` | `public/assets/audio/<path>.mp3` — the `~<hash>` segment is a cache-buster the path ignores, exactly like `server/http/media.js` |
| `/scene/<id>/meta` · `/scene/<id>/bin` | `public/assets/local/scene/<id>/scene.json` · `scene.bin` |
| `/clip/<name>` | `public/assets/loading/<name>.mp4` |

**Verify it, do not assume it.** `node tools/check-delivery.mjs` prints the configured origins, which one answered,
the chain the client would use per class, and what each origin's route shapes answer; `--live` adds the check that
matters most — two visits in one browser, where the warm one must come back from the browser cache:

```
Cold visit   requests  2237  ·  fromCache     1  ·  relay 2237  ·  github 0  ·  this server 0
Warm visit   requests  2470  ·  fromCache  2240  ·  relay  230  ·  github 0  ·  this server 0
CACHE-FIRST OK: 90.7% of the warm visit is answered by the browser cache.
```

(Those 230 are the images the cold visit did not reach — the preload stops at its 60 s deadline — so they are first
fetches, not cache misses: nothing came from gh-proxy or the game server in either visit.)

**When the relay suddenly slows down (the 2026-10-15 incident).** Its real egress collapsed to ~1 Mbps (0.05–0.4 MB/s
single, 0.42 MB/s at 4-way) while the plan advertises **200 Mbps** — the 轻量 console read "峰值公网带宽 1.03 Mbps /
200 Mbps". The site stayed usable with **no deploy**: `js/assetMirror.js` measures the origins, the relay missed its
1.2 MB/s bar, and the manifest URLs moved to the **game box** (3–4× faster than the throttled relay). Aliyun's support
lifted the instance's restriction the same day, and the same rule picked the relay back up (measured 2026-10-15:
**7.1 MB/s sustained on a 2.1 MB file, 21.7 MB/s at 8-way** — ~18× the box).

What to check next time, in order:

1. **Measure from a domestic vantage** (the Hangzhou ECS is fine): fetch the same committed file from both origins — for
   example 8 parallel of `/assets/local/scene/act1autochess_m01/scene.bin` (~2.1 MB) — and compare the aggregate MB/s.
   A single small file only measures round-trip latency (that mistake made the fixed relay look slow: one 112 KB sample
   read 0.42 MB/s while six in parallel read 1.9 MB/s).
2. **轻量 console → 流量使用情况 / 带宽 / 监控**: is the monthly traffic package exhausted? Is the bandwidth **峰值
   (peak / burst)** or **固定 (fixed)**? A throttled instance shows a **flat line** in the bandwidth chart.
3. **It is not the DDoS page.** 流量安全's 清洗阈值 is 200 Mbps / 200k pps — a few Mbps of normal traffic never triggers
   scrubbing, and a blackhole makes the IP **unreachable**, not slow. (Recorded because that page was the first suspect.)
4. **Nothing else to do.** The client re-measures on every load (a reading is reused for `SPEED_CACHE_MS`, 2 min) and
   walks the chain on errors, so a source whose quality changes needs **no code change and no restart** — this incident
   is exactly what the speed rule was added for ([`docs/MATCHMAKING.md`](MATCHMAKING.md) §44).

**Publishing order (owner, 2026-10-14): the relay first, then gitee / github.** The clients hit the relay first, so it
has to hold the bytes before the code that asks for them is published:

```powershell
node tools/push-assets-relay.mjs        # 1. deploy the relay (a push; its hook checks the tree out)
node tools/push-gitee.mjs -m "…"        # 2. then the two mirrors (github primary + gitee)
```
- **Extension-less routes** for the files a download manager (IDM / 迅雷 / FDM) hijacks out of XHR/fetch. The audio has
  had `/media/…` since 0.2.5; the scene bundle and the boot clip joined it:
  **`/scene/<stageId>/{meta,bin}`** (`shared/scene.js` + `server/http/scene.js`) and **`/clip/<name>`**
  (`shared/clip.js` + `server/http/clip.js`). A path with no extension matches none of the download types such a
  manager reacts to — without it the owner's IDM grabbed `…/scene.bin` and the 3D board silently fell back to the
  procedural tiles. The direct `/assets/…` URLs keep working (they are the fallback for a plain static host, which
  `load.js` uses). Tested live: `/scene/act2autochess_m04/bin` → 200, 2,139,668 B; `/clip/boot?v=2` → 200 `video/mp4`,
  immutable.

**The extracted scenes are tracked now** (owner's decision, 2026-10-14). `public/assets/local/scene/**` used to be
git-ignored ("the repository stores no official files"), but the CDN mirrors serve the *primary repository*, so the
74.8 MB of scene bundles 404ed there and every 3D board fell back to this box. `test/scene-assets.test.js` asserts the
directory is **not** ignored any more.

**Testing (this fork's additions).** `test/asset-mirror.test.js` (the mirror rules, the `?h=` mapping, the deep
rewrite), `test/asset-idb.test.js` (the store's Node-safe surface), `test/short-routes.test.js` (the `/scene/` and
`/clip/` mappings + live requests against the routes).

**Why not Gitee / GitLab.** Their **raw** endpoints send **no `Access-Control-Allow-Origin`**, so a browser `fetch` is
blocked, and Gitee **Releases 403** hotlinks — so neither can be a *browser* download source. Gitee stays the **code
mirror** and the human-facing **package download** links only. (gh-proxy and jsDelivr were both verified to serve our
primary repo with `ACAO: *`.)

## 本地客户端来源（owner 提供，2026-10-06）

主人本地装了官方客户端，缺的**美术**资源可直接从它抽（不用镜像）：

- **路径**：`D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP`（**日服**）；Unity 资源根 =
  **`…\Arknights_JP\Arknights_Data\StreamingAssets\AB\Windows`**（热更内容另在 `Arknights_Data\PersistentData\Bundles\`）。
- **美术**：`tools/local-extract/extract.py` 直接指到该根即可：
  ```
  .venv-extract\Scripts\python.exe tools\local-extract\extract.py ^
    --game "D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP\Arknights_Data\StreamingAssets\AB\Windows" [--only <subdir 前缀>]
  ```
  （自动棋地图 / 自动棋 UI 切图 / 表情 / 说明页 / 投射物 / 战斗特效贴图（`fx/kalts2` 卡尔茨 S2 + 自选干员 `fx/ascln` `fx/makoto` `fx/aglna2` `fx/wang` `fx/gdglow` `fx/narant` `fx/clemnt` 克莱门莎，`EFFECT_FX_BUNDLES`）/ 若干 Spine / 3D 棋盘网格·材质·特效 / 派生 PBR / WebP / 敌人 Spine；写出到 `public/assets/local/**` 并更新 `data/local-assets.json`；随仓库提交的素材由 `committed-manifest.mjs` 汇总为 `data/local-assets.committed.json`。）
  相关：`tools/local-extract/enemy_scales.py` 读模型缩放；`node tools/setup.mjs --local` 把本地抽取一并接入。
- **语音**：本地客户端每个干员一个包 `audio/sound_beta_2/<lang>/<干员>.ab`（`<lang>`＝客户端默认语言 `voice`，另有 `voice_cn` / `voice_en`），内含该干员所有语音片段（`CN_019`…，**编号是 CN 行号，与语言无关**）。用 `tools/local-extract/extract-voice.py` 按清单把要的片段抽出来转 mp3 写回（**无需改清单**）：
  ```
  .venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py ^
    --voice-dir "D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP\Arknights_Data\PersistentData\Bundles\audio\sound_beta_2\voice"
  ```
  2026-10-06 的第一版**误用**了日服默认语言 `voice`（日语）填了中配槽（120 干员、1680 条）——`audio.voice` 指的中配树因此混进了一批日语（设置→语音语言选「中文」时那批干员仍说日语）。2026-10-12 修正：**中配从本地中配客户端（B 站）的 `…\sound_beta_2\voice_cn` 抽**（`--dub cn`），**日配从 `voice` 抽**（`--dub jp`）；两家客户端都同时带 `voice`（日配）与 `voice_cn`（中配），别交叉。`--print-jobs` 只看要写什么。
  **日配树**（`audio.voiceJp`，2026-10-10）：加 `--dub jp`（源仍是 `…\voice`），输出的 `cn_nnn.mp3` 落到清单里的 `audio/voice/jp/<charId>/`，也就是设置→语音语言「日本語」播的那套：
  ```
  .venv-extract\Scripts\python.exe tools\local-extract\extract-voice.py --dub jp ^
    --voice-dir "D:\本地网络游戏中心\鹰角启动器\YostarGames\Arknights_JP\Arknights_Data\PersistentData\Bundles\audio\sound_beta_2\voice" ^
    --ffmpeg "C:\…\ffmpeg.exe"
  ```
  `--dub`（`cn` 默认 / `jp`）选清单里的树；客户端的 `voice` 是**日配**、`voice_cn` 是**中配**（英配 `voice_en`）。播放时**选中的语言优先，缺则逐条回退另一套**——中文⇒CN 否则 JP；日本語⇒JP 否则 CN——两套都没有才不出声（`public/js/audio.js voiceLine`），所以本地客户端没有的（新干员）不影响它上线。
- **BGM / SFX**：`extract.py` / `extract-voice.py` 都不管；本地这个日服客户端也**没有**上游新增的 `m_bat_kazimierz2_*` / `m_bat_corrosion_*` / `b_ui_alarmenter`。→ 走镜像（见下），或以后有更新的客户端再抽。
- ✅ **远程镜像其实能用**：本机直连 `raw.githubusercontent` / `jsDelivr` 被墙，但 `fetch-assets` 带 **`--asset-source=mirror`**（#24 的 gh-proxy 镜像）就正常：
  ```
  node tools\fetch-assets.mjs --asset-source=mirror
  ```
  2026-10-06 用它补齐了 BGM/音效。（`--asset-source` 也可用 `SP_ASSET_SOURCE` 环境变量；不带 flag 时先试原始源、失败再提示。）
- ✅ **GitCode 镜像（yuanyan 图标库）**：`yuanyan3060/ArknightsGameResource`（干员头像/立绘、技能图标、敌人/召唤物图标）在 GitCode 有只读镜像，免登录。直连 GitHub 被墙时用 **`--asset-source=gitcode`**（等价前缀 `https://raw.gitcode.com/gh_mirrors/ar/ArknightsGameResource/raw/main/`）即可下到这批图标；其余源（fexli 脊柱 / AA2 / Ark-Models）GitCode 没有镜像，仍走直连 + jsDelivr。已验证镜像文件与 GitHub 逐字节一致（如 `avatar/char_377_gdglow.png`，58,987 B）。

## Licensing and credits

The project's code is GPL-3.0-or-later (`LICENSE`); none of the items below is covered by it. Details: `NOTICE.md` (scope, non-commercial terms) and `THIRD-PARTY-NOTICES.md` (libraries, fonts, licence texts).

- **Game assets.** All images, Spine models, audio and game data are © **Hypergryph (上海鹰角网络)**. The overseas publisher is **Yostar**.
  - This is an **unofficial, non-commercial fan project**: no ads, donations or paywall.
  - Assets are fetched from public community dumps at install time and are not redistributed in this repository. The plug-and-play bundle attached to a GitHub release does carry them (with the local-client art) under the same non-commercial terms, with `NOTICE.md` inside.
  - Assets will be removed on request from the rights holders.
  - The client must show a credits screen: "Arknights © Hypergryph / Yostar. This is an unofficial fan project; all game assets belong to their owners."
- **Asset dumps and tools.** Credit to:
  - [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) (mirrored on GitCode as [gh_mirrors/ar/ArknightsGameResource](https://gitcode.com/gh_mirrors/ar/ArknightsGameResource), used by `--asset-source=gitcode`)
  - [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource) (ArkResourceAutoUpdateBot)
  - [isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models) (ArkUnpacker). Not for commercial use.
  - [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2) (ArknightsStudio)
  - [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)
- **Spine runtime.** pixi-spine is MIT-licensed. It embeds Spine Runtime code under the [Spine Runtimes License](http://esotericsoftware.com/spine-runtimes-license), which formally expects a Spine Editor licence. This is commonly tolerated for non-commercial fan tools, and the Spine Runtimes License must be credited (`THIRD-PARTY-NOTICES.md`). The project's GPL carries an additional permission (section 7) to combine it with the Spine Runtimes (`NOTICE.md`).
- **Fonts.**
  - **Bender:** © Jovanny Lemonad (Oleg Zhuravlev, Ivan Gladkikh). Free for personal and commercial use.
  - **Novecento Wide:** © Jan Tonellato / Synthview. Free licence.
  - Both are mirrored from TimWangZi/The-font-of-Arknights.
  - Noto Sans SC and Noto Serif SC (SIL OFL) are loaded from Google Fonts, not self-hosted.

### Skill attack banks (0.2.3, PR #410)

`pickModeAttacks` / `pickModeHits` select a uniform d/h/s bank from the official audio table (attack/combat abilities
only). A skill's activation sound supplies its mode letter; without one, d/h/s = slots 1/2/3 is [ASSUMED]. Competing
banks prefer START over ON, then plain/numeric order; this is a deterministic approximation, not proof of every
operator's runtime ability graph. Mixed-letter banks are skipped. Preserve `mixOf` for each selected bank separately;
`attacks`/`hits` and `attackMix`/`hitMix` use matching skill keys. Regenerate the current manifest instead of importing
an older PR's full JSON, preserving JP voices and current operators. See DESIGN §28.17.

The 40th local token model is the original champagne bomb (`token_10031_swire2_gdtrap`, §29.5), extracted from the official `btl_pfb_tokens_0.ab` through `TOKEN_SPINES`. Its web fallback is retained. Failed board-pack/image requests can retry after connectivity/visibility recovers; a failed three.js module gets at most two fresh-URL retries per page because browser module failures are cached. Successful resources remain cached.
