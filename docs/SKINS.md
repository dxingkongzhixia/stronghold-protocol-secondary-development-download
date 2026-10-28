# 干员皮肤 (Operator skins)

An operator's Spine model and its pictures can be replaced by one of its official alternative outfits (时装). This
document is the normative reference for that feature. The skin system is a **core feature of this project**, not a
plugin: the catalogue is tracked, the local art sets are served by the server, and every player can choose an outfit
without installing or switching on anything.

> 上游 #652 被关闭的原因仍然是这个设计的边界：**服务器不提供安装通道**。本项目没有让客户端触发服务器下载或改写
> `data/assets.json` 的报文，也不随包发布安装状态。核心皮肤只读取本机已经存在的 `skins/sets/`，并由
> `node tools/skins.mjs` 从本机抽取结果生成目录。

## The data: a core catalogue + local art sets

```
skins/
  catalogue.json                     tracked: version, set names, chars[<charId>] { illust?, skins[<skinKey>] }
  sets/<set>/overlay.json            local extraction (git-ignored, same shape as the old cosmetic plugin overlay)
  sets/<set>/media/…  spine/…        local official art (git-ignored; never redistributed)
        │
        ├── the server serves /skins/catalogue.json (no-cache) and /skins/sets/… (long media cache)
        │
        ├── public/js/coreSkins.js fetches the catalogue once and calls cosmetics.setCore(chars)
        │
        └── public/js/cosmetics.js merges the catalogue UNDER every room / personal cosmetic layer
                 │
                 └── data.get('assets') — what every screen reads (public/js/data.js setView)
                          │
                          ├── chars[<charId>].skins[<skinKey>]  →  the picker's rows (public/js/ui/skins.js availableSkins)
                          └── chars[<charId>].skins[<skinKey>].spine  →  the model (public/js/assets.js spineEntry { skin })
```

The catalogue's art paths are absolute (`/skins/sets/<set>/…`). A missing catalogue, a missing art file or an old
selection falls back to the operator's own appearance; nothing becomes a placeholder.

Three properties are load-bearing:

- **A skin key is the KEY, and it is data.** It carries `@` `#` `+` `.` (`char_002_amiya@winter#1`), so it is **not** an
  `isId` (shared/protocol.js `isSkinId`). A set with no official id for a skin may write the stem form
  (`char_102_texas_epoque_7`). Whatever writes a skin and whatever wears it must agree on that exact string.
- **The choice is keyed by OPERATOR (charId), not by chess.** `chars[<charId>].skins` is the manifest's own grouping, so
  one entry covers an operator's normal piece, its elite (the merge) and a 自选 slot fielding it. The renderer agrees:
  a unit's skin resolves through `d.spine ?? d.charId ?? u.defId` (server/sim/snapshot.js), i.e. the charId.
  Every owner/scout board, hand, temp and battle input resolves the **effective body** with `PlayerState.fieldRecord`:
  a stand-in uses `backup.charId`, a 自选 slot its pick. Skin choices follow that body too, so an original operator's
  selected outfit never dresses its stand-in.
- **A missing piece falls back; nothing is ever a placeholder.** `spineEntry(m, id, { skin })` draws the operator's own
  model when the skin (or its model) is not in the manifest; `avatarUrl` / `portraitUrl` / `illustUrl` fall back to the
  operator's own pictures. The picker shows the operator's portrait on a skin that ships none.

### Importing a local extraction

The old cosmetic-plugin layout can be moved into the core layout without copying the 300 MB of art:

```bash
node tools/skins.mjs import plugins/local-skins --id local-skins --move
node tools/skins.mjs import plugins/local-skins-2 --id local-skins-2 --move
node tools/skins.mjs import plugins/skins-update --id skins-update --move   # if the old layout has it
node tools/skins.mjs import path/to/another-set --id my-set          # copy instead of --move
node tools/skins.mjs build                                         # rebuild skins/catalogue.json
```

`build` merges every `skins/sets/*/overlay.json` in name order and rewrites relative paths. The generated catalogue is
tracked; `skins/sets/` is in `.gitignore` because the official art must not be redistributed.

