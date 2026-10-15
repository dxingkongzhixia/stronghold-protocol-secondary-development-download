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
- `CHANGELOG.md`: our 0.4.0 section kept; one scene bullet added under 新功能. Upstream's `docs/history/0.2.5.md`
  is **not** imported (kept deleted — our fork does not carry upstream's 0.2.3–0.2.5 history docs).
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
