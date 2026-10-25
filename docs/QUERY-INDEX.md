# QUERY-INDEX — where to find what

A **lookup table** for an agent or a newcomer: start from the question you have, land on the owning
document or code file. The authoritative docs are still the ones linked here; this file only points.

Orientation first: [`AGENTS.md`](../AGENTS.md) / [`AI-AGENT.md`](AI-AGENT.md) (AI agent),
[`DEVELOPER.md`](DEVELOPER.md) (human) → [`docs/README.md`](README.md) (documentation system) →
[`docs/RULES.md`](RULES.md) (rules) → [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) (where are we now).

> **Pinned vs free docs.** `test/docs-consistency.test.js` pins exact wording in `DESIGN` / `design/` /
> `history/` / `SIM.md` / `META.md` / `DATA.md` / `README.md` / `DEPLOY.md` / `PLAYING.md`;
> `test/docs-paths.test.js` checks every path and link in `ARCHITECTURE.md` and `CONTRIBUTING.md`;
> `test/docs-mojibake.test.js` checks encoding for every `.md`. Reorganise freely only in the
> **free** docs (`AI-AGENT`, `DEVELOPER`, `RULES`, `PLUGIN-DEV-GUIDE`, `HANDOVER`, `PROJECT-STATE`,
> `MATCHMAKING`, `OUR-FEATURES`, `UPSTREAM-MERGES`, `AI-WORKFLOW`, this file, `AGENTS.md`).

## 1. Orientation and current state

| question | file |
|---|---|
| What is this project? How do I run it? What can players do? | [`README.md`](../README.md) |
| Which documents exist, which are authoritative, and which should I read first? | [`docs/README.md`](README.md) |
| I just inherited this — where do I even start? | [`docs/DEVELOPER.md`](DEVELOPER.md) (human) / [`docs/AI-AGENT.md`](AI-AGENT.md) (AI) |
| Where are the game rules, and which document wins? | [`docs/RULES.md`](RULES.md) → [`docs/DESIGN.md`](DESIGN.md) |
| I want to develop a plugin — where do I start? | [`docs/PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) |
| What is deployed right now, which switches, which backups, known issues? | [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) |
| Which file implements feature X? | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/DEVELOPMENT.md`](DEVELOPMENT.md), [`docs/DEV-GUIDE-ZH.md`](DEV-GUIDE-ZH.md) |
| What changed in each release? | [`CHANGELOG.md`](../CHANGELOG.md) |
| How do I contribute? | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |

## 2. "Which file implements X?" — code map

