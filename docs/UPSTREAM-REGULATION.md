# 规程（卫戍协议·规程 序列Ⅰ）还原清单 / Regulation port plan

> 目标版本：官方 **卫戍协议·规程【序列Ⅰ】**（`act3autochess` `V3_1`，2026-11-08 开放）。
> owner 决定（2026-11-15）：**路线 A 版本共存**——默认仍是盟约（`act2autochess`），规程作为一个可选官方版本。
> 本文件是执行清单；进度与状态以 §6 的勾选与提交号为准。相关：`UPSTREAM-DEV-TRIAGE.md` §10（总台账）、
> `UPSTREAM-MERGES.md`（历史合并日志）、`OUR-FEATURES.md`（必须保留的 fork 特性）。

## 0. 「还原官方版本」的定义

- **数值与规则**以官方 gamedata 为唯一来源（pin 见 §1）；不做「近似」「平衡性调整」。
- **表现**用本仓已提取的官方素材重建（本地客户端 → `tools/local-extract`），布局按官方截图/录屏复刻；
  不追求把官方客户端资源原样搬进仓库（版权与仓库政策，见 `NOTICE.md` / `docs/ASSETS.md`）。
- **联机**用本仓大厅（1–4 人），实现官方的 联防 / 领袖合血 / 机变轮流，而不是接官方服务器。
- **不在范围（可后补）**：活动奖励/功勋兑换/蚀刻章/成就六维、官方账号进度、序列Ⅱ。

### 0.1 两版本隔离（基本规则）

**默认盟约（`act2autochess`）与规程（`act3autochess`）是两个有实质差异的版本，必须隔离、互不影响。**
owner 2026-11-15 明确：这不是“尽量兼容”，而是本 fork 的基本规则。

- 默认房间的数据、规则、数值、UI、golden 不因规程工作而改变；`build-data --offline` 的默认产物必须逐字节不变。
- 规程专属内容只能由**版本数据**（该版本 `bands.json` / `bonds.json` / `choices.json` / `config.version` 等）
  或**该版本才存在的 band / 机变 / 干员 id** 触发；默认房间拿不到这些 id，因此天然不生效。
- 共享代码（`server/sim/content/**`、`server/match/**`）可以复用**实现/工具函数**，但新增行为必须带版本或 band 条件；
  不允许把规程行为写成无条件分支，也不允许借“复用”改默认盟约的盟约 6 名效果、层数、经济或战斗数值。
- 若某项规程效果需要改默认路径才能实现，按 stop-and-ask 处理：先报告差异，再决定是否复制一份版本内实现。
- 回归口径：默认 golden 9/9、默认数据零 diff、`test/match/**` 全绿（规程改动前后对比）；规程自身另有
  `test/data-versions.test.js` 与版本内容测试。

## 1. 权威来源

| 来源 | 用途 | 版本/位置 |
|---|---|---|
| 官方 gamedata（Kengxxiao/ArknightsGameData 镜像） | 16 张玩法表的唯一数值来源 | pin **`6f63c14e`**（CN 79.2.0，change 127796，2026-11-05）；`tools/versions/act3autochess-v3_1.mjs` |
| 主线 `origin/dev` | 实现参考（构建适配、规则、UI、测试），只读 | 目标钉 **`e31e7bbae`**（2026-11-14） |
| PRTS「卫戍协议·规程」 | 规则/模式/难度/地图/干员名单/曲目核对 | <https://prts.wiki/w/卫戍协议·规程>（2026-11-14 版） |
| 本地官方客户端 | 官方素材、关卡预制体、主题、音效 | `D:\本地网络游戏中心\B站鹰角启动器\Arknights bilibili\games\Arknights`（下载清单 2026-11-06） |
| 本仓提取工具 | 从本地客户端提取 | `tools/local-extract/{extract.py,fx.py,scenes.py,music.py,sfx.py,autochess_themes.py}` |

> 主线 dev 的原话与本仓 `docs/research/` 的对照：上游在 `docs/research/regulation-*` 记录了 MAP09 隐匿地块、
> Boss 受击区、萨卡兹亡语、核心盟约禁用等实测；这些是我们核对官方行为的第二来源。

## 2. 官方范围（核对表）

| 项 | 官方 | 数据/代码落点 |
|---|---|---|
| 模式 | 入门 `AC-TR-1`、标准 `AC-MP-1`、险境 `AC-MP-2`、绝境 `AC-MP-3`、终极 `AC-MP-4`、极速 `AC-TB-1`、规程等级 `AC-SP-1…20` | `config.modes`（25 条；`mode_single_1..20` 的 difficulty 依次 FUNNY/HARD/ABYSS…，以数据为准） |
| 轮次 | 标准 14 回合；极速 9 回合；第 14 回合最终领袖，第 15 回合隐秘核心（条件触发） | `config.modes[*].rounds / lastRound / bossRound / hiddenRound` |
| 难度 | 标准 100 %/+8、险境 120 %/+13、绝境 135 %/+19、终极 150 %/+20；认证效率与解锁链 | `config.modes[*].enemyScale / unlockText` |
| 战场 | 10 张（PRTS #01–#06、#09–#12；数据 `m01..m06,m09..m12`），每张 3 个 sub-level | `stages.json`（12 条含非战场条目）、本地关卡 prefab |
| 干员 | 6 阶名单；本季 155 个商店棋子（310 条含精锐），其中 37 个有 kit、10 个自选位无 kit | `chess.json` / `kits/ops/*` |
| 自选 | Ⅴ/Ⅵ 阶各 0–2（至多 4）；联合在开局选；核心盟约被禁则该干员不可选 | `config.diyBringLimits`、`backups.json` |
| 核心盟约 | 个人模拟把核心盟约分两组，选一组；未选一组的干员离场；联合禁用半数核心 | `config.version.rules.bondDraw: 'regulation'`、`profile.config.bans` |
| 盟约 | 26（含 5 组核心 + 通用） | `bonds.json` |
| 策略 | 61，含**主动策略（指令：点击/拖放、每回合次数/资金/冷却）**与**变换策略** | `bands.json`、`bands/commands.js` |
| 装备 | 116；独立 5 格装备区（`equipHand`）；容量按 `equipSlotNum`（Ironhide 4/6） | `items.json`、`shared/itemRules.js` |
| 机变 | 9 张表（个人 3 选 1；联合 4 人轮流 6 选，各自 16 s，首位 +14 s） | `choices.json`、`tools/versions/tables/*` |
| 敌人 | 15 个 archetype（SP19、SP20–SP25、SP27–SP29、SP31–SP33）、77 个模型 | `enemies.json`、`data/assets.json`、本地 Spine |
| 音乐 | *Kernel Overflow*、*Restore*、*BOSSEns Inexorabile*、*BOSSSystematic Violation* | `audio` 版本音乐（§4 缺口） |
| 主题 | 终端主题「规程」+ 界面主题包 | `ui_zone_home_theme_act3autochess.ab`、`shared/uiTheme.js` |
| 隐秘核心 | 规程等级 5+/险境+，通过第 14 回合且满足条件进入；不影响通关判定 | `config.hiddenCore`、`regulation-bosses.js` |
| 联机 | 联防（非完美作战者的敌人进入 1–2 名完美者阵地，不叠盟约层）；领袖轮合血、超时扣血 | `server/match/*`、`lobby` |

## 3. 本地素材清单（官方客户端 2026-11-06）

| 官方 bundle（相对 `games/Arknights/Arknights_Data`） | 大小 | 内容 | 提取 |
|---|---|---|---|
| `PersistentData/Bundles/activity/[uc]act3autochess.ab` | 11.4 MB | 规程活动 UI/预制体/背景 | `extract.py`（UI/activity） |
| `PersistentData/Bundles/ui/autochess/[uc]autochesscommon.ab` | 4.9 MB | 卫戍协议通用 UI（HUD、简报、商店） | `extract.py` |
| `PersistentData/Bundles/ui/autochess/[uc]autochessouter.ab` | 19.8 MB | 外层界面（编队、大厅、结算） | `extract.py` |
| `PersistentData/Bundles/battle/prefabs/[uc]{skills,equips,globalbuffs,projectiles,dynamicabilities,tiles}.ab` | 0.06–1.9 MB | 技能/装备/全局 buff/弹道/动态能力/地块预制体 | `fx.py` / `extract.py` |
| `PersistentData/Bundles/pkgrps/btl_pfb_fx_enemy_{2,4,7,8,17..20}.ab` | 3.3–5.2 MB | 敌人特效 | `fx.py` |
| `PersistentData/Bundles/spritepack/ui_zone_home_theme_act3autochess.ab` | 0.6 MB | 终端主题 | `autochess_themes.py` |
| `PersistentData/HGDownload/26-11-06-…/` | 30 个文件 | **m01–m06、m09–m12 关卡 prefab（每张 3 个 sub-level）** | 关卡/场景解析 |
| `PersistentData/Bundles/refs/` + `anon/*.bin` | 57 MB + 55 MB | 敌人/干员模型与贴图（按需下载的匿名包） | `extract.py ENEMY_SPINES` / `TOKEN_SPINES` |
| `PersistentData/Bundles/chararts/char_4245_alga.ab` 等 | 0.2–8 MB | 新干员立绘（本机仅 4 个新干员） | `operators.py` / `fetch-assets` |
| `StreamingAssets/AB/Windows/audio/sound_beta_2/music/` | 全量音乐 | **规程 4 首未在本机缓存**（需客户端内播放一次后重扫，或用社区 dump） | `music.py` |

> 提取只在 owner 的机器上运行，产物进 `public/assets/`（不进 git），由 `tools/push-assets-relay.mjs` 发布；
> 客户端反作弊/加密不绕过，沿既有 `aklz4.py` 流程。

### 3.1 试提取结果（2026-11-15，只写 `%TEMP%`，未动仓库）

**通过**（`tools/local-extract/.venv-extract` + `aklz4.py`，本机直接读取）：

| 目标 | 结果 |
|---|---|
| `ui/autochess/[uc]autochesscommon.ab`（下载目录，规程期） | **254 sprites / 7.4 MiB**（基础包同文件为 173 / 3.9 MiB） |
| `[uc]autochessouter.ab`（下载目录） | **881 sprites / 20.7 MiB**（基础包 873 / 18.3 MiB） |
| `[uc]autochessbattle.ab` | 只在**基础包**里（343 sprites / 4.1 MiB）；下载目录没有 → 提取需合并两个根 |
| `[uc]act3autochess.ab` | 解码成功：751 MonoBehaviour / 659 GameObject / 175 Texture2D / 168 Sprite（入口 UI、徽章、logo） |
| `spritepack/ui_zone_home_theme_act3autochess.ab` | 1 张 1024×858 Sprite，已导出预览 |
| `pkgrps/btl_pfb_fx_enemy_17.ab` | 解码成功：2547 ParticleSystem / 129 Mesh / 52 Texture2D（规程敌人特效） |
| 关卡 `.dat`（HGDownload，30 个） | **是 ZIP 容器**；解出内层 `level_act3autochess_*.ab` 后 UnityPy 可读：210 GameObject / 197 Mesh / 199 MeshRenderer / 1 Light / 1 Camera |

