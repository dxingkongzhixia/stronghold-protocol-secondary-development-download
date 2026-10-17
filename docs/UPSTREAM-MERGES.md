# Upstream merge log (`UPSTREAM-MERGES`)

Who this is for: **the next person who merges the mainline (主线项目)** and **anyone auditing what we took from
`sganggs/Stronghold-Protocol`**. This is the chronological record of every upstream batch folded into our fork:
what came in, what we deliberately left out, how conflicts were resolved, how the golden corpus moved, and the
local commits it produced.

> **Navigation.** The **never-merge list** is §0; the per-batch records follow chronologically (§1 …). The merge procedure itself is in [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b). See also [`docs/QUERY-INDEX.md`](QUERY-INDEX.md).

Read this together with:

| Read this | For |
|---|---|
| [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) | the merge **procedure**, the golden-attribution rule, the GitHub/Gitee push, the deploy order |
| [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) | what is **ours and must survive** a merge (and the §7 lobby-community surface) |
| [`docs/MATCHMAKING.md`](MATCHMAKING.md) §22 / §33–§38 | the **decision record** (the blacklist §22, the feedback5 merge §33, the fix log §35, the community surface §36/§38) |

Conventions used below:

- **Upstream commits** are authored `sganggs <sganggs@users.noreply.github.com>`; **our commits** are authored
  `merge <merge@local>` (the store `_merge-scratch`, branch `ours`). The upstream object database is present in
  the store even when a commit is unreachable from a ref, so an upstream hash can be inspected with
  `git show <hash>`.