| area | entry points |
|---|---|
| server process / HTTP / WebSocket | `server/index.js`, `server/http/` (`routes.js`, `static.js`, `websocket.js`, `buildTag.js`) |
| sessions and the wire | `server/net.js`, `shared/protocol.js` |
| lobby, rooms, seats, reconnect, boot gate | `server/lobby.js`, `server/bootgate.js` |
| matchmaking (野排) | `server/matchmaker.js` |
| match / meta engine (rounds, economy, views) | `server/match/` (`Match.js`, `match/`, `player/`, `unite.js`, `board.js`, `choices.js`, `waves.js`, `finalAssault.js`) |
| battle engine (units, buffs, damage, skills) | `server/sim/` (`Battle.js`, `battle/`, `units.js`, `buffs.js`, `damage.js`, `skills.js`, `targeting.js`, `professions.js`, `content/`) |
| fork-only persistence (accounts, community, stats) | `server/db.mjs`, `server/auth.js`, `server/community.js`, `server/stats.js`, `server/admin.js` |
| account profile: default seat artwork + uploaded avatars | `accounts.art` / `accounts.avatar` (schema v6, `server/db.mjs`), `server/auth.js` (`setArt` / `setAvatar`), `server/lobby.js` (`setArt` / `accountSetArt` / `applyProfile`), `POST /api/account/avatar` + `GET /avatar/<file>` in `server/index.js`, `public/js/ui/artPicker.js`, `public/js/ui/account.js` (`ProfilePanel`), `public/js/screens/room.js` (seat art) |
| shared constants + wire contract | `shared/constants.js` (incl. `APP_VERSION`), `shared/protocol.js`, `shared/stats.js` |
| browser client (screens) | `public/js/main.js`, `public/js/store.js`, `public/js/screens/` |
| browser UI widgets | `public/js/ui/` |
| **main interface switch (classic lobby / Hub)** | [`docs/UI-HUB.md`](UI-HUB.md) · `server/uiMode.js` · `public/js/screens/hub/` · `public/css/screens/hub.css` |
| plugin system review / risks / verification gaps | [`docs/PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) |
| **plugin development guide (workflow, classes, testing, packaging)** | [`docs/PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) |
| plugin content authoring (records, bonds, bands, enemies) | [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md), [`docs/PLUGINS.md`](PLUGINS.md) §10 |
| plugin DSL (skills / talents / prep) | [`docs/PLUGIN-DSL.md`](PLUGIN-DSL.md) |
| **PRTS「源代码」玩法插件（已上线：Boss/拟态/凯尔希 band，fork 独有）** | [`docs/PRTS-SOURCE-CODE.md`](PRTS-SOURCE-CODE.md) |
| **AI 机器人训练 / 布局先验** | [`docs/DEPLOY.md`](DEPLOY.md)（Bot rehearsal / training）, `server/match/botPrior.js`, `tools/train-bot.mjs`, `server/training/` |
| plugin / Forge system, content sets, studio | `server/plugins/`, `shared/plugins/`, `schemas/`, `server/studio/`, `public/studio/`, `public/js/ui/{pluginPanel,pluginTabs,pluginSettings,pluginTag,notices}.js` |
| built-in 阵营加强 plugins (self-made shop operators, off by default) | `server/plugins/builtin.js`, `shared/plugins/category.js`, `data/builtin/faction-*.json` (generated by `tools/build-data.mjs` `splitCustomShop`), `server/plugins/registry.js` |
| main-interface plugin preview (personal, browse plugin content outside a room) | `public/js/ui/previewPlugins.js`, `GET /plugins/preview` in `server/http/static.js`, `public/js/content.js` (`ui.previewCs`), Hub/classic lobby entries |
| test console / `SP_TEST_MODE` | `public/js/ui/{testConsole,testDock,testAudit}.js`, `server/lobby.js` (`room.test`), `server/match/testCommands.js`, `shared/testMode.js` |
| operator skins | `shared/protocol.js` (`room.skins`), `server/match/{PlayerState,player/basics,player/views}.js`, `public/js/ui/{skins,skinPicker}.js`, `public/js/render/{app,units}.js`, `docs/SKINS.md` |
| extract official outfits from a local client into a plugin | `tools/local-extract/skins.py`, `tools/local-extract/spine-webp.py`, `docs/SKINS.md` (Extracting official outfits locally) |
| operator full-body seat art (default 立绘, WebP) | `tools/illust.mjs`, `tools/assets/illust.mjs` (resize + encode), `data/assets.json` `chars[].illust`, `docs/ASSETS.md` |
| 主界面音乐 (Hub music picker: official lobby themes, per-browser pick; optional 218-track local pack) | `public/js/ui/musicPicker.js`, `public/js/ui/musicLibrary.js`, `public/js/audio.js` (`lobby:<id>`, `setLobbyTrack`, `setMusicLibrary`), `settings.lobbyMusic`, `tools/lobby-music.mjs`, `tools/assets/lobby-music.mjs`, `tools/local-extract/music.py`, `var/music/index.json` + `/music/…`, `data/assets.json` `audio.lobbyMusic`, `docs/UI-HUB.md` · `docs/ASSETS.md` "Music pack" |
| 2D (PixiJS) + 3D (three.js) rendering | `public/js/render/`, `public/js/render/board3d/`, `public/js/render/fx/`, `public/js/render/vfx/` (official battle effects) |
| client networking / preload | `public/js/net.js`, `public/js/preload.js`, `public/js/assets.js` |
| 潜能 / 练度 per-operator settings (0.2.2) | `shared/potential.js`, `shared/loadoutRecord.js`, `server/match/player/{basics,diy}.js`, `public/js/ui/loadoutModel.js` |
| content-hashed asset index (0.2.6) | `server/http/assetIndex.js`, `server/assetindex.js`, `shared/assetPaths.js` |