**已落地（2026-11-15，单提交）**：

- `tools/local-extract/import_scenes.py`：把客户端 `PersistentData/HGDownload/<version>/*.dat` 里的 bundle 解到
  `--scenes` 目录（`--match act3autochess` 只导规程的 30 个关卡预制体）。
- `tools/local-extract/regulation_scenes.py`：主线参考移植——规程一张图是 **3 个 piece 预制体**（sub_01/02/03），
  按 `PIECE_SHIFT` 拼到 19×21 棋盘，处理水片、背景地面、lightmap 2×2 图集与 `HIDDEN@1/2/3` 分组。
- `extract.py`：`--only scene/act3autochess_m01` 走 `regulation_ids` + `export_regulation`；这些组**不进**
  `expected_local_groups`（客户端没有时仍是金属棋盘）。
- **m01 实跑通过**：24 chunks / 105 901 顶点 / 3 张 lightmap 合成 2048²，输出 `scene.json`（version 1）、
  `scene.bin` 4.0 MB、`lm0.png|webp`、`scene/tex/*` 共 15 文件。黑边统计（lightmap 修复前后）与 4 个分组均正常。
- **10 张全部导入（`ba97bfb67`）**：m01–m06、m09–m12 → `public/assets/local/scene/act3autochess_*`，
  每组 4 文件（`scene.json` v1 / `scene.bin` / `lm0.png` / `lm0.webp`），共 **111.5 MiB**（m05 14.5、m10 21.2、m12 21.4 较大）；
  chunk 数 12–24、顶点 105 901–395 490。新增共享贴图 34 个（icewild / church_tower / wild 等）；
  22 个既有主题贴图按当前客户端重导（逐像素比对：`TX_AutochessSand_N` 完全一致，albedo 均值差 < 0.4 级，
  属解码/版本差异，非画面变化）。`scene/tex` 总计 222.9 MiB。

- **统一两个 AB 根（`bundles.py`）**：`--game` 接受安装目录 / `Arknights_Data` / AB 根；按 `hot_update_list.json`
  + `persistent_res_list.json` 把 `PersistentData/Bundles` 的下载包覆盖到打包客户端之上，在
  `.cache/client-bundles/<打包版本>+<热更版本>/` 建一棵硬链接树（Windows 下加载中的文件无法删除，故缓存复用）。
  本机实测：`26-10-20… + 26-11-06…；1388 downloaded, 13355 packaged, 1016 unavailable`。
- **规程 activity / 主题任务（`EXTRA_JOBS`）**：`activity/[uc]act3autochess.ab` → `ui/activity/act3autochess`
  （270 文件 / 14.0 MiB：入口 UI、赛季前后景、徽章、logo），`spritepack/ui_zone_home_theme_act3autochess.ab` →
  `theme/act3autochess`（1 张 1024×858 / 0.9 MiB）。它们是 **opt-in**（只在 `--only` 点名时跑），不进
  `expected_local_groups`。敌人特效不需要任务表条目：`fx.py` 的 `pkgrps/btl_pfb_fx_*.ab` 已经按 glob 扫描。
- **规程敌人模型**：上游资产的 98 个 `spineLocal` 规程敌人**全部提取**（98/98）→ `public/assets/local/spine/enemy/*`，
  **294 文件 / 14.6 MiB**。`ENEMY_SPINES` 由 2 扩到 98，`expected_local_groups` 172 组；`--enemy-spines <ids|@file>`
  可按需覆盖。`_2`/`_3` 变体没有独立骨架，`export_enemy_spines` 复用基座模型（`enemy_9029_acfnc_2` / `enemy_9037_aceel_2`
  写的是 `enemy_9029_acfnc.*` / `enemy_9037_aceel.*`，与上游元数据一致）。
- **规程音乐**：客户端索引里有 `audio/sound_beta_2/music/act3autochess/{m_sys,m_boss1,m_boss2}.ab`，从 Windows CDN
  （`https://ak.hycdn.cn/assetbundle/official/Windows/assets/<version>/`）取回后用 `music.py` 的编码链（-14 LUFS）
  写入 `var/music`：**Kernel Overflow / Ens Inexorabile / Systematic Violation**，3 首 / 8.1 MiB，`index.json` 已写。
  第 4 首 **Restore**（2024《卫戍协议》关卡 BGM）不在当前热更索引里，取官方 **Monster Siren** 的 WAV
  （`/api/song/461136`，sourceUrl）编码后同样入 `var/music`；四首共 **10.6 MiB**。

**仍需处理**（P4）：

- [x] 关卡 `.dat` 解 zip（`import_scenes.py`）；规程三段场景表（`regulation_scenes.py`，10 张图）
- [x] 统一两个 AB 根（`bundles.py` + `--game` 安装目录 + `.cache` 硬链接树）
- [x] 规程 activity / 主题的 opt-in 任务（`EXTRA_JOBS`；enemy-fx 走 `fx.py` 的 glob，无需条目）
- [x] 规程敌人模型：**98/98** 全部提取（`spine/enemy/*`，14.6 MiB），`ENEMY_SPINES` 扩到 98；`_2` 变体复用基座骨架
- [x] 规程音乐 4 首（Kernel Overflow / Restore / Ens Inexorabile / Systematic Violation）已入 `var/music`；
      Restore 走官方 Monster Siren 源（`/api/song/461136`）

## 4. 与我们的差距（概览）

> 2026-11-15 同步：按当前代码与 `UPSTREAM-BANDS.md` 的实际状态重写；下方 §5 才是逐项清单。

| 层 | 现状 | 还差 |
|---|---|---|
| 版本系统 | 注册表、版本数据托管、`/cs/`、大厅版本字段、客户端加载、`kind:'version'` 对局宿主、房间版本投票、通用 profile 加载器已完成（P0 全部） | 无 |
| 规程数据 | 16 文件 / 6.4 MiB 已落地，`--version` 重建逐字节通过；enemies 343 = 上游；模板预设（阿米娅·医疗）取 `char_patch_table` 的完整形态；tuning（称号规则）与 `spineLocal` 输入已显式化 | — |
| 规则/内容 | 40/40 干员套件、4/4 新盟约、96/96 敌人、141/141 garrison、band B1–B7（含指令替换）、个人核心盟约二选一 + 核心优先禁用 + 5 格装备区 + 隐秘核心端到端（服务端）、26 个模式、一个难度端到端可玩、全部 act3 地图规则、寻宝人（含机器人）、#932 暴躁铁皮、#925 装备池、#944 组合装备、#943 莱塔尼亚（召唤/追击/出生格索敌/乐部二连击）、`recruitTierExempt` 通讯机例外、装备研究按 trapId 索引、隐秘核心/领袖/联防复核 | 无（P2 完成） |
| UI | 版本下拉、加载、20 级服务端选择、房间等级选择器、简报核心盟约二选一、装备区（棋盘 row 8 五格 + 选择干员，2026-11-18 取代悬浮抽屉）、band 技能按钮/目标选择、装备报告 tab 已有 | 无（P3 完成） |
| 素材 | 场景/主题/敌人特效、按版本并集规划（敌人/召唤/干员/模块类型均已接进 `fetch-assets`）、98 个本地敌人 Spine、音乐、主题；首包约 2.6 MB gzip | 无（P4 完成） |
| golden/测试 | 默认 golden 6 文件全匹配；规程 golden 304 场景（含 10 地图 × 4 模式矩阵）（`test/golden/act3autochess-v3_1/`）由 `--version` 在本树重建 | 无（P5 完成） |
| 冲突面 | 14 条 never-merge 路径已审计，fork 面由测试守卫 | 上游新提交按 `check-upstream.mjs` 手工移植（P6） |

### 未做清单（2026-11-16）

状态：🔴 未开始 · 🟡 部分完成 · ⛔ 阻塞 · ⏸ 等许可 · ⚪ 不适用

| 阶段 | 未做项 | 状态 |
|---|---|---|
| P2 | 对局侧修复 #925 #932 #934 #937 #939 #943 #944 #947 #946 | ✅ 全部完成；#946 为阶段横幅去重 + 机变单入口（#930 N/A） |
| P2 | `recruitTierExempt` 招募例外 | ✅ 版本档案标记 + 通讯机例外 + `SharedPool` 仅绕过 maxTier |
| P6 | 14 条 §0 never-merge 路径逐块重写 | ✅ 审计与守卫完成；上游新提交按 check-upstream 手工移植 |
| P6 | 保留 fork 特性（自定义干员、VFX、插件内容集、admin、i18n 等） | ✅ `test/versions-never-merge.test.js` 锁定 |
| 部署 | 生产部署 | ✅ 2026-11-16 23:45，build `6e06ed134215`，`SP_VERSIONS=all`（默认盟约 / 规程可选） |

以下各节以 `[ ]` 标出的条目即上表对应的未做项；`[x]` 为已完成。本轮会话的完整交接（环境、命令、已提交项、坑）见 [`HANDOFF-2026-11-16.md`](HANDOFF-2026-11-16.md)。

### 规程的敌人预览栏 / 版本干员攻击（2026-11-17）