- The git store `_merge-scratch` is the single source of truth; the working project `Stronghold-Protocol` has no
  `.git` and is a byte-for-byte mirror. See [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §6.
- **Never** `git checkout --theirs/--ours` on a source file. Resolve hunk-by-hunk, keeping both sides. When a
  block genuinely conflicts on the same line, **take our behaviour** and fold in the upstream improvement.

---

## 目录

> 导航用；每节正文才是准的（按标题里的编号 grep 更快）。

- 0. 永不合并 — the never-merge list
- 账号与统计：与主线的设计差异（本分支独有，非上游合并）
- 标题画面：公告 / 关于本服务器 / 添加到桌面（本分支独有，灵感来自另一部署）
- 1. feedback5 — the full upstream merge (2026-10-07)
- 2. feedback6 — selective (2026-10-07)
- 3. 0.3.0 — our own feature release (2026-10-08/09, not upstream)
- 4. feedback7 — the R22 batch (2026-10-09/10)
- 5. Group A — the post-0.3.0 upstream combat fixes (2026-10-09/10)
- 6. Group C — the R23 stream (2026-10-10)
- 7. Pending: the displacement-slide + 失衡 port (`port-r22-slide`)
- 8. 0.2.3 PWA install icons + manifest (mint rook) — the 添加到桌面 button's missing half (2026-10-11)
- 9. 0.2.5 official battlefield scenes on the 3D board (2026-10-12)
- 10. 0.2.5 — the 驭械术师 funnel/drone hit fixes (upstream `e0f37718` / `a451ddcf`, ported) (2026-10-12)
- 11. v0.2.6 — the **whole-branch** merge (2026-10-14)
- 12. How to add the next batch to this log
- 12.1 v0.3.0 分批并入计划（2026-10-16 起，进行中）
- 官方特效：待修清单（2026-10-16 夜，owner 报障 → 交下一会话）
- 13. v0.3.0 / v0.3.1 续并准备（2026-10-17）

## 0. 永不合并 — the never-merge list

These upstream commits/features are **excluded by the owner** and must not be merged (or, if re-applied, must be
reverted):

| Item | Upstream evidence | Why never |
|---|---|---|
| **#149 盟约收起 (foldable bond bar)** | upstream `game.js` `bondsCollapsed` / `bonds-toggle` / `gm__bond-list` / `match-bond-strip` | The bond strip stays **permanently shown and centred**. Blacklisted in `docs/MATCHMAKING.md` §22. Self-check must stay empty: `grep -rn "bondsCollapsed\|bonds-toggle\|gm__bond-list\|match-bond-strip" public/js server`. |
| **本局禁用盟约被强制失效 (a 本局禁用 bond forced inert even when its members activate it)** | upstream `server/match/bondsMeta.js` `computeBonds`' `if (gd.modeInactiveBonds.has(id)) continue;` (`01a44cd2`, the initial import — still at `upstreamm/master` `1db8e510`); the 本局禁用 UI `b4fa21a0` + `695ece26` (feedback1b WG) and `offBondCounts` / grey discs `c0cc1d61` (feedback3 WH). Carried unchanged by feedback5 `e3bd9de7`, Group A `6bdd0800`, R22 `177bad63`, R23 `8d20f50f`. | **The owner's rule (2026-10-11): the ban only stops a bond being OFFERED** (pool / strategy draft / bots). It must NOT make an otherwise-active bond inert — 「被 ban 的盟约即使被激活也无法生效」 is the bug. `computeBonds` counts every bond, so a 本局禁用 bond whose members reach its threshold is `active` and **takes effect**; one below its threshold stays inert (its layers still ride into the battle, §27). The dialog still reads 本局禁用 while it is inactive. Not the §22 bond-collapse family (that is the foldable bar). Self-check: `computeBonds` in `server/match/bondsMeta.js` has no `modeInactiveBonds.has(id)) continue`, and `PlayerState.battleBonds` forces no `active: false`. |
| **最近的同盟 (recent-alliance chips)** | our own removed feature | We removed it (commit `6d27d583`, 2026-10-07) and it must not come back. Self-check: `grep -rn "recentRooms\|rememberRoom\|最近的同盟" public shared server test` empty. |
| **Upstream 克莱门莎 (Clementia)** | `2e122873` *0.2.3: add Clementia and Shu/Ulpianus modules (#437)*, `0b0ce4fb` *Update expanded roster checks and register Clementia impact visuals*, `ba5b998a` *0.2.3: Clementia S2 releases a dead, hidden, uncarriable or pathless rider at once* | **We keep OUR `char_4231_clemnt`** (the self-made 6★ 本源近卫, `docs/MATCHMAKING.md` §37, `CUSTOM_CHESS`). Upstream's Clementia is a different, official-data operator; taking it would collide with ours. |
| **R21P 满潜 / R22-LOADOUT (per-operator 潜能 / 练度)** — **SUPERSEDED 2026-10-14; default changed 2026-10-15** | `806a0477` / merge `b05845f5` (R21P: 潜能 6); `7e09c63d`, `ec0a2fc6`, `96d9441f`, `7a0937e3`, `519f04e2`, `dc336f24`, `8e2b981e`, `4f8f5d2a`, `9f36db32`, `4d63e9d5`, `66297106` (R22-LOADOUT); **re-introduced by the whole-branch v0.2.6 merge** (§11) | **Owner's decision 2026-10-14: the fork now KEEPS the 潜能 / 练度 subsystem.** The v0.2.6 whole-branch merge re-introduced it and reverting it back out would have cost more than adapting, so the fork adapted instead. **The runtime default is 潜能 1 / 未精英化 since 2026-10-15** (owner: 「所有干员的默认潜能 1 / 未精英化」 — the official baseline for an operator the player does not own; 满潜 (潜能 6) / 精英2 Lv.60 was the default 2026-10-08 → 2026-10-15; the data itself is still BUILT at full potential). **This row no longer means "never merge"** — it now means **do not revert the feature back out**, and the earlier R21P / R22 exclusion (owner, 2026-10-08) is withdrawn. Self-check: `shared/potential.js`, `public/js/ui/loadoutModel.js` and `public/js/screens/cultivation.js` exist and the loadout / potential tests pass (`test/full-potential.test.js`, `test/match/loadout.test.js`, `test/match/potential.test.js`, `test/ui/potential-ui.test.js`, `test/ui/loadout.test.js`). |
| **设置 → 问题反馈 / DIAGNOSTICS (copy local diagnostics)** | upstream `3f884412` (our R22 port `2ef6339b`, §4) — the settings section that copies local diagnostics for a GitHub issue | **We dropped it** in `60e9eab8` (the §6 *Deliberate divergence* note): our own bug-report entry (the 设置 dialog's 「bug提交」 since 2026-10-11, before that the lobby's) already reports bugs, so the duplicate section must not be re-introduced. Self-check: `grep -rn "ISSUES_URL\|set-diag\|复制诊断信息" public/js/ui/settings.js` must be empty. |
| **上游的 设置 按钮位置 (top-bar placement)** | upstream `911e4bff` (`a9a1592a`) — the 设置 button of the lobby / room top bar, placed left of 玩法说明 (#238) | **We move 设置 next to the 档案 account chip** instead (the top bar's right-hand group; in the room, beside the invite key). Upstream's middle placement must not be restored by a later merge. |
| **上游道具牌库把「白给装备」也卡库存 (`6bfc08270c`)** | upstream `6bfc08270c` *0.2.4-dev: round-29 community fixes and the official shared card pool* — `server/match/player/acquire.js` `acquireItem` adds `if (!this.m.itemPool.canGain(itemId)) { … '装备库存不足，未获得该装备'; return null; }` with **no `requirePool` escape**, and `server/match/effectsMeta.js` `grantItem` forwards only `source` / `toTemp` / `deferMerge`, so the `requirePool: false` the callers already pass (`server/sim/content/bands/meta.js` 变形者集群 R5/10/15; `server/sim/content/garrisons/meta.js` `H.SERVER_GAIN_EQUIP` — 缪尔赛思's `<获得时>` `garrison_76_a/b`) is dropped; GitHub issue **#488** (saltwmc, 2026-10-11): the trait and the strategy stop paying 变形同构体 once the 3-copy item stock is out (投资人 ×2 exhausts it sooner). | **A `<获得时>` / strategy grant is not a shop purchase — the official text has no stock premise.** Our `acquireItem` has **no `itemPool` check**, so 缪尔赛思's trait and 变形者集群 pay 变形同构体 every time (the trait's total can pass the upstream cap 3). If the shared card pool is ever merged, `requirePool` must be forwarded through `grantItem` → `acquireItem` and the trait / strategy grants must pass `requirePool: false`. Self-check: `grep -rn "itemPool\|canGain" server` empty (or those grants pass `requirePool: false`); `test/content/garrisons_meta.test.js` #488. Mirrored in [`docs/MATCHMAKING.md`](MATCHMAKING.md) §39.2. |

| **上游把「满潜 6 / 精英2 Lv60」当默认值** | `shared/potential.js` 的 `POTENTIAL_DEFAULT` / `CULTIVATE_DEFAULT`（主线 R21P / R22-LOADOUT 的一部分；v0.2.6 整支合并 `aec85c5d` 曾带入） | **Owner 2026-10-15**: the fork's DEFAULT is **潜能 1 / 未精英化** — the official baseline for an operator the player does not own ([`docs/MATCHMAKING.md`](MATCHMAKING.md) §45). Keeping 满潜 / 满练度 made every owned operator **15–17 % stronger** in ATK (+10 % DEF / HP, −2 cost, −4 s redeploy) than that baseline — 「敌人变脆」. A merge must not restore a full-potential default; the per-operator 干员调配 setting still raises both. Self-check: `grep -n 'POTENTIAL_DEFAULT = ' shared/potential.js` ⇒ `POTENTIAL_MIN`; `grep -n 'CULTIVATE_DEFAULT = ' shared/potential.js` ⇒ `0`; `shared/loadoutRecord.js` must not return the raw record for a DEFAULT loadout (only 潜能 6 skips the composition) |

| **上游对 3D 战场的实现（board3d：光照 rig / 材质层 / 高台）** | upstream `public/js/render/board3d/{scene,materials,load}.js`（v0.3.0：一个全战场共用的 `LIGHTING` 常量、trap 高台的官方模型、材质层重写） | **实现方式不同，本分支保留自己的**：按战场分级的 `theme.js`（exposure / ambient / sun / tint / 可选 `gain`）+ apron（环绕沙地）+ 地面/道具拆分 `splitSceneProps`；高台（platforms）我们**故意关闭**（不做平面假模型）。因此 `public/js/render/board3d/` **整块归本分支所有**：上游在其中的新提交**不整块合并**，需要时**手工移植**（如 `#569` 那次的设备板修复） |

| **上游的敌人 / 领袖数值层（`gamedata.enemyScale` / `waves.js` / `bossRounds.js`）** | upstream `server/match/gamedata.js` `enemyScale(r)` = 纯 PRTS 表、`bossHpMul()` = 1；`server/match/waves.js` 的 boss / part spawn 与 `server/match/match/bossRounds.js` 的 boss field flags 都直接用同一个 scale |

| **上游的多语言配音（英语 / 韩语 / 本土语言，`8eb7f701` + `d93d6d30`）** | upstream `public/js/audio.js` 的语音语言表、`public/js/ui/settings.js` 与 `public/js/audio.js` 的选项、以及 `data/assets.json` 的 `audio.voiceEn`（182 名）/ `audio.voiceKr`（182）/ `audio.voiceNative` 三套清单 | **Owner 2026-10-16：「配音只保留日语和中文，其他的不要了」** —— 本分支只提供 **中文 / 日本語** 两套（日语默认，见 [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) 「The Japanese voice dub」）。上游那三套配音**不合并**（素材也不上中继）。Self-check: `grep -c "voiceEn\|voiceKr\|voiceNative" public/js/audio.js data/assets.json` 两处都应为 0；`data/assets.json` 的 `audio` 只有 `voice` / `voiceJp` | **Owner 2026-10-16**：本分支在官方表**之上**刻意加了一层难度（敌人第 5 回合起 生命 / 攻击 ×1.3；领袖 血池 ×1.4 + 攻击 / 防御 / 法抗 ×1.4，部件与战中召唤物同档；8 个正式模式，入门协议不动），见 [`docs/MATCHMAKING.md`](MATCHMAKING.md) §47 / [`docs/BALANCE.md`](BALANCE.md) §8。上游这几个文件在合并时**会抹掉这一层**，一律以我们为准（`data/tuning.json` 的 `boost` 块是唯一真相，改数值只改它）。Self-check: `grep -n 'enemyBoost\|bossBoost\|bossEnemyScale' server/match/gamedata.js`（三处都在）；`node tools/balance.mjs --mode multi --difficulty HARD --boss-only` 的池子应含 ×1.4；`node --test test/match/boost.test.js` |

> **给上游的 PR 分支是中间产物，不进本分支。** 把本分支的优势提给主线时，是在一个**基于主线**的临时分支上重做的（如 `board3d-lighting`，即 PR `sganggs/Stronghold-Protocol#658`）：它**只用于向上游提交**，**不要合并进我们自己的 `master`** —— 它按上游的实现方式裁剪过，与我们这边的实现不同（见上表 board3d 行）。

The self-checks for the §22 blacklist are in [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §5 and run after every merge.

**Machine-readable projection.** `node tools/check-upstream.mjs` fetches the mainline and says whether any new upstream
commit lands on this surface: it flags every path we **deleted** relative to the mainline, plus `NEVER_MERGE_WATCH` in
[`tools/check-upstream.mjs`](../tools/check-upstream.mjs) — the rows above that live *inside* a file we still keep
(#149 收起 in `public/js/screens/game.js`, the 本局禁用 rule in `server/match/bondsMeta.js`, 克莱门莎's kit, the
R21P/R22-LOADOUT files, the DIAGNOSTICS settings section, the item-stock gate). **This table stays the authority**: when
a row is added here, add its upstream path there too.

---

## 账号与统计：与主线的设计差异（本分支独有，非上游合并）

This note sits beside §0 because it is the fork's other standing divergence from upstream: it is not a single merge
record but the **two features the fork adds outside the mainline** — a server-side account system and server-side match
statistics — with the rationale and a recommendation for upstream. Read it with [`docs/OUR-FEATURES.md`](OUR-FEATURES.md)
§8 (the fork-only surface to keep), [`docs/MATCHMAKING.md`](MATCHMAKING.md) §2 (accounts) / §40 (statistics) and
[`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §13 (the schema).

> **提交摘要（可粘贴到上游 PR / issue）** 本分支在主线之外引入了**服务端账号体系**（`server/auth.js` +
> `server/db.mjs`，SQLite `var/accounts.db`：登录 / 注册、角色与权限、会话令牌、账号与游客区分），并把**对局统计从
> 浏览器本地迁移到服务端** —— 客户端把一条**已规范化**的记录（沿用主线的 `normalizeRecord` schema、**不改字段**）经
> `stats.submit` 提交，服务端写入新增的 `match_stats` 表（`user_version 5`），**归属键**为登录账号的 account id（游客
> 用其会话 / 游客身份），因此**同一身份跨设备可见**；上限**沿用主线规则、数值取主线的 2 倍**（2000 / 60 / 1.6M ←
> 1000 / 30 / 800k），`localStorage` 退化为服务端不可用时的离线兜底。主线「纯本机、零上传、零服务端负担、隐私面最小」
> 的设计更轻，本分支用**服务端持久化换长期留存、跨设备、玩家互看与后续数据分析**，因此把隐私收敛为「只暴露游戏内
> 已公开字段」（不含账号 id / 邮箱 / 令牌 / 游客密钥），并保留离线兜底与账号级删除。**建议**：若主线愿意采纳，做成
> **可选后端** —— 无账号或服务端不可用时自动回落到主线现有的 localStorage 方案，两侧共用同一记录 schema，零成本兼容。

**这是本分支的偏离，不是上游。** The account system and server-backed statistics are **our fork's additions**;
mainline ships neither (its statistics page is the local, browser-only PR #323). They must survive a merge —
[`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §8 lists every file.

**账号（服务端）。** 本分支在主线之外引入了一套**服务端账号体系**：`server/auth.js`（`AuthService`）+
`server/db.mjs`（`node:sqlite`，`var/accounts.db`），提供**登录 / 注册、角色与权限、会话令牌、账号与游客的区分**；
野排等需要身份的功能**以账号为前提**（主线是纯本机、无账号的）。

**对局统计（服务端）。** 并把**对局统计从浏览器本地迁移到服务端**：

- 每次本地玩家参与的对局结束后，客户端把一条**已规范化**的记录经 `stats.submit` 提交；该记录**沿用主线的
  `normalizeRecord` schema，不改字段**（`shared/stats.js`）。
- 服务端写入新增的 `match_stats` 表（`server/db.mjs`，`user_version 5`，索引 `(owner, ended_at DESC)`）。
- **归属键（owner）**为登录账号的 account id、游客则用其**会话 / 游客身份**，因此**同一身份跨设备可见**（登录后本地
  积压补传、归入账号）。
- 支持 `stats.list`（自己的记录）、`stats.clear`、`stats.view`（在「在线玩家」中查看他人**仅游戏内已公开字段**的记录）。
- `localStorage` 退化为**服务端不可用时的离线兜底**；重复提交按记录自身的 id / seed+start 去重。
- 数量上限**沿用主线规则、但数值取主线的 2 倍**（2000 / 60 / 1.6M ← 1000 / 30 / 800k），服务端按**同一套裁剪**执行，
  不只依赖客户端。

详见 [`docs/MATCHMAKING.md`](MATCHMAKING.md) §40（schema、owner、上限、隐私）与 [`docs/DEVELOPMENT.md`](DEVELOPMENT.md)
§13（`server/db.mjs` schema v5）。

**设计取舍。** 主线「纯本机、零上传、零服务端负担、隐私面最小」的设计更轻；本分支用**服务端持久化换长期留存、
跨设备、玩家互看与后续数据分析**，因此把隐私收敛为「**只暴露游戏内已公开字段**」（不含账号 id / 邮箱 / 令牌 /
游客密钥），并保留离线兜底与账号级删除。

**给上游的建议。** 若主线愿意采纳，做成**可选后端** —— 无账号或服务端不可用时自动回落到主线现有的 localStorage
方案，两侧**共用同一记录 schema**，零成本兼容。

---

## 标题画面：公告 / 关于本服务器 / 添加到桌面（本分支独有，灵感来自另一部署）

**这是本分支的偏离，不是上游。** 标题画面的三处小入口是本分支自己加的，灵感来自另一个部署（`wei.linxia.dev`
的 0.2.4 构建）的截图；数据与文案都接**我们自己的实现**，没有抄它的**资源预载（PRELOAD）**面板：

- **公告 banner + 公告 入口** —— 接**我们自己的通知存储**：`server/community.js` 持久化「更新日志」里
  `source: 'notice'` 的条目（管理端 `POST /admin/api/notify` → `lobby.broadcastNotice` → `recordNotice` 追加
  `0.2.N`）。标题页顶部横幅显示**最新一条**公告；`知道了` 关闭后把该条目的 id 写进 `loadPref`/`savePref`
  （键 `noticeSeen`），同一条不再打扰、有新公告再出现；`GET /community/api/changelog` 取不到（离线 / 还没有公告）
  时横幅隐藏。登录框下方的「公告」入口打开**同一份**「更新日志」浮层（`ui/community.js` `ChangelogOverlay`，标题
  改为「公告」）——**不是第二个 store**；与 `ui/notice.js` 的实时 `sys.notice` 条、房间文字聊天无关。文件：
  `public/js/ui/announce.js`；`public/js/screens/title.js`（挂载）；`public/js/ui/community.js`（`title` 参数）。
- **关于本服务器** —— 只写我们自己的项目事实（`README.md` §一「二次开发版的下载 / 镜像库」、Gitee 仓库、
  `shared/constants.js` 的版本 / 模式、`/healthz` 的构建号与在线人数、页脚同款的素材版权声明），并明确本部署
  **仅支持网页版（桌面浏览器）、手机端可能存在兼容问题**（标题画面入口下方也有一句同样的提示）。文件：
  `public/js/ui/about.js`。
- **添加到桌面** —— 接浏览器自己的安装提示（`beforeinstallprompt` → `prompt()`）；已安装 / 独立窗口 / 没有提示时
  隐藏（优雅空操作），iOS 等无提示的浏览器给一句手动「添加到主屏幕」的说明。**安装资格已补齐**：上游 0.2.3 的
  安装图标与 `public/manifest.json`（`upstreamm/master` 的 `90421254`、`9ec84f36`）已合入本源（见 §8），因此
  Chromium / Edge 112+ 会真正触发安装提示、按钮才可能显示。安装本身**不需要 service worker**（Chrome 108 /
  Edge 112 起不再要求），所以上游的 `public/js/pwa.js` 未合并——我们已有 `public/js/ui/install.js`；本分支后来
  （0.4.0）为**可选的美术资源缓存**才注册 `public/sw.js`（见 [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §10），
  与安装无关。文件：`public/js/ui/install.js`。

**不要把**这三处 UI 与上游的**资源预载（PRELOAD）**混为一谈：后者（`res-pill` / 「预载资源管理」/ ZIP 导入导出，
依赖 Service Worker + Cache Storage）**不属于本分支**；我们自己的 `public/js/preload.js` 只是**启动时的图片预热**，
与它无关。（上游 0.2.3 的 manifest / `public/icons/` 现在已合并，见 §8。）

---

## 1. feedback5 — the full upstream merge (2026-10-07)

**What it was.** The big upstream drop: `origin/master` at **`1303321` (v0.2.0)**, **383 commits / 848 files** —
v0.2.0 itself (补位 / 自选编队 / i18n / custom hotkeys / lite package), the four new languages (English, 日本語,
한국어, 繁體中文), the R19A–R19G community-fix stream and the CB1–CB5 community-report stream, plus the Boss and
asset work.

**Result.** Merge commit **`e3bd9de7`** (`merge upstream feedback5 (383 commits) …`), parents = our pre-merge
`1557a5a` + upstream `1303321`. Resolved block-by-block; no whole-file side was taken.

**Kept (our side):**

- **All six custom operators** at the time (阿斯卡纶 / 结城理 / 予愿安洁莉娜 / 澄闪 / 娜仁图亚 / 望) — data, kit,
  art, voice, tests, count assertions.
- **Option A — the shop chess win on a name clash**: upstream ships the same five names as *自选* (`ops/op-*.js`);
  upstream's five duplicate files were dropped, keeping our shop chess.
- **Our bond strip** (banned members hidden / counted, not upstream's "show + disable badge").
- **The §22 blacklist** (see §0) — #149 excluded, 最近的同盟 removed for good.

**Structural moves (upstream refactors we carried our changes into):**

- `kits/tier{1..6}.js` → one file per operator `kits/ops/chess_char_<…>-<codename>.js` + `kits/index.js`
  (`KIT_FILES` / `STANDIN_KIT_FILES` / `OPERATOR_KIT_FILES`); shared helpers in `kits/shared/tierN.js`.
- `docs/DESIGN.md` became an **index**; current rules in `docs/design/*.md`, revisions in `docs/history/*.md`.
- Broad split of `server/sim/Battle.js`, `server/match/Match.js` / `PlayerState.js`, `server/index.js` into thin
  façades + method modules.

**Conflicts and how they were resolved.** Kits (ours landed in the new per-operator files and `KIT_FILES`); the
bond strip; the i18n sweep (our new/kept Chinese strings wrapped in `t()`, module-level tables kept `N_()`);
the local-client token Spines (our extractor added 39 tokens / 117 files).

**Golden.** Regenerated on the merged tree; the merge commit's record (see §33) and the subsequent CB/R19 streams
enumerate every moved scenario.

**Verification.** `_merge-scratch` full `node --test`: **5110 / 5102 pass / 0 fail / 8 skip**;
`node tools/kit-coverage.mjs` **301/301 skills, 118/118 chess**; `node tools/build-data.mjs --offline` clean. The
working project passes the same except the two `git ls-files` suites (`docs-paths`, `package`) that need a `.git`.

**Local commits.** `e3bd9de7` (the merge) and the post-merge fixes `d2def363` → `7ef2607d` (docs §33, remove
最近的同盟, 望 棋子 auto-placement, funnel drones, 结城理 formats, 澄闪 浮游单元, kalts2, the unite arena, the
two-tier battle-fx system, the asset sources, the local-art pipeline, `push-gitee.mjs`, `ARMOR`/review fixes).

Full write-up: [`docs/MATCHMAKING.md`](MATCHMAKING.md) §33.

---

## 2. feedback6 — selective (2026-10-07)

**What it was.** Upstream's feedback6 line, released as **v0.2.1 (`c2a2ef77`)**. The upstream R21 stream is a set
of community rules (R21A…R21P + `fb6-diy-esc` + `fb6-small-fixes`). We took a **selective** subset.

**Taken (upstream hash = the commit as it sits in our history):**

| Upstream commit | Rule | Our golden move | Local commit |
|---|---|---|---|
| `322cd877` R21A | a 突袭 member may land on a teammate's half when both halves of a field are taken (two-helper 联防 and the Final Assault / Hidden Core pair); a lone helper's empty half, a solo boss field's other half and the hand/temp rows stay closed | 8 scenarios (boss pair fields + `coop4-ABYSS-7`) | `322cd877` |
| `11b05091` R21E | 外勤医疗 Touch casts 恳切福音 on an injured ally inside its 5‑2, and the Touch card is an operator card | `roster-041`, `coop2-NORMAL-14-standins` | `11b05091` |
| `dd3cb3c4` R21E | an operator's 凋亡 burst drains the official 技力 (stored charges included) | 5 (fields + `diy-058/059`) | `dd3cb3c4` |
| `6a081266` R21E | a refresh runs the 刷新时 特质 of the chess that stood on the board / in the hand when it happened | unchanged | `6a081266` |
| `8ae8c4e4` R21H | the round's enemy effects reach the 频次 器物 and the leaders' mid-fight summons | 74 | `8ae8c4e4` |
| `c44f2ad6` R21D | a consume-on-equip item on a full carrier opens the replace dialog and replaces the picked item first | 10 matches | `c44f2ad6` |

**Skipped (not taken at that time):**

- **R21B** (联防 on the round's battlefield) — **ours already did this** (`14b58ec1` / `1fa045bf` / `9ddce457`,
  `docs/MATCHMAKING.md` §35.4 reverts upstream #41's escaped map).
- **R21C** (自选 picks in bond member lists), **R21F** (enemy flyer hover), **R21G** (held control messages),
  **`fb6-diy-esc`** (Esc in the 自选 picker), **`fb6-small-fixes`** — not part of the selective set (where the
  behaviour was wanted it is present in `ours` by another route or arrived later).
- **R21P 满潜** — not merged **in this batch**; **superseded by the v0.2.6 whole-branch merge (§11): the fork keeps it (§0)**.

**Conflicts.** The R21E Touch card reads our `tokens.json` record; every golden was regenerated on the merged
tree and the R21 streams' moves were kept. Local: `8fa90abb` (feedback6 selective: regenerate the golden corpus
for R21A / R21E×3 / R21H / R21D).

**Our own version bump** at this stage: the fork went from the merged `0.2.0` toward its own `0.3.0` (the next
section). Upstream's own release tags `v0.2.1`/`v0.2.2`/`v0.2.3` exist in the store as upstream objects; our fork
does not bump to them.

---

## 3. 0.3.0 — our own feature release (2026-10-08/09, not upstream)

0.3.0 is **ours**, not an upstream merge — but it sits between the merge batches and is the state the next batches
were applied on top of. It brought the lobby community (更新日志 / bug提交 / 公开房间), the 8th custom operator
**克莱门莎** (`char_4231_clemnt`), room text chat (等待室 + 局内 临时气泡), the 凯尔希·思衡托 S2 特效 fix, the
official battle-fx art (two-tier system for the whole roster + our operators), and it bumped `APP_VERSION` to
`0.3.0`. This work is 0.3.0/**deployed** and is documented in [`CHANGELOG.md`](../CHANGELOG.md) 0.3.0 and
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §36–§38 + [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §1–§7.

---

## 4. feedback7 — the R22 batch (2026-10-09/10)

**What it was.** The large feedback7 stream, upstream HEAD **`62eb1134` (feedback7 v0.2.2)**, later **`1db8e510`
(0.2.3, also `upstreamm/master`)**. The full ordered upstream commit list is preserved at
`D:\DOTK\_merge-attrib\all-fb7.txt` (138 commits); the per-commit triage is in
`D:\DOTK\_merge-attrib\apply-log.txt` and the area index in `order.txt` / `take-order.txt`. Areas:
`G-TOOLS`, `G-UI`, `G-SMALL`, `stats`, `UIBACK`, `R22-GHSIM`, `R22-OSIM`, `R22-RENDER`, `R22-HUD`,
`R22-FIELDS`, `R22-LATE`, `R22-VOICES`, `dober`, `R22-E2EFIX`, `R22-UNBAL`, `R22-LOADOUT`.

**Method (the selective cherry-pick).** Each upstream commit was **cherry-picked onto `ours` with its author and
subject preserved**, then adapted to the fork where our tree differs. The triage marks are:

- `OK` — cherry-picked as-is (source applied; goldens later).
- `OKg` — cherry-picked and marked **"golden ours"**: the commit moves golden scenarios, so the golden corpus was
  regenerated in **our** combine commit (attribution first, see below).
- `SKIP` — not applied; the reason is one of: **ours already has it** (a fork implementation with the same
  behaviour — we do not take upstream's file), **the hunk lives in a file our fork rewrote** (`render/units.js`,
  `skills.js`, a kit, a test), **doc-only leftover** (the code is already ours), or **excluded by the owner**
  (LOADOUT, the dobermann extras). `SKIP-ALREADY` / `EMPTY` mean the behaviour/diff was already present.

**Golden attribution.** No golden file was hand-edited. For a moving commit, the change was reverted alone →
`node tools/golden.mjs` shows **zero** diff; restored → the diff is exactly the expected scenarios. The combined
regenerations are our commits **`eeae4210`** (R22 source changes: roster 21, bonds 14, fields 15, matches 12,
standins 2, diy 8 move) and **`177bad63`** (re-based onto Group A, combined corpus). The rule is
[`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b).

**Taken — by area** (upstream hash → ours; the rule in one line; `→` = our re-implementation under our author):

*G-TOOLS / G-UI / G-SMALL / stats / UIBACK*

| Upstream | Ours | Rule |
|---|---|---|
| `51c53de1` | `a202a59a` | listen on `::` so one socket serves IPv6 and IPv4 (#291) |
| `c36320fe` | `eb9b4092` | GitHub issue templates (#300) |
| `e8ba0912` | `c48adc99` | battle performance bench under `public/dev` (#198) |
| `1f147a28` | `74357012` | `tools/ci.mjs` + `npm run ci` (#367) |
| `a2a3f524` | `252c499d` | `SP_VERIFY` re-runs slices inside the 8 ms budget (#352) |
| `5f0a06cc` | `99afe008` | retreat with a full bench counts the summon stack's slot (#361) |
| `bc22f9cb` | `808b476e` | Enter on the equip-replace dialog keeps native behaviour (#358) |
| `59525390` | `286b9adb` | clear the 调度中心 upgrade confirm for the level after D (#356) |
| `246622be` | `baf4a344` | spectator prep view updates after a 机变 pick (#349) |
| `8597b66d` | `cddc8669` | boot build tag includes sim / shared / data (#351) |
| `e2503c7f` | `1b7b9385` | import dialog traps keyboard focus (#341) |
| `063408e4` | `095a3a5e` | `build-data --refresh` fails instead of falling back (#350) |
| `d07d97dc` | `c9c5879f` | selling a summoner counts the slots its stacks free (#309) |
| `5662b7ef` | `19eab0c7` | out-of-order language-pack responses (#304) |
| `25bcdff3` | `fab2adab` | reselecting the same operator keeps its draft skill/module (#306) |
| `7c307d86` | `25f5fa3b` | a reconnect token cannot be claimed twice (#299) |
| `b5c29b53` | `1fffc8ff` | asset downloads honour `HTTP(S)_PROXY` (#289) |
| `fd791a66` | `7572dbdb` | co-op rooms can make AI teammates draft last (#368) |
| `073507ec` | `fed6ee97` | double-click a teammate avatar in prep to open their field (#374) |
| `3f884412` | `2ef6339b` | settings can copy local diagnostics (#321) |
| `438a6b52` | `e33a8838` | the local statistics page (PR #323, as submitted) |
| `51e0e60b` | `ecf2d1d0` | a match left right away stays in history but does not count; bounded storage; tabs |
| `df540b62` | `a0d2e884` | a stage device explains itself on a tap (#228 / PR #229) |
| `911e4bff` | `a9a1592a` | a 设置 button in the lobby / room top bar (#238) |
| `7fb41f4f` | `73de8b8d` | 准备就绪 folds the shop bar (#138) |
| `d7c665db` | `e071de72` | the 观战席 capsule + host removes a spectator (PR #120) |
| `b4bc89ad` | `d8ce0214` | the top-bar capsule counts resolved = killed + leaked (PR #308) |
| `4bb0c11e` | `7f54f647` | a 调度中心 upgrade opens the new shop slot EMPTY (#332 / PR #333) |
| `f632e0b0` | `24c074bc` | `docs/design/client.md` names the new screen pieces |
| `1a880699` | `d0af4e5a` | a finished 联防 / boss-pair field publishes its own resolved (our capsule-progress fix) |

*R22-GHSIM / R22-OSIM / R22-RENDER / R22-HUD / R22-FIELDS / R22-LATE / dober*

| Upstream | Ours | Rule |
|---|---|---|
| `3356b340` | `e8c7bb30` | ≥3 overlapping 同名效果取最高 resume strongest-first (#342 / PR #348) |
| `5a50f7b5` | `a898e5a0` | REA-Y「攻击范围内存在N名…」 applied by the engine (#293) |
| `a0cd6826` | `56e9de88` | 异客 S3 雷暴 covers the 13-tile diamond at the target's tile (#322 / PR #329) |
| `b2510524` | `b8f598ce` | 歌蕾蒂娅 S3's skill-end net pulls within 1 tile (tornado keeps 1.5) (#324 / PR #329) |
| `ca671f2f` | `7672a38f` | 大帝 加急调度 stacks without a cap (#328 / PR #329) |
| `bfef34ff` | `b3c561ba` | 假想敌：骨刺 changes model with its 隐匿 (render) (#296 / PR #365) |
| `c250ff66` | `77c18a03` | 假想敌：骨刺 targets as PRTS writes (sim) (#296 / PR #365) |
| `4bd154e3` | `2549d8af` | a 速射手 blocking a ground enemy shoots a flyer first (#220, owner) |
| `895653fc` | `4cb35fd5` | 帝国炮火先兆者 shells hit the impact tile + 8 around (#364) |
| `38d4c3e4` | `85a2e8ae` | 饵·【文火慢炖】 skips noStack bonds (owner) |
| `6d6fbe92` | `b27dc27b` | 伊内丝 S3 restarts on a 突袭 landing |
| `42caca3b` | `d583d719` | 引星棘刺 alchemy units restore HP as 生命回复速度 |
| `977215e1` | `1fe6956d` | PRTS 不可对空 effects spare the flying 炎佑 |
| `dd23572b` | `b2701903` | 琳琅诗怀雅's 香槟炸弹 never shows an HP bar |
| `1e78648a` | `f8ad9834` | closed eyes stay closed without the stencil masks (GitHub #177) |
| `6326dd4d` | `c1a56290` | a late-seen attack plays its whole clip (#246) |
| `8a64edc9` | `4781a863` | an enemy out its attack recovery is drawn standing (PR #381, supersedes #307/#314) |
| `8ae891f1` | *(n/a)* | HP-bar ammo cells: the sim/snapshot part is ours; the doc hunk was skipped — see skipped below |
| `030d0a29` | `fee27b1c` | a renderer that loses the 12 s race no longer mounts late (PR #302) |
| `3484178e` | `2be8fd90` | an early skill cue is held and sounds once (PR #292) |
| `bc11c0d6` | `58d56357` | cached-atlas refreshes take turns from the update order (#327 / PR #334) |
| `16df0bf4` | `ef5d6675` | every shop card draws its own slot's frost (#354) |
| `ffa538c3` | `0e277b34` | 赤刃明霄陈 S3's sword wave is drawn along its path (PR #382, owner item 12) |
| `a87cc1e9` | `96ae10db` | boss-field portals teleport (route-end → far exit → that side's door) (#336 / PR #337) |
| `f14b3a06` | `c8b2ee6a` | 耀骑士临光's 卡西米尔 redeploy reduction floors at 0 (#370) |
| `8d896e40` | `67e40844` | the path tie-break never wades into more 深水区 (#375) |
| `1205336a` | `ee95372e` | a route ending on a corner portal stays hidden 3 s (review of #337) |
| `48a2d37e` | `34365c87` | 突袭 members jump to 隐匿 ground enemies (owner, GitHub #316) |
| `19c7b268` | `fcef8d87` | a 画卷 copy that completes a merge copies the target's equipment |
| `1a67ecc3` | `3af24d3f` | 引星棘刺 S1: two alchemy units add their DEF on one ally |
| `7c56335c` | `4bff9b26` | 谢拉格's 盟约寒风 blows a blizzard up the field (PR #386, owner) |
| `03688c82` | `dc1294ec` | 度算浪波 breaks an HP-ratio tie by the latest deployment |
| `ac423184` | `eec49a10` | a 画卷's copied items arrive unequipped |
| `2df1cf15` | `a41a2e76` | a watched teammate's bond popup counts their bench (#385 / PR #387) |
| `0ca2a9c2` | `45a8cc7f` | an open detail card draws its field unit's current attack range (#281) |
| `05eb2b80` | `eb98158d` | the Final Assault / Hidden Core pay a 战术特训 perfect-battle card (PR #353) |
| `66a228c6` | `f09499f1` | a boss field's perfect payout needs the client result to agree with its `b.progress` |

*R22-VOICES (the JP dub) and the UNBAL slide*

| Upstream | Ours | Rule |
|---|---|---|
| `cb8865d9` | `cb2e3ed9` | a tap on an operator says its 选中干员 line in every phase (owner) |
| `ddf8c39e` | `b398cc46` + `af981bd7` | **the Japanese voice dub** as a second tree beside the Chinese one (`audio.voiceJp`, 设置 → 语音语言 中文 / 日本語, CN fallback; full zip ships both) — our packaging (one switch, `FULL_ZIP_JP_VOICE`) differs from upstream's, so re-implemented |
| `bcee737f` | `af981bd7` | voices review fixes (a 选中 tap no longer restarts the battle-voice gap; the second card says its 选中 line; measured JP size) |
| `2669b6ab` | `20ae5ac2` + `5f78eb63` | a pushed / pulled enemy **slides** to where the sim put it; a dying flyer keeps its lift; a long Die clip plays whole (PR #380) |
| `7a33bc7e` | `453a4e81` | a unit killed on the step of its push lies where the sim put it (Grok review) |
| `cdf2bd5c` | `6e71870d` | the official **失衡 (UNBALANCE)**: no walking / normal attack for the push's 位移时间 or the pull's window (idea PR #392, re-implemented from the sources) |
| `1db84d79` | `c59aab17` | 失衡 review fixes (pulled 静态刚体 held for the window, 弧光锋卫 bleeds, no skill/blink/scripted move, route APPEAR / 逐火 重生 ends it) |
| `a0043d42` | `5616d9b7` | **Preserve enemy facing through push and pull slides** (#418, #427) — re-applied on the R22 slide stack |

*Adaptations, goldens and data (ours):* `9947a64a` (`portalPickup` uses our `Math.hypot`, no `detmath.js`),
`5fa3ae2d` (adapt the strongest-status overlap test + README suite count), `eeae4210` and `177bad63` (goldens),
`2cab8b6b` (**rebuild `data/enemies.json`** — a one-line drift left by the cache merge when 克莱门莎 was added;
the offline rebuild reproduces `data/` byte-for-byte again).

**Ours on top of the statistics page (PR #323 — not an upstream merge).** The local statistics page (`438a6b52` /
`e33a8838`, rows above) later grew a **server-backed** store: `shared/stats.js`, `server/stats.js` on a new
`match_stats` table (schema v5), the `stats.submit` / `list` / `clear` / `view` protocol, the per-owner sync and the
online-player `stats.view`. That layer is entirely ours (caps = 2× the mainline) and must survive a merge — see
`docs/MATCHMAKING.md` §40 and `docs/OUR-FEATURES.md` §8.

**Skipped — the explicit list (upstream hash + why):**

| Upstream | Why skipped (the files it would have touched) |
|---|---|
| `ffa538c3` | already ours — `SKIP-ALREADY` (Group A's `0e277b34` drew the sword qi) |
| `8a64edc9` | `EMPTY` — already applied under another commit |
| `2669b6ab` | our `render/units.js`, `test/render/unitview.test.js`, `test/sim/displace-fx.test.js` differ — ported by hand (`20ae5ac2`/`5f78eb63`) |
| `ddf8c39e` | `README.md`, `data/assets.json`, `docs/DEPLOY.md`, `tools/package.mjs` differ — re-implemented (`b398cc46`) |
| `f2aec39e` | our `server/sim/content/bosses.js` differs — the Hidden-Core 链 change was not taken |
| `7e8b435f` | our `chess_char_4_01-rmixer.js` differs |
| `6326dd4d` | our `test/render/feedback2-enemy-attack-clip.test.js` differs |
| `8ae891f1` | our `interp.js` / `battle/events.js` / `op_hsgma2.test.js` differ — the HP-bar readout is ours |
| `030d0a29` / `bc11c0d6` | doc-only leftovers (`docs/design/client.md`); the code is ours |
| `bfef34ff` | our `render/units.js` differs — ported by hand (`b3c561ba`) |
| `5a045731` | 望's `op-wang.js` / `op_wang.test.js` differ |
| `5f98baec` / `e733171b` | our `chess_char_3_04-swire2.js` (琳琅诗怀雅) / `tokens.js` differ |
| `4128965a` / `db29acf9` | our `skills.js` differs (the #298 instant-skill cycle) |
| `bcee737f` | our `detailPanel.js` / `feedback7-voices.test.js` / `tools/package.mjs` differ — re-implemented (`af981bd7`) |
| `7a33bc7e` | our `render/units.js` differs — ported by hand (`453a4e81`) |
| `69d791f9` | our `skills.js` / `queries.js` differ (白铁 铁钳号) |
| `2df1cf15` / `0ca2a9c2` | doc-only leftovers (`docs/PLAYING.md`); the code is ours |
| `a1bc37ed` | our `public/js/ui/gameLogic.js` differs (Enter during facing selection) |
| `cdf2bd5c` / `1db84d79` | our `displacement.js` / render / goldens differ — ported by hand (`6e71870d`/`c59aab17`) |
| `b972c1fc` / `267a826b` / `917e8924` | our `screens/diy.js` and the loadout e2e tests differ |
| `56a7b918` / `e6321457` / `1ab12763` | **excluded by the owner** (教练 personal choice; the bots' zero-range heavy-guard placement; their docs) |

**R22-LOADOUT (excluded from this batch, §0; re-adopted later).** `7e09c63d`, `ec0a2fc6`, `96d9441f`, `7a0937e3`, `519f04e2`, `dc336f24`,
`8e2b981e`, `4f8f5d2a`, `9f36db32`, `4d63e9d5`, `66297106` — the per-operator 潜能 / 练度 loadout screen; the
owner excluded it here and it was not applied **in this batch**. **Superseded:** the whole-branch **v0.2.6** merge (§11)
brought it in and the owner chose to keep it (2026-10-14, §0).

**Local commits produced:** the ~50 cherry-picks listed above plus the goldens/adaptations/data commits, ending
`177bad63`, then the slide + UNBAL stack `20ae5ac2`→`c59aab17` and `b3c561ba`/`b398cc46`/`af981bd7`/`2cab8b6b`.

---

## 5. Group A — the post-0.3.0 upstream combat fixes (2026-10-09/10)

**What it was.** A small upstream stream on top of our pre-Group-A tip `a4e11922`
(tag `backup-pre-groupA`). Upstream HEAD ~ the tip of this stream. The commits are authored `sganggs` and were
applied **linearly** (no merge commit), then adapted.

**Taken (upstream = local hash here; they were applied as-is):**

| Commit | Rule |
|---|---|
| `a181b462` | 修复赤刃明霄陈三技能对空自动开启并核实社区反馈 (chen3 S3 air + community combat) |
| `09d74ee3` | charged guardian heals act without enemies; mixed S2 triggers fixed (#406) |
| `bffd06c9` | source-owned Lemuen (蕾缪安) detection and wanted-skill triggers (#428) |
| `a0043d42` | preserve enemy facing through push and pull slides (#418, #427) |
| `5f9e0d51` | count Fartooth (远牙) granted layers on doll swaps (#415, #429) |
| `fe2d1bff` | correct community-reported combat and strategy draft behaviour |
| `2e793db3` | clipboard fallback selection inside dialogs (#433) |
| `ddea1542` | report missing asset leaves + opt-in strict mode (#421) |
| `42fe3279` | Korean wording + default contribution template (#414, #432) |
| `e6f72273` | clean up browser test pipes; scope deliberate outage errors |

**Our adaptations (authored `merge`):** `a36b475e` (restore the rear-player 蕾缪安 S3 lock/ammo regression onto
our test file), `6bdd0800` (**golden: regenerate for Group A gameplay** — chen3 S3 air, guardian heals, Lemuen
wanted, doll-swap layers, community combat/draft), `ce11e4fc` (adapt the Group A regressions to our fork).

**Conflicts.** Where upstream's test/doc files differ from ours (the Lemuen regression, the combat/draft tests,
the docs), the upstream behaviour was kept and the fork's files adapted. Golden re-baselined once on the combined
corpus.

**Note.** The facing fix (`a0043d42`) appears twice in the graph: as the Group A cherry-pick and again as
`5616d9b7` on the R22 slide stack (the R22 RENDER/UNBAL work re-applied it on top of the slide). Both are in
`ours`.

---

## 6. Group C — the R23 stream (2026-10-10)

**What it was.** The final upstream feedback7 additions after v0.2.2, the **R23** stream (plus our adaptations).
Built on the `groupc` branch, rebased to `groupc-rb` = `ours` HEAD.

**Taken (upstream, authored `sganggs`; the same commits appear on `groupc` as `8cbf0ee4` / `de121460` /
`bfbe07e9` / `b4adce31`):**

| Commit (`ours`) | Rule |
|---|---|
| `ddaef46f` R23-TOAST | 拟态物质 / 简易通讯机 / 寻呼模块 that grant nothing say why (`{who}：卡池中已没有{name}` / `{who}：没有可获得的同盟约干员`); the item is still destroyed; en / ja / ko / zh-TW; golden unchanged (GitHub #401, owner OK) |
| `10a7f68d` R23-TICK | an attack interval or a time-SP cost of a whole number of frames takes exactly that many — 1 s = 30 frames, not 31 (PR #402); **golden: every family moves** |
| `4dde652e` R23-TICK | the docs for the whole-frame rule: `docs/SIM.md` §2 / §7.1, `docs/design/geometry-time.md` §4, §27.61 in the DESIGN index + the intro area map |
| `d366dcc0` R23-DRAGSNAP | a dragged operator stands on the tile under the pointer while it is a legal target (`render/drag.js` `dragStandTile`), held under the pointer elsewhere; pick / highlight / tileHover / wheel / drop stay the pointer's tile (the owner's 2026-10-09 recording; report in PR #403, not merged); golden unchanged |

**Our adaptations (authored `merge`):** `cd4887ed` (adapt the 顶栏胶囊 resolved test to our
`teammateProgress`), `8d20f50f` (regenerate the golden corpus for the applied R23 source, rebased onto `ours`),
`f26a4837` (adapt the doc / data tests to our fork and **regenerate the stale `data/enemies.json`** — the one-line
drift is now gone and `node tools/build-data.mjs --offline` reproduces `data/` byte-for-byte).

**Golden.** Every family moved with R23-TICK (commit `10a7f68d`), then was regenerated in `8d20f50f`; compare
`roster 49`, `bonds 46`, `fields 22`, `matches 18`, `standins 10`, `diy 138`.

**Verification.** The isolated-worktree full suite at HEAD `f26a4837`: **5806 tests / 5795 pass / 0 fail /
11 skipped** (see the report in `docs/PROJECT-STATE.md` §9).

**Deliberate divergence.** The 设置 → **问题反馈 / DIAGNOSTICS** section that upstream's `3f884412` added (our R22 port
`2ef6339b`, §4 above) was **deliberately dropped**: it duplicates our own bug-report entry point (the 设置 dialog's
「bug提交」 since 2026-10-11, before that the lobby's), so `public/js/ui/settings.js` no longer carries the section, its
「复制诊断信息」 button, its recorded-errors row or its `ISSUES_URL`, and the `set-diag*` CSS hooks are gone.
`public/js/diag.js` itself stays — `main.js`, `ui/toasts.js` and `battle/runner.js` still record into its error log.
**Both it and the upstream 设置-button placement are on the 永不合并 list (§0).**

**Divergence (2026-10-11) — the 设置 button's position.** Upstream `911e4bff` put the 设置 button left of 玩法说明 in the
lobby / room top bar; we keep 设置 in the top bar's right-hand group instead — in the lobby immediately before the 档案
account chip (right of 登录 / 注册), in the room beside the invite key — so the merge must not restore upstream's middle
placement (§0). Lobby right group, left→right: 统计 · 干员调配 · 登录 / 注册 (guests only) · 设置 · 档案 chip.

**Divergence (2026-10-12) — 玩法说明 / 资料库 are NOT in the 设置 dialog; bug提交 still is.** The lobby's top bar keeps 公开房间 · 更新日志
(and the room keeps its other controls). The 设置 dialog's action row now carries only the player **bug提交** entry beside 完成:
`public/js/ui/settings.js` `set-bug` → `openBugReport` (the `ui/community.js` `BugReportHost`, mounted once by `main.js`,
`css .bug-host` above `--z-modal`, opens above the modal and still submits through `bug.report` + the image upload). The
2026-10-11 玩法说明 (`set-guide`) and 资料库 (`set-codex`) actions were **removed on 2026-10-12**: the codex has its own
lobby top-bar entry (`codex-entry`) and the guide stays reachable in-match (the gear / step-head `GuideButton`,
`ui/matchChrome.js`). A later merge must not move the bug提交 entry back onto a top bar nor drop it, and must not
re-introduce the removed 玩法说明 / 资料库 settings actions. (The in-match gear / step-head 玩法说明 buttons stay as they are.)
The **title screen's** own 玩法说明 button (`.title-guide`, in the callsign console's 已连接服务器 · ping row, next to the
settings gear) was **removed** earlier — the title reaches the guide through the in-match triggers now, and the connection
row carries only the status dot / text / ping · 设置 · 全屏.

**Divergence (2026-10-11) — a 本局禁用 bond is banned from being OFFERED, not from taking effect.** Upstream's
`computeBonds` skips `gd.modeInactiveBonds` (`01a44cd2`; the 本局禁用 UI `b4fa21a0` / `695ece26` / `c0cc1d61`, all
carried unchanged by our merges) so a bond the mode never offers could never activate — and upstream's `battleBonds`
(the 0.1.3 §27 fix) even handed such a bond to the battle as an INACTIVE entry. The owner's decision of 2026-10-11
(「被 ban 的盟约即使被激活也无法生效」): **the ban only governs the offer** (the pool, the strategy draft, the bots);
`computeBonds` now counts every bond, so a banned bond whose members reach its threshold is `active` and its effect
applies, while one below its threshold stays inert (its layers still ride into the battle, §27). `bondList` still marks
an inactive one `off: true` (grey 本局禁用 disc) and the dialog says 本局禁用 until it is activated. Blacklisted in
§0; self-check: no `modeInactiveBonds.has(id)) continue` in `computeBonds`, and `battleBonds` forces no `active: false`.

---

## 7. Pending: the displacement-slide + 失衡 port (`port-r22-slide`)

The branch **`port-r22-slide`** (worktree `D:\DOTK\_merge-wt`) was created to hold the R22 **push/pull slide +
失衡 (UNBALANCE)** port while it was resolved by hand (the upstream commits `2669b6ab` (slide), `7a33bc7e`
(dying-view anchor), `cdf2bd5c` (UNBAL) and `1db84d79` (UNBAL review) all `SKIP` in the batch — see §4).

**Status at HEAD `f26a4837`:** the branch is an **ancestor of `ours`** — `git rev-list --count
port-r22-slide..ours` = 40 and `git log ours..port-r22-slide` is empty. Its tip `b3c561ba` and the whole slide +
失衡 stack (`20ae5ac2` → `5f78eb63` → `453a4e81` → `6e71870d` → `c59aab17` → `5616d9b7`) are **already integrated**
in `ours`, so **nothing remains to merge from it**. Do not delete or touch it (per the owner); it is kept as the
staging branch of record for that port.

> If a future instruction says the slide/UNBAL port is still pending, re-check this: at `f26a4837` it is in.
> The branch's own tree is 40 commits behind and is **not** a source of truth.

---

## 8. 0.2.3 PWA install icons + manifest (mint rook) — the 添加到桌面 button's missing half (2026-10-11)

**Why.** Our title screen's 添加到桌面 install button (`public/js/ui/install.js`) was a graceful no-op because our
tree shipped no `public/manifest.json` and no icons, so no browser fired `beforeinstallprompt`. The 0.2.3 install-icon
work had never been merged (it rode in the skipped 0.2.3 batch).

**What came in** (taken verbatim — `git checkout upstreamm/master -- public/manifest.json public/icons`, verified
byte-identical blob hashes):

| Path | Notes |
|---|---|
| `public/manifest.json` | `name 卫戍协议：盟约` / `short_name 卫戍协议` / `start_url`+`scope` `/` / `display fullscreen` / `orientation landscape-primary`; `any` and `maskable` 192 + 512 PNG icons |
| `public/icons/app.svg` | the 512-square mint-rook master (owner's pick, refines the 0.2.x castle) |
| `public/icons/app-192.png` `app-512.png` | `purpose: any` |
| `public/icons/app-maskable-192.png` `app-maskable-512.png` | `purpose: maskable` (mark inside the W3C safe circle; `tools/export-app-icons.py` `MASK_SCALE = 0.875`) |
| `public/icons/favicon-16/32/48.png` `favicon.ico` `apple-touch-icon.png` | favicon + Apple touch (the ICO keeps its transparent 1-bit mask) |

Upstream commits: `90421254` *重绘系列通用安装图标…manifest sizes, maskable and favicons re-exported* and `9ec84f36`
*the install icon keeps the 0.2.x mint rook (the owner's choice)…*. Their tooling (`tools/export-app-icons.py`,
the PWA section of `tools/assets/manifest.mjs`) is **not** needed here — the binaries are committed — so only the
assets were taken. `public/index.html` now links the manifest and the icon set (replacing our inline data-URI
favicon).

**No worker is needed for the install.** Upstream ships none — its `public/js/pwa.js` states it explicitly — and Chrome
108 (Android) / 112 (desktop) dropped the fetch-handler requirement, so `beforeinstallprompt` fires without a worker
in current Chromium. At merge time we added none (a worker only for the install would risk the stale-`index.html`
class of bug and cost a startup per navigation, for a game already served over the LAN). Upstream's `public/js/pwa.js`
is **not** merged (we already have `public/js/ui/install.js`). **Later (0.4.0)** the fork added an **opt-in local asset
cache** that DOES ship and register `public/sw.js` — only when the player chooses 缓存到本地, and never for the install
([`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §10). (Chromium on iOS and Firefox never fire the event; iOS gets the
manual hint, Firefox silently hides the button.)

**Stale-`index.html` guard.** `public/js/ui/ensureManifest.js` re-links `/manifest.json` at boot (its boot call is in
`public/js/main.js`), like `ui/ensureStylesheet.js`, so a served `index.html` that predates this merge cannot keep the
button hidden. The source of truth is still the `<link>` in `public/index.html`.

**Guards.** New `test/ui/pwa-assets.test.js` (the manifest is installable, every named icon exists, decodes to its
declared size, is opaque with a real mark, and the maskable ones stay inside the safe circle; the favicon / Apple tags
resolve to real files of the declared size). `test/ui/ensure-manifest.test.js` covers the re-link; the updated
`test/ui/title-surfaces.test.js` asserts the manifest + icons are present and linked (the install needs no worker; our opt-in `public/sw.js` asset-cache worker is a separate surface).

---

## 9. 0.2.5 official battlefield scenes on the 3D board (2026-10-12)

**Extraction on this machine (2026-10-12).** The owner's standing rule is the local client first: the **CN** Bilibili
client (`D:\...\Arknights_Data\StreamingAssets\AB\Windows`) has the autochess bundles but is **off-season** (no
`scenes/activities/act1autochess`), so the scene bundles came from the CDN (`fetch_scenes.py`) while the materials /
textures still came from the client. `node tools/setup.mjs --scenes` alone finds no client here (the owner's install
sits under a custom path, `D:\<local network games>\...`), so the run was
`node tools/setup.mjs --scenes --game "<CN AB root>"`. Result: **33/33 bundles**, **11/11 stages**.
`public/assets/local/scene/` = **92 files, 64,423,310 bytes** (`scene/<stageId>/{scene.json,scene.bin,lm<i>.png,lm<i>.webp}`
for the 11 stages; `scene/tex/` = 30 files); `.cache/official-scenes/26-04-13-12-31-42_e9b560/` = the 33 bundles
(**29,714,076 bytes** on disk; the list's 22,801,308 is the CDN-compressed size). Stages: `act1autochess_m01`-`m07`
and `act2autochess_m01`-`m04`. Backup at
`C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip` (**67,603,003 bytes**; `scene\` +
`official-scenes\`) - restore in runbook (d) below. `data/local-assets.json` now lists all 12 `scene/...` groups
(`sceneListed` needs group `scene/<stageId>` with a `scene` and a `bin` entry); at the time the files stayed
git-ignored (`git ls-files` showed 0) — **superseded 2026-10-14: the owner committed them** so the CDN mirrors can
serve them (see ASSETS.md and HANDOVER §8).

**Why.** Upstream 0.2.5 renders the official battlefield scene on the 3D board (PR #532 / #533 by @andrew05060414),
falling back to our procedural metal board when a scene is absent. Our fork already had the 3D board
(`public/js/render/board3d/`), so this is an additive client feature plus a local extraction tool step.

**What came in** (each `cherry-pick -x`, adapted; author and subject preserved; the local commits carry the upstream
hash in their `(cherry picked from commit …)` trailer):

| Upstream | Status | What it is |
|---|---|---|
| `d482fbb8` | taken (`-x`) | the full ported feature: `load.js` `loadScenePack` / `parseSceneChunks` / `sceneGroupRects` / `sceneListed` / `sceneGroup`; `materials.js` `sceneMaterial` / `sceneWaterMaterial` / `sceneBlend` / `SCENE_LIGHT`; `scene.js` `setScenePack` / `_sceneResources` / `_disposeScene` / `_buildScene` / `sceneGroupVisible`; `app.js` `useOfficialScene`; the extractor `tools/local-extract/{scenes.py,fetch_scenes.py}` + `extract.py --only scene`; `tools/setup.mjs --scenes`; `tools/package.mjs` full-zip scenes; `tools/doctor.mjs`; `test/render/board3d-scene.test.js`, `test/scene-assets.test.js` |
| `3bb7fef7` | taken (`-x`) | `load.js` `mergeSceneChunks` / `sceneMaterialKey` and the `scene.js _buildScene` bucketing (chunks sharing a material / lightmap page become one mesh — draw calls back in budget), plus the boss-round real-server test reading the actual seat pairing (`test/ui/playtest2.real.e2e.test.js`) |
| `1fe81947` | **subsumed — no separate commit** | the raw #532 PR by @andrew05060414. Its whole content is contained in `d482fbb8` (the ported #533): `git diff 1fe81947 d482fbb8 -- public/js/render/board3d/ public/js/render/app.js tools/local-extract/` shows only refinements on `d482fbb8`'s side (a `load.js` reformat, the `c.lightmap >= 0` guard, the `sceneWater` array, the DXT5nm normal-map comment) and `app.js` is identical — so taking `d482fbb8` carries it. |

**Adapted to this fork** (ours wins where they differ):

- `load.js`: kept our `resetBoardPack()` (our fork never had the `threeFailures` retry state) and added
  `sceneCache.clear()`; the scene loader is otherwise upstream's.
- `scene.js` / `materials.js`: kept our `environmentMap` PMREM `__rt` disposal (`envRT`, which upstream lacks) —
  the merged files carry both the scene code and our `envRT` handling.
- `CHANGELOG.md`: our 0.4.0 section kept; one scene bullet added under 新功能. **Correction (2026-10-16):** this note
  used to claim upstream's history docs are not imported — the fork **does** carry them (`docs/history/0.2.5.md` is
  byte-identical to upstream's, 0.2.6 differs only by our own additions). Only the *in-progress* release doc had been
  dropped; since 2026-10-16 `docs/history/0.3.0.md` is carried too (our §32) — see the §32/§33 entry at the end.
- `docs/DESIGN.md`, `docs/DEPLOY.md`, `docs/ASSETS.md`, `docs/design/client.md`, `tools/package.mjs`, `tools/setup.mjs`:
  resolved to our docs and our JP-voice `held` logic, plus the scene row / paragraphs / `SCENE_ART_PREFIX` /
  `scenes` plan field. The stale `§30.17` citation in `docs/design/client.md` (our DESIGN stops at §29) was
  repointed at `docs/ASSETS.md`.
- `test/scene-assets.test.js`: fixed the Windows path (`fileURLToPath`; upstream used `new URL(...).pathname`, which
  yields `D:\D:\…`) and asserted our `.gitignore` invariant (`public/assets/local/scene/` ignored, since this fork
  otherwise tracks `public/assets/**`).
- `test/ui/playtest2.real.e2e.test.js`: upstream's fix reads `m.public.bossPairs`; our server publishes none, so
  `assignedBossSide` recomputes the pair from the alive players in seat order (the rule `prepCamera` already uses).
  Opt-in real-server E2E only.

**Nothing official is committed.** The bundles and the extracted files stay out of the tree: `.gitignore` now lists
`public/assets/local/scene/` explicitly (this fork otherwise tracks `public/assets/**`) and `.cache/` already covers
`.cache/official-scenes/`. `tools/package.mjs` ships the extracted scenes in the **full** zip when the packaging
machine extracted them (`SCENE_ART_PREFIX`; the `battlefield scenes` summary line) and never in the lite zip.
`node tools/setup.mjs --scenes` fetches (`fetch_scenes.py`: 33 bundles, 22,801,308 bytes compressed on the Android
list, md5-checked) and extracts (`extract.py --only scene`) on the machine. The client falls back to the metal board
whenever `data/local-assets.json` lists no `scene/<stageId>` — or a load fails, or `version` is unknown.

**Where they live / size.** Extracted: `public/assets/local/scene/<stageId>/{scene.json,scene.bin,lm<i>}` and
`public/assets/local/scene/tex/<texture>`; downloaded bundles: `.cache/official-scenes/<version>/`. In this
environment the scenes **are** extracted and cached (`data/local-assets.json` lists the `scene/...` groups and
`node tools/doctor.mjs` reports the 3D board usable); both live under git-ignored paths. Because they are
git-ignored, a `git revert` / `reset --hard` does not delete them; still copy them aside before a re-clone or
`git clean -x` (runbook below).

**Golden: unchanged.** The scenes are render-only — the 3D board is a client view over the same sim — so `test/golden/*`
is byte-identical (both `-x` messages say "golden: unchanged"; `node tools/golden.mjs` reports no movement).

**Restore point (the backup).** Annotated tag **`backup/pre-3d-scenes`** on commit
**`fc06debda36da1f7c735ed10be04d9ddf7625bdd`** (the pre-merge `ours` HEAD), pushed to GitHub and Gitee (remote tag object
`3d5a475afac546895812b4f220faa109254ec8f4`). A standalone bundle of the tag + `refs/heads/ours` is at
`C:\Users\31273\AppData\Local\Temp\opencode\sp-backup-pre-3d-scenes.bundle` (582,104,649 bytes, `git bundle verify`
okay).

### Runbook — revert the 3D scenes at any time

PowerShell, copy-paste. `$SP = D:\DOTK\Stronghold-Protocol`, `$STORE = D:\DOTK\_merge-scratch`.

**(a) Revert only the 3D-scene change (preferred — keeps the other concurrent merges).** Revert the two `-x`
commits; git adds a revert commit each, history stays linear and the other agents' work is untouched.

```powershell
$STORE = 'D:\DOTK\_merge-scratch'
git -C $STORE fetch gitee
git -C $STORE checkout ours
git -C $STORE pull --ff-only gitee master                      # the latest ours
$scene1 = git -C $STORE log --format=%H --grep 'cherry picked from commit d482fbb8' -1
$scene2 = git -C $STORE log --format=%H --grep 'cherry picked from commit 3bb7fef7' -1
git -C $STORE revert --no-edit $scene2 $scene1                 # newest first
# a conflict here just means later work touched the same files — resolve keeping the later work
```

**(b) Reset to the tag and re-apply the later work** (heavier; only if (a) conflicts badly). Keep the current tip so
nothing is lost, reset to the restore point, then re-apply the batches merged after it.

```powershell
$STORE = 'D:\DOTK\_merge-scratch'
git -C $STORE branch backup/ours-before-scenes-revert-$(Get-Date -Format yyyyMMddHHmm) ours
git -C $STORE reset --hard backup/pre-3d-scenes
git -C $STORE log --oneline --first-parent backup/ours-before-scenes-revert-* ^backup/pre-3d-scenes
# cherry-pick / merge the listed commits back, then publish with (c).
```

**(c) Publish the revert to the remotes (GitHub primary + Gitee) and restore the dev tree.** The store is the source of truth; the one-way helper
pushes it and mirrors it into `Stronghold-Protocol` (it never copies the dev tree back).

```powershell
$env:GIT_USERNAME = 'marseille1'; $env:GIT_PASSWORD = '<token>'   # the Gitee PAT, never committed
node $SP\tools\push-gitee.mjs --dry-run                           # what would move
node $SP\tools\push-gitee.mjs                                     # push HEAD:refs/heads/master + mirror
```

**(d) Keep / restore the extracted scenes without re-extracting.** They are **committed since 2026-10-14**, so a
revert or `reset --hard` onto an older commit *does* drop them (before that they were git-ignored and survived).
If they are removed, restore a copy or re-extract:

```powershell
robocopy $SP\public\assets\local\scene C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup /E
robocopy C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup $SP\public\assets\local\scene /E
# or from scratch (needs the client / network):
Set-Location $SP; python tools\local-extract\fetch_scenes.py; python tools\local-extract\extract.py --only scene
```

**Backup taken 2026-10-12** (the extracted scenes + the downloaded bundles):
`C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip` (67,603,003 bytes) packs `scene\` (the 92
files) and `official-scenes\` (the 33 bundles). Unpack it and copy each part back over the tree:

```powershell
Expand-Archive C:\Users\31273\AppData\Local\Temp\opencode\sp-scenes-backup-20261012.zip -DestinationPath $env:TEMP\sp-scenes-restore -Force
robocopy $env:TEMP\sp-scenes-restore\scene $SP\public\assets\local\scene /E
robocopy $env:TEMP\sp-scenes-restore\official-scenes $SP\.cache\official-scenes /E
```

**(e) Last resort — restore the whole pre-merge tree from the bundle** (offline, no Gitee):

```powershell
git clone C:\Users\31273\AppData\Local\Temp\opencode\sp-backup-pre-3d-scenes.bundle D:\DOTK\_restore-pre-scenes -b ours
# then compare / cherry-pick back whatever work is needed.
```

---

## 10. 0.2.5 — the 驭械术师 funnel/drone hit fixes (upstream `e0f37718` / `a451ddcf`, ported) (2026-10-12)

**What it was.** The 0.2.5-dev funnel/drone commit and its review fix, cherry-picked and adapted where our tree
differs. The hit-tile rounding (#520) and the #523 外勤医疗 initial aggro were **already in `ours`** from the
concurrent low-risk batch, so this batch does not carry them (see the coordination note below).

| Upstream | Rule | Ours |
|---|---|---|
| `e0f37718` (PRs #537/#536/#535/#520/#518) | the 驭械术师 unreleased drones are ADDITIONS beside the caster's own hit (`funnelMul`/`funnelBodyHits`, `ai.js resolveHit`); a redeploy resets the drone ramp and the per-target map (`professions.js installFunnel`); 洛洛 S2 releases its drone into an independent skill tick that keeps the lock until a kill or the skill ends; bots softly avoid a living teammate's opening factions until that teammate is eliminated (PR #518) | taken: `ai.js`, `professions.js`, the funnel kits, `server/match/bot.js`. Dropped: `op-gdglow.js` (we keep `chess_char_377_gdglow-gdglow.js`), the 0.2.5 history/CHANGELOG docs, the #475 tests (ours never had them), and the PR #520 hit-tile part (`ours` already has it — see below) |
| `a451ddcf` (review fix) | attached drones (`funnelBodyHits !== 0`) keep the own hit for a skill that only buffs/retargets the attack; only a drone-only skill (`funnelBodyHits: 0`) skips it (耶拉 S2 both forms, 荒芜拉普兰德 S1) | taken (耶拉's two forms use the shared `kjeraRelease`; 荒芜拉普兰德 S2 is the drone-only case) |
| `f1ea116f` | golden matches recomputed on the merged tree | subsumed by our golden regeneration (below) |
| `37e0fffb` (#523) | the 外勤医疗 reserve medic takes the initial aggro order before the ordinary battle-start deployment | **not taken here — already in `ours`** via the low-risk batch (commit `3a91fb32`); the instruction was to take it only if the other agent had not, and the two branches raced |

**PR #520 (hit tiles) and PR #518 (bot).** The hit-tile round-half-to-even + `FIELD_EDGE_INSET` landed in `ours` from
the low-risk batch (`8994d163`, `roundHalfEven` defined and exported in `body.js`). This batch's own port (a minimal
`server/sim/detmath.js`) was dropped on the rebase — one implementation stays. The PR #518 bot change **is** taken
here: `ours` had only the crude hard-exclude (`4e904de3`, IceCodeNew's original PR commit, reserve → weight 0); the
ported `e0f37718` version makes it a **soft** reserve (`SOFT_BAND_RESERVE` = 0.25, the reservation lifts when the
teammate is eliminated), which supersedes it.

**Our funnel rules kept (deliberate divergence from upstream).** Upstream's 澄闪 (`op-gdglow.js`) is a fully custom
`dealDamage` drone model. Ours (`chess_char_377_gdglow-gdglow.js`, §31 / OUR-FEATURES §35.2) rides the shared
`funnel` profession: `attack.hits` is the drone count and every drone locks the ONE target (`funnelTarget` /
`funnelScale`), each at the full ramp-scaled ATK — the fix only adds the caster's own hit beside them. The own hit
stays on the normal attack and S1/S2; S3 澄净闪耀 停止攻击, so its spec sets `funnelBodyHits: 0` (drone-only, the ramp
inside the hits; `attack.hits` = 3 for +2 drones). `docs/SIM.md` (the `funnel` row) and `docs/design/engine.md`
carry this fork adaptation. `public/js/render/fx/official.js` is regenerated (the ported 洛洛 S2/`drone` fx made
`char_4040_rockr`'s table entry stale; generated file, `tools/build-fx-official.mjs`).

**Golden.** Attribution first: reverting only the non-golden source of the source commit and re-running `node
tools/golden.mjs --update` reproduces the pre-merge golden byte-for-byte (an empty `git diff 3f38337f -- test/golden`).
Moved: **roster 17 / bonds 14 / fields 2 / matches 15** (standins and diy unchanged — they field stand-in kits and
owned 6★ DIY picks, not the funnel's shop chess). The funnel/#518 changes moved the 补位 scenario's whole trajectory,
so `tools/golden.mjs` re-chooses its not-owned set (pieces with a 补位 prototype) to keep `test/golden-standins.test.js`
meaningful. Local commits: `cc35f164` (source) → `2661d8d2` (golden) → `881a80c0` (docs), on `3f38337f`.

---
## 11. v0.2.6 — the **whole-branch** merge (2026-10-14)

**What it was.** The first **whole-branch** merge since feedback5 (§1): `git merge origin/master`, not a commit-by-commit
cherry-pick. Upstream mainline **v0.2.6** = `488db49f`; the merge base is **v0.2.0** `1303321`, so the range brings the
**374 upstream commits** of the 0.2.1 – 0.2.6 line (the feedback6 / feedback7 tail included) on top of `ours` `417b1e97`.
Done in the throwaway worktree `_merge-v026` (branch `merge/v026`); **190 conflicts**, each resolved hunk-by-hunk keeping
both sides (never `--ours` / `--theirs` on a source file).

**Local commits.** `aec85c5d` (the merge; conflicts resolved, tests not yet green) → `c849a632` → `656fada6` →
`6a463e73` → `d2f4b411` (the adaptation) → `5e8207c8` (all gates green). The docs commits sit on top of those.

**Adopted upstream (kept and working).**

| Upstream | What we took |
|---|---|
| 潜能 / 练度 (0.2.2 …; `0ced21d3` fb7-loadout, `96d9441f` R22-LOADOUT) | the per-operator 潜能 (1–6) + 练度 (未精英化 / 精英1 / 精英2 / 精英2 Lv.60) set in 干员调配, **defaults 潜能 1 / 未精英化 since 2026-10-15** (满潜 6 / 精英2 Lv.60 before that) — **kept by the owner**, see the decision note below. Code: `shared/potential.js`, `shared/loadoutRecord.js`, `public/js/ui/loadoutModel.js`, `public/js/screens/cultivation.js` |
| 文字大小 (text-size scaling) | the 设置 rows plus the `calc(NN * var(--t))` rollout (254 declarations across 10 CSS files; a few test-pinned plain selectors stay literal) |
| 弹药数量 (#552) | the optional 「剩余 / 总」 ammo read-out under a yellow bar |
| Spine clip bounds / impostor sizing (#542) | `public/js/render/spine.js` (`clipBounds`, `CLIP_SAMPLE_*`) |
| Device slabs on the official scenes (#569) | `public/js/render/board3d/scene.js` (`M.raised`) |
| Deploy replay + landing sound (#416) | the per-round deploy replay and its landing SFX |
| Content-hashed asset URLs / brotli / traffic counters (0.2.6) | `server/http/{assetIndex,files,traffic}.js`; [`docs/ASSETS.md`](ASSETS.md) |
| Per-character voice dubs | `public/js/voicePrefs.js` (设置 → 语音语言) |

The rest of the range is the remainder of the 0.2.1 – 0.2.6 rules / UI **not** already carried by our R22 (§4) / R23 (§6)
cherry-picks; where our file already had the change, ours stayed.

**Kept from the fork (kept out of the merge).**

- The economy / card-pool rules, including **#488**: upstream's item-stock gate in `acquireItem` is removed again and the
  item-cap invariant allows the overdraw, so a `<获得时>` / strategy grant stays free ([`docs/MATCHMAKING.md`](MATCHMAKING.md) §39.2).
- `pool_equip_rockr` — our four 维式重锤 as `items`, not upstream's `weighted`.
- `public/js/render/spine.js` `windUp` (ours), alongside the new clip bounds.
- `tools/package.mjs` and the no-update-zip packaging (ours) — `test/update-package.test.js` went with it.
- `server/sim/content/kits/shared/summoner.js` `tokenStat` keys on `owner.def.tokenOwner ?? owner.defId` (our token variants).
- `server/match/builtinMeta.js` 拟态物质 grants with `requirePool:false`; `public/js/ui/gameLogic/settings.js` re-exports
  `VOICE_LANGS` from `voicePrefs.js` (the doubled definition).
- **Upstream 克莱门莎 (`op-clemnt.js`) is not taken** (§0): the kit file is absent while our
  `chess_char_4231_clemnt-clemnt.js` + `test/content/clemnt.test.js` stay.

**Upstream tests deliberately dropped (12).** Tests for content / features we do not carry, plus two audio tests:
`test/content/{community-round30,echo-counter-023,item-damage-procs,new-modules-023,skill-trigger-followup}.test.js`,
`test/match/{community-round30,leaver-isolation-ws,runner-pending}.test.js`, `test/ui/feedback6-diy-bond-members.test.js`,
`test/update-package.test.js`, and the two SFX tests (`test/feedback6-leizi2-attack-sfx.test.js`,
`test/feedback7-chen3-s3-sfx.test.js` — the mode-attack SFX are **pending regeneration** from the local client, so pinning
them now would pin the wrong audio).

**Golden.** The merge moves the corpus (**7 files**: roster, bonds, fields, matches, standins, diy + README) — upstream's
rule changes and the fork's full-potential composition both shift it; it was regenerated with the merged engine inside the
adaptation commits (`node tools/golden.mjs --update`, never hand-edited).

**The 潜能 / 练度 decision (owner, 2026-10-14).** The loadout subsystem was excluded in the R22 batch (§4,
[`docs/MATCHMAKING.md`](MATCHMAKING.md) §39.2), but the whole-branch merge re-introduced it and the owner chose to **keep
and adapt** it (reverting it back out would have cost more than adapting the tests); the fork content tests moved from
potential-0 to full-potential numbers then, and **moved back to the 潜能 1 / 未精英化 default on 2026-10-15** (owner's
decision, §39.2). The §0 R21P / R22-LOADOUT rows now read as *kept*, not *excluded*.

**Verification.** The full suite in the store at `5e8207c8`: **6600 tests / 6579 pass / 0 fail / 21 skipped**
(measured at *that* commit; the tree has moved on since — see `docs/PROJECT-STATE.md` §3 for the current
numbers, 6669 / 6654 / 0 / 15 on the desktop store);
`build-data --offline` leaves `data/` byte-identical; `kit-coverage --missing` 307/307 skills · 120/120 chess;
`i18n check en --strict` **1454/1454**; `doctor` exit 0; `eslint .` 0 errors; `check:imports` / `typecheck` pass; the three
docs guards 34 pass / 0 fail.

---

## 12. How to add the next batch to this log

1. Fetch upstream; write the ordered commit list (`git log --oneline <base>..<head>`) to a scratch note (the
   `_merge-attrib/all-fb7.txt` pattern).
2. Triage each commit into an area; mark `OK` / `OKg` / `SKIP` and the skip reason (already-ours / our file
   differs / doc-only / owner-excluded). Record it (`apply-log.txt` pattern).
3. Cherry-pick the `OK` set onto `ours`, **preserving the author and subject**, adapting to the fork.
4. Golden: attribute first, then regenerate in a dedicated commit (never hand-edit; never loosen a guard).
5. Update this file (a new `## N.` section), [`docs/MATCHMAKING.md`](MATCHMAKING.md) for any non-obvious rule, and
   [`CHANGELOG.md`](../CHANGELOG.md) for the release.
6. Full `node --test` in the store, then publish with the one-way helper (`node tools/push-gitee.mjs`) and mirror
   the working project. See [`docs/AI-WORKFLOW.md`](AI-WORKFLOW.md) (b)/(c).
---

## 12. v0.3.0 分批并入计划

> **进度（2026-10-16）**：B1 第 1 条 **已并入** —— `c983ce7d` 秘术师储存的攻击能量（血条下方 orb + 当前/上限，纯显示、golden 不变）。随附的 `571577ae`（改成**设置项、默认关**）**暂缓**：它依赖上游 0.3.0 的设置体系（`public/js/ui/settings.js` / `ui/gameLogic/settings.js` / 四份 i18n / CHANGELOG 全部冲突），而我们的 `ammo` / `wolves` / `neg` 这类血条读数本来就没有开关 —— 等设置体系对齐后再手植（相当于一个小功能：新增开关 + 渲染门控 + i18n）。下一条：`ea4fe48c` 作战统计（再接 `fbc3f522` 里 Worker 局隐藏的那部分）。（进行中，owner 2026-10-16）

`c24e17ee` (0.3.0) 相对我们的基线 `488db49f` (v0.2.6)：**390 个提交 / 807 个文件 / +111,918 − 9,489 行**，其中 **174 个文件我们也改过**（预测冲突）、**§0 命中 18 处**。数据面几乎未动（`data/` 仅 2 行）。先合并低风险批次（owner 2026-10-16）。

**方法**：在基于我们 `master` 的合并 worktree 里**逐条 `git cherry-pick`**（对上游的 merge 提交用 `-m 1`，或挑其内层提交）→ 冲突按「两边都保留」逐块解→ **每批一次** `node --test` + `node tools/build-data.mjs --offline`（零漂移）→ golden 变动就**单独一个提交**重算（AI-WORKFLOW 的叒因规则）→ 每批推一次。**每批前后都跑** `node tools/check-upstream.mjs` 看 §0 面。

### 批次 B1 — 低风险（体验 / 小规则修正）

| 内容 | 上游提交 | 碰到我们的 |
|---|---|---|
| 作战统计（局内伤害/治疗/DPS）可选默认关 | `ea4fe48c`（+ 后续 `fbc3f522` 改成 opt-in 并在 Worker 局隐藏） | `public/js/**` |
| 秘术师能量条可选默认关 | `c983ce7d`（+ `571577ae` 默认值决定） | `server/sim/snapshot.js` |
| 射程按敌人 0.1 碰撞箱判定 | `5bf337a5` | `server/sim/**` |
| 已出现的装备库存被拿空后仍可买（欠账）、凯瑟琳定向投放可刷突变细胞 | `72ebd9f3`（+ `f2af6107`） | `server/match/**` |
| 攻击追击（出手时在范围内就打完）、投石机三连击改 3 次独立攻击、野鬃推动方向 | `9f228439` | `server/sim/**` |
| 枯朽之种自毁改为速度 10 的弹道 | `a93a5d16`（golden `25685636`） | `server/sim/content/**` + golden |
| 假想敌：镜膜 首次被沉默后永久失去生命加成 | `1a701241` | `server/sim/content/bosses.js` |
| 维多利亚未激活攒到 25 层 → 激活那一刻立即发锤（远见/奇迹同规则） | `16567bbe`（+ `422b8091` 文案） | `server/sim/content/**` |
| 伊利昂的木驮兽 / 「越长尘」载客 | `18cb28fe` / `d19dd600` | `server/sim/**` |
| 风丸替身形态可对空（S2 召唤的替身仍不能）+ 队列奖励不消失 | `e54ac351` | `server/sim/**` |

（Q/X 撤退出售、W 悬停购买、暇息期预览区、拖拽镜头、临时整备区排队等在上游的 **round-44 / round-46 整合提交**里（如 `25705cdf`），需单独拆，并入 B1 后段）

### 批次 B2 — 中等（规则 + 配音）

| 内容 | 上游提交 | 备注 |
|---|---|---|
| 同盟自选玩家私人库存随公共卡池翻倍（#650：5 阶 16 / 6 阶 10） | `843ccb57`（合并行 `25705cdf`） | `server/match/gamedata.js`（**我们刚改过它——务必保留 §8 的 boost 层**） |
| 英语 / 韩语 / 本土配音，设置选语音 + 本土开关 + 逐人试听 | `8eb7f701`（+ `d93d6d30` data/assets.json + `f22b7129`） | `data/assets.json`、`public/js/**`；**需要对应的语音素材** |

### 批次 B3 — 大块（各自单独评估，不轻易并）

- **插件系统 + 工作台**（`plugins/`、`shared/plugins/`、`server/plugins/`、`server/studio/`、`public/studio/`、CSP、`SP_PLUGINS`/`SP_PLUGIN_SCRIPTS`、Docker）——纯新增但面大
  - **owner 2026-10-16 决定：暂缓（服务器不需要它）。** 现状核实：这 5 个目录我们**一个文件都没有**（上游合计 126 个文件），`server|shared/plugins/identity.js` 维持删除。这一轮并官方特效时它还**两次试图溜进来** ✗：`settings.js` 的上游 hunk 带了 `content.js` / `pluginTag.js` / `uiPlugins.js` / `shared/plugins/*` 的 import（都是**未使用**，已拆掉）✓；`server/http/static.js` 用 `git apply --3way` 时把**整个插件 HTTP 文档**（`/plugins/`、`/cs/`、`/vs/`、`/p/`）拖了进来（已回退手改）✗。
  - 若日后要并：单独一轮 + 单独分支；`SP_PLUGINS` 默认关；**先只并服务端 + 只读 `plugins/`**，工坊（studio）最后上；需要**显式改 §0**（re-add `server|shared/plugins/*`）；与我们的「本地 → 镜像 → 中继」素材链对齐是最贵的一块（`content.js` 会重写每屏读的 art manifest）。验收线：无插件时**逐字节不变**。
  - **更轻的替代**：我们已有 `packs/`（内容 / 语言包，`docs/PACKS.md`）+ kit 约定 + `tools/package.mjs` —— 想让朋友之间分享内容，**扩展 packs 比并插件系统便宜一个数量级**。
，且与我们的 8 名自造干员、客户端资源链相邻，**建议整块作为一次专项**。
- **官方战斗特效**（`tools/local-extract/fx.py`、`shared/`的 fx 运行时、`public/js/render/vfx/*`、设置「官方特效」）——**与我们自己的双层特效系统（OUR-FEATURES §2）直接重叠**，逐项决定，不整块合并。
- **统计页改版**（`946f9fb8`）——与我们自己的社区统计重叠（PROJECT-STATE §5），逐项取舍。
- **资料下载/导入 + 素材包**（`aa8d4fc1`、`5bc36c48`）——与我们的中继 + 镜像 + SW 链重叠，不整块合并。
- **机器人改进**（`a2e67454` 等）——与我们已合并的 feedback6/7 体系并行，需重新校准。

### 手植项目（owner 2026-10-16 点名：向官方学）

- **流动水面**：上游在 `public/js/render/board3d/`（`load.js` 加载 `TX_water_normal` / `TX_Caustics256` / `T_noise_clouds_01`；`scene.js` 的 `sceneWaterMaterial` 不受 lightmap；`layout.js` 区分「水面」与「动态水格平台 waterPlatform」）。**这块是 §0，我们不整块并**：用我们自己的 `theme.js`/`scene.js` 做一个**水波动材质**（法线贴图滚动 + 焦散动画），纹理走我们自己的 `tools/local-extract/` 提取。
- **回合开始的部署回放**：上游 `public/js/render/app.js` 的 `view.replayDeploys(uids)` + `DEPLOY_REPLAY_MS`（按部署顺序逐个回放入场）、`fx.deploy` 闪光、`UnitView.land` → `audio.deployCue`。`public/js/render/app.js` **不在 §0**，可直接学/手植。
### 两个手植项的核对结论（2026-10-16）

- **② 回合开始的部署回放：我们早就有了。** `public/js/render/app/tune.js` 的 `DEPLOY_REPLAY_MS = 50` 与上游**逐字相同**；`render/app.js replayDeploys`、`ui/gameLogic/phases.js deployOrder` / `roundStartReplay`、`screens/game.js` 的接线、`render/units.js land()` + `LAND_VOICES` / `warmLandings` / `audio deployCue` **全部在位**。所以「官方的部署动画更好看」指的**不是回放**，而是**部署时的官方粒子 / 特效** —— 那属于上游的「官方特效」子系统（B3；它的覆盖范围里就含「部署」）。要它得拉 B3 的那个切片，不是一条能单独手植的小改动。
- **① 流动水面：材质其实一直在动，缺的是「按每张图自己的水材质参数」。** `board3d/materials.js` 的深海水材质与上游**旧版逐行相同**（`uTime` + 两层滚动法线 `n1`/`n2` + 焦散 `uCaustics`），`board3d/scene.js:881-882` **每帧都在写 `uTime`**（`['water','mire','infection','smog']` + `this.official` 时的 `this.sceneWater`），官方水贴图（`[ucp]TX_water_normal` / `TX_Caustics256` / `T_noise_clouds_01`）本地提取里也都在。上游 0.3.0 真正新增的是**每张图自己的水参数**：`materials.js` 里带 `uTiling` / `uWaterSpeed` / `uNormalTiling` / `uFlowSpeed` / `uCausticsTiling` 的 `WATER_TUNING` 版本 + `applyWaterMaterial` / `sceneWaterInfo`，参数来自提取出的 `public/assets/local/scene/<map>/scene.json`。**这是 §0 手植**（board3d 归我们）：把我们那份旧材质升级成「按图取参」即可，不需要动别处。
### 卡住的并入项（2026-10-16 续）

- **商店库存欠账 + 凯瑟琳定向投放可刷突变细胞**（`72ebd9f3`，#624 / #631）**暂停待决**：它的核心是给 `acquireItem` 加 `requirePool` / `itemPool.debt`（道具库存池记账），而那正是 §0「上游道具牌库把「白给装备」也卡库存」那一条的表面（我们的模型是 `acquireItem` **不做池子检查**，`invariants.js` 里写着 "the fork's model, GitHub #488"）。同时它还改了**生成数据** `data/choices.json`（不能手改，得从构建器走）。两者都不是能机械合并的东西 —— 需要 owner 定：是否改成上游的「库存池 + 欠账」模型（那会动到 §0 的立场），还是只取「已出现的装备仍可购买」这一半。
- - **打磨石投石机三连击**（`31a172e2`）—— **已落地（2026-10-16）**。真正的原因是我自己第一次解冲突时只保留了 `passengers.js` 那一行 import、**丢掉了上游的 `boundedCount` / `PLUGIN_TIMES_MAX` 导入**，于是 `catapultVolley` 抛 `ReferenceError`、一颗石头也落不下来（探针给出 `b.errors[0] = boundedCount is not defined`）。而那两个工具属**上游插件系统**（`shared/plugins/limits.js` 71 行 / `officialBounds.js` 335 / `steps.js` 41），本分支没有插件、该上限对官方数据恒等，所以**内联**成 `Math.max(1, Math.floor(T(ab, "Attack.attack@times") ?? 1))`。模拟侧（`ai.js` 的 `deferHit` 消费端、`unique` 形态钩子、`catapultVolley` / `catapultStone` / `catapultSplash`）与上游 tip **逐字相同**，不是它们的问题；golden 另一个提交重算。
- **射程按敌人 0.1 碰撞箱**（`5bf337a5`）：200+ 行的碰撞 / 几何重构，父提交不是我们基线 —— 按单独一轮处理。

- **已按 A 落地（2026-10-16）**：商店里**已显示**的装备卡与装备奖励（机变卡、定向投放 / 见者有份）**不再因共享库存耗尽而拒绝** —— 删掉了 `player/economy.js` 的购买拒绝、`player/prep.js` 的奖励拒绝、`match/spDraft.js` `spCardAvailable` 的池子判定与 `match/views.js` 对 机变卡的置灰，**不引入任何欠账记账**（盘子可以超发 —— 本分支的 `invariants.js` 本来就允许，GitHub #488）；**不改 §0 立场**。生成侧的过滤（`spDraft` 的 `itemAvailable`、`pool.js` 的 `shopItemsByTier`）保留 —— **之后的刷新仍然不会出现空库存的装备**。测试：`test/match/shared-stock.test.js` 改写了原先钉住拒绝的两条、新增一条专测本规则。golden 未受影响。**#631（凯瑟琳【定向投放】可刷突变细胞）仍单独待办** —— 它只是 `data/choices.json` 的白名单，而 `data/` 是生成物，得从 `tools/build-data.mjs` 走 + 离线重建。

- **凯瑟琳【定向投放】刷突变细胞（#631）已落地（2026-10-16）**：机制按上游原样移植 —— `server/match/match/spDraft.js` 的 `rollItemId` 认池子的 `also` 列表（追加进该池子自己的抽取；不在 `shopItemsByTier` 里，所以商店装备格依旧不出售；它没有上限，所以总抽得到），构建器里写上 `pool_equip_kathe.also = ['chess_item_5_08_e_a']`。
  **数据的重建方式要留意**：本机的 `.cache/gamedata` 几乎为空，而取数地址是 `master`（没钉版本）—— 联网重建会把官方新版本的漂移一并带进来（实测：`chess.json` / `backups.json` / `enemies.json` / `tokens.json` 四个无关文件也变了）。所以只**保留了构建器自己写出的 `data/choices.json`**（差异仅一处 `also`），四个漂移文件已撤回；测试人员可在**缓存与数据同版本**的机器上跑 `node tools/build-data.mjs --offline` 复核：应为**零差异**。

- **多语言配音（英语 / 韩语 / 本土语言，`8eb7f701` + `d93d6d30`）—— 卡在素材，待单独一轮。** 我们现有日语 `audio.voiceJp`（默认）+ 中文 `audio.voice` 两套（设置「语音语言」二选一）；上游这一条加 **`audio.voiceEn`（182 名）/ `audio.voiceKr`（182）/ `audio.voiceNative`** 三套，代码在 `public/js/audio.js` + 设置 UI（另加逐人试听），清单在 `data/assets.json`（`d93d6d30` 只动了这一个文件）。**本机没有可提取的语音源**（`public/assets/local/audio`、`.cache/official-voice` 均不存在）—— 得先从官方客户端提取（或拿维护者的完整素材包）并**先推中继**，然后才能落代码 + 清单；否则设置里会多出“能选却没声音”的选项。

- **① 流动水面 —— 收尾已完成（2026-10-16）**：模块里抽出 `waterParamValues(info)` 与 `applyWaterParams(material, info)`，`waterMaterial`（棋盘水格）与 `sceneWaterMaterial`（场景水面）**共用同一套取参**；`scene.js` 在拿到那张图的水材质记录后，把它应用给棋盘的水格（上游 0.3.0：「棋盘上的水格和场景的水面用同一种水」）。**没有记录时逐像素不变**（棋盘水的焦散色调按默认倍率保持原样）；新增测试 `test/render/board3d-scene.test.js`（默认 → 按图 → 清空）。

### 射程按敌人 0.1 碰撞箱（`5bf337a5`）—— **已落地（2026-10-16）**

- 核心**全部自动合并**：`constants.js` 新增 `ENEMY_COLLIDER_RADIUS = 0.1`；`body.js` 新增 `colliderKeys` 与 `bodyInRange`（点状敌人用 0.1 半径的圆与范围格相交；巨型单位与同盟仍用 `bodyKeys` 的格子）；`battle/queries.js` 的范围桶改走 `bodyInRange`（格子判定一侧保留 `bodyInKeys`）；`Battle.js`、`battle/blocking.js`、`content/bonds/addon/battle.js` 与 11 个 kit 的 `bodyInKeys → bodyInRange` 调用点。
- 上游的 `shared/plugins/steps.js` 依赖（`op-ifrit.js` 的一行 import）在本分支**未被使用**，已丢弃（同投石机那次的内联思路）。
- **那 4 条红不是射程造成的**：用干净 worktree 二分，锁定本会话的 **`5c650a9b`（攻击追完 / attack commitment）** —— 它的**父提交**上 `pathing` 连跑三次全绿，它自己连跑三次全红；把它的两个文件（`ai.js` + `lifecycle.js`）**一起**退回即转绿（单独退任一个仍红 ⇒ 改动横跨两文件）。这也解释了乌尔比安 S3「移动/返回」那条。
- **真正的解药是上游紧接着的对补提交 `6aaaebbf`**（"the full-suite fixes after the round-40 merges — **a locked enemy swing still strikes its blocker whatever its range**"，正是箱子的症状），已作为 `b0adce4f` 并入 → `test/sim` **912/912 全绿**。随后射程本体完整并入（`5d75096a` + golden `5553b729`）→ `test/sim` **918/918**。
- **方法学（已写进本文件顶部流程）**：主树里的「逐文件回退」骗过我两次（同批的测试文件把它盖掉）—— **worktree 二分才是权威**；并且**任何 sim 改动都要跑全量 `test/sim`**，这次逮到的恰好是唯一没跑的那条。
- 同批补回的**文档半片**：`docs/design/engine.md` 的 Engine helpers 与 `docs/SIM.md` 的 helper 表都补回 `keepDir`（野鬃那次漏掉的文档侧）—— 守卫 `` `battle.push(e, force, { …, keepDir })` `` 因此转绿。

### #631 的另外半片（测试与文档）—— 已补齐（2026-10-16）

- 我先前只搬了 `72ebd9f3` 的**机制与数据**（`spDraft.js` 的 `also` + `build-data.mjs` + `data/choices.json`），**漏了它同批的测试与文档** → 全量套件里 `test/match/pool.test.js`（effect-only 物品不得进商店池）与 `test/match/feedback5-cathy-pool.test.js` 两条红。
- 已补：两条测试改为「凯瑟琳的池子可刷突变细胞、其余商店池与商店格子仍然不可」；`test/content/bands.test.js` 与 `test/ui/feedback1-offers.test.js` 的同一断言同步；`docs/PLAYING.md` 的「突变细胞只来自昆图斯的策略」→「…来自昆图斯的策略，也会出现在凯瑟琳【定向投放】里（调度中心仍不出售）」，并同步 `test/docs-consistency.test.js` 的守卫。
- `72ebd9f3` 的**另一半仍然不并**：共享库存欠账（#624，`itemPool.debt`、`player/acquire|economy|items|prep`、`invariants.js`、`test/match/shared-stock.test.js`）—— 那是 §0「上游道具牌库把白给装备也卡库存」的正题，我们按**方案 A** 自行处理（已显示的卡不再因共享库存耗尽而拒绝）。
- 提醒：`b0adce4f` 里 `test/local-extract.test.js` 的两处期望属于 **`33bf08d0`（射击台用官方模型）**，我们不并它；已把那两处退回，等 `33bf08d0` 自己那一轮一并进来。

### 官方战斗特效（上游 0.3.0 / `ffd6d250` 一带，2026-10-16 → **已并入 master 并上线**）

**目标（owner 2026-10-16）**：并上游 0.3.0 的官方战斗特效（`tools/local-extract/fx.py` + `public/js/render/vfx/**` + 设置「官方特效」），**把我们自研的双层特效降为兜底**，不是二选一。

> **状态（2026-10-16 夜补记）**：这一批**已在 `master` 上**（不是分支了）——客户端接线（`app.js` / `units.js` / `spine.js` / `ui/settings.js` + i18n）全部完成、全量套件转绿、并入 master 并部署（本文件后面「官方特效：待修清单」§0 记了随后的还原度修复）。原「分支 `fx-official`」的措辞仅保留在下面的过程记录里。

**落地过程（当时在 `fx-official` 分支做，随后并入 master）**：

1. **设计文档 §32 + §33 一并携带**（`3cc1a732`）：按 owner 决定开始携带 `docs/history/0.3.0.md`（我们的 §32）；`docs/design/vfx-format.md`（§33）随之落地 —— §32 的正文自己就引用 §33，两者必须同时。`test/docs-paths.test.js` 里我先前加的 `ABSENT` 豁免表**已撤掉**，守卫恢复满强度。
2. **提取器**（`a6be3f02` → `74d0c116`）：`fx.py` + `extract.py --only fx --fx-set used` ✓，后一条把它**追平到上游 HEAD**（清单拆成 `data/local-fx.json` ✓、`index.json` v3 ✓、四个骨骼影响 ✓）。**第一代（Phase 1a）会把清单写进 `local-assets.json` 而不写 `local-fx.json`，与稍后的运行时对不上** —— 这是升级的原因。
3. **运行时**：`public/js/render/vfx/**` 26 个文件 / 625 KB + 19 个 vfx 测试 + `tools/vfx-skill-coverage.mjs`，**整取上游 HEAD**（`8e543cfb`）。好消息：`vfx/` 自身**自洽**（不 import 我们的模块，是别人 import 它）。
4. **sim 侧管道**（`78eed2bc` + golden `c2d0aa36`）：`castSlot` / `cast` 事件、`layerView`/`chargeView` 进快照、`bubble`/`billro` 的 fx 载荷字段。**变化横跨两文件/多文件时单独退一个无效** ✓；这次改动让 golden 漂移，已**先归因**（只退 `server/sim` → 摘要**零漂移** ✓）再**单独重算** ✓。
5. **设置模型**（`d175e8aa`）：`officialFx`（auto/off/lite/full）+ `OFFICIAL_FX_MODES`，与我们**只保留日/中语音**的设置并存。
6. **`fx/numbers.js`**（`77a84592`）：加上游的 `o.noSpark`（官方特效画了这次打击时不再画火光/斩击）。**更正（2026-10-16 夜）**：当时「保住我们自研干员手绘的身位打击（`render/fx/hits.js`）」已被 owner 撤销——`hits.js` 整体删除，自研干员与全名册一样：有官方特效走官方，否则走**程序化**（见本文件 §0 与 OUR-FEATURES §2）。
7. **服务端**（`a3c204bc`）：`data/local-fx.json` 作为**独立清单**分发（`VIEW_MANIFESTS` + `UNLOADED_DATA` + 缺文件时回空清单、永不 404 ✓）。

**素材（本机实测）**：`--only fx --fx-set used` → **3,565 prefabs / 3,143 textures / 1,113 meshes / 12,659 个文件 / 231.5 MB / 244 秒** ✓。上游**自己也把 fx 素材放进仓库**（只忽略 per-machine 的 `data/local-fx.json` ✓），中继是裸仓库、push 即部署 ✓ ⇒ 「先推中继」= 素材进 git ✓。少数 trail prefab 报 `AttributeError`（上游提取器的毛病，非致命）。

**方法学（重要，已两次踩中）**：
- **不要整取上游文件、也不要用 `git apply --3way` 整块应用** —— 上游的 hunk 里混着与特效无关的改动，还有**删掉我们自研功能**的地方 ✗。实测：`server/http/static.js` 用 `--3way` 把**整个插件系统（DESIGN §32）**的文档带进来（那个系统我们根本没并、模块还删了）✗，只能回退手改。
- **可靠做法**：`git diff HEAD <上游> -- 文件`（正向）→ 关键词过滤只留特效 hunk → 逐条人工确认 → 应用。工具留在临时目录（`_fxapply.py`，含 `--check` 预演）。**混合 hunk（上游删我们东西的）必须手改** ✓。
- **提取器测试要跑在仓库自己的 `.venv` 里**（`fx.py` 里那段 helper 用了 Python 3.12 的 f-string 语法；系统 `python` 是 3.8 ✗）—— 两个提取器测试已改成优先用 `.venv/Scripts/python.exe` ✓。

**客户端接线（已全部完成，2026-10-16）**：`public/js/render/app.js`（**逐 hunk 手并**：56 hunk / 25 像 fx，混着我们自己的 `projSpeed`、`mysticEnergy` 等 ✗）、`units.js`、`spine.js`、`ui/settings.js`（「官方特效：自动 / 关闭 / 精简 / 完整」，只有本机提取过才显示）+ i18n 词条（`public/i18n/en.json` 的「官方特效」，中文为源串）✓ —— 随后全量套件转绿 → **并入 `master`** ✓ → 已上线 ✓。

**收尾清单（2026-10-16 夜复核，全部已结）**：

- 已做完：运行时 ✓、sim 管道 + golden（先归因零漂移 ✓、单独重算 ✓）、设置模型 + 设置界面 + i18n ✓、提取器升级 ✓、服务端分发 `local-fx.json` ✓、素材 ✓、`units.js` 骨骼挂点 ✓、**`app.js` 挂载 ✓**（上游本来就是「官方接管则跳过、否则走我们的」⇒ 自研干员自动保留兜底 ✓，无需补丁 ✓）。
- **原「剩余 3 处测试期望」已全部转绿**：① `test/render/board3d-extract.test.js` 的 WebP 名单（`mesh/trap_110/TX_trap_1106_achplat`，mode `lossy`）✓；② `test/render/board3d-scene.test.js` 的同一性断言改为**比行为**（新版把 `derive_normal_rg` 换了实现）✓；③ `test/render/token-wang-stone.test.js` 的望棋子模型 ✓ —— 本机 `data/local-assets.json` 补回 `spine/token/*` 组后转绿（并集语义与踩坑见 [`docs/ASSETS.md`](ASSETS.md)「The committed manifest and the served manifests」）。
- **未做 → 已做**：`public/js/ui/settings.js` 的「官方特效」行与 i18n 词条 ✓（见上）。
- **部署注意（仍然有效）**：`data/local-fx.json`（9,243 条 / 1.23 MB）按设计是 per-machine + gitignored ✓；**另一台机器没有它就看不到官方特效**（服务端回空清单、客户端静默回兜底，不报错）。部署时在那台跑一次提取，或把这份清单带上去 ✓（已写进 [`docs/DEPLOY.md`](DEPLOY.md) 与 HANDOVER §9）。
- **两个 `.venv` 依赖**：`test/local-extract*.test.js`、`test/render/board3d-*.test.js` 都改成**优先用仓库 `.venv`** ✓（新版 helper 用了 Python 3.12 的 f-string 语法，系统 `python` 是 3.8 ✗）。

**并入 master 之后的当日收尾（2026-10-16，全部在 `master` 上）**：

| 提交 | 内容 |
|---|---|
| `7f3ae642` | `SpineActor.strikePose()`（出手帧挂点）+ `app.js` `NO_SPARK`（半个 hunk 的两个代表）+ dev `fx-viewer` 画干员模型与实时骨骼 |
| `b28cc60e` `102e4418` `05a9fd58` | 逐人官方特效 QA：B1（术士/狙击）、B2（近卫/重装/先锋）、B3（辅助/医疗/特种/召唤物）、B4（105 个敌人 + 7 个 boss / 19 技能），结论：有官方数据的一律被官方层接管、特效落在各自挂点 |
| `7b185854` | **自研干员全面改用官方特效**：删 `render/fx/hits.js`（`FX_HITS`）、`FX_OFFICIAL` 跳过 `CUSTOM_CHESS`（`identifier ≥ 900`）、清理各 kind 的 `local.byOp` 手写层；澄闪普攻钉成官方 `Attack_Start→Attack→Attack_End`、结城理 `Die→Stun`、S3 的 P1→P2 拆成 `ChangeBegin/ChangeEnd`；新增离线工具 `tools/refresh-anim-roles.mjs` + `test/asset-anim-roles.test.js` |
| `dd2d60b3` | 一次攻击按 `begin → loop → end` 三段时序播放（`SpineActor._attackSeq` / `_playAttackAt`）+ `test/render/attack-begin.test.js` |
| `0cb74a2b` | **按攻击节奏提前起手**：渲染只提前 ~0.1–0.2 游戏秒看到 `atk`，短于起手剪影 ⇒ `UnitView._predictWindUp` 在 `lastAtk + atkInterval` 前 `strikeSeq/ts` 起手 + `test/render/attack-rhythm.test.js` |
| `7f0b598e` | **回环射手的回收动画**：`wiring._fly` 支持 `AdvancedMovement.comeBack`（命中后飞回射手挂点，`delayAfterReached` / `comeBackSpeedScale`） |
| `ae43f70a` | **护盾循环跟着护盾结束**：`LOOP_BUFF_BOUND` + `TalentFx.status`（原「破盾就停」的闸测的是天赋下标，对干员从不生效） |
| `f6618c32` | 文档：本机 `data/local-assets.json` 的并集语义与踩坑（见 ASSETS） |
| `df3b1897` | 记录 owner 2026-10-16 对两条护盾报障的决定：**保持官方现状，不再顺手修** |
| `879ea5ad` + `ea5ccf2f` | **望 S3 每次落子额外至多 3 枚跟子**（官方 S3 文案；此前做成「整局 3 枚」）+ golden 归因后重新生成 |




### 设计文档：§32 与 §33 一并落地（2026-10-16）

- 上游把 0.3.0 的修订史写成 `docs/history/0.3.0.md`（**§32**）、把官方特效的格式写成 `docs/design/vfx-format.md`（**§33**）。我们此前删掉 0.3.0.md ✗，于是合并内容里成千条 `§32.14.*` / `§33.*` 引用全部悬空，守卫只能靠豁免兜 ✗。
- **决定（owner 2026-10-16「开始携带 0.3.0.md」）**：**携带 `docs/history/0.3.0.md` = 我们的 §32** ✓ —— 与我们一向携带 0.2.3–0.2.6 的做法一致 ✓。§33 必须**同时**落地（§32 的正文自己就引用 §33 ✓），`docs/DESIGN.md` 索引补 `| §32 |` 与 `| §33 |` 两行，`test/docs-paths.test.js` 里那张 `ABSENT` 豁免表**撤掉** —— 守卫恢复满强度 ✓（§32 的修订史里没有 `DESIGN §N` 形式的引用 ✓，不会连带引爆更多）。
- 后续 0.3.0 的文档更新照此办理：该文件是**上游的修订史**，冲突时**以上游为准** ✓；我们的自研说明只写在 `docs/MATCHMAKING.md` 与 `docs/OUR-FEATURES.md` ✓。

---

## 官方特效：待修清单（2026-10-16 夜，owner 报障 → 交下一会话）

> **状态**：官方特效已上线（`master` = `6cc99417`，盒子 build `db7299140227`）；线上**无 outage**（客户端已回退 + `gpu` 修复已上线）。**本清单是剩下的"还原度缺陷"**，不影响可玩性。

### 0. 复核结论（2026-10-16 夜，第二会话）—— §2 的「提取侧」判断**已证伪**，真因在运行时，已修

一份逐项复核（本机 `master`，`node --test test/render/…` + 浏览器实测）：

- **§2 的「`follow` 恒无」不成立。** `public/assets/local/fx/index.json`（v3，与 `HEAD` blob 哈希一致）里 **4,557 个 prefab 摘要中 4,169 条带 `spawn`、866 条带 `follow`**（取值 0–18：`SPECIAL_0` 472、`SPECIAL_1` 162、`MUZZLE` 65、`HIT` 8 …）。`fx.py` 的 `prefab_anchor` 与客户端数据（`FollowMountPoint` / `_mountPointType`）一致，**提取没有丢**。文中的 "4,169 spawn / 0 follow" 只有前半句对得上。
- **`follow` 从第一次提取起就在**：`e6676f11`（首次提取）与 `df8b1de6`（补天赋表）两个 blob 都带 866 条 `follow`；文档 `c2394421` 提交时产物已是这样，所以那不是「待修」的提取问题。**不必重跑提取。**
- **真的缺陷：`SpineActor.strikePose()` 缺失。** `public/js/render/units.js` 的 `boneOffset` 用 `typeof a.strikePose === 'function' ? a.strikePose() : null` 读「攻击剪影的出手帧（strike frame）」——但全仓库**没有任何地方定义 `strikePose`**，所以该分支恒为 `null`，`strike=true` 时永远退回到「模型当前姿态」而不是 OnAttack 那一帧。上游 `docs/history/0.3.0.md` §32.14.36 明确要求 `SpineActor.strikePose`（「a shot leaves where the clip fires whatever frame the model was last posed in」）——我们的移植**漏了这个方法**。`test/render/vfx-origins.test.js:433` 用桩 `strikePose()` 把它遮住了，所以测试一直绿。
  - 已补：`public/js/render/spine.js` 的 `SpineActor.strikePose()`（`mode === 'attack'` 时返回当前攻击剪影 `{ anim, time: entry.hits[<clip>][0] }`，否则 `null`）+ `test/render/vfx-strike-pose.test.js`（真 `SpineActor`，风起 / 攻击 / 技能 / 死亡四态）。
  - 影响面：`_fly` 的出手点、`playOn`/`_casts` 的 `strike` 施法/枪口特效都用它——修好后出手点落在「剪影出手那一帧」的挂点上（上游 0.3.0 的 灰毫 / 安洁莉娜 案例）。
- **dev 查看器本身会误导**：`dev/fx-viewer.html` 的 `?attack=` / `?skilldemo=` **从不画干员模型**，`wiring.pose(v)` 的 fake view 也没有 `boneOffset`，于是所有特效都按**皮肤静态点**摆放、在空场里「悬空」——看起来就像「不从法杖出 / 凭空生成」。已修：查看器现在会加载并绘制该干员的 Spine，把 `UnitView.prototype.boneOffset` 接到 fake view 上（含 `strikePose` 的出手帧），并按 `?attack=` 的节奏驱动攻击剪影。**默认开启**，`&model=0` 关闭；两个 headless 浏览器套件（`vfx-skills` / `vfx-funnels`）在 URL 里显式加了 `&model=0` 以保持旧的静态点行为。
- **另一处「半个 hunk」：`app.js` 的 `NO_SPARK` 未定义（已修）。** 官方特效接管伤害 / 治疗时，`public/js/render/app.js` 的 `dmg` / `heal` 事件分支会读 `NO_SPARK`（`fx/numbers.js` 的 `o.noSpark`：官方已画了这次打击，就不要自研的火光 / 斩击），但 `3222d54c`（挂载 `app.js`）那次**只带了引用、丢了定义** —— 这是 `npm run lint` 的 **2 个 error**，也是上一会话 `gpu is not defined` 的同型病（§6.1）。已在 `app.js` 顶部补 `const NO_SPARK = Object.freeze({ noSpark: true })`；`npx eslint .` 现在 **0 error**。（它只在官方特效开启、且有 dmg / heal 事件时触发；`npm run ci` 的 lint 步本该拦住它。）
- **B1（术士 / 狙击）逐人实测**：33 名有官方特效的术士 / 狙击跑 `?attack=` 定点采样，**每一条弹道首帧都落在某个挂点（muzzle / SPECIAL_n）0.03–0.71 格内**（多数 ≤0.36），**没有半空生成**。**§1 的两条症状在本机、当前树上都复现不出来**；`野鬃 S2`（`char_496_wildmn`）的 buff 特效也只在脚下一个紧凑爆点。

- **自研干员的特效：全面改用官方特效，自研的抛弃（owner 2026-10-16）**。8 名自研干员（阿斯卡纶 / 结城理 / 予愿安洁莉娜 / 澄闪 / 娜仁图亚 / 凯尔希·思衡托 / 克莱门莎 / 望）本就是官方角色、官方 prefab 齐全，官方层（`render/vfx/**`）已覆盖其攻击与技能。**删掉了 fork 的自研兜底**：`public/js/render/fx/hits.js`（`FX_HITS` 手绘普攻打击，7 名）整体移除（调用点 `numbers.js` / `projectiles.js` / `system.js` / `fx.js` 一并清），8 名干员从 `FX_OFFICIAL` 移除（`tools/build-fx-official.mjs` 按 `identifier ≥ 900` 跳过 `CUSTOM_CHESS`；表 56 → 50），并删掉 `aoe` / `strike` / `takeoff` / `champagneBomb` / `kalts2Heal` / `kalts2Damage` 里给自研干员的 `local.byOp` 手写层。**无官方特效时统一回退程序化原型**（与官方名册一致）。文档：OUR-FEATURES §2、ASSETS / DEVELOPMENT / HANDOVER / AI-WORKFLOW、MATCHMAKING §35.12「后续」均已更新。

**给下一会话**：§2 的表格与 §3 的「重跑提取」步骤**作废**；真问题已按上文修掉。若在**盒子 / 桌面 store** 上仍看到「弹道悬空」，先确认那台机器的 `master` 是否含本修复，再按 §5 的环境注意项排查（`data/local-fx.json` 是 per-machine）。

### 0.1 运行时补齐：回环射手的回程（owner 报障 2026-10-16 夜）

- **症状**：回环射手（跃跃 `char_4100_caper` / 娜仁图亚 `char_4138_narant`）的**攻击物没有回收动画** —— 飞出去就没回来。
- **根源**：官方 projectile 的 `movement` 是 `AdvancedMovement` 且 **`comeBack: 1`**（`speed` 15、`comeBackSpeedScale` 0.25 ⇒ 回旋 3.75，与 PRTS「投掷 15 / 回旋 3.75」一致、`delayAfterReached` 0.01），而 `render/vfx/wiring.js` 的 `_fly` 只画了去程（`flight.dur` 一到就 `finish`）。官方开着时**官方层接管**了这次攻击，程序化回环（`fx/projectiles.js _stepBoomerang`，自带回程）就不再画 ⇒ 去程有、回程没有。
- **修**：`_fly` 认出 `movement.comeBack === 1` 时，命中之后（`delayAfterReached` 起）把飞行特效**飞回射手当前挂点**，速度 `speed × comeBackSpeedScale`，回到手上才 `stop`；命中仍落在目标（`dur`）。`test/render/vfx-origins.test.js` 新增一条（去程 → 命中不停 → 回程靠近 → 收回）。

### 0.2 护盾动画：循环要跟着护盾一起结束（owner 报障 2026-10-16 夜）

- **症状**：owner 报「有护盾的干员在没开技能的时候护盾动画显示了」，点名 **卡涅利安 `char_426_billro`** 和 **空弦 `char_332_archet`**，并说明是「刚部署 / 准备阶段」就看到。
- **先查清了「是谁画的」**（`public/assets/local/fx/index.json` + sim 事件实测）：

  | 干员 | 部署时画护盾的东西 | 官方数据怎么说的 |
  |---|---|---|
  | 卡涅利安 | 官方 prefab 循环 `billro_beidong_buff_03`（prefab 节点名里就有 **`hudun_01`（护盾）**），由 `Modes/Default/Trait_Eff` 与 `Modes/S1_Enhance/Trait_Eff` 的 `PassiveBuffAbility` 播 | **这是阵法术师「特性」的守卫外观**，官方就是在**技能未开启**（Default 模式）时播；我们的 sim 同态（`professions.js installPhalanx` 的 `trait:phalanxGuard` 只在技能关闭时挂着），**与官方一致，未改** |
  | 空弦 | 天赋 2（铁弦）的循环 `archet_buff_01_start` + sim 自己的 `fx('shield')`（本地美术层 `FX_OFFICIAL` 的 `archet_glow` / `ray_70`） | 铁弦是「**部署时**获得 1 层护盾」的天赋 ⇒ 部署时就有护盾**是官方的**；但护盾被一次伤害吃掉后，循环**必须跟着停** |

- **真缺陷**：官方 prefab 里「`PassiveBuffAbility` 的循环跟着它建的 buff 走」，而我们的提取看不见结束那个 buff 的脚本，于是这些模板都是 `life: { type: 'INFINITY' }` —— 循环会一直播到干员倒下。运行时本来有一道「护盾破了就停」的闸（`talentfx._inForce`：`U.broken && /shield|barrier/i.test(b.key)`），但它测的是 **binding 的 key**，在真实索引里那是**天赋下标**（空弦是 `'2'`）或能力名（卡涅利安是 `'Default'`），于是这道闸对干员**从不生效**（它其实是给敌人的 `Shield` 天赋写的）。**空弦的护盾特效因此在护盾被吃掉后仍然一直显示** —— 这才是「没护盾了还有护盾动画」的真身。sim 侧的信号是齐的：吃完那次伤害会发 `['status', id, 'talent:archet_shield', 0]` + `['fx','shieldBreak',…]`（本机实测）。
- **修**：新增一张显式小表 `talents.js` **`LOOP_BUFF_BOUND`**（单位 → binding key → sim 的 buff/状态名），binding 上带 `follow`；`talentfx.status(v,key,on)` 记录 sim 的状态事件，`_inForce` 见到 `follow` 且该状态报过就以它为准（循环跟着 buff 起落；没报过的回放视图仍走「站着就播」的官方规则，不回归）。表里目前只有空弦这一条（名册里唯一「可消耗护盾 + 官方循环」的组合）。`test/render/vfx-buff-layers.test.js` + `test/render/vfx-skills.test.js`（对真索引的 pin）各加一条。
- **owner 决定（2026-10-16）**：卡涅利安与空弦这两条**保持现状，不管了**（卡涅利安是官方行为——阵法术师特性守卫，技能关着才播；空弦部署时 sim 多发的那次自研 `fx('shield')` 也不动）。**别再"顺手修"这两处**；要改必须由 owner 重新点名。

### 1. 症状（owner 实测，本机 `localhost:3000/dev/fx-viewer.html` 可复现）

- **术士的普攻弹道不从法杖出，而是"半空直接生成"** ✗。
- **野鬃的技能特效疑似"铺满整行"** ✗（未真机确认，属同一类待查）。
- owner 要求：**所有干员（含自造）逐个真机对照官方** —— 见第 4 节的批次计划。

### 2. ~~已定案：缺陷在**提取侧**（行号级证据）~~ —— **已证伪，见上 §0**

| 事实 | 证据 |
|---|---|
| 上游提取器**会**输出跟随挂点 | `tools/local-extract/fx.py:1081` `spawn, follow = prefab_anchor(nodes)`；`:1084` `**({'follow': follow} if follow is not None else {})` —— **只在非 None 时写入** |
| 我们的产物里 `spawn` 有、**`follow` 恒无** | `public/assets/local/fx/index.json`（v3，517 单元 / 4,557 prefab 摘要）：带 `spawn` 的 **4,169** 条，带 **`follow` 的 0 条** ✗ |
| 弹道行为里**没有**跟随类 | `index.projectiles['projectile_chr_gdglow'].behaviours` = `SimpleProjectile` / `EffectBehaviour` / `AdvancedMovement`；全 542 条的 top 行为里**没有** FollowMountPoint 类 ✗ |
| 运行时靠它挂到骨骼 | `public/js/render/vfx/wiring.js:484` `const pos = P.fmp ? mountPoint(skin, P.fmp.mount, pose) : spawnPoint(skin, P.spawn, pose);` ⇒ 没有 `follow` ⇒ `P.fmp` 恒空 ⇒ 弹道走默认点 = **半空** |

**数据侧本身是好的**（可用于排除怀疑）：`index.units['char_377_gdglow'].modes[0].attack` 带
`projectileKey: "projectile_chr_gdglow"`、`mount: "MUZZLE"`（**字符串**）、`node: "Modes/Default/Body/Attack"`、`cast: [{directionType, effects:["gdglow_attack_start_01"], …}]` —— 施法/命中位置正确 ✓。

### 3. ~~下一步（一条命令就能定案）~~ —— **已作废（前提不成立）；真因与修复见上 §0**

1. 读 `tools/local-extract/fx.py` 的 **`def prefab_anchor`**，看它判定"跟随挂点"用的**行为类名 / 字段名**；
2. 二选一（都不会碰其它系统）：
   - **类名/字段与客户端版本不符** → 改 `fx.py` → 重跑提取；
   - **我们这次提取落了这一项** → 补齐后重跑提取。
3. 重跑：`.venv\Scripts\python.exe tools/local-extract/extract.py --only fx --fx-set used --game "D:\明日方舟\Hypergryph Launcher\games\Arknights\Arknights_Data\StreamingAssets\AB\Windows" --out <临时目录>/public/assets/local --manifest <临时目录>/data/local-assets.json`（≈5 分钟），再只替换 `public/assets/local/fx/{index.json,textures.json,tex,prefabs,mesh}`（**保留**自研的 119 个 `<stem>/` 目录）与 `data/local-fx.json`；
4. **验收**：`npm run ci`（**含 `tsc --checkJs`** —— 上次 `gpu is not defined` 就是它本该抓到的 ✗）+ `test/render/vfx-*.test.js` + 真机对照；
5. 部署见 `docs/AI-WORKFLOW.md` (d)（**公告 → 等 30 s → 增量 → 重启 → 验证 build 变化**）。

### 4. 逐人真机对照（owner 要求，含自造干员）

用本机查看器（`node server/index.js` 后开）：

- `http://localhost:3000/dev/fx-viewer.html?attack=<charId>` —— **普攻/弹道起点**演示；
- `?skilldemo=<charId>&s=<技能位>` —— **技能特效**演示；
- `?unit=<charId>` —— 画出该干员的**挂点标记**（`mounts.js` 的 `POINT_NAMES`：`muzzle: Muzzle/MuzzlePoint/muzzle`）；
- 逐帧取证：`window.__fx = { play, step, render, stats, skillDemo, setTier, keys }`（`tools.browser.evaluate({ tabID, script })` 驱动，注意这套运行时**没有定时器**，不要 `setTimeout`）。
- **查看器现在会画出干员模型**（2026-10-16 夜）：加载该干员的 Spine，把 `UnitView.boneOffset` 接到演示用的 view 上、并按演示节奏驱动攻击剪影，于是特效按**实时骨骼 / 出手帧**摆放（此前只按皮肤静态点摆、场上没有模型 ⇒ 看起来「凭空出现」）。默认开启；`&model=0` 关掉（headless 浏览器套件用它保持旧的静态点行为）。新增只读探针：`__fx.modelInfo()`、`__fx.demoViews()`、`__fx.loadUnitModel(id)`。

批次：**B1 术士/狙击 → B2 近卫/重装/先锋 → B3 辅助/医疗/特种/召唤物（含望的棋子）→ B4 敌人/BOSS**；每批产出"干员 / 看到的问题 / 对照官方结论 / 截图"清单。自造干员（`char_377_gdglow` 澄闪、`char_1015_aglna2`、`char_1052_kalts2`、`char_4132_ascln`、`char_4138_narant` 娜仁图亚、`token_10064_wang_stone1` 望的棋子 …）**必查** ✓。

**B1 进度（2026-10-16 夜）**：33 名有官方特效的**术士 / 狙击**逐一跑 `?attack=` 定点采样，**每一条弹道的首帧都落在某个挂点（muzzle / SPECIAL_n）0.03–0.71 格内**（多数 ≤0.36），**没有半空生成**；官方特效对这些干员**全部接管**（未回退到自研）。仍未做：需要 owner 在**真机 / 官方录像**前逐人核对「好不好看 / 对不对味」（本会话只能核对几何与接管与否）。

**B2 进度（2026-10-16 夜）**：**近卫 / 重装 / 先锋 47 名**逐一跑 `?attack=`（近战用 `kind=none`）定点采样 —— **全部官方接管**，`*_attack_*_start` / `*_weapon*` 的**武器 / 出手特效都落在挂点 0–0.3 格**，命中的 hit 特效落在目标身上；**没有几何异常**。技能侧再跑 **123 组（干员 × 技能）**：**没有一组是空的**（都播出官方特效）；两组只出通用效果 —— **古米**（`char_196_sunbr`，`common_hit_01`）与**蛇屠箱 S2**（`char_150_snakek`，`common_ignite_defense` + `common_empty` + `common_hit_01`）；一组（**斯卡蒂** 三个技能）有特效离双方都 >1.5 格，看图是她的大剑光/命中（宽幅斩击）。**没有武器特效的几名**（古米 / 塞雷娅 / 艾丝黛尔 / 蛇屠箱 / 玛恩纳）已按官方数据核对：它们的攻击能力**只有 hit 行**，或 cast 就是 `common_empty`（官方本来就不画）——**不是缺失**。

**B3 进度（2026-10-16 夜）**：**辅助 / 医疗 / 特种 40 名** + **召唤物（token）57 个**。干员：`?attack=` 采样（医疗 / 远程用 `arrow`，近战用 `none`）**全部官方接管**，武器 / 出手特效 0–0.34 格挂点、命中在目标；**104 组技能全绿**（0 空 / 0 只出通用 / 0 越位）。召唤物：**57 个 token 没有任何缺失的 prefab 键**（17 个「无声明键」的靠宿主技能 / 装置驱动，如 凛御银灰的三只鹰、米诺斯装置，属正常）；有真实攻击的 **32 个**逐一跑攻击采样，**全部接管**——带弹道的（麦哲伦无人机 2/3、温蒂炮、令 S2 魂、凛冬子弓、雷达站 2/3）都从 **muzzle** 飞出、命中在目标，近战 token 的出手在 s0–s3 挂点。**望的棋子 `token_10064_wang_stone1`** 有声明键且无缺失，其自身特效走 kit（`wangStoneBlast`，`test/render/token-wang-stone.test.js`，本机因缺该模型骨架而跳过）。

**B4 进度（2026-10-16 夜）**：**敌人 249 个中 105 个有攻击能力**，逐一跑 `?attack=`（远程 / 有弹道用 `arrow`，近战用 `none`）—— **0 空**（每个至少播出官方命中）；出手 / 弹道特效落在挂点 0–0.34 格、命中在目标；14 个「只出 `common_*`」的正是官方的**共享箭头 / 法术轨迹 + 通用敌人命中**（隐形弩手、术师等），属正常。**BOSS 7 个唯一（`data/bosses.json` 的 10 条）** 共跑 **19 组技能**（每个最多 4 个）—— **0 空**；被判「远离双方」的是 **昆图斯** 与 **阿利斯泰尔** 的**大范围 / 全场技能**（左右手起手、range、召唤），符合 BOSS 特技的预期，不是错位。**B4 无几何缺陷。**

**QA 结论（B1–B4 全跑完）**：四个批次合计 **约 165 名干员 / 召唤物 × 攻击 + 约 350 组技能**（外加 105 个敌人 + 7 个 BOSS），**没有发现任何「特效不在挂点上 / 弹道半空 / 该有的特效缺失」的几何缺陷** —— 官方特效层对**全部**有官方数据的单位**接管**（未回退自研），出手 / 武器特效稳定落在 muzzle / SPECIAL_n（0–0.34 格）、命中落在目标、范围 / 大范围技能落点符合预期。**需要 owner 做的**只剩「好不好看 / 对不对味」的观感核对（真机 / 官方录像）；`dev/fx-viewer.html` 现在能画模型 + 实时骨骼，可直接逐人比对。

### 5. 环境与坑（新会话直接可用）

- **Python**：用仓库自己的 `.venv`（3.12 + UnityPy 1.25.4 / lz4 / Pillow ✓）；系统 `python` 是 **3.8** ✗，跑新版 helper 会 `SyntaxError` ✗。四个提取类测试已改成优先用 `.venv` ✓。
- **官方表**（天赋链接需要）：`.cache/gamedata/excel/{character_table,battle_equip_table,uniequip_table}.json` ✓ 已下好 ✓（直连 github 会挂 ✗ → 走 `https://gh-proxy.com/https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/…` ✓ 并**设超时** ✓）。有了它们才会出现 `talents of N units`（先前是 `0` ✗）。
- **中文请求体**：**不要过 PowerShell 管道** ✗（会变 `?` ✗）→ 一律写文件 + `curl -H 'Content-Type: application/json' --data-binary @文件` ✓（公告那次就是这么栽的 ✗）。
- **部署前**：**必须 `npm run ci`**（typecheck 能抓住"未声明变量"这类 ✗ —— 上次线上 `gpu is not defined` 就是它本该拦下的 ✗）；`public/js` 是静态文件 ✓ 可单独热更（无需重启 ✓）。
- **盒子**：`ssh -p 45217 root@183.66.27.19` ✓（**密码认证** ✗ → 非交互需 `SSH_ASKPASS` + `SSH_ASKPASS_REQUIRE=force` ✓）；部署树 `/www/wwwroot/Stronghold-Protocol` ✓（**无 `.git`** ✗ → 只能 tar/scp ✓）；`data/local-fx.json` 是 **per-machine** ✓，不上传则服务端回空清单 → 客户端**看不到官方特效** ✗。
- **远端**：`github` 走**本地代理 127.0.0.1** ✗ —— 代理没开时只推 `gitee`（`git push gitee HEAD:refs/heads/master` ✓）；`relay` 用 `node tools/push-assets-relay.mjs` ✓（**素材先推中继** ✓）。

### 6. 两条方法学（本次踩过的）

1. **部分 hunk = 线上事故** ✗：并上游文件时只应用了一半（带了用它的行、丢了声明它的行 ✗）→ ES 模块严格模式直接抛错 ✗ → 整站挂掉 ✓。**任何并进来的 `public/js` 文件都要过 `npm run ci`** ✓。
2. **改 sim/com 之前先量、改完跑全量** ✓：`test/sim` 全量 + golden 先归因（只退自己的改动 → 零漂移 ✓）再单独重算 ✓。

---

## 13. v0.3.0 / v0.3.1 续并准备（2026-10-17）

> **状态：准备完成，尚未开始并入。** 本节记录基线、缺口盘点、批次顺序与验收线；并入时在下面逐批补结果（格式同 §11）。

**基线与目标**

| 项 | 值 |
|---|---|
| 我们的 `ours`（起点） | `9fa6629a`（比上游基线多 **483** 个提交） |
| 上次折叠的上游基线 | `488db49f` = v0.2.6（§11） |
| 本次拉到的上游 tip | **`6ab24682`**（`v0.3.0` tag + `0.3.1` 的 CI 修复） |
| 规模 | **406 个上游提交 / 813 个文件**；`git merge-tree --write-tree` 试合并 → **122 个冲突文件**；`check-upstream` 的 §0 命中 **20 处** |

**主题盘点（406 个提交按主题）**

| 主题 | 数量 | 处置 |
|---|---|---|
| 插件系统 / 工作台（`plugins/`、`server/studio/`、`public/studio/`、`shared/plugins/*`、DSL） | 116 | **不并**（§12 B3；owner 2026-10-16：服务器不需要）。并后核对这三块目录仍为 **0 文件** |
| vfx / 官方特效 | 57 | 多数已手植（「官方特效：待修清单」§0）；只对**增量**逐条核，见下方验收线 |
| 社区 PR 合并（`0.3.0: merge PR #…`） | 42 | **主体**，按 P1–P4 分批 |
| tests / fix / feat / CI / docs | 80 | 跟随所属批次；纯 CI 的 5 条按需（我们的测试与上游已分叉） |
| other（版本收尾、CHANGELOG、round 44/46 整合） | 111 | 逐条看；**整合提交必须拆**成单项再挑 |

**候选批次（每一项都要先核「我们是否已有」）**

- **P1 界面 / 操作**（风险最低、离 §0 最远，先做）：`#629` 悬停热键（Q/X 作用于悬停单位、W 买悬停商品）· `#630` 备战席溢出（15 格之外隐藏排队）· `#646` 部署折叠（拿起棋子折叠镜头 + 方向指示）· `#637` 单独联防助战单位的镜头 · `#618` 作战统计（opt-in，默认关）· `#622` 主浏览器机器人排练（opt-in）
- **P2 画面**：`#640` 闸门方块（官方 Particles shader；脉冲用 clip 自己的曲线）· `#636`/`#633` 秘术师能量条（**已并入** `c983ce7d`）· 其余 vfx 增量逐条对照「待修清单」§0
- **P3 规则 / 模拟**（golden 变动单独提交）：§12 B1 的剩余条目 —— 枯朽之种自毁改弹道 `a93a5d16`、攻击追击 `9f228439`、维多利亚 25 层 `16567bbe`、伊利昂木驮兽 `18cb28fe`/`d19dd600`、风丸替身对空 `e54ac351`、假想敌镜膜 `1a701241`。已落地的不再动；未落地的单独 cherry-pick
- **P4 服务端 / HTTP**（放最后）：`#649` HEAD 忽略 Range（RFC 9110）· `#654` assets-env-proxy 测试接受 Node 26 的 absolute-form
- **不并**：§0 的 20 处命中全部；英语 / 韩语 / 本土配音；道具库存池 + 欠账模型；`public/js/render/board3d/**`（整块归我们）；统计页改版；素材下载 / 导入包（与我们的中继 + SW 链重叠 —— 只挑「标题页全素材下载」里与我们的链**兼容**的那一半）

**「术士特效必须从法杖发射」——本次合并的硬验收线（owner 2026-10-17 重申）**

记录见「官方特效：待修清单」§0：真因是 **`SpineActor.strikePose()` 缺失**（`boneOffset` 读「出手帧」恒为 `null`）+ dev 查看器不画模型；修好后 B1 的 33 名术士 / 狙击逐人实测，弹道首帧落在 `MUZZLE` / `SPECIAL_n` **0.03–0.71 格**内（多数 ≤0.36），无「半空生成」。

合并时以下文件的**上游 hunk 一律先看我们的实现**，不许整块覆盖：

| 文件 | 必须保留的东西 |
|---|---|
| `public/js/render/spine.js` | `SpineActor.strikePose()`（`mode === 'attack'` → 当前攻击剪影的出手帧） |
| `public/js/render/vfx/wiring.js` | `_fly` 的 mount 点（`MUZZLE` / `SPECIAL_n` / `follow`）、`comeBack === 1` 的回程、`_casts` 的 strike 施法点 |
| `public/js/render/vfx/talents.js` | `LOOP_BUFF_BOUND`（循环跟着 sim 的 buff 起落） |
| `public/js/render/units.js` | `boneOffset` 经 `strikePose()` 取出手帧 |
| `public/js/render/app.js` | `NO_SPARK`（官方已画打击时不再叠自研火光 / 斩击） |
| `public/js/render/fx/**` | 程序化 + 官方两层分工；`hits.js` / `FX_HITS` 与自研 `local.byOp` 层**不得回来** |

每批并入后跑：`node --test test/render/vfx-*.test.js test/render/fx-local.test.js`，并用 `dev/fx-viewer.html?attack=char_377_gdglow&model=1` 手看术士普攻**从法杖出**（`&model=0` 关闭，headless 套件用它）。

**方法**（同 §12）：基于 `ours` 建 `merge-031` 分支 → 逐条 `git cherry-pick`（merge 提交 `-m 1`）→ 冲突**两边都保留**逐块解（**绝不** `--ours/--theirs`）→ 每批 `node --test` 全量 + `node tools/build-data.mjs --offline`（零漂移）→ golden 变动**单独一个提交** → 每批 `git push`（美术没动就跳过中继）→ 批前批后 `node tools/check-upstream.mjs`。

**每批验收线**

- 全量 `node --test` 绿（当前基线：**7078 / 7064 通过 / 0 失败 / 14 跳过**）
- §0 自检全空（`docs/OUR-FEATURES.md` §5 的命令逐条跑）
- 默认值不回归：`POTENTIAL_DEFAULT = POTENTIAL_MIN`、`CULTIVATE_DEFAULT = 0`、`data/tuning.json` 的 `boost` 三处仍在
- 数据可复现：`node tools/build-data.mjs --offline` **零差异**
- 术士 / 狙击弹道「从法杖出」验收线（上一节）

**下一步**：P1 → P3 → P2 → P4。

### 13.1 批次 1（低风险）— 已并入（2026-10-17）

先在 `merge-031` 分支上逐条应用，四条都过全量后并回 `ours`：

| 上游 | 内容 | 落点 / 备注 |
|---|---|---|
| `#649` (`d7069e01`) | HEAD 忽略 `Range`（RFC 9110 §14.2）：状态 / 长度 / 编码 / ETag 按完整表示返回，也不再被 Range 逼成 identity | `server/http/files.js` 1 行（`req.method === 'GET' ? req.headers.range : undefined`）+ `test/lobby.test.js` 的 Range 用例补 4 条断言（HEAD 带 Range → 200、无 `Content-Range`、`Content-Length` / `ETag` 与普通 HEAD 相同；文本资源仍按 gzip 选编码） |
| `#654` (`6d263fbc`) | assets-env-proxy 测试同时接受 Node 26 的 absolute-form 代理跳转与 CONNECT 隧道 | `test/assets-env-proxy.test.js` 原样应用（本机 Node 24 仍走 CONNECT，属前向兼容）；8/8 ✓ |
| `#637` (`c2f3c5e9`) | 单独联防助战的镜头：只有一侧有玩家时开局就框在那一半，🌓 胶囊留在那一半（GitHub #635） | `public/js/battle/observe.js` 新增 `loneHalf()` 干净应用；`public/js/screens/game.js` 冲突 1 处 —— **上游 hunk 自带 `import '../ui/pluginFrame.js'`（插件系统）**，按 §12 B3 丢弃，只取 `loneHalf` |
| `#629` (`7144acf9`) | 悬停热键：Q/X 作用于**鼠标指向**的单位、W 买**鼠标指向**的商品；旁观 / 已淘汰 / 看别人棋盘 / AI 托管时备战快捷键失效 | 9 个文件干净应用；`gameLogic/settings.js` 冲突 1 处（JSDoc 联合类型）—— **保留我们的 `voiceLang: 'cn'|'jp'`、不加 `voiceNative` / `combatMetrics`（§0）**，只加 `buy`。i18n：4 条新 msgid 按上游对应语言补进 `en/ja/ko/zh-TW`（`en --strict` 1477/1477 ✓）；README 的套件计数 6717 → 6721（`docs-consistency` 会把关）|

**验收**：全量 `node --test` **7082 / 7068 通过 / 0 失败 / 14 跳过** ✓；`npm run typecheck` 无错 ✓；`npx eslint` 0 error ✓；`i18n check en --strict` 100 % ✓；`docs-consistency` / `package`（tracked tree）全绿 ✓。

**下一批**：`#646`（部署折叠，纯客户端但面大）、`#618` / `#622`（opt-in，碰 `settings.js`）；`#630`（备战席溢出）**降到 P3** —— 它改 `player/acquire.js`，与 §0「道具库存池」相邻。

### 13.2 批次 2 — 部署折叠（PR #646 / GitHub #602，2026-10-17）

三个上游提交（`fafa23b5` 基础折叠、`a374a1c3` round 44 的 UI + 休整期 pen、`fc241089` 跟随修正）的**代码与配套测试**一起并入；`merge-tree` 里唯一冲突是 `render/app.js` 顶部的**接口注释**（我们那行过时、缺 `mysticEnergy` / `officialFx` / `pen`），取上游那版。

| 行为 | 实现 |
|---|---|
| **拿起棋子 → 商店收起 + 镜头拉近** | `ui/gameLogic/camera.js` 的 `foldCamera` 去掉「拖拽中不做」的门（原来 `busy` 直接返回 null），改为拾取 / 方向轮盘打开即折叠，放下后回到玩家**自己**的折叠状态；`render/app/tune.js` 的折叠飞行时长 |
| **休整期的敌方 pen（两道红门）** | `render/app/view.js` 的 `showsPen` / `penShown` / `flightView` + `boardArea` / `fieldRows`；pen 随战斗开始消失，下一次备战随镜头带回 |
| **镜头飞行期间每帧重判拖拽** | `render/drag.js` 的 `refresh`：手指不动时被拖的棋子 / 落点不会从手指下滑走；从 pen 返回的机位**不记得**折叠的 350 ms 飞行 |
| 用户手册 | `docs/PLAYING.md` §4 补一句（拿起自动折叠、放下复原、官方倾斜我们不做）|

**测试**：上游新增的 `test/ui/issue602-deploy-fold.test.js` + 两个 `issue5-fold-camera` / `drag` 的更新、以及 `playtest2*`（pen 归属）与 `fieldview` / `playtest5-maps`（blower 视图）的配套改动一并取；e2e 文件同时更新（opt-in）。

**验收**：全量 `node --test` **7094 / 7080 通过 / 0 失败 / 14 跳过** ✓；`npm run typecheck` 无错 ✓；`npx eslint` 0 error ✓；`i18n check en --strict` 100 % ✓。README 的套件计数随注册用例 → 6740。

> **踩坑留档**：这次一开始只取了 `public/js`，撤掉了同提交里的 `test/render/{playtest5-maps,fieldview.browser}.test.js` 等**与代码配套的视图测试** → 三条 blower 用例立刻变红（视图签名/行归属变了）。**合并上游 UI 提交时，配套测试要和代码同批取**，不能只挑 `public/js`。

### 13.3 批次 3 + 盘点（2026-10-17）

**已并**（代码与测试同批；golden 单独提交）：

| 上游 | 内容 | 备注 |
|---|---|---|
| `#615` (`e5d3a25d`) | 公开状态（public-state）的间隔从**真正广播的那一刻**起算，而不是从调用开始 | `server/match/match/messaging.js` 3 行 + `test/match/connection.test.js` |
| `#614` (`dbcc64f5`) | 突袭的落点窗口按**敌人身体**判定，而不是按位置取整后的格子（假想敌：镜膜的 hitArea dx 1 时，对手半场第 12 列的落点会丢） | `server/sim/content/bonds/addon/battle.js` + 新 `test/sim/raid-body-window.test.js`；**golden 变了 1 个场景 → 已归因**（只退这一处 → 语料零差异）→ `715a5d72` 单独重算 |

**已跳过 / 押后**（记档）：

- `#618` 作战统计 —— **早就有**（`f29a41ee`「B1.2: the local combat meter」，含 `battle/metrics.js`、`ui/combatMetrics*.js`、`combatMetrics` 设置项）。误应用后已 `reset --hard` 撤销。
- `#622` 宿主浏览器代为彩排（`SP_BOT_REHEARSAL=host`）—— **押后**：默认关的实验特性，要动**线上协议**（`shared/protocol.js` +16）、重写 `server/match/bot.js`（184 行）、并依赖我们没有的 `public/js/battle/simLoader.js`。等真的需要把机器人彩排移出服务器时再单独做。
- 插件系统 / 工作台（119 个提交）—— §12 B3 不并。
- 统计页改版（约 150 个「other」提交，来自另一份 fork：称号 / 六边形 / 最常用策略…）—— 与我们**服务端统计**重叠（§40、MATCHMAKING §2），不整块并；只按需挑单项。
- vfx 增量（62 个提交）—— 主体已手植（「官方特效」§0）；**round 46 的审计修复**（`e92880c0` fix-hits 的 `wiring.js` +255、`4d10df08` fix-plans、`aa1c847c` 固定旋转挂点）**还没并**，因为直击我们的法杖挂点代码 → 单独一批、逐 hunk 做，并跑法杖验收线。

**剩余候选**（下一批）：round 46 vfx 审计修复（`wiring.js` / `skillfx.js` / `skills.js` / `mounts.js`）、`#647` 闭眼贴图（region eyeballs）、`#640` 闸门方块、`#630` 备战席溢出（§0 相邻）、`#628` 标题页全素材下载（与我们的链只挑兼容的一半）。

**round 46 的 vfx 审计批 —— 核对结论：已经在我们的树里（2026-10-17 复核，无需再并）**

- `e92880c0` fix-hits（R3/R4/R9/R12/R14/R15/R16）：我们的 `wiring.js` 已有 `ARRIVAL_WINDOW = 0.35`、`pendingHit` 表、`_inAir(id, time, claim)` 与 `_arrive` ✓。
- `4d10df08` fix-plans（R7/R8/R13，"official shot's hit is claimed before a skill's kit hit"）：我们的 `_airHit` 已有 `this.skills.seen(v, false, …)` 的认领顺序 ✓。
- `aa1c847c` 固定旋转挂点：`public/js/render/vfx/mounts.js` 与上游该提交**逐字节相同** ✓。
- 事实上我们的 `skillfx.js` / `skills.js` 比 `aa1c847c` **更新**（带 `FX_COVER` / `COVER_AFTER_S` / `coverOf` / `BOUND_BY_SKILL` —— 那是 round 46 更后面的 fix-procedural R10/R11），说明当时的特效移植用的是更靠后的上游状态。
- **留档原因**：这次差点再把它们并一遍（`git apply` 在 `wiring.js` 上撞出 4 处冲突，全是我们的吊环回程 / strike 出手点 / 技能认领，属于"我们已有"）。下一会话别再重复。

### 13.4 批次 4 — 闭眼贴图（GitHub #647，2026-10-17）

`43a5b571` 的**代码 `spine.js` 干净应用**（0 冲突）—— 眼皮兜底从「槽位整体隐藏」改成**按槽位落在裁剪多边形内的绘制面积占比**判定（< 1/4，或其中心在外部且 < 1/2 时隐藏）；区域的测量改走 **pixi-spine 的 `bone.matrix`**（此前从未测量过，所以区域型眼球贴图会一直显示）；完全在**凹形裁剪内**的槽位保留（予愿安洁莉娜的武器光）。附带修复：纯烬艾雅法拉的眨眼 / S3、佩佩倒地 0.10 s。

- 测试：`test/render/eyemask.test.js` 16/16（含新增的合成骨架、她的骨架、佩佩倒地）+ 新增 `test/render/eyemask.browser.test.js`（`RENDER_E2E=1` 时对真 stencil 做浏览器校验）。
- **保护区核对**：`spine.js` 的 `strikePose()` 原样保留（合并后仍在 L836），法杖验收线 48/48 ✓（`vfx-origins` + `vfx-strike-pose` + `fx-local`）。
- `npm run typecheck` 无错 ✓；`npx eslint` 0 problem ✓；README 套件计数 → 6752。

### 13.5 批次 5 — 闸门方块（PR #640 / GitHub #639，2026-10-17）

`429339b9` + `f654f200` 的 `materials.js` / `scene.js` 两段**干净应用**（0 冲突；`board3d` 虽是 §0 归我们，但闸门这一段是原样继承上游的）。对照客户端 `Particles` shader 还原：

| 项 | 旧（我们之前） | 现在（官方） |
|---|---|---|
| 颜色 | 三个材质**白 tint** | `GATE_TINT`：起点门**红 `[1,0,0]`**（α 0.134↔0.229）、终点门**蓝 `[0,0.0897,1]`**（α 0.16↔0.097）、alpha 部件白（α 1） |
| shader | `c = texel.rgb * uTint`，`uPulse` 手调 | `c = 2·uTint·texel.rgb`、`a = clamp(2·uAlpha·texel.a, 0, 1)`（官方 2× 约定） |
| 色彩空间 | sRGB 采样 + `colorspace_fragment` | 闸门贴图**线性**（`srgb: false`），不再二次转换 |
| 脉冲 | 余弦 0.134↔0.229 × `GATE_GAIN 0.6` ÷0.18；终点门 `phase 0.5`；alpha 门钉死 0.9 | clip 自己的 `_TintColor.a` 曲线（**smoothstep** `x²(3−2x)`，2 s 循环），**每块材质各用各的曲线**，`GATE_GAIN` 删除 |

- 测试：`test/render/board3d.test.js` 19/19（新增：起始门 `rgb == [1,0,0]`「不是白的」、`gatePulse(0/1, end.alpha) == 0.16/0.097`、`uAlpha` 会动）。
- 纯视觉：不碰 sim / 数据 / golden；`img.gate` 用本地提取的 `map/fx` 合并图集 ✓。
- `npm run typecheck` 无错 ✓；`npx eslint` 0 error ✓；全量 **7106 / 7091 通过 / 0 失败 / 15 跳过** ✓。

### 13.6 批次 6 — 备战席溢出（PR #630，owner 更正 2026-10-14，2026-10-17）

11 个服务端/客户端文件**全部干净应用**（0 冲突）；golden **零变化**（AI 对局没触到 15 格上限）。

| 规则 | 改前（我们） | 改后（官方 / owner 更正） |
|---|---|---|
| 被动溢出（合成精锐、战斗奖励、退回装备、召唤物） | 手牌 10 + 临时 5 都满时：精锐**丢弃**（退回卡池）、装备**销毁**、召唤物**留在场上** | 进入**可扩展的临时队列**（5 个可见 + 隐藏的按到达顺序），**永不丢弃**；隐藏项照常参与合成 / 库存 / 断线重连 / 截止结算 |
| 卖带装备的干员 | 没位置 → **拒绝**（`HAND_FULL`） | **允许卖**，装备排队 |
| 手牌满时购买 / 领奖励 | 拒绝 | **不变**（仍拒绝） |
| 临时区有东西时准备就绪 | 拒绝 | **不变** |

- 新测试：上游的 `test/match/bench-overflow.test.js`（9 条）+ `test/ui/bench-overflow.e2e.test.js`（`SP_E2E`）；其中一条专测**插件 DSL**（`registerDslMeta`，我们没有插件系统）→ 改写成语义等价的**普通脚本 meta 处理器**用例。
- 文档：`docs/PLAYING.md` §位置上限 / 装备合成两处按新规则改写（不再「满了两件都销毁」）。
- `npm run typecheck` ✓、`npx eslint` 0 error ✓；全量 **7115 / 7099 通过 / 0 失败 / 15 跳过** ✓（README 计数 → 6762）。