## 3. Game rules (the design document)

- **Rules entry**: [`docs/RULES.md`](RULES.md) — authority order, topic table, core numbers, change flow.
- Index: [`docs/DESIGN.md`](DESIGN.md).
- **Current rules**: [`docs/design/`](design/) — `overview.md`, `engine.md`, `match.md`, `client.md`,
  `network.md`, `geometry-time.md`, and `vfx-format.md` (the official battle-FX format: prefabs / particle
  systems / the importer and the runtime viewer).
- **Per-release revisions and the evidence**: [`docs/history/`](history/).
- Rules cited anywhere as `DESIGN §N` are checked against these headings (`docs-paths.test.js`):
  **do not renumber or retitle a section**.
- Player-facing rules guide (中文): [`docs/PLAYING.md`](PLAYING.md).
- **Co-op rescue (`分血救援`)**: [`docs/MATCHMAKING.md`](MATCHMAKING.md) §50 · code `shared/constants.js` (`REVIVE`), `server/match/player/round.js` (`down`/`revive`), `server/match/match/{settle,intents}.js` · UI `public/js/ui/teamPanel.js`, `public/js/screens/game.js` · test `test/match/revive.test.js`.

## 4. Engines (deep reference)

| engine | doc |
|---|---|
| battle simulator (`server/sim`) — units, buffs, damage, hooks, skills, professions | [`docs/SIM.md`](SIM.md) |
| match/meta (`server/match`) — flow, effect registry, 联防, views, assumptions | [`docs/META.md`](META.md) |

## 5. Data and content authoring

| subject | doc / file |
|---|---|
| every `data/*.json` field and how it is generated | [`docs/DATA.md`](DATA.md) |
| the generator (incl. `CUSTOM_CHESS`, the 8 custom operators) | `tools/build-data.mjs` |
| add a **custom operator** end-to-end (中文) | [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) |
| author a **bond / strategy (band) / bounty enemy / 3D theme** | [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) |
| operator kits — contract and registration | `server/sim/content/kits/README.md`, `server/sim/content/kits/index.js` |
| 望's 棋子（相连激活 / 跟子 / S3 弹药与「不断下棋子」） | [`docs/MATCHMAKING.md`](MATCHMAKING.md) §30（§30.5 范围、§30.6 S3 每次 3 枚跟子）、`server/sim/content/kits/ops/chess_char_2027_wang-wang.js`、`server/sim/content/tokens.js`（`wangStone`）、`test/content/feedback-wang.test.js` |
| difficulty model (official numbers, no custom tuning) | [`docs/BALANCE.md`](BALANCE.md) |

## 6. Client / rendering