- **预览栏（2026-11-18 修正）**：3 期规程的敌人预览栏就是官方 19×21 网格里的 rows 14–18、cols 7–13（`PEN_RECT`，来自关卡的 `sub_03` rows 7–11）：rows 14/17 为 `f`，15/18 为 `Sffffff`（左缘两个 `tile_start`），16 为 `ppppppp`（`previewNotAlloed`，不可部署）。2026-11-17 的“装备行右侧侧栏 + 棋盘外 cols 21–27”方案已全部回退：`tools/versions/layouts.mjs` 的 `STAGE_ROWS` 恢复 `{ r, piece: 3, from: r - 7 }`，row 8 只从 sub_01 取 cols 0–11（5 个装备格），不再写 `options.configBlackBoard.enemy_place_rect`；`data/versions/act3autochess-v3_1/stages.json` 由 pinned 缓存 `.cache/gamedata@6f63c14e` 重建，10 张图的 `rows[8]`、`rows[14–18]`、`config`、`tiles.p` 与主线逐字段一致（`test/render/regulation-full-board.test.js` 锁定）。
- **战场 / 相机（2026-11-18 修正）**：3 期的双半场（cols 0–20）是**联防**地图，休整期和普通战斗只显示自己的半场——与盟约共用同一套 `boardArea` / `restView` / 相机逻辑，只有 `unite` 相机构建 cols 0–20；规程不再有专用的区域 / 取景分支（第一版曾把双半场放进 prep/normal，已回退）。预览栏仍是官方 rows 14–18、cols 7–13，随 prep / pen 相机出现在场地上方的平台，红门在平台左缘。
- **装备区（2026-11-18，方案 A）**：5 格装备区按官方放在 row 8、cols 4–8 的 `tile_acbag` 上，但改由棋盘渲染：`render/app.js` 的 `setPrep` 接受 `equip`（`m.private.equipHand`）并按 temp 行几何画在 row 8 的 5 个格子上（`temp` 队列的棋子只占装备空出的格子），空槽由 `ui/equipRow.js` 的 `EquipRow` 画虚框；点装备弹 `EquipPicker`（选择干员 → `g.equip`）。`m.private.equipHand` 里的道具同时进入 `placementContext`（按 temp 槽位索引），所以也能像盟约一样直接拖到干员身上装备。道具图标先查 `data/assets.json` 的 `items`，没有则回退本地客户端清单 `item/<iconId>`（`data/local-assets.json`），3 期独有装备才有图。`ui/equipArea.js` 悬浮层已删除；盟约不传 `equip`，temp 行行为不变。服务端数据层（`equipHand`、`area:'equip'`）未改。
- **场景（2026-11-18）**：当时按「本机没有官方客户端 AB 与 `tools/local-extract/.venv-extract`」处理，所以 10 张 act3 场景改用主线仓库已提交的 `scene.json` / `scene.bin`（9 张的 `lm0.png` 与主线逐字节相同，故保留本仓库的 lossless WebP；m12 的光照图随场景一起替换并按 lossless 重编），`data/local-assets.committed.json` 重新生成。**2026-11-18 复核：这个前提是错的** —— 客户端在 `D:\本地网络游戏中心\B站鹰角启动器\Arknights bilibili\games\Arknights\Arknights_Data\StreamingAssets\AB\Windows`（13,598 个 bundle，`scenes/` 4,975 个文件），`.venv-extract` 也在；`--only scene` 可以全量重抽复核（另见 §4 待办里客户端 AB 不含 gamedata 的说明）。`tools/local-extract/regulation_scenes.py` 里为“棋盘外侧栏”加的逻辑（`SIDE_PEN` / `SIDE_PEN_DX` / `SIDE_PEN_RECT` / `SIDE_PEN_DZ` / `_in_side_pen` / `_overlaps_pen` / `_boss_pen_row` 及其分支）已删除，之后有客户端时可全量重抽复核。
- **动画**：版本专属干员的 Spine 来自本地客户端 `spine/char/<id>/<face>`，`data/assets.json` 没有它们的 charpack 角色表。`shared/animRoles.js`（原 `tools/assets/anim-roles.mjs`，纯函数，浏览器与工具共用）在骨架解析后按真实 clip 名解析 idle / attack / 每个技能槽 / die，`render/spineRoles.js` 从 EventTimeline 的 `OnAttack` 事件取命中帧；本地模型的技能攻击读 charpack mode 的 `attack.animKey`（`skillAttack.js` 的 `localModel`），空 key 按官方攻击动画器显示普通攻击。
- **特效**：`node tools/local-extract/extract.py --only fx --fx-units <ids>` 只爬这些单位的 charpack，并把它们引用的特效/投射物/技能合并进已有 fx 索引（不动其它单位）；`fx.py game_data` 现在合并 `data/versions/<slug>/{chess,backups,enemies,tokens}.json` 与各 `.cache/gamedata*/excel`，版本干员的技能和天赋 prefab 才能被找到。40 个 3 期干员的攻击/技能特效因此进入 `public/assets/local/fx/**` 与 `data/local-fx.json`。
- **隔离**：以上全部是版本数据或本地客户端素材的增量；默认盟约的 `data/assets.json`、golden 与 act1/act2 场景保持原样。

### 规程敌人机制核对（PRTS，2026-11-18）

按 PRTS 敌人页核对 3 期新增敌人，本轮修正：

| 敌人 | PRTS 规则 | 之前 | 现在 |
|---|---|---|---|
| 假想敌：械 | 生命值首次低于 **50%**：击倒全部冲击之械并召唤两个，进入护甲形态（横坐标不同的伤害 -50%）；每次造成伤害在目标 3×3 内最近可通行地块召唤量变之械 | 20% 才触发、只召唤 1 个、无护甲、只落在目标格、2 s 节流 | 50% 触发、护甲 -50%、左右各一个；3×3 最近格；补【洪流攻势】每 25 s 四格召唤 |
| 矩兽 【非命】 | 生命值首次低于 **50%**：阻挡 +1、攻击 +50%、移速 200% | 40% | 50% |
| 矩兽 【兼爱】 | 退场时击倒场上敌人（**后兽除外**），对全体我方造成攻击力 **100%** 物理 | 击倒全部（含后兽），伤害 ×2 | 保留后兽，伤害 ×1 |
| 假想敌：茧 | 【淤困捕食】初始 15 s / 冷却 25 s；酸雨【悲惨之雨】只属于**隐秘核心**强化版 | 18 s 固定；50% 血就下酸雨（基础版也有） | 15 s 首发、25 s 冷却；酸雨只在 `_2` |
| 假想敌：鳍 | 【鳍盾】未被阻挡时物理/法术 -40%；被阻挡时转为【鳍刺】，下一次攻击 ×150%；【离子环波】初始/冷却 24 s、半径 1.5、攻击力 125% + 40% 神经 | 减伤 50%、被阻挡并受击才转、环波 12 s ×100% 半径 2 | 按 PRTS 全部修正 |
| 假想敌：影役 | 周围 1.8 内**干员**阻挡数 -1（不可叠加） | 光环作用在**敌人**身上 | 改为 `allyAura`，干员阻挡 -1 |
| 假想敌：镜波 | 折射；被击倒时向 1.2 内法抗最低的干员发射弹道，法抗 +10（可叠加、无限持续） | 未实现（只有通用折射） | 新增 `kitAcRefd` |
| 假想敌：镜眼 | 折射；受到法术伤害时使伤害来源攻速 -50，持续 3 s | 未实现 | 新增 `kitAcRefm` |

仍未对齐（已知、记录在案）：

- 械 / 茧的普通攻击是脚本化的（不走引擎的前摇/挥击动画）；伤害、索敌与触发沿用官方数值。
- 后兽的 `SummonBranchEnemy`：技能已接（CD 170 / 初始 5，仅第二形态），按关卡 `branches[branch_id]` 生成；`act3` 数据没有 `dyjsww_summon` 分支（后兽不在任何 act3 关卡），所以当前施放后不生成敌人。关卡数据补上 `branches` 即生效。
- 茧【淤困捕食】已改为每侧随机 2 个（普通 2/4，隐秘核心 3/6，按技能黑框）；普通攻击仍是每侧生命值最高的 3 个（PRTS）。
- 隐秘核心强化版（`_2`）已随主线补上酸雨、毒与跳跃/雷暴；仍以主线实现为准，未逐条复核其推演。

> 规程 boss 主体（械 / 冲击之械 / 量变之械 / 茧 / 淤困之茧 / 鳍 / 矩兽 / 后兽）已改为移植主线
> `server/sim/content/regulation-bosses.js`（原样拷贝 + 三处本地适配：`loseHp`、护甲/减伤只作用于物理与法术、
> 兼爱伤害按 PRTS 100%），本仓库只在其上补了“械全场普攻”“茧按左右半场分组”两个 PRTS 差异。

**素材**：这些 boss 的 Spine 模型两仓库本来就有；官方特效 prefab / 贴图 / 网格原本缺失，2026-11-18 已从主线
`public/assets/local/fx/**` 拷贝全部缺项（1301 个文件，约 20 MB），并把主线 `data/local-fx.json` 作为本机特效索引
（该文件按设计不进 git）。特效能否播放还取决于本仓库 `public/js/render/fx/official.js` 的「sim 事件 → prefab」
映射表，见下方待办。

### 规程普通敌人核对（PRTS，2026-11-18 第一批）

3 期独有普通/精英敌人 89 个，其中 57 个没有手写 kit、走 `enemies/procedural.js`。逐个核对 PRTS 能力条与官方
blackboard 后，先处理了这几类：

| 敌人 | PRTS | 之前 | 现在 |
|---|---|---|---|
| 冰爆源石虫·α | 死亡爆炸半径 0.65、攻击力 100% 物理 + 寒冷 10 s | `boom.*` 小写组未被识别，误用普通源石虫的 kit | 识别 `boom` 组与 `boom.freeze`，按 0.65 半径爆 + 寒冷 |
| 开天汽水瓶 | 飞行单位，逐渐流失生命并加速 | 无 kit | `kitNscola`（每 0.5 s 扣 120 血、移速 +0.3，25 s 上限） |
| 遮天面包机 | 飞行单位，未被阻挡时持续对周围溅射 | 无 kit | `kitNsbomb`（2.5 s、半径 1、攻击力 200%） |

**顺带修了一个通用问题**：`procedural.js` 的“同签名复用”原来只比天赋组名（`boom`），不同敌人会共用错 kit；现在
同时比较 blackboard 的键集合，33 个“签名复用”降到 15 个，其余改走各自的数据驱动的通用处理。

待办（已核对、未实现）：

- [x] 萨卡兹子裔链术师 / 组长：攻击带 30% **凋亡损伤**，在 4 个目标间跳跃（每次 ×0.85）；首次倒下重生为**大君之赐**
- [x] 萨卡兹子裔轰击者 / 毁击者：延时炮弹（半径 1.1）范围物理；首次倒下重生为**大君之触**
- [x] 残党乐团管乐家 / 巫王乐团管乐家：未被阻挡时攻击力增长、攻击后清零；沉郁变奏下攻击眩晕
- [x] 萨卡兹骸骨卫士长（`BmbcarBuff` + `Summon`）、注能魂灵法骸、蕴核饲育者、变异巨岩蛛等
      —— 2026-11-18 直接移植主线 `server/sim/content/enemies/regulation.js`（共 35 个 kit），本仓库原有的
      20 个手写 kit 保留在 `regulation-extra.js`（合并后按 key 取并集，主线优先）
- [x] **狂暴凶豕兽**（`enemy_1309_mhboar_2`，`enemies/regulation-extra.js kitMhboar`）：占用 2 阻挡（`blockWeight` 2）；每 0.1 s 检测，未受阻且未被阻挡时开始冲撞；0.5 碰撞光环只选低地单位，每次冲撞每单位受一次 当前移速×800 物理；开始 3 s 后每 0.333 s +33.3% 移速（最多 35 层，停止解除）；第一次普攻追加 当前移速×600，造成后停止；晕眩/冻结/浮空/束缚停止并重置。
- [x] **恶尘源石虫**（`enemy_1424_lrboom`，`kitLrboom`）：死亡 1 s 后半径 1.3、攻击力 350%、来源无效的物理爆炸；与活性源石风暴距离 ≤ 其半径 + 0.3 时立刻死亡并给风暴 +1 层增幅（可沉默）；其他死亡生成源石污染区（可沉默；act3 无十四章控制器，区域按 0 伤害标记）。

### 规程新增干员核对（2026-11-18，两遍过完）

3 期独有干员 15 名（其余 31 条 chess 记录是金色版本与 12 个「甄选干员」DIY 槽位）：

`瑰盐` `真理` `铸铁` `星源` `安哲拉` `凯瑟琳` `盟约·辅助干员` `风丸` `至简` `奥尔佳` `青枳` `寒檀` `焰尾` `冻河` `阿米娅(医疗)`