`build` also copies each set's Spine metadata — clip roles (`anims`), durations, events, hits, bounds — out of the
set's `plugin.lock.json` into the catalogue. That file is what the old cosmetic plugin produced with
`node tools/plugin.mjs pack`; **without it a skin has files but no clip roles**, `validSpine`
(`public/js/assets.js`) rejects the model, and the client silently draws the operator's default artwork. Import copies
the whole set folder, so keep the lock next to `overlay.json`.

#### Summon outfits (`tokenSkinMap`)

A summon's outfit models are indexed by `skin_table.json`'s `charSkins[*].tokenSkinMap` and live **inside the summon's
own bundle**: `skinpack/token_<tokenId>.ab`, prefab
`dyn/battle/prefabs/skins/character/<tokenId>/<tokenSkinId>.prefab` — nothing extra is downloaded.

```bash
python tools/local-extract/skins.py --game <AB/Windows> --out skins/sets/local-skins-tokens \
  --id local-skins-tokens --tokens-only
```

It writes `tokens[<tokenId>].skins[<tokenSkinId>] = { spine: { front, back } }` (one folder per model under
`spine/<tokenId>/<tokenSkinId>/`). 2026-10-28 on the official client: **51 summons / 72 outfits / 8.5 MB**,
10 mappings skipped (skeleton in a bundle this install does not carry — collaboration outfits). The catalogue and the
runtime do **not** read `tokens` yet; the mechanism is analysed in
[`UPSTREAM-DEV-TRIAGE.md`](UPSTREAM-DEV-TRIAGE.md) (#876).

#### Switching a live server off the old plugin

A server that installed the outfits as cosmetic plugins keeps showing them in the plugin list as 非官方 mods. Move them
into the core layout once and the plugins are gone (and so is the mod mark), with no art copied:

```powershell
# on the server, after the build that serves /skins/ is running
node tools/skins.mjs import plugins/local-skins   --id local-skins   --move
node tools/skins.mjs import plugins/local-skins-2 --id local-skins-2 --move
node tools/skins.mjs import plugins/skins-update --id skins-update --move   # if the old layout has it
node tools/skins.mjs build
# restart once (skins/catalogue.json is read at boot on some paths; /skins/ is served either way)
```

Check it took: `GET /skins/catalogue.json` answers with the sets and every operator's outfits, and `plugins/` no longer
contains the skin folders — the room's plugin list drops back to the real plugins. A room that still lists a removed
cosmetic set simply loses that layer (the core catalogue stays underneath), so no player needs to re-pick their outfit.

### Plugins can still override

A cosmetic plugin (docs/PLUGINS.md §9) may still write `chars[…].skins` / `illust`; its layer is applied **above** the
core catalogue, so it can add or replace an outfit for a room or for one player. The default plugin list no longer
contains the skin sets (`plugins/config.json` `default` is empty for skins): a fresh installation has skins through
the core catalogue alone.

### Official presets are no longer required

The 干员调配 screen's skin section appears whenever the composed manifest offers at least one wear-able skin. Before,
that required the owner's `local-skins` cosmetic plugin and the lobby's default visual set; now it is simply the core
catalogue. A server without `skins/sets/` has no skin section, exactly like an installation without outfits.

## 设置「显示其他玩家的皮肤」 (default on)

A pure client preference (`settings.otherSkins`, `sp.pref.settings`; **never sent**):

- **on** (the default) — a piece draws the appearance its owner chose, which the match published
  (`Match.publicView().players[].skins`, and `UnitInfo.skin` of every unit);
- **off** — every other seat's piece draws the operator's own model; **this player's own pieces keep their skin**.

The asymmetry is deliberate and is what the setting is for: what you draw is your own choice, what others draw is theirs.
Turning it off hides *their* look from *you* and changes nothing on their screen (public/js/render/app.js `skinOf`). The
renderer decides who is "other" from `UnitInfo.ownerId` and the local `me.playerId`
(public/js/ui/fieldHost.js `setMe`) — never from the seat whose camera happens to be on screen.

[ASSUMED] Switching off retains the received skin ID separately (`sourceSkin`) and derives only the displayed `skin`.
Switching back on restores already loaded units immediately, including a boss partner's read-only prep pieces and
units received while hidden. `room.skins` remains valid in every phase: `Match.setSkins` marks the owner's private
view, which also refreshes existing prep scouts and the boss partner. `fieldHost` forwards public seat choices to
`view.setSkins(players)` on mount and when they change. The current battle's operators use that latest selection
(an omitted `skins` map clears it), even if later spawn metadata carries an older choice. This rebuilds appearance
only: it neither changes the running sim / BattleSpec nor restarts playback. Live refresh timing is a remake UI
choice, not a rule established by the official tables.

## The picker: two display rules

In 干员调配 (`screens/loadout.js Detail`) and in the 自选编队 picker's detail (`screens/diy.js DiyPickerView`), the 皮肤
section sits under the operator's name. 潜能与练度 immediately follows 皮肤 wherever cultivation is offered.
The preserved 0.3.1 order is 皮肤 → 潜能与练度 → 特质 → 技能 → 局内数值 → 模组 in 干员调配, and
皮肤 → 潜能与练度 → 局内数值 → 技能 → 模组 in 自选编队 (prototype picks omit cultivation).
[ASSUMED] This is the existing remake panel order; official tables do not prescribe a skin picker layout.

The room's **seat card** uses a separate picker (`public/js/ui/artPicker.js`, 更换立绘): step 1 picks the operator, step 2
lists that operator's **default full-body illustration** (`chars[charId].illust`) and every core skin's own `illust`
(name + group, `skins/catalogue.json`); the choice travels as `room.setArt` / `account.setArt` — a charId or a skin key —
and only changes the card's picture. It does **not** change the battle model: the model choice is still `room.skins`
(`SkinSection` above), so a card may show one outfit while the unit fights in another.

1. **The section is GLOBAL: every operator shows it, or none does.** The one question `SkinSection` asks is
   `public/js/ui/skins.js hasAnySkinChoices()` — **at least one** operator of the composed manifest has one **wear-able**
   skin (`chars[<charId>].skins[<skinKey>]` with a model this client resolves). While that is false — no plugin at all,
   a plugin that writes only pictures, or only skins that are art without a model — nothing is drawn anywhere, header
   included: an installation without a cosmetic layer looks exactly as it did before this feature.
   While it is true, **every** operator shows the section, including one the plugins wrote no skin for. That operator
   gets the 默认 tile alone, a real picture on it and no empty art box, and the header's note reads `0 套外观`: the count
   is kept at zero on purpose, because the whole point of the global rule is that this box **means something** — "the
   plugin is on, this operator has no 时装". A section hidden per operator said nothing, and left the player unable to
   tell an operator without skins from a plugin that failed to load. This is the **reverse** of the rule this feature
   first shipped with (a per-operator `hasSkinChoices`: 默认 plus a wear-able skin of *that* operator, else no section),
   and it must not be turned back. `hasSkinChoices` remains the single-operator criterion — no production code calls it
   — and is what `hasAnySkinChoices` is counted from, so the two can never disagree about "wear-able".
   The gate counts **wear-able appearances**, never pictures: a plugin that writes only 立绘 (`chars[<charId>].illust`) and
   no skin turns the section on nowhere, and this picker then shows none of its pictures. That is deliberate — the
   section exists to choose a 时装 and its note counts 套外观, so one replaced 立绘 must not put a `0 套外观` box on every
   operator of the installation. A plugin whose 立绘 has to be seen has to give some operator a wear-able skin (then every
   operator's 默认 tile draws the 立绘 it has, per the rule below), or needs a surface of its own.
   **Owner decision (2026-10-20): picture-only outfits stay non-wearable here — an appearance plugin must ship a Spine
   model. The upstream B6 change (`77b91081c`, 0.3.2 `pictureOnly`) is deliberately not merged; the one line that would
   change the rule is the body of `hasAnySkinChoices`.**
2. **A missing layer falls back to the operator's own art** — a skin with no `portrait` shows the operator's portrait
   (its `illust`, then the portrait), never a slash or a placeholder; the tile is dimmed (`.lo-skin--fallback`) so the
   replacement is legible. The enlarged preview (`.lo-skin-preview`, a `Modal`) shows the skin's 立绘.

The 默认 tile is the operator's **real** appearance, not an empty slot: it draws the operator's own 立绘
(`chars[<charId>].illust` — the picture an appearance plugin may write for an operator it gives no skin at all, and this
tile is the only place that picture is seen), else `chars[<charId>].portrait`, else its avatar. The 立绘 wins over the
portrait on purpose, for the same reason the section is global: what a plugin wrote for the operator has to be visible,
and the 1:2 tile crops to the top exactly as it already does for a skin that ships only an illust. It is never empty
while the record has any of the three; an operator the composed manifest does not hold at all (not even a 默认 tile
exists) gets no section rather than an empty grid.

## New files

| Path | What |
|---|---|
| `public/js/ui/skins.js` | The client store (`sp.pref.skins`, `{ [charId]: skinId }`, at most `SKIN_LIMITS.entries` pairs: `parseStoredSkins` is the one parse of a stored selection — the store's initial state, every edit and what the sync sends — so the wire's own limit is applied where the selection is read), `availableSkins` (the composed manifest's rows, with `playable` and with art already resolved and fallen back; the 默认 row exists for every operator the manifest holds, also one with no `skins`), `hasAnySkinChoices` (the section's global rule), `hasSkinChoices` (the single-operator criterion, kept for tests and future rules), `chosenSkin` (a stored entry that is not one of this operator's wear-able skins counts as 默认), `setSkin` / `clearSkin` |
| `public/css/screens/loadout-deck.css` | The Hub 干员调配 deck (docs/UI-HUB.md); the classic screen keeps `loadout.css` |
| `public/js/ui/skinPicker.js` | The 皮肤 section itself: `SkinSection` (nothing while `hasAnySkinChoices` is false — for every operator alike; the 默认 tile alone for an operator without a skin), `SkinPreview` (the enlarged 立绘), the five-tile grid's markup |
| `test/skins.test.js` | The wire shape (`isSkinId` / `isSkinSelection`), the lobby → Match → PlayerState chain, the public view, reconnect, the sim's UnitInfo, the client's fallbacks, and the absence of the install channel |
| `test/lobby-skins.test.js` | `room.skins` over WebSocket: validation, session and seat storage, the seats handed to the Match, bots, the change made mid-match |
| `test/ui/skin-picker.test.js` | The picker's rules against a composed manifest: the rows, `playable`, the art fallbacks, the global `hasAnySkinChoices` and the per-operator `hasSkinChoices`, `chosenSkin`, and that the section's gate is the global one |
| `docs/SKINS.md` | This document |
| `skins/catalogue.json` | Core catalogue (tracked): `{ version, source, sets, chars }`; art paths are absolute `/skins/sets/…` |
| `public/js/coreSkins.js` | Loads `/skins/catalogue.json` once and calls `cosmetics.setCore(chars)` |
| `tools/skins.mjs` | `import <dir> --id … [--move]` / `build`: turn a local extraction into `skins/sets/` and rebuild the catalogue |

## Edits to existing files

| File | Where | What |
|---|---|---|
| `shared/protocol.js` | before `isNotOwnedList` | `SKIN_LIMITS` (256 [ASSUMED]), `isSkinId` (**not** `isId`; the same character class as `isSkinKey`), `isCharId`, `isSkinSelection`, `operatorCharIds`, `checkSkinSelection` |
| `shared/protocol.js` | `C2S` | `'room.skins'` — and **no** `'room.skin.install'` |
| `server/net.js` | `HEAVY_TYPES`, `Session` ctor | `'room.skins'`; `session.skins` |
| `server/lobby.js` | after `freezeDiy`, `onMessage`, after `diy()`, `humanSeat`, `seatSettings`, `startMatch` | `freezeSkins` (charId + skinId, drop operators the room lacks; a bad map is BAD_MSG and does not clear), `case 'room.skins'`, `skins()` — **no phase gate**, unlike the loadout — and the selection riding into the match |
| `server/match/PlayerState.js` | ctor | `this.skins = Object.freeze({})` + `setSkins(seat.skins)` |
| `server/match/player/basics.js` | after `setLoadout` | `skinCharIdOf` / `skinFor` / `setSkins` (bots refused; a bad map refused whole, unknown operators dropped) |
| `server/match/match/platform.js` | after `setLoadout` | `setSkins(playerId, skins)` — any phase, `markPrivate()` (owner, prep scouts, boss partner) and `markPublic()` |
| `server/match/match/views.js` | `publicView().players[]`, `_prepBoardUnits`, the scouted bench | `skins` (omitted when empty), and `skin` on every unit the player owns |
| `server/match/player/round.js` | `battleInput` | the unit's `skin`, from the player's own selection and the piece's operator (a 自选 slot follows its pick) |
| `server/match/player/views.js` | `pieceView` | `skin` on the prep board / hand / temp views |
| `server/sim/units.js`, `server/sim/battle/players.js`, `server/sim/snapshot.js` | `Unit`, `_createAllyFromInput` / `_makeAlly`, `unitInfo` | carried to the client; `skin: u.skin ?? undefined`, so a piece without one adds no key to the wire |
| `public/js/assets.js` | `portraitUrl` / `illustUrl` (new) / `spineEntry` / `hasBackSpine` / `unitPictureUrl` / `skinsOf` / `skinHasModel` | every helper takes `opts.skin` (the skinId) and falls back to the operator's own art |
| `public/js/render/units.js` | `_pictureUrl`, `_modelEntry`, `_wantsBack`, `_loadPicture` | `info.skin` reaches the Spine entry, the diamond and the Front/Back question; the picture's cache key carries the skinId |
| `public/js/render/app.js` | `otherSkins` setting, `ctx.myPlayerId`, `applyInfo`, `refreshSkins`, `setSettings`, `setMe`, `setSkins`, `pieceInfo` | received `sourceSkin` is retained while displayed `skin` follows the switch and latest public selection; a changed appearance drops the view; read-only prep pieces refresh too |
| `public/js/render/app/info.js` | `renderInfo` | `skin` |
| `public/js/ui/loadoutSync.js` | header, `installSkinsSync` | the fourth `installPrefSync` setting (`room.skins { skins }`) |
| `public/js/main.js` | boot | `installSkinsSync({ net })` |
| `public/js/ui/settings.js` | `CosmeticSection` | the 显示其他玩家的皮肤 switch — with or without a cosmetic plugin |
| `public/js/ui/gameLogic/settings.js` | `DEFAULT_SETTINGS`, `sanitizeSettings` | `otherSkins: true` |
| `public/js/ui/fieldHost.js` | mount, store subscription, `OPTIONAL` | `view.setMe` and `view.setSkins` adopt and follow local identity / public seat choices; unmount removes the subscription |
| `public/css/screens/loadout.css` | end | `.lo-skins` / `.lo-skin*` tiles, `.lo-skin-preview` |
| `public/i18n/*.json` | — | the strings above, in every pack (`node tools/i18n.mjs check --all --strict`) |

## Invariants

- **No `cs`.** An appearance is never part of a room's content set: it changes nothing a battle does, so no battle
  identity moves for it (docs/PLUGINS.md §6).
- **No `server/sim/` rule.** The sim carries `skin` as opaque data (`Unit.skin` → `unitInfo().skin`); no rule reads it
  (`server/sim/units.js` stores it, `battle/players.js` copies it onto the ally, `snapshot.js` publishes it). The same
  seeded battle run with and without a skin returns the same `Battle.result()` (`test/skins.test.js`), and
  `test/golden/*.json` is unchanged. `skin` is listed with the sim fields in `docs/design/engine.md` §5.2 and
  `docs/SIM.md` §2 as display-only.
- **No `data/` write.** Nothing in this feature writes a data file; the catalogue is `skins/catalogue.json` and the
  art is served from `skins/sets/` under `/skins/sets/…`. A cosmetic plugin's own files still come from `/p/…`.
- **No game art in git.** `skins/catalogue.json` (names / groups / paths) is tracked; `skins/sets/` is ignored and
  must be extracted locally, exactly like the old plugin art.
- **A bad map is refused whole.** `isSkinSelection` / `validateC2S` (`room.skins`), the lobby (`freezeSkins` / `skins()`)
  and `PlayerState.setSkins` all require a plain object, a charId key (`isCharId`: official `char_<digits>_<token>` or
  a plugin `char_x_…`, never a chess id) and a skinId value (`isSkinId`). An array, a null-prototype object, one bad
  key or value, or more than 256 entries [ASSUMED] is BAD_MSG and does **not** clear a choice already stored. A charId
  the room's content does not have (`operatorCharIds`: chess records, `backups.units`, `diy.ownedPool`,
  `diy.operators`) is dropped and the rest kept, so the stored map is at most that operator count. An unknown skinId
  of an operator the room does have still draws the default model (`spineEntry`).
- **The client never sends more than the wire accepts.** `SKIN_LIMITS.entries` (256 [ASSUMED]) is applied in
  `public/js/ui/skins.js parseStoredSkins`, the one place a stored selection is read — the store's initial state, every
  edit and the `room.skins` payload the sync prepares. The limit has to be honoured there because an over-long map is not
  trimmed entry by entry on the server: `isSkinSelection` refuses the WHOLE message (BAD_MSG), so nothing would be stored
  and the sync would sit in `error` (public/js/ui/loadoutSync.js `installPrefSync`) instead of saving the rest.
- **A tile never outgrows the panel it sits in.** `.lo-skins` is `repeat(5, minmax(0, 1fr))` (three columns below 900 px,
  where the detail panel is a whole phone width — or a narrow window — and tall enough for the 1:2 box), so a tile is a
  share of the detail panel and its size never moves with how many skins an operator has. The tile draws the appearance's
  1:2 portrait, and on a panel too short for that box it draws the same appearance's 1:1 `avatar` instead —
  `@media (max-width: 1000px) and (max-height: 520px)` at the end of the picker's block in
  `public/css/screens/loadout.css`. That query is a phone in landscape: its detail panel is 193–263 px tall (measured
  740×360 … 932×430) while the 1:2 tile is 264–379 px there, which made 皮肤 the ONE section of that panel a phone could
  not see whole (潜能与练度 / 技能 / 局内数值 / 模组 are 135–163 px in the same panel). Both images of a tile are in the DOM
  (`public/js/ui/skinPicker.js`, `availableSkins().avatar`) and CSS alone decides, so no resize listener and no re-render;
  273/273 of the installed skins ship an `avatar` of their own (measured), and a row whose manifest has none keeps its
  portrait on every screen. A 1:2 box is still what every wider panel draws, with `min-height: max(1.5rem, 130px)` as
  the floor of a narrow one. Portrait is not a case to solve: a portrait phone is covered by 「请将设备横屏」
  (`public/index.html .rotate-hint`, shown by `public/css/theme.css`
  `@media (orientation: portrait) and (max-width: 1024px) { .sp-rotatable .rotate-hint { display: grid } }` for the
  `sp-rotatable` that `public/js/ui/device.js` sets on a coarse pointer whose screen is not landscape).

## Extracting official outfits locally (本机抽取)

The repository never carries skin art, but an installation can turn the official client it already has into a
core skin set — the same `chars[<charId>].skins` overlay documented above, served from `skins/sets/` and merged by the
core catalogue.

```powershell
# 1. the outfits (writes skins/sets/local-skins/; skins/sets/ is git-ignored)
python tools/local-extract/skins.py `
  --game "<Arknights>/Arknights_Data/StreamingAssets/AB/Windows" `
  --update "<Arknights>/Arknights_Data/PersistentData/Bundles" `
  --out skins/sets/local-skins --id local-skins

# 2. keep a full pack inside a room's 512 MB set (Spine pages -> lossless WebP, atlas + overlay rewritten)
python tools/local-extract/spine-webp.py skins/sets/local-skins --lossless

# 3. rebuild the core catalogue (skins/catalogue.json is tracked)
node tools/skins.mjs build
```

| flag | meaning |
|---|---|
| `--update <dir>` | a hot-updated bundle root laid over `--game` (repeatable; updates shadow the base). New outfits often exist **only** under `Arknights_Data/PersistentData/Bundles` until the launcher rewrites the base |
| `--only <charId,...>` / `--limit N` | a pilot |
| `--illust-max` (1024) / `--illust-quality` (80) / `--quality` (88) | picture size and WebP quality |
| `--lossless` | exact pixels for the pictures |

- **Where it reads**: `skinpack/<charId>.ab` (battle Spine prefab + illustration), `spritepack/char_portrait_*.ab`
  (half-body), `spritepack/ui_char_avatar_*.ab` (avatar), and `excel/skin_table.json` from the official-data cache
  (`build-data` downloads it; `.cache/gamedata/excel/skin_table.json`). It reads the base install
  (`StreamingAssets/AB/Windows`) and every `--update` root — the client's hot updates live in
  `Arknights_Data/PersistentData/Bundles`, and their files shadow the base ones.
- **What it takes**: alternative outfits only (`<charId>@<series>#<n>`), for operators in this installation's
  roster (`shared/protocol.js operatorCharIds`: chess, `backups.units`, the DIY pools). On 2026-10-19 that is
  **277 outfits of 175 operators**.
- **Re-running resumes**: pictures and complete Spine models already on disk are kept; a character whose skins are
  not all complete is extracted again (its files are overwritten).
- **Always available**: the core catalogue is installed for every page (`public/js/coreSkins.js`), so the picker
  appears wherever the catalogue has a wear-able skin (`hasAnySkinChoices`). A server without `skins/sets/` has no
  skin section, exactly like an installation without outfits; a cosmetic plugin can still add or override an entry.
- **Windows + a non-ASCII install path**: pass the AssetBundle root through an ASCII junction if a shell drops the
  CJK characters on the way to Python (e.g. `New-Item -ItemType Junction -Path $env:TEMP\akab -Target "<…>\AB\Windows"`).
- **No install channel**: the server still never downloads or writes art; this is an owner-side extraction into
  `skins/sets/`, served read-only at `/skins/`.

## 房间里看不到皮肤：先跑 `check`

A room's `room.skins` carries only the **choice**; the art comes from the core catalogue
(`skins/catalogue.json`) and `skins/sets/`. If the art is missing, every skin falls back to the operator's own
model — the room looks like it "ignores the global skin setting", and so does every other screen.

```bash
node tools/skins.mjs check
# [skins] catalogue: 3 set(s) [...], 175 operator(s), 277 skin(s) (257 wear-able, 20 art-only)
# [skins] art: 2358 file(s) under /skins/, 2358 present, 0 missing
```

`check` exits 1 and names the first missing files, or reports skins that have a model but **no clip roles**:

```
[skins] 20 skin(s) have a model but no clip roles: plugin.lock.json is missing or has no entry for it; the client draws the default model
```

That second failure is silent in the game — the room looks like it "ignores the global skin setting" while every file is
present. The fix is data, not code:

```bash
# on the machine that has the old plugin layout / the official client
node tools/skins.mjs import plugins/local-skins   --id local-skins   --move
node tools/skins.mjs import plugins/local-skins-2 --id local-skins-2 --move
node tools/skins.mjs import plugins/skins-update --id skins-update --move   # if the old layout has it
node tools/skins.mjs build
node tools/skins.mjs check
# restart the server once
```

Then remove the skin sets from `plugins/config.json` (`default` / the room's plugin list): a cosmetic plugin may
still override a skin, but it is no longer the source. A room that names no visual set, or a room whose plugin set
changed, must not change which core skins are available.

The **deployed** catalogue is the one browsers read: after rebuilding, copy `skins/catalogue.json` to the server too
(it is `no-cache`, so a reload revalidates — no hard refresh needed). 2026-10-27 diagnosis of "皮肤在房间里没有按全局设置
显示": every art file and every `room.skins` value was correct, but the catalogue in use had been built from
`overlay.json` alone, so no skin carried `anims`; `validSpine` rejected each model and the room drew the operators'
default artwork. Rebuilding with `plugin.lock.json` present fixed it — in the browser, `__SP_VIEW__.raw.pieceArt(uid)`
then reports `actor.entry.skel = /skins/sets/…` and `anims.idle = "Idle"`, where a broken catalogue reports the
`/assets/~…` default model.

If `check` reports 0 missing and 0 without clip roles and a room still draws the default model, collect: the chess id and skin key, the
owner (your own seat or a teammate), `settings.otherSkins`, whether the room is modded, and the browser console's
`/skins/sets/…` requests. `room.skins` is cosmetic and public: the server accepts it in every phase
(`Match.setSkins` → `markPrivate` / `markPublic`), and `render/app.js skinOf` applies `UnitInfo.skin` and
`Match.publicView().players[].skins`.

## Known limitations

- **Bots always wear the default model** (`PlayerState.setSkins` refuses a bot, as `setLoadout` does).
- **The studio does not list skins.** It finds an operator, an enemy or an interface picture by its official name
  (`server/studio/targets.js`), so a skin key is copied from the installation's manifest or written in the stem form.
- **No skin effects and no operator voices** (a separate piece of work; docs/ASSETS.md).
- **A 自选 slot's own record has `charId: null`**, so it wears its **pick's** operator's skin — the slot has no body of
  its own. The picker offers the appearance while picking that operator, and the choice is kept per operator, so
  changing the slot's operator changes the appearance with it.