| subject | doc / file |
|---|---|
| client architecture | [`docs/design/client.md`](design/client.md) |
| 3D board (official scenes, 高台, props, shadows) | `public/js/render/board3d/`, [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8 |
| battle FX — **官方特效优先**（运行时 + 提取 + dev 查看器），**然后是**本项目的两层兜底（白名单 / 开关 / 尺寸上限） | [`docs/ASSETS.md`](ASSETS.md)「Battle effects」+「The committed manifest…」, [`docs/HANDOVER.md`](HANDOVER.md) §6, [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §2, [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0；代码 `public/js/render/vfx/**`（`wiring.js` / `skillfx.js` / `talentfx.js` / `funnelfx.js` / `flight.js` + `effect.js` / `library.js`）、`public/js/render/fx/**`、`tools/local-extract/fx.py`、`data/local-fx.json`、`public/dev/fx-viewer.html`、`test/render/vfx-*.test.js` |
| picking / dragging / facing wheel | `public/js/render/pick.js`, `public/js/render/drag.js`, `public/js/ui/facingWheel.js` |
| Spine clip bounds / impostor sizing (#542) | `public/js/render/spine.js` (`clipBounds`, `CLIP_SAMPLE_*`, `stepClipBounds`), `public/js/render/units.js` |
| statistics page (统计页改版: overview / 称号六边形 / 单局纪录 / 最常用盟约与策略) | `public/js/screens/stats.js`, `public/js/ui/stats.js`, `public/js/ui/titleHexagon.js`, `public/js/ui/playerName.js`, `public/css/screens/stats.css`; schema `shared/stats.js` (record v2) |
| 成就统计 (achievements: card + panel, seven groups, 战果纪录, 盟约 / 策略 records) | `public/js/ui/achievements.js`, `public/js/ui/achievementModel.js`, `public/css/screens/achievements.css`; entries in `public/js/screens/lobby.js` and `screens/hub/lobby.js`; records from `ui/stats.js` + `ui/statsSync.js` (`stats.list`) |
| official statistics template art (37 files + fonts) | `public/assets/ui/statistics/`, `tools/fetch-stats-assets.mjs`, `tools/assets/stats-template.mjs`, `data/assets.json` (`ui['statistics/*']`) |
| per-character voice overrides (语音语言) | `public/js/voicePrefs.js` |
| 文字大小 (text-size) and 弹药数量 (ammo count) settings | `public/js/ui/gameLogic/settings.js`, `public/css/theme.css` (`--t`), `public/js/render/app.js` (`ammoCount`) |
| device slabs on official scenes (#569) | `public/js/render/board3d/scene.js` (`M.raised`) |

## 7. Networking and protocol

| subject | doc / file |
|---|---|
| the wire contract (normative) | [`shared/protocol.js`](../shared/protocol.js), [`docs/design/network.md`](design/network.md) |
| server HTTP/WS plumbing | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), `server/http/` |
| server-side re-simulation / verification | `SP_VERIFY` (see [`docs/HANDOVER.md`](HANDOVER.md) §3) |

## 8. Accounts, matchmaking and the community surface (fork-only)

The decision record for all of this is [`docs/MATCHMAKING.md`](MATCHMAKING.md) §0–§50 (the file opens with a 目录). Code:
`server/auth.js`, `server/db.mjs` (schema v4/v5), `server/matchmaker.js`, `server/community.js`,
`server/stats.js`, `server/admin.js`; client `public/js/screens/lobby.js`, `rooms.js`, `stats.js`,
`public/js/ui/community.js`, `stats.js`, `chat.js`.

- **公开房间目录**：`public/js/screens/rooms.js` 请求 `GET /online/api?all=1`（`server/index.js` → `server/admin.js buildPublicSnapshot({ all: true })`）——目录列**全部**公开房；主界面两排小列表仍用默认上限（12 / 4）并自己 `slice` 到 3 / 4。决策在 [`MATCHMAKING.md`](MATCHMAKING.md) §36.4。

> **Trap:** the room **text chat is never persisted** — do not add a `chat` table.

## 9. Assets, audio and i18n

| subject | doc |
|---|---|
| asset sources, layout, manifest, licensing | [`docs/ASSETS.md`](ASSETS.md) |
| browser asset chain: **relay first**, then the CDN mirrors, then this server (Service Worker, or IndexedDB on the plain-HTTP site) | [`docs/ASSETS.md`](ASSETS.md) "Local asset cache & CDN mirror download chain" + "Without a Service Worker" · [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §10 · [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §9.2 |
| the art relay (`123.57.150.185`): what it serves, its nginx config, how to deploy it | [`docs/ASSETS.md`](ASSETS.md) "The relay" · `tools/relay/sp-relay.nginx.conf` · [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (c) |
| battlefield scenes (extracted official bundles, **committed** since 2026-10-14) | [`docs/ASSETS.md`](ASSETS.md) · [`docs/HANDOVER.md`](HANDOVER.md) §8 · [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) §8.3 |
| languages: UI strings, game texts, server messages, adding a language | [`docs/I18N.md`](I18N.md) |
| content-pack format | [`docs/PACKS.md`](PACKS.md) |
| local-client extraction (official art/voice/Spine) | `tools/local-extract/`, [`docs/HANDOVER.md`](HANDOVER.md) §3 |

## 9.1 Plugin development and operations

| subject | doc |
|---|---|
| no-code / studio plugin workflow | [`docs/PLUGIN-GUIDE.md`](PLUGIN-GUIDE.md) |
| developer workflow (manifest, categories, debug, pack) | [`docs/PLUGIN-DEV-GUIDE.md`](PLUGIN-DEV-GUIDE.md) |
| complete plugin specification | [`docs/PLUGINS.md`](PLUGINS.md) |
| script SDK | [`docs/PLUGIN-API.md`](PLUGIN-API.md) |
| data-plugin DSL | [`docs/PLUGIN-DSL.md`](PLUGIN-DSL.md) |
| Forge pack authoring / compatibility | [`docs/FORGE-PLUGIN-DEV-GUIDE.md`](FORGE-PLUGIN-DEV-GUIDE.md) · [`docs/FORGE-COMPATIBILITY.md`](FORGE-COMPATIBILITY.md) |
| marketplace / upload / signature | [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) · [`docs/PLUGIN-SUPPLY-CHAIN.md`](PLUGIN-SUPPLY-CHAIN.md) |
| architecture, risks, trusted isolation | [`docs/PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) · [`docs/PLUGIN-RISKS.md`](PLUGIN-RISKS.md) · [`docs/TRUSTED-DEPLOY.md`](TRUSTED-DEPLOY.md) |
| current plugin gaps / roadmap | [`docs/PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md) · [`docs/PLUGIN-PLATFORM-PLAN.md`](PLUGIN-PLATFORM-PLAN.md) |
| AI authoring rules inside `plugins/` | [`plugins/AGENTS.md`](../plugins/AGENTS.md) |
| **read the documentation chain in the admin page** | `/admin/docs` (same token/cookie as `/admin`; source: [`docs/README.md`](README.md)) |

## 10. Build, test and tooling

| subject | command / doc |
|---|---|
| rebuild `data/*.json` deterministically | `node tools/build-data.mjs --offline` |
| the whole test suite (run in the store) | `npm test` (not bare `node --test`; that also runs `test/fixtures/**`) |
| golden corpus | `node tools/golden.mjs`, `test/golden/README.md` |
| kit coverage | `node tools/kit-coverage.mjs --missing` |
| i18n completeness | `node tools/i18n.mjs check en --strict` |
| environment diagnosis | `node tools/doctor.mjs` |
| local CI mirror | `npm run ci` (`tools/ci.mjs`) |
| is the delivery chain + cache-first still right? | `node tools/check-delivery.mjs [--live]`, [`docs/ASSETS.md`](ASSETS.md) |
| the art relay (address, ssh, routes, how to deploy it) | `node tools/push-assets-relay.mjs` (`npm run push:relay`), [`docs/ASSETS.md`](ASSETS.md) "The relay" |
| change the relay / mirror addresses (no deploy, no restart) | the operations page (`/admin`) → **来源配置**, `GET/POST /admin/api/origins`, [`docs/MATCHMAKING.md`](MATCHMAKING.md) §12.3, `server/mirrors.js` |
| is the relay throttled? which origin would a client install right now? | the operations page → **测速**, `GET /admin/api/speed`, [`docs/MATCHMAKING.md`](MATCHMAKING.md) §12.2, `server/speed.js` |
| what the operations page (`/admin`) covers | accounts / rooms / online / notices / reports / 插件与内容 / 测速 / 来源配置; 插件与内容 has second-level 商城插件 / 本机插件 / 服务策略 / 诊断与内容, [`docs/MATCHMAKING.md`](MATCHMAKING.md) §12, [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) |
| plugin marketplace / admin plugin management | `server/market.js`, `server/admin.js`, `server/index.js` (`/market/api/*`, `/admin/api/market`, `/admin/api/market/import`, `/admin/api/market/keys`, `/admin/api/plugins/ai`), `public/market/**`, `public/js/market.js`, [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) |
| plugin downloads / relay / mirrors | `var/plugin-market/mirrors.json`, `tools/push-plugin-market.mjs`, `public/js/market.js`, [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) |
| plugin signatures / key registry | `var/plugin-market/keys.json`, `server/market.js` (`verifySignature`, `publicKeys`, `setSignaturePolicy`), `/admin/api/market/keys`, [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) |
| plugin compatibility (this fork vs mainline 0.3.x) | `shared/plugins/manifest.js` (`appVersionCompatible`, `PLUGIN_COMPAT_APP`, `PLUGIN_COMPAT_CLASSES`), [`docs/PLUGIN-REVIEW.md`](PLUGIN-REVIEW.md) §7 |
| plugin ordering / related bindings / import | `server/market.js` (`move`, `related`, `upload`), `/admin/api/market` `move` + `edit.related`, `/admin/api/market/import`, [`docs/PLUGIN-MARKET.md`](PLUGIN-MARKET.md) |
| where the art origins are written down (the only place) | `public/asset-mirrors.json`, [`docs/ASSETS.md`](ASSETS.md) "sources", `public/js/assetMirror.js` |
| where is the project / how do I take it over | [`docs/HANDOVER.md`](HANDOVER.md) §0, [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) §2 |
| is there new upstream work, and what will it conflict with | `node tools/check-upstream.mjs` (`npm run check:upstream`), [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0 |
| release packaging | `tools/package.mjs`, `docs/WINDOWS.md` |

- **A match that does not end** (no enemies, a phase that hangs): `/admin/api/state` lists each room's `phase / round / deadline / fields[{ mode, done, authority }]`; a silent client field is taken over after `FIELD_SILENCE_MS` (12 s) — [`docs/META.md`](META.md) §1.3b, `server/match/match/clientCombat.js`.

## 11. Ops: publish, deploy, backups

| subject | doc |
|---|---|
| the operating contract (research → change → merge → push → deploy) | [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) |
| publish helper (store → github → gitee → dev tree) | `tools/push-gitee.mjs` |
| **publish order (owner, 2026-10-14): the ART RELAY first, then the two mirrors** | `node tools/push-assets-relay.mjs` then `node tools/push-gitee.mjs`, [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (c) |
| deploy guide (firewall, autostart, reverse proxy, Docker) | [`docs/DEPLOY.md`](DEPLOY.md) |
| **our** production runbook (notice-first) | [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (d) |
| external server directory we are listed on | [`docs/RELAY.md`](RELAY.md) |

## 12. History: decisions, merges, releases

| subject | doc |
|---|---|
| **our** decisions §0–§50 (目录 at the top of the file) | [`docs/MATCHMAKING.md`](MATCHMAKING.md) |
| mainline-merge log + never-merge list (§0) | [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) |
| **plugin stack / Worker hosting — how it landed, fork adaptations, tests** (merged 2026-10-19, `2e37b1407`) | [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §13.10 (tail) · [`docs/PROJECT-STATE.md`](PROJECT-STATE.md) §10.1 · [`docs/PLUGINS.md`](PLUGINS.md) |
| fork-only mechanisms that must survive a merge | [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) |
| release notes | [`CHANGELOG.md`](../CHANGELOG.md) |

## 13. Research (official data, machine-readable)

Start at [`docs/research/00-INDEX.md`](research/00-INDEX.md). The `.md` files are the readable
notes; the matching `.json` files are the machine-readable companions (not read by `build-data`).

## 14. Search recipes

```powershell
# run from the store root D:\DOTK\_merge-scratch
git grep -n "MATCHMAKING.md §" -- docs public server shared   # where a decision is cited
git grep -n "DESIGN §" -- server public shared                 # rules cited in code
git grep -n "OUR-FEATURES"                                     # fork-only mechanism pointers
git log -S "<symbol>" --all                                    # when a symbol changed
node tools/kit-coverage.mjs --missing                          # is any kit missing?
```