- 每名都有手写 kit（`server/sim/content/kits/ops/`，按 charId 键），没有落到通用兜底。
- 第一遍对照官方 `chess.json` 的天赋/技能描述（与 PRTS 同源）逐条读 kit：**焰尾**（S1 闪避下次物理、S2 双段 180% + 0.5 s 眩晕 + 友方 40% 物理闪避、S3 逐点回费 / +45% 攻击 / 阻挡 +1 / 60% 双闪、天赋「前锋剑术」二连击打所有阻挡）与 **安哲拉**（天赋按队伍深海猎人 +12 攻速、S2 停手血线 / 移速 -20%）数值与机制一致。
- 4 处 `[ASSUMED]` 的收尾（2026-11-18）：
  - [x] 安哲拉：`编入队伍` = **已部署**的干员（天赋是光环，整备区不在场）；目标全部低于半血时停手、没有兜底目标（PRTS「普通攻击不再以生命值低于50%的敌人为目标」）。
  - [ ] 寒檀：S2 冰锥从攻击到落下的时间（客户端 start 预制体是 8 s 的冰场，不是冰锥；没有别的数据可对，仍按 0.3 s 视觉值）。
  - [x] 风丸：`替身` 存活时长 = 技能持续（数据 20 s；`onEnd` 撤退替身）。
  - [x] 盟约·辅助干员：三种损伤按 PRTS「攻击同时附带…」在同一次伤害上同时施加。

- [x] 其余 13 名干员逐条复核（2026-11-18 第二遍，全部 15 名看完）。发现并修正的**实际缺口**：

  | 干员 | 问题 | 处理 |
  |---|---|---|
  | 真理 | S2「攻击范围扩大」没接技能 `rangeGrid`（棋盘仍是本体 12 格） | `ver-glassb.js` 用 `targeting.rangeGrid`（实测 12 → 21 格） |
  | 铸铁 | S2「攻击距离缩短」没接 `rangeGrid`（数据为 `[[0,0]]`） | `ver-sidero.js` 用 `targeting.rangeGrid` |
  | 奥尔佳 | S2「攻击距离延长」没接 `rangeGrid`；「天赋效果提升至1.4倍」没实现；「优先攻击攻击力最高的精英/领袖」没实现 | `ver-alga.js`：`targeting.rangeGrid`、S2 期间天赋光环 ×`talent_scale`、`beforeAttack` 把范围内最高攻精英/领袖换到首位（阻挡目标仍优先） |
  | 冻河 | S3「范围内技力比例最高的另一名干员」错用全场 `alliesFor` | `op-tocka.js` 改用 `alliesInGrid`，并只选干员（`kind === 'op'`） |
  | 瑰盐 | S1 没有手写 spec（当前记录选 S2，但换技能会掉通用兜底） | `chess_char_4_08-rosesa.js` 补 S1（下次治疗 150% 攻击力） |
  | 寒檀 / 焰尾 / 凯瑟琳 | kit 注释里的旧数值（15% / 22% / 11%） | 校正为 18% / 25% / 8% |

  其余 10 名逐条对照官方黑框与 kit 数值/机制，一致：瑰盐 T0/S2、星源 T0/S1/S2、安哲拉 T0/S1/S2（含 `lowestDef` 索敌）、凯瑟琳 T0/S1/S2（装置 6%/s 在 `tokens.js`）、盟约·辅助 T0/S1、风丸 T0/S1/S2、至简 T0/S1/S2、青枳 T0/S1/S2、焰尾 T0/S1/S2/S3、阿米娅 T0/S1/S2。

- 规程 golden 已归因后重算：默认 golden 只有 `diy` 变（冻河 S3 的目标范围）；规程为 `roster` / `bonds` / `fields` / `matches`。
- [x] 官方 prefab 列表（2026-11-18）：本机 `public/assets/local/fx/index.json` 已与上游官方索引合并（本树 5111 + 主线 453 = **5564** 个 prefab，与 `fx/prefabs/` 文件一一对应）；`data/local-fx.json`（gitignore，本机）由合并后的索引重建（11011 项：5564 prefab / 3950 贴图 / 1495 网格），`test/local-extract-fx.test.js` 34/34。主线索引里 `enemy_9027_acfnca` 的 `HitPoint` 在脚底（y=-0.78），当时去掉了该点；2026-11-18 已查清并补回（见下方待办同名条目）。
- [x] **官方特效映射表**（2026-11-18）：新增 `public/js/render/vfx/regulation-fx.js`，与 `render/vfx/skills.js` 的 `FX_BINDINGS` / `FX_COVER` / `ENEMY_FX_BINDINGS` 合并。覆盖 械 / 冲击之械 / 后兽 / 茧 / 鳍 / 链术师 / 轰击者 / 15 名新增干员：
  - `REGULATION_FX_ROSTER`：这 8 类敌人（含 `_2`）在官方索引里实际使用的 prefab 键（普通攻击 / 技能 / 天赋 / 投射物），由 `test/render/vfx-regulation.test.js` 对着提交的 `fx/index.json` 钉住；
  - `REGULATION_FX_BINDINGS`：后兽的 `phase[form2]` 计时器切形态不是 `castSlot`，绑到官方切换片段 `enemy_dyjsww_die_01`；
  - `REGULATION_SKILL_BINDINGS`：风丸 S2 召唤 `<替身>` 绑到 `kazema_skill_02_start`（token 没有 `startEffect`，技能计划也没有 start 行）；
  - `REGULATION_FX_COVER`：瑰盐 S2 `saltWard`、凯瑟琳 S2 `overclock`、焰尾 S1/S2 `dp`、S2 `aoe`、S3 `flame` —— 这些技能的计划已经播放官方 loop / start，程序化提示不再重复。
  - 其余单位（械 / 冲击之械 / 茧 / 鳍 / 链术师 / 轰击者 / 大多数新增干员）的普通攻击、技能、天赋已经由索引计划自动播放，不需要额外表项。

### 新增干员素材与官方特效核对（2026-11-18 晚）

- **8 名版本干员在本机根本没有模型 / 头像 / 立绘**：瑰盐、凯瑟琳、盟约·辅助干员、风丸、至简、寒檀、焰尾、冻河。它们的 charpack 只在 11-13 的热更包里（安装包是 10-20），`data/assets.json` 又没有版本干员的 charpack 表，所以画面里是回退形态。用
  `extract.py --only plugin-art --char-art <ids>` 从 `.cache/client-bundles/26-10-20…+26-11-13…` 抽出
  `spine/char/<id>/{front,back}`（各 3 个文件）+ `char/avatar/<id>` + `char/portrait/<id>`。fx-viewer 里
  `modelInfo()` 为 `loaded: true, bones: true`，瑰盐截图正常；另 7 名同批抽出。
- **官方特效本来就接线了**：15 名干员的 **30 个技能位**逐个在 `dev/fx-viewer.html?skilldemo=<charId>&sid=<skillId>` 里跑
  （`liveKeys()` 采样 4.6 s），**每一个都播出了官方 prefab**，例如 寒檀 S2 → `sntlla_skill_02_buff_01` / `_buff_02_right`、
  冻河 S3 → 7 个 `tocka_skill_03_*`、焰尾 S2 → `flamtl_skill_02_start_01/02` + `_range_01` + `_hit_01`。
- **「索引里有、demo 里没看到」的 key 全部复核过**，三类结论：
  1. **demo 参数问题，不是缺**：星源 S1、至简 S2 的投射物 key（`halo_skill_01_hit/_trail`、`malist_skill_hit/_hit_2/_trail`）
     只是 `skilldemo` 默认按近战（`kind=none`）跑；带 `&kind=bolt` 后全部播出。奥尔佳 S1 的 `hit_2` 同样要 `&hits=2`
     （`MultiHitUberEffectEmitter` 的第二个命中组）。
  2. **已补绑定**：寒檀 S2 的官方冰场 `sntlla_skill_02_start_01`（`projectile_chr_sntlla_s2` 的 `_effectsWhenReached`）
     → kit 的 `iceSpike` 落点；冻河 S1 的两个标记 loop `tocka_skill_01_buff_02` / `_buff_01`
     （`EmptyAnimatedAbility._activeBuffs on: targets`）→ kit 的 `mark`；冻河 S2 的 `tocka_skill_02_hit_01`（投射物命中）
     + `tocka_skill_02_buff_02`（`CreateBuffAllowAll` 的 loop）→ kit 新增的 `allyMark`（S2 落在友军身上的那个标记）。
  3. **仍按设计不播**（记录在案，不硬绑）：至简 S2 的 `malist_skill_2_buff` / `_buff_weapon` 是 `eff_cond` 条件 buff，
     奥尔佳 S1 的 `start_02` / `start_03` 是 `MultiHitUberEffectEmitter` 的多段施放（计划只放第一段）。
- **fx-viewer 只跑渲染侧**：kit 自己 `battle.fx(...)` 的（`iceSpike` / `saltWard` / `overclock` / `mark` / `allyMark` …）
  在里面根本不会触发，只能在 sim（沙盒 / 真实对局）里验；渲染侧的绑定由 `test/render/vfx-regulation.test.js` 钉住。
  冻河 S2 的 `allyMark` 改了 sim 的事件流，golden 已归因（只动 `events.fx` 与 `fx.allyMark` 两个字段）后重算。


**镜波修正**：主线把「被击倒后使周围法抗最低的**敌人**法抗 +10」理解为对**敌方单位**生效（`reg:res`），
本仓库此前误加到我方干员身上，现改用主线实现；镜眼（受到法术伤害使来源攻速 -50）同样改用主线版本。


### 待办（后续做）

已完成的机制（保留记录）：

- [x] 后兽 `SummonBranchEnemy`（分支增援）**机制**：`kitTail` 已接（CD 170 / 初始 5 / 仅第二形态），按关卡 `branches[branch_id]` 生成。
- [x] act3 boss 官方特效映射：`public/js/render/vfx/regulation-fx.js`（械 / 冲击之械 / 后兽 / 茧 / 鳍 等；见 §4 的映射表条目）。
- [x] 茧【淤困捕食】改为每侧随机 2 个（普通 2/4，隐秘核心 3/6，按技能黑框；普通攻击仍每侧血最高 3 个）。
- [x] **`enemy_9027_acfnca` 的 `HitPoint` 正确值**（2026-11-18 查清，客户端重抽）：上游的 `0,-0.779112,-0.303` **不是坏点**，是从客户端抽出来的真值——该 prefab 的根 `HitPoint` 局部仍是标准 `(0, 1.8, 0)`，差别全在它的 `Graphic` 节点被摆在 `y = -1.2`（其余敌人都是 `-0.2`）。本树渲染只取 `Graphic` 的 −30° 倾角、从不取它的位移（`render/vfx/mounts.js` 的 `graphicRotation`），所以按 prefab 原样合成会让该单位所有锚点比我们画出来的模型低一格。`fx.py` 的 `skin_points` 现在会把「比常规摆放低半格以上」的 `Graphic` 位移扣掉（位移换成 `(0,-0.2,-0.06)`，旋转与缩放保留），重抽后该单位的三点 = `HitPoint (0, 0.220888, -0.303)`、`HeadPoint (0, 0.735307, -0.6)`、`SpecialPoint0 (0, 1, 0)`；`index.json` 只改了这一处（其余 5563 个 prefab、679 个 skin、685 个 unit 逐键比对不变），`test/local-extract-fx.test.js` 34/34、`test/render/vfx-{regulation,origins,orient,skillfx}.test.js` 68/68。

仍未处理（2026-11-18 记录）：

- [ ] **后兽【返璞】的分支内容**：`dyjsww_summon` 是 ISW-DF 末狩关卡的 `branches`，本机 `.cache/gamedata` 只有 act3 关卡（`level_autochess_enemy_data.json` 的 branches 只有 `dragon`；act3 关卡本体有 `acsgnt` / `acfnca` / `left_acfncb` / `summon_enemy` / `boss_summon_enemy` / `dslily_dstnta` 等分支，没有 `dyjsww`），没有 ISW-DF 关卡。**客户端也帮不上**：`hot_update_list.json` 里 `gamedata` / `excel` 各出现 0 次、没有 `levels/` 的 bundle，关卡与表只在 gamedata 镜像里。拿到关卡 JSON 后放进 `stages.json` 的 `branches` 即可生效。
- [ ] **恶尘源石虫 `DetectStorm` 的可测内容**：十四章的 `活性源石风暴`（特殊敌人）与 `源石污染区` 的隐藏控制器装置不在 act3 数据里；补这两个单位/装置后才能验证「靠近立刻死亡 + 风暴 +1 增幅」和污染区的 50/100/200 真实伤害。已核：`enemy_8019_pollut`（源石污染区，3 个等级）在 `levels/enemydata/enemy_database.json` 里有完整属性，可以直接建单位；但 `活性源石风暴` 在 2,234 个敌人里没有任何条目（它是第十四章的场地图装置，表在缺失的 trap / token 表里）。
- [x] **寒檀 S2 冰锥下落时间**（2026-11-18 查清，客户端 `battle/prefabs/[uc]skills.ab`）：官方 S2 的冰锥是投射物 `projectile_chr_sntlla_s2`（`AttachToTarget`，`_delayAfterReached` 1、`_delayTime` **0.6**、`_forceReachedWhenTimeup` 1、`_lifeTime` 1；`EffectBehaviour` 的 `_effectsWhenReached` 是 `sntlla_skill_02_start_01`（8 s 冰场）、`_effectsWhenHit` 是 `sntlla_attack_hit_02`），所以从攻击到落下/命中是 **0.6 s**，不是原来的 0.3 s 视觉值。`chess_char_5_21-sntlla.js` 的 `ICICLE_DELAY` 已改 0.6（`kits_t5` 51/51）。命中时点后移，golden 归因后重算：**只回退这一处 → 两套语料全等**；重算后默认 `roster` 2 / `bonds` 2 / `fields` 5、规程 `roster` 2 / `bonds` 2 / `fields` 4 / `matches` 3（共 20 个场景，`matches` / `standins` / `diy` 其余不动）。
- [ ] **冲击之械的砸地与 falldown 官方特效**：prefab `enemy_acfnca_skill_02_start_01` / `enemy_acfnca_move_01` 在索引里，但 `kitArmor` 的砸地/落地是直接结算伤害，没有 `castSlot`/`fx` 事件；需要给 kit 加事件并接 `ENEMY_FX_BINDINGS`。
- [ ] **械的 `WithArmor` 形态**：`talents.js formModes` 对该单位返回空，客户端不会切 mode；攻击行与 Default 相同，视觉差异小，但严格说没对齐。
- [ ] **`tools/local-extract/fx.py` 重抽**：提交的索引是合并后的 5564 个 prefab（本树 5111 + 主线 453），当前提取器只产出 5111；以后重抽会把 453 个上游 prefab 丢掉，需要改提取器或固化合并步骤。2026-11-18 顺带查出并补齐了两处机器侧清单不一致（都在 `public/assets/local/fx/`，提取器产物、不是 `data/` 生成物）：`textures.json` 只有 3778 项而 `tex/` 下有 3950 个文件（合并进来的 172 项贴图没登记，含 3 项本次新抽的），按文件补登记后 3950；本机 `data/local-fx.json`（gitignore）原先停在合并前的 5111，已按索引重建为 11011 项（5564 prefab / 3950 贴图 / 1495 网格）。
- [ ] **push**：本地 `master` 尚未推到 `origin` / `gitee`（需要凭据与明确授权）。
- [ ] **清理**：主线 `localhost:3001` 服务仍在跑；之前拷进 `D:\DOTK\Stronghold-Protocol\public\dev\` 的对比文件未删；本机 `data/local-fx.json` 按设计不入库（换机器需重新生成）。

回归：`node --test test/versions-bosses.test.js test/versions-cocoon.test.js test/content/enemies_bosses.test.js test/versions-enemies-official.test.js test/versions-enemies-procedural.test.js test/render/vfx-regulation.test.js`（含新增的 50% 阈值、护甲形态、影役光环、镜波/镜眼、狂暴凶豕兽、恶尘源石虫用例）。

## 5. 合并清单

### P0 版本宿主（5–8 人日）
- [x] **P0.1** 注册表 `shared/versions.js`（默认 + `act3autochess@V3_1`）、`server/data.js` 的 `versionDataDir/getVersionData/resetVersionData`、`test/versions.test.js` — `f39e2cb91`
- [x] **P0.2** `versionsFrom`（`SP_VERSIONS`/`SP_VERSION_DEFAULT`/`SP_MAX_VERSION_HOSTS`，未知 id 丢弃、默认不可用回退）；`server/versions.js` 的 `createVersionSets`（每版本 `cs`、目录、索引、bounds、可用性）；`/data/versions/<slug>/` 只在启用时提供（默认 `/data/` 明确 404）、`/cs/<cs16>/index.json` 与 `/bounds/official.json`；`/healthz.versions`（仅启用非默认版本时）；启动日志。测试：`test/version-sets.test.js`、`test/http-versions.test.js`
- [x] **P0.3** `lobby` 版本字段（`room.version`、`room.state.version`、`welcome.versions`）；`room.create { version }` 与 `VERSION_UNKNOWN`/`VERSION_UNSUPPORTED`（未启用、数据不可用、该模式未提供、版本房开关玩法插件）；房间数据与对局走该版本（`dataFor`、`versionHosts`）；`server/match/host/` 的 `kind: 'version'`（`version-crash`/`version-hang`/`version-start`，每版本 `officialBounds` 由 host 安装）；`/healthz.versions.hosts`。测试：`test/lobby-versions.test.js`、`test/versions-host.test.js`
- [x] **P0.3b** `room.proposeVersion` 版本投票：房主提议；房间只有一名在场真人时立即切换，否则在场真人投票（同意/拒绝/房主取消），最后一人同意即切换；`room.state.versionVote` 下发目标/投票人/已同意/过期时间；拒绝或超时后 5 s 才能再次提议；切换时重解析房间的装饰插件（玩法插件只属于默认盟约，丢弃并警告）、难度回退到目标版本提供的档位、**协议模式跟随**（新版本有同名 mode 就保留，否则按难度映射到该版本的模式，例如 盟约 NORMAL → 规程等级5）、非房主取消准备并清空 loadout/自选/内容确认。协议 `room.proposeVersion` / `room.versionVote` / `room.cancelVersionVote`；客户端房间页版本切换与投票条。测试 `test/lobby-versions.test.js`
- [x] **P0.4** `public/js/versions.js`（`welcome.versions` 清洗、浏览器偏好 `sp.pref.lobby.version`、服务器默认回退）；`content.js` 的 `loadVersionSet` 按 `/cs/<cs16>/index.json` 下载并校验该版本 15 个数据文件与 bounds，`installContentSet` 在房间内换上该版本数据、离开还原；`simContent` 带 `version`。**建房页的版本选择器已按 owner 要求移除（2026-11-17，经典大厅与 Hub 协议页都不再显示）**：建房一律用服务器默认版本，进入房间后用 P0.3b 的版本切换/投票换到规程；`room.create { version }` 协议仍保留给测试与 agent。测试：`test/ui/versions.test.js`；浏览器 smoke：Hub 协议页建房 → 房间内切到规程 → `__SP_CONTENT__.state()` 为 ready
- [x] **P0.5** `tools/versions/*` 通用 profile 加载器：`profiles.mjs`（`loadProfile` / `pinGroupOf` / `pinnedShaOf`）、每个版本的 profile（`act2autochess.mjs`、`act3autochess-v3_1.mjs`）、`sources.mjs`（镜像基址）与 `adapters.mjs`（当前 pin 无需 adapter）；`tools/build-data.mjs` 的 section 路径与 `layout: 'regulation'` 改由 profile 驱动，不再按版本 id 硬编码。测试 `test/versions-profiles.test.js`

### P1 规程数据（3–5 人日）
- [x] **pin 缓存**：`.cache/gamedata@6f63c14e/`（9 张 excel 表 + 61 个 level 文件，PowerShell 从 `raw.githubusercontent.com/.../6f63c14e/` 取；Node 的 TLS 在本机被中间证书挡住，构建器下载不可用）。第 9 张是 `char_patch_table.json`：模板干员（阿米娅·医疗）的 character 记录不在 `character_table` 里
- [x] **`--version` 骨架**：`tools/build-data.mjs --version act3autochess@V3_1` 从注册表取 season / 输出目录，按 `activity.AUTOCHESS.act3autochess.V3_1` 定位 section、`autoChessData` 取共享表；默认构建 `--offline` 仍逐字节不变（298 chess / 23 bonds / 361 effects，exit 0）
- [x] **版本专有表**：`tools/versions/tables/act3autochess-v3_1.mjs`（bountyDrafts / shopDraft / tacticDraft，145 行，按 15 场联合录屏实测）已接入；`stock` 按上游规则在版本构建中留空（无按名库存覆盖）；版本构建的总额度上限 7 MB
- [x] **构建干净通过**：15 文件 / **6.46 MiB**，写入 `data/versions/act3autochess-v3_1/`；`test/data-versions.test.js`（pin 缓存缺失时跳过）验证「重建逐字节相同」与计数
- [x] **`layout: 'regulation'`**：移植 `tools/versions/layouts.mjs`，10 张 stage 由 5×9/6×21/13×21 三段 piece 拼回 **19×21**（`composeRegulationStage`）；round 模板走 `placeRegulationTemplate`
- [x] **计数与上游一致**：chess **310**、bonds 26、bands 61、items 116、choices 9、garrisons 334、tokens 34、stages 12、effects 465、bosses 16、waves 50、factions 5、visible 141；modes 26、hiddenCore {350,1200}
- [x] **版本化 gating**：版本构建跳过 fork 的自定义干员/阵营、版本 stock 留空、act2 专有 pool 丢弃、模式里缺失的盟约剔除、DIY 池里缺召唤变体的「王」剔除、模板预设（`backup.tmplId`，阿米娅·医疗）在构建时应用（见下条）
- [x] **enemies 343 = 上游**：参照 `enemy_database` 补两个没有任何 act3 表/波次引用的条目 `enemy_2017_csphts` / `enemy_2123_dyjsww`（版本表 `enemyExtras`，仅本版本；`STATS_ONLY` 数据形态）。默认数据不变；`test/versions-enemies-procedural.test.js` 覆盖 98 个新增敌人
- [x] **`backup.tmplId` 的完整形态**：官方 `charShopChessDatas` 的模板行（`chess_char_5_26`：`charId` 阿米娅 + `tmplId` char_1037_amiya3，医疗形态）在构建时应用——`char_patch_table.patchChars` 提供模板角色记录（skills / phases / `uniequip_00x_amiya3`），行的 `charId` / `backupCharId` 改为模板、`tmplId` 置空，stats / trait / skill / talents / range / 模块 / 美术全部取模板；套件随之改为 `ver-amiya3.js`（S1 哀恸共情、S2 慈悲愿景、天赋诚挚期许）。默认盟约没有模板行，因此不加载该表、数据逐字节不变。测试 `test/versions-templated.test.js`、`test/content/kits_ver_act3.test.js`；规程 golden 归因后重算（roster / bonds / fields）
- [x] **隐藏输入显式化**：① `data/assets.json` 的 `spineLocal` 片段——`tools/fetch-assets.mjs` 把版本并集（`tools/assets/versions.mjs presentationUnion`）的敌人/召唤 ID 并入计划，本机抽取的 98 个敌人模型因此进入共享 manifest；`tools/assets/local-enemy-spines.json` 从抽取结果重建（96 → 98，含 79 个规程敌人）；② 版本构建设 `tuning.json`（结果称号规则；**不含**盟约专用的 `boost` 层，规程数值按官方）；③ `docs/research/*` 不再静默：版本构建先找 `docs/research/versions/<slug>/`，缺失时在报告里 `[ASSUMED]` 警告。测试 `test/data-versions.test.js`、`test/versions-assets.test.js`

### P2 规则与内容（8–12 人日）
- [x] **跨版本套件键控**：`KIT_CHAR_IDS`（145 个 tier kit key → charId）、`TIER_KIT_KEYS_BY_CHAR`、`officialKitKey`（默认数据与插件内容集仍按 chess id；版本数据按 charId，避免复用 id 跑到别人的套件）；规程 310 个 chess 中 3 个同 id 同干员、203 个按 charId 解析，40 名新干员列入 `PENDING_KIT_CHARS`。测试 `test/versions-keying.test.js`；默认 golden 全量不变
- [x] **一个可玩难度的对局验证**：把规程数据集安装为进程数据后，1 人 + 3 AI 走完 INFO 确认、选队/招募、准备、一场战斗、结算，到达第 2 回合准备；0 引擎错误、invariants 通过。测试 `test/versions-match.test.js`
- [x] **40 名规程干员套件**：按 `PENDING_KIT_CHARS` 逐批编写并移除（现为空）。batch 1 极光 / 安哲拉 / 伊桑 / 星源（移植 mainline），batch 2–9 本树实现：慕斯、灰喉、拜松、卡达、摆渡人、夏栎、霜叶、烈夏、真理、铸铁、陨星、杰克、蓝毒、星极、海沫、吉星、复奏、奥尔加、阿米娅、青枳、芬、奥斯汀、䌷、车尔尼、暴躁铁皮、云迹、乌啾、风絮、水灯心、罗比菈塔、褐果、折光、Miss.Christine、渡桥、旅骨、乌有。测试 `test/content/kits_ver_act3.test.js`（40 套件全部技能手写 + 数值断言）、`test/versions-keying.test.js`
- [x] **新盟约（batch 1）**：`bonds/regulation.js` 的「聚合」与「伊比利亚」——聚合按成员攻击范围每秒回血/元素并给 3 人减伤；伊比利亚每次伤害叠 10 层 10 秒法术 DoT，6 人翻倍、减速、20% 弹射 300% 攻击力。伊比利亚自己的 DoT/弹射（`bond:iberia` tag）不再触发本盟约（曾导致 6 人弹射递归到 hook 深度上限，规程 golden `coop2-HARD-4` 记录到该缺陷）。测试 `test/versions-bonds.test.js`
- [x] **新盟约（batch 2）**：「乌萨斯」成员 ATK/HP 加成、击杀叠 2（6 人 4）层、6 人受伤按比例转 10 秒生命流失与阻挡期间每秒法术伤害；「莱塔尼亚」成员与召唤物 ATK 加成、敌人死亡召唤「小节」（6 人上限 20 + 30% 改为「乐部」并给成员攻速 +20）、我方干员死亡额外召唤。测试同 `test/versions-bonds.test.js`（4 个新盟约共 4 项）
- [x] **boss_11–17**：`enemy_9029_acfnc` / `_2`（械：攻击召唤量变之械、20% 血召唤冲击之械）、`enemy_9035_acspider` / `_2`（蛛：每 25% 血获得 50% 双闪+迷彩、50% 血酸雨、周期缚网）、`enemy_9037_aceel` / `_2`（电：攻击附带神经损伤、未阻挡护盾、被阻挡消耗并强化下一击、离子环波）、`enemy_2124_dyjsfg`（矩兽：阻挡/停止时 35% 减伤否则 90%、2.5s 践踏、40% 血过载、死亡清场+全体物理伤害）。测试 `test/versions-bosses.test.js`；部分细节（跳跃/方向减伤/天气雷击）为近似
- [x] **程序化敌人覆盖**：`enemies/procedural.js` 对无手写套件的版本敌人生效（仅版本数据；默认数据/插件内容集保持原查找，golden 不变）。96 个规程新增敌人：**23** 个按天赋签名复用已有套件、**40** 个由通用天赋组处理器覆盖（减伤/增攻/闪避/流血中毒/死亡爆炸/践踏/巨体/被动/暴击/首击/射击叠层/减速/束缚/召唤/过载/移速/光环/吸血）、**7** 个 boss 已单独实现；合计 **70/96**。测试 `test/versions-enemies-procedural.test.js`（全部 96 个生成+运行 0 错误，覆盖集合钉住）
- [x] **官方敌人机制（26 个）**：`enemies/regulation.js` 手写套件覆盖剩余全部 26 个（重生的锋盔学徒、死亡爆炸+寒冷的冰原卫法、三种寻路者弹药、补给车光环、乐团双姿态、投石机首击、掷弹兵轻量、推进者受阻挡强化、漂游蟹神经损伤、雪山双姿态/冻结破除、量变之械首击双倍、影役阻挡光环、丛生首击禁疗、食人花吞噬、帕拉杜利斯冲锋、搏命养家者警戒/减伤）。测试 `test/versions-enemies-official.test.js`；部分细节（吞噬/冲锋/双姿态切换节奏）为近似
- [x] **规程敌人 96/96 覆盖**：23 个签名复用 + 40 个通用天赋组 + 7 个 boss + 26 个官方套件；`test/versions-enemies-procedural.test.js` 的覆盖集合现为零未覆盖
- [x] **规程 garrison（141 个）**：131 个复用现有 `SERVER_ADD_BOND` / `GAIN_BUFF` / `SERVER_GAIN_EQUIP` 等类型处理器；新增 5 类 prep handler（自身出售价 +N 上限、免费刷新升级上限、场上携带装备干员加层、战斗结束存活干员加层、临时层转换占位）并补 `piece.sellBonus` 到出售结算。测试 `test/versions-garrisons.test.js`（全覆盖 + 4 项行为）
- [x] **规程 band 元数据**：`buildBands` 从官方 `activity_table` 的 `skillInfoDataDict` / `effectInfoDataDict` 写入 `bands.json`（44 个新 band：ACTIVE 25 / PASSIVE 13 / NONE 6；目标 COMMON_CHESS 11 / NO_TARGET 10 / SHOP_SLOT 2 / MAP_TILE 2；可用 ROUND_RESET 17 / ALL_LIMIT 3 / DEFAULT 22 / COOLDOWN 2；含 cost / unlockType / HUD）。默认数据 `bands.json` 逐字节不变。测试 `test/versions-bands.test.js`
- [x] **规程 band 的可用模式**（修复）：官方 act3 用 `bandDataListDict[].inactiveModeIdList`（不在哪些模式提供）而不是允许列表；版本构建曾把它写成空的 `modeTypeList`，`bandAllowed` 视为「任何模式都不可用」→ 规程选队一个策略都选不了。现版本数据写 `modeTypeList: ['SINGLE','MULTI']` + `inactiveModeIds`，`GameData.bandAllowed` 按 `modeId` 排除（极速 31 个、单机等级 60 个、联机 61 个）；默认数据无该字段。测试 `test/versions-bands.test.js`
- [x] **规程 band handlers**：**B1–B7 完成**。B1 被动 5 个；B2 `g.bandSkill` intent + 经济类 10 个；B3 选干员 7 个 + 4 个战斗标记 + 官方解锁链（`skill.stages`）+ 伊比利亚；B4 地块/商店格 4 个 + 玩家级标记；B5 无 key 技能 4 个 + 准备期被动 5 个；B6 7 个 `auto_chess_effect_replace`（5 个复用现有盟约 6 名实现、维多利亚借装备、阿戈尔整备区召唤）；B7 `band_random` 追随者们（每次休整期 2 个随机指令二选一替换，`g.bandSkillChoose`，只替换指令不换策略/被动）。测试 `test/versions-bands-skills.test.js`、`test/content/bands_marks.test.js`、`test/content/bands_replace.test.js`、`test/versions-band-egir.test.js`、`test/versions-band-instructions.test.js`
- [x] **[汇总]** **其余规程内容**：下方 189–195 的具体条目（装备/盟约规则、hidden core、地图/指令/寻宝与 top-3 统计）均已完成；141 个 garrison 与 54 个 band effect 已完成。
- [x] **26 个官方模式**：`config.modes` 的 26 个模式（入门 / 极速 / 规程等级 1–20 / 四档多人）全部由数据驱动；每模式有完整回合表（模板、boss/hidden 回合、spRounds、enemyScale、stage 池），`test/versions-modes.test.js` 校验全部 26 个并用 4 个代表模式跑到 PREP。大厅把 4 个难度映射到规程等级 1 / 5 / 9 / 15（`officialModeId`）；20 级单独选择器留 P3 UI
- [x] 核心盟约二选一（个人）**服务端完成**：`g.coreBond`、两组随机核心盟约、落选组进禁用并重建池/自选库存（`Match.coreBondGroups` / `phases.applyCoreBondChoice`，默认盟约无变化；选择器 UI 随 P3）
- [x] 核心优先禁用（规程）：`GameData.bondsExclude` 按官方多人录像（BV1hmWL6fEmQ，`docs/research/regulation-core-ban-video-…`）——有核心盟约时只看核心，全部核心灰才禁用；无核心时才看附加盟约。初雪（谢拉格灰 + 协防亮）因此离场，多核心留任一、无核心随附加；`pool` / `coreBond` 重建 / 自选库存 / 具名奖励共用。默认盟约保持原「全部盟约联合」判定。测试 `test/versions-corebond.test.js`
- [x] 自选无特质、按阵营分盟约：`shared/diy.js` 的自选记录取槽位身份（`garrisonIds: []`）与干员的派生盟约（`backups.diy.operators[charId].bonds`），非盟约表原样复制；Ⅴ/Ⅵ 各 0–2 由 CUSTOM_CHECK 实现。测试 `test/diy.test.js`（默认数据）与 `test/versions-custom.test.js`（规程）
- [x] 装备区（服务端）：独立 5 格 `equipHand`（`economy.equipHandSize` = 官方 `constData.maxDeckEquipmentChessCnt`），购买/获得进装备区、从装备区装备、装备区参与合并；默认盟约仍与手牌共用（`equipHandSize` 缺省 0）。测试 `test/versions-equipment.test.js`；UI 随 P3
- [x] 每干员装备容量：版本构建写入官方 `charChessDataDict[].equipSlotNum`（非 2 时）到 `chess.json equipSlots`，`GameData.equipSlotsOf` 覆盖 `equipPerChess`（Ironhide 4 / 6，其余 2）；装备/替换、invariant、bot 与装备区 UI 均按干员容量；`shared/standIn.js IDENTITY_FIELDS` 携带该字段。测试 `test/versions-equipment.test.js`
- [x] 招募例外 `recruitTierExempt`：不是 gamedata 字段，而是版本档案标记（`tools/versions/act3autochess-v3_1.mjs` 只写 `chess_char_5_22_a`）。构建给普通/精锐两条记录写 `recruitTierExempt: true`；`effectsMeta.rollChess` 的 `tierExemptChess` 只放行「有标记、隐藏、非精锐、非自选、不在普通库存、未被禁」的那一条，`SharedPool._eligible` 只让它绕过 `maxTier`、保留真实阶级。`equip_destory_first_bond_char`（简易通讯机）已实现，寻呼模块不继承。测试 `test/match/ironhide-items.test.js`、`test/data-versions.test.js`
- [x] 隐秘核心端到端：规程 solo NORMAL+（⟨等级5⟩+）/ co-op HARD+（⟨险境⟩+），Σ 激活层数 > 350/1200 且 team LP > 1，R14 胜利后进入 R15；未通过不影响通关。测试 `test/versions-hidden-core.test.js`；阈值 350/1200 仍 `[ASSUMED]`
- [x] 隐秘核心/领袖/联防复核：Hidden Core 350 / 1200、R14、solo NORMAL+ / co-op HARD+ 与上游一致；领袖共享血池（`bossHpScale.perPlayer`）与超时 150 s 后 1 LP/s；联防 `layerGainsEnabled: false`（`fields.js` 拒绝战斗内加层），HP/SP/位置继承与漏怪满血。测试 `test/versions-config-rules.test.js`，行为覆盖 `test/versions-hidden-core.test.js`、`test/versions-boss-top.test.js`、`test/match/finalAssault.test.js`
- [x] 地图规则：MAP09 双方隐匿地块（`tile_duel_grassland`：双方地面单位获得隐匿、被阻挡显形、解除阻挡立即恢复——官方 `enemyStealthRestoreSec` 0 即「草丛秒数」、离开清除；`special.duelGrass`）；m12 加速地块（`tile_speedup` +25 ASPD / ×1.5 移速）；Boss 受击区（7 个 act3 首领的 `hitArea` 已随数据生成）；茧隐匿索敌与「淤困之茧」捆绑（Net 只选可选中目标、茧捆绑一格并自损 4 %/s）；萨卡兹亡语（子裔寄生者周围击杀召唤大君之赐）与延迟召唤（自助出餐终端按技能 CD 召唤）；莱塔尼亚召唤改为**友方 token**（小节/乐部，可阻挡地面敌人并自损）。测试 `test/versions-map-rules.test.js`、`test/versions-cocoon.test.js`、`test/versions-enemies-official.test.js`、`test/versions-bonds.test.js`
- [x] 指令（主动策略）：服务端 `g.bandSkill`、客户端点击/拖放与目标选择、每回合次数/资金/冷却显示、追随者们的指令替换（B7）；变换策略仍待核对
- [x] **领袖战 top-3 伤害统计**：`config.bossDamageStats`（官方 30/60/100 阈值）存在时，`m.public.bossHp.top` 下发共享领袖血池的前三名（玩家、伤害、占最大生命百分比），顶栏领袖胶囊显示；测试 `test/versions-boss-top.test.js`
- [x] 寻宝人：band 侧「模拟宝藏」（触碰永久消失、存活给钱、所在格无法部署、休整期只读可见、客户端放置预览、身体重叠判定）与机器人使用（`botTreasureTile` 选路线外可部署格，`botPrepEndSteps` 在准备就绪前发 `g.bandSkill`）。测试 `test/versions-treasure.test.js`、`test/content/bands_marks.test.js`、`test/match/bot-treasure.test.js`；装备报告 tab 已由 P3 完成
- [x] **组合装备（#944）**：获得另一半即合成，包括穿在干员身上的搭档；成品未装备，回到装备区。休整期结束的发放（`deferMerge`）只收下这一半并标 `pendingFusion`，下个准备期开始 `checkItemMerges({ releaseDeferred: true })` 再合成，开战前不会卸下搭档；商店购买、奖励领取与画卷复制走同一路径。一次 `onMerge`、两个组件各一次 `onDestroy`（reason `fuse`），没有 `onEquip`。测试 `test/match/item-fusion.test.js`
- [x] **装备研究按 `trapId` 索引**（与上游一致）：赛季复用物品 id 时不再串味——规程 5_05 是「天马之盔」而不是 act2 的「拟态物质」，5_08「佣兵名牌」不再套用突变细胞规则；商店排除与规则表改按效果 id 查找。测试 `test/data-versions.test.js`
- [x] **#943 莱塔尼亚**：任意敌方单位被 `killed` 即按 `summon_prob_*` 召一只小节；六名不同成员时按 `big_prob_*` 改为乐部、自身干员被击倒额外召一次、上限 20（否则 10），只数该玩家自己的存活召唤。召唤物是**不占 `_occ` 的移动 token**：可以叠在干员/倒地身体上，`relocate` 直接拒绝，`blocking.js` 在出现过追击召唤物的战斗里按坐标扫描它们；`content/bonds/lethania.js` 按四向地面路径追击最近可选敌人，小节优先攻击出生格上的敌人（`birthCellTargets` / `birthLocalTargets`，局部集空后永久退出），空场时回到出生格中心；乐部每三次攻击后的下一次攻击命中两次。测试 `test/versions-bonds.test.js`
- [x] **对局侧修复**：#932 暴躁铁皮（S1 清除异常并免疫、攻击范围内的友方、崩裂之击 1.7 格）；#934 极光/忍冬 与 #937 白铁 核对后与上游等价；#925 装备池；#939 MAP09 隐匿；#947 萨卡兹死亡替换；#946 阶段横幅去重（`phaseBanner` 对休整/作战/机变返回 `null`，机变只留 `轮到你选` 圆盘，单人也提示）。测试 `test/content/kits_ver_act3.test.js`、`test/data-versions.test.js`、`test/versions-bonds.test.js`、`test/ui/gameLogic.test.js`、`test/ui/turn-popup.test.js`

### P3 UI / 主题（8–12 人日）
- [x] 规程等级 1–20 的**服务端选择**：`room.setMode { modeId }` 接受版本自己的模式（`config.modes`，如 `mode_single_7`），同步房间难度与 `content.modeId`；测试 `test/lobby-versions.test.js`
- [x] ~~房间**等级选择器 UI**（`screens/room.js` VersionLevelPicker，含 极速模拟 + 等级1–20 / 联机四档）~~ —— owner 2026-11-18 明确要求删除（联机四档与难度 tab 重复）：房间栏不再放「选择模拟协议」下拉，协议模式由难度档位映射（服务端 `room.setMode` 保留）。简报**核心盟约二选一 UI**（`screens/briefing.js` CoreBondChoice，`g.coreBond`）保留；测试 `test/lobby-versions.test.js`
- [x] **装备区 5 格 UI**（`ui/equipArea.js`：`m.private.equipHand` 抽屉、点击装备 → 选有空栏的场上/手牌干员 → `g.equip`）；测试 `test/ui/equip-area.test.js`
- [x] **band 技能按钮与目标选择 UI**（`ui/bandSkill.js`：`m.private.bandSkill` 的名称/消耗/剩余次数/冷却，`NO_TARGET` 直发、`COMMON_CHESS`/`SHOP_SLOT` 目标列表、`MAP_TILE` 行列选择 → `g.bandSkill`；服务端视图 `views.js bandSkillView` 走官方阶段链与实时价格）；测试 `test/versions-band-skill-view.test.js`、`test/ui/band-skill.test.js`
- [x] **指令替换 UI（追随者们）**：休整期显示本次 2 个候选指令（效果名 + 策略名），点选发 `g.bandSkillChoose`；`m.private.bandChoice` 下发候选与已选，策略与被动不变；测试 `test/versions-band-instructions.test.js`
- [x] **装备报告 tab**：本局信息抽屉新增第三页（仅 `economy.equipHandSize > 0` 的版本），先列装备区，再按场上 → 手牌 → 临时整备区列出每名干员已装备的装备与官方效果文本；`ui/enemyDrawer.js equipmentReport`；测试 `test/ui/equipment-report.test.js`
- [x] **选择自编（CUSTOM_CHECK）**：版本 `config.timers.enterSteps` 含该步骤时，选队后进入 30 s 的选择界面；玩家从自己的自选编队中带 **5阶/6阶各至多 2 名**（`g.custom`），确认（`g.customReady`）后应用 `setDiy` + 重建自选库存，再进入协议启动；超时按当前选择；默认盟约无此步骤。测试 `test/versions-custom.test.js`、`test/ui/custom.test.js`
- [x] **规程 HUD**：顶栏的版本标记（`ui/hud.js versionMarkModel`：`规程·序列Ⅰ` + 该房间的准确模式名，如「规程等级7」「绝境模拟」，默认盟约不显示）；加上既有的策略条、指令按钮、装备区抽屉与本局信息页。测试 `test/ui/hud-version.test.js`
- [x] **双栏简报**：INFO_CHECK 已是左「敌方情报」+ 右「核心盟约二选一 / 本局信息」两栏（`screens/briefing.js` + `ui/matchInfo.js`）；规程仅追加核心盟约二选一。
- [x] **领袖战徽章**：最终攻势 / 隐秘核心的领袖徽章与血条在顶栏（`ui/hud.js PhaseCapsule`，领袖图标 + 共享血池），结算页的领袖/隐秘核心勋章与评语在 `screens/result.js`。
- [x] **官方主题包 + 提取器（已按 owner 要求退役，2026-11-17）**：主题机制仍在（`shared/uiTheme.js` / `public/js/uiTheme.js` / `public/css/ui-theme.css` / `tools/theme-template.mjs --check`），但注册表为空：规程改用**盟约的 mint/green 外观**，不再替换色板或给房间页加主题图。曾登记过的 `act3autochess` 主题图仍留在 `public/assets/local/theme/act3autochess/` 作为未来版本的参考包。测试 `test/ui/ui-theme.test.js`
- [x] **每版本音乐**：`public/js/audio.js VERSION_BGM` 把规程的 `var/music` 包映射到阶段（主题 Kernel Overflow / 作战 Restore / 领袖 Ens Inexorabile / 隐秘核心 Systematic Violation）；`m.public.version` 选择版本，缺包时按 `resolveBgm` 回落到默认大厅曲。测试 `test/ui/audio-version.test.js`
- [x] **3D 简报图（静态降级，随主题退役）**：曾用官方入口图 `stage_act_entry_act3autochess.png` 作简报背景、赛季徽记作水印；2026-11-17 起规程统一用盟约简报外观，入口图仍保留在 `public/assets/local/ui/activity/act3autochess/`。不做实时 3D，避免与 §0 的 `board3d` 冲突

### P4 素材（3–5 人日）
- [x] 关卡 `.dat` 先解 zip；规程三段场景导出（`import_scenes.py` + `regulation_scenes.py`，m01 实跑通过；见 §3.1）
- [x] 合并两个 AB 根（`bundles.py`：`--game` 安装目录 + 硬链接缓存树，实测 1388 下载 / 13355 打包）
- [x] act3 的 activity / 主题 opt-in 任务（`EXTRA_JOBS`，270 + 1 文件）；enemy-fx 已由 `fx.py` 的 glob 覆盖
- [x] **按版本素材并集规划**：`tools/assets/versions.mjs` 读取各版本 `chess/backups/tokens/enemies/items/bands/bonds/bosses/stages`，按美术身份并集（干员 216 / 敌人 343 / 策略 61 / 盟约 26 / 装备 70 / 召唤 57 / 模块类型 133），并对照 web manifest 与本地客户端 manifest 报告缺口；`--check` / `--json` / `--junctions`。测试 `test/versions-assets-plan.test.js`
- [x] 规程 4 首音乐：已从本地客户端 / Monster Siren 入 `var/music`（Kernel Overflow / Restore / Ens Inexorabile / Systematic Violation），客户端由 `VERSION_BGM` 使用
- [x] **本地客户端素材补全**：从本机 B 服客户端抽取 Amiya 基础形态 avatar/portrait/Spine、阿米娅·医疗的 avatar/portrait/Spine 与 `skchr_amiya3_1/_2` 技能图标、**96 个规程敌人图标**（含热更 `spritepack/icon_enemies_6.ab` 的 17 个 act3 专属图标，`extract.py --only enemy/icon`）、**44 个策略图标 / 4 个盟约图标 / 47 个装备图标 / 75 个技能图标**（`public/assets/local/{enemy/icon,band,bond,item,skill}`，经 `data/local-assets.committed.json` 登记；`ui/assetUrls.js` 的 enemy/band/bond/item/skill/avatar/portrait 解析回落本地，客户端只带 E2 图的形态回落 E2）；40/40 规程套件干员、98/98 敌人 Spine、10/10 战场场景、主题均已覆盖；另用 `tools/local-extract/illust.py` 从 `chararts/*.ab` 补了 **40 张规程专属干员的座次立绘**（`public/assets/local/char/illust/<charId>/<charId>.webp`，`seatArtUrl` 在 web manifest 无该干员时回落本地立绘/头像）；`assets.js spineEntry` 对 `data/assets.json` 没有 `chars` 记录的版本专属干员回落本地 `spine/char/<charId>/front|back` 模型（`localCharSpineEntry`），否则这些新干员在棋盘上没有 Spine。`enemy_9036_acweb` 是投射物/标记，客户端没有也不应要图鉴图标（`NO_ICON`）。测试 `test/versions-assets.test.js`、`test/versions-assets-plan.test.js`、`test/ui/assetUrls.test.js`、`test/ui/localArt.test.js`
- [x] **版本并集的干员 / 图标下载计划**：`tools/fetch-assets.mjs` 的 `versionOperatorExtras` 把版本并集的干员（charId、技能图标）并入 `extraOperators`，`moduleTypes` 并入模块类型；敌人与召唤此前已接入。离线运行时 39 个规程干员的 SFX 单元进入 manifest（共享音效已存在），头像/Spine/立绘优先用本地客户端素材（40 张立绘已抽，见上一条）。测试 `test/versions-assets-plan.test.js`
- [x] 中继发布：`node tools/push-assets-relay.mjs` 已把含规程素材的树部署到 relay（每次发布先于 gitee/github）
- [x] **手机端首包评估**：`tools/first-paint.mjs` 统计冷启动首包（`index.html` + 全部样式表 + `main.js` 的静态模块图 + 启动 manifest + 字体 + 图标），按 gzip 计：**约 7.2 MB 原始 / 2.6 MB gzip**；弱网 400 kbit/s ≈ 54 s，4G 1600 kbit/s ≈ 13 s。测试 `test/first-paint.test.js`。后续若需缩首包，优先拆 `main.js` 的静态图（当前 211 个模块）与按屏懒加载 CSS

### P5 golden / 测试 / CI（3–5 人日）
- [x] 按版本分目录 golden（`test/golden/act3autochess-v3_1/*.json`）+ `tools/golden.mjs --version <id>` + `tools/versions/runtime.mjs`；默认 6 文件不动（`npm run golden` 仍逐项匹配）
- [x] 规程 golden 在**我们树**上生成：304 个场景（roster 102 = 62 干员/负载 + 40 地图矩阵 / bonds 52 / fields 34 / matches 21 / standins 13 / diy 82），0 引擎错误；`test/golden-versions.test.js` 校验文件并重算 fast 子集
- [x] **地图矩阵**：10 张普通地图 × 4 个代表模式（等级5 / 等级20 / 险境 / 终极），每张地图跑该模式的真实第 7 回合波次（`map-<stage>-<mode>`，roster 家族内；两张联防地图在 fields 家族覆盖）；默认语料不受影响
- [x] `ci-shards.json` 配重：新的规程 golden 测试按 23 s 计入（4 个分片 426.8 s / imbalance 1.00）
- [x] `test/ui` 规程套件：`test/ui/regulation-ui.test.js` 用真实规程对局帧串起房间等级、简报核心盟约、追随者们指令、band 技能模型与装备报告，并断言默认盟约没有这些版本模型

### P6 冲突适配（3–5 人日）
- [x] **never-merge 守卫**：`test/versions-never-merge.test.js` 逐条锁定 §0 的 fork 面（#149 收起、本局禁用只禁“提供”、最近的同盟、下载完整素材/素材包、英/韩/本土配音、潜能 1/未精英化默认、难度 boost 层、#488 免费授予不卡库存、自造克莱门莎、board3d 主题/apron、标题页无素材包）；`test/versions-isolation.test.js` 锁定两版本的数据隔离（默认无版本块、规程模式/策略/敌人/模板只在版本数据）。
- [x] **逐块审计 14 条 §0 路径**（不整块合并；在 pin `e31e7bbae` 上各路径的版本行为已由本树实现与测试覆盖，此后上游新提交由 `check-upstream.mjs` 标记后手工移植）：
  | 路径 | 本树现状 | 覆盖 / 后续 |
  |---|---|---|
  | `public/js/screens/game.js` | 规程 UI / 等级选择器 / 自编已接；#149 与 deployFold 已移除 | `test/ui/regulation-ui.test.js`、`never-merge` 守卫 |
  | `server/match/Match.js` | 版本宿主、核心盟约二选一、宝藏标记 | `test/versions-match.test.js`、`versions-corebond` |
  | `server/match/gamedata.js` | officialBounds + boost 层 + `bondsExclude` | `test/versions-config-rules.test.js`、`versions-bonds` |
  | `server/match/bondsMeta.js` | 只禁“提供”，激活仍生效 | `test/versions-bonds.test.js`、`never-merge` 守卫 |
  | `server/match/match/spDraft.js` | 版本 pools / 奖励池 | `test/versions-custom.test.js`、`versions-assets-plan` |
  | `data/assets.json` | 自有素材链 + 版本并集 | `test/versions-assets.test.js` |
  | `public/js/audio.js` | 版本 BGM；仅中/日配音 | `test/ui/audio-version.test.js`、`never-merge` 守卫 |
  | `public/js/render/board3d/*` | 本分支 own（theme/apron） | `test/render/board3d-*`、`never-merge` 守卫 |
  | `assetDownload/assetPack.js` | 按 owner 决定不存在 | `never-merge` 守卫 |
  | `public/js/screens/title.js` | 无“下载完整素材/导入素材包” | `never-merge` 守卫 |
- [x] 保留：予愿安洁莉娜/自定义干员、`grounded`/`groundbind`、B4 固定穿透公式、65 批 VFX、插件内容集、admin/DIAGNOSTICS、i18n 四语言、潜能/练度默认（`test/versions-never-merge.test.js` 锁定）

## 6. 还原度验收

| 维度 | 怎么核 | 通过标准 |
|---|---|---|
| 数值 | `test/data-versions`：离线重建 16 表 | 与 pin 逐字节一致 |
| 模式 | 26 条模式可创建；解锁链与 PRTS §2 一致 | 名称/代码/难度/回合数/效率全对 |
| 地图 | 10 张战场，布局/出怪点/敌人分组对照本地关卡 prefab + 上游 research | 每张 1 场标准/险境各跑通 |
| 干员 | 名单/等阶/技能/模组/自选；40 kits 对照官方技能文本 | 技能行为测试 + 录屏抽查 |
| 盟约/策略/装备 | 26/61/116 与官方文本、层数、触发 | 上游对应测试 + PRTS 对照 |
| 联机 | 联防、合血、双组领袖、机变轮流 | 4 人 e2e 场景 |
| 表现 | HUD/简报/商店/主题/音乐对照官方截图/录屏 | 人工抽查清单 |
| 回归 | 默认盟约版本 golden 不变 | 279 场景全等 |

## 7. 风险 / 开放问题

- **音乐与部分模型未缓存**：本地客户端只缓存了已播放/进入过的内容；规程 4 首曲目、部分新干员与敌人模型需要客户端内触发下载后重扫，或用社区 dump。
- **官方仍在更新**：序列Ⅰ 已进入修订期、序列Ⅱ 将开；本清单钉 `e31e7bbae` + pin `6f63c14e`，不追流水。
- **未公开数值**：装备池权重、部分禁用组合、隐秘核心血量是 [ASSUMED]；标注来源与日期，按录屏复核。
- **版权**：素材不进 git、不复制官方文本长段；代码 GPL，素材仅本地/中继用于非商业同人。
