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
| 版本系统 | 注册表、版本数据托管、`/cs/`、大厅版本字段、客户端加载、`kind:'version'` 对局宿主已完成（P0.1–P0.4） | P0.3b 版本投票、P0.5 通用 profile 加载器 |
| 规程数据 | 15 文件 / 6.46 MiB 已落地，`--version` 重建逐字节通过；enemies 343 = 上游；模板预设（阿米娅·医疗）取 `char_patch_table` 的完整形态 | `spineLocal`/tuning 隐藏输入 |
| 规则/内容 | 40/40 干员套件、4/4 新盟约、96/96 敌人、141/141 garrison、band B1–B7（含指令替换）、个人核心盟约二选一 + 5 格装备区 + 隐秘核心端到端（服务端）、26 个模式、一个难度端到端可玩 | 联合半数核心、自选规则、招募例外 recruitTierExempt、隐秘核心阈值复核、地图规则、寻宝/top-3、对局修复 |
| UI | 版本下拉、加载、20 级服务端选择、房间等级选择器、简报核心盟约二选一、装备区抽屉、band 技能按钮/目标选择、装备报告 tab 已有 | 无（P3 完成） |
| 素材 | 场景/主题/敌人特效提取已跑通部分 | 按版本并集、77 敌人 Spine、新干员/地图/音乐、manifest（P4） |
| golden/测试 | 默认 golden 6 文件全匹配；规程 golden 304 场景（含 10 地图 × 4 模式矩阵）（`test/golden/act3autochess-v3_1/`）由 `--version` 在本树重建 | 无（P5 完成） |
| 冲突面 | 未动 14 条 never-merge 路径 | 逐块适配并保留 fork 特性（P6） |

## 5. 合并清单

### P0 版本宿主（5–8 人日）
- [x] **P0.1** 注册表 `shared/versions.js`（默认 + `act3autochess@V3_1`）、`server/data.js` 的 `versionDataDir/getVersionData/resetVersionData`、`test/versions.test.js` — `f39e2cb91`
- [x] **P0.2** `versionsFrom`（`SP_VERSIONS`/`SP_VERSION_DEFAULT`/`SP_MAX_VERSION_HOSTS`，未知 id 丢弃、默认不可用回退）；`server/versions.js` 的 `createVersionSets`（每版本 `cs`、目录、索引、bounds、可用性）；`/data/versions/<slug>/` 只在启用时提供（默认 `/data/` 明确 404）、`/cs/<cs16>/index.json` 与 `/bounds/official.json`；`/healthz.versions`（仅启用非默认版本时）；启动日志。测试：`test/version-sets.test.js`、`test/http-versions.test.js`
- [x] **P0.3** `lobby` 版本字段（`room.version`、`room.state.version`、`welcome.versions`）；`room.create { version }` 与 `VERSION_UNKNOWN`/`VERSION_UNSUPPORTED`（未启用、数据不可用、该模式未提供、版本房开关玩法插件）；房间数据与对局走该版本（`dataFor`、`versionHosts`）；`server/match/host/` 的 `kind: 'version'`（`version-crash`/`version-hang`/`version-start`，每版本 `officialBounds` 由 host 安装）；`/healthz.versions.hosts`。测试：`test/lobby-versions.test.js`、`test/versions-host.test.js`
- [ ] **P0.3b** `room.proposeVersion` 版本投票（已开局/多人房间的切换确认）——留到 P3 与大厅选择器一起
- [x] **P0.4** `public/js/versions.js`（`welcome.versions` 清洗、浏览器偏好 `sp.pref.lobby.version`、服务器默认回退）；经典大厅与 Hub 协议页的版本选择（`版本` / VERSION，标签取注册表 msgid）；`room.create` 带 `version`；`content.js` 的 `loadVersionSet` 按 `/cs/<cs16>/index.json` 下载并校验该版本 15 个数据文件与 bounds，`installContentSet` 在房间内换上该版本数据、离开还原；`simContent` 带 `version`。测试：`test/ui/versions.test.js`；浏览器 smoke：Hub 协议页切到规程 → 建房 → `__SP_CONTENT__.state()` 为 ready
- [ ] **P0.5** `tools/versions/*` 的其余部分（profiles/adapters/sources/runtime）——构建已用 `--version` + `tables` + `layouts` 跑通，只差通用 profile 加载器

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
- [ ] 隐藏输入：`data/assets.json` 的 `spineLocal` 片段、`data/tuning.json` 字节副本、`docs/research/*` 输入

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
- [ ] **其余规程内容**：见下方 189–195 的具体条目（装备/盟约规则、hidden core、地图/指令/寻宝与 top-3 统计）；141 个 garrison 与 54 个 band effect 已完成。
- [x] **26 个官方模式**：`config.modes` 的 26 个模式（入门 / 极速 / 规程等级 1–20 / 四档多人）全部由数据驱动；每模式有完整回合表（模板、boss/hidden 回合、spRounds、enemyScale、stage 池），`test/versions-modes.test.js` 校验全部 26 个并用 4 个代表模式跑到 PREP。大厅把 4 个难度映射到规程等级 1 / 5 / 9 / 15（`officialModeId`）；20 级单独选择器留 P3 UI
- [x] 核心盟约二选一（个人）**服务端完成**：`g.coreBond`、两组随机核心盟约、落选组进禁用并重建池/自选库存（`Match.coreBondGroups` / `phases.applyCoreBondChoice`，默认盟约无变化；选择器 UI 随 P3）
- [ ] 联合模拟禁用半数核心（规则待官方核对）；自选无特质、按阵营分盟约（Ⅴ/Ⅵ 各 0–2 已由 CUSTOM_CHECK 实现）
- [x] 装备区（服务端）：独立 5 格 `equipHand`（`economy.equipHandSize` = 官方 `constData.maxDeckEquipmentChessCnt`），购买/获得进装备区、从装备区装备、装备区参与合并；默认盟约仍与手牌共用（`equipHandSize` 缺省 0）。测试 `test/versions-equipment.test.js`；UI 随 P3
- [x] 每干员装备容量：版本构建写入官方 `charChessDataDict[].equipSlotNum`（非 2 时）到 `chess.json equipSlots`，`GameData.equipSlotsOf` 覆盖 `equipPerChess`（Ironhide 4 / 6，其余 2）；装备/替换、invariant、bot 与装备区 UI 均按干员容量；`shared/standIn.js IDENTITY_FIELDS` 携带该字段。测试 `test/versions-equipment.test.js`
- [ ] 招募例外 `recruitTierExempt`：当前 gamedata pin 无该字段，待官方表更新
- [x] 隐秘核心端到端：规程 solo NORMAL+（⟨等级5⟩+）/ co-op HARD+（⟨险境⟩+），Σ 激活层数 > 350/1200 且 team LP > 1，R14 胜利后进入 R15；未通过不影响通关。测试 `test/versions-hidden-core.test.js`；阈值 350/1200 仍 `[ASSUMED]`
- [ ] 隐秘核心阈值 350/1200 的官方/录屏复核；领袖轮合血、超时扣血；联防（不叠层）需按规程核对
- [ ] 地图规则：MAP09 双方隐匿地块、草丛秒数、Boss 受击区、茧隐匿索敌、萨卡兹亡语与延迟召唤、莱塔尼亚召唤与地面接敌
- [x] 指令（主动策略）：服务端 `g.bandSkill`、客户端点击/拖放与目标选择、每回合次数/资金/冷却显示、追随者们的指令替换（B7）；变换策略仍待核对
- [x] **领袖战 top-3 伤害统计**：`config.bossDamageStats`（官方 30/60/100 阈值）存在时，`m.public.bossHp.top` 下发共享领袖血池的前三名（玩家、伤害、占最大生命百分比），顶栏领袖胶囊显示；测试 `test/versions-boss-top.test.js`
- [ ] 寻宝人模拟宝藏（band 侧“模拟宝藏”已做，寻宝人整体未做）；装备报告 tab 已由 P3 完成
- [ ] 对局侧修复：#925 装备奖励池、#930 人事部记录、#932 暴躁铁皮、#934 极光/忍冬、#937 白铁、#944 组合装备、#939/#943/#947 规程战斗、#946 阶段横幅（随本阶段一并落地）

### P3 UI / 主题（8–12 人日）
- [x] 规程等级 1–20 的**服务端选择**：`room.setMode { modeId }` 接受版本自己的模式（`config.modes`，如 `mode_single_7`），同步房间难度与 `content.modeId`；测试 `test/lobby-versions.test.js`
- [x] 房间**等级选择器 UI**（`screens/room.js` VersionLevelPicker，含 极速模拟 + 等级1–20 / 联机四档）与简报**核心盟约二选一 UI**（`screens/briefing.js` CoreBondChoice，`g.coreBond`）；测试 `test/ui/room-levels.test.js`
- [x] **装备区 5 格 UI**（`ui/equipArea.js`：`m.private.equipHand` 抽屉、点击装备 → 选有空栏的场上/手牌干员 → `g.equip`）；测试 `test/ui/equip-area.test.js`
- [x] **band 技能按钮与目标选择 UI**（`ui/bandSkill.js`：`m.private.bandSkill` 的名称/消耗/剩余次数/冷却，`NO_TARGET` 直发、`COMMON_CHESS`/`SHOP_SLOT` 目标列表、`MAP_TILE` 行列选择 → `g.bandSkill`；服务端视图 `views.js bandSkillView` 走官方阶段链与实时价格）；测试 `test/versions-band-skill-view.test.js`、`test/ui/band-skill.test.js`
- [x] **指令替换 UI（追随者们）**：休整期显示本次 2 个候选指令（效果名 + 策略名），点选发 `g.bandSkillChoose`；`m.private.bandChoice` 下发候选与已选，策略与被动不变；测试 `test/versions-band-instructions.test.js`
- [x] **装备报告 tab**：本局信息抽屉新增第三页（仅 `economy.equipHandSize > 0` 的版本），先列装备区，再按场上 → 手牌 → 临时整备区列出每名干员已装备的装备与官方效果文本；`ui/enemyDrawer.js equipmentReport`；测试 `test/ui/equipment-report.test.js`
- [x] **选择自编（CUSTOM_CHECK）**：版本 `config.timers.enterSteps` 含该步骤时，选队后进入 30 s 的选择界面；玩家从自己的自选编队中带 **5阶/6阶各至多 2 名**（`g.custom`），确认（`g.customReady`）后应用 `setDiy` + 重建自选库存，再进入协议启动；超时按当前选择；默认盟约无此步骤。测试 `test/versions-custom.test.js`、`test/ui/custom.test.js`
- [x] **规程 HUD**：顶栏的版本标记（`ui/hud.js versionMarkModel`：`规程·序列Ⅰ` + 该房间的准确模式名，如「规程等级7」「绝境模拟」，默认盟约不显示）；加上既有的策略条、指令按钮、装备区抽屉与本局信息页。测试 `test/ui/hud-version.test.js`
- [x] **双栏简报**：INFO_CHECK 已是左「敌方情报」+ 右「核心盟约二选一 / 本局信息」两栏（`screens/briefing.js` + `ui/matchInfo.js`）；规程仅追加核心盟约二选一。
- [x] **领袖战徽章**：最终攻势 / 隐秘核心的领袖徽章与血条在顶栏（`ui/hud.js PhaseCapsule`，领袖图标 + 共享血池），结算页的领袖/隐秘核心勋章与评语在 `screens/result.js`。
- [x] **官方主题包 + 提取器**：`shared/uiTheme.js` 登记 `act3autochess`（官方主题图 `public/assets/local/theme/act3autochess/act3autochess.png` + 红/黑强调色），`public/js/uiTheme.js` 按 `room.version` / `m.public.version` / 大厅版本标签设置 `<html data-ui-theme>`，`public/css/ui-theme.css` 替换 mint 色板并给房间页加淡主题图；`tools/theme-template.mjs --check` 校验资产与 CSS 选择器。测试 `test/ui/ui-theme.test.js`
- [x] **每版本音乐**：`public/js/audio.js VERSION_BGM` 把规程的 `var/music` 包映射到阶段（主题 Kernel Overflow / 作战 Restore / 领袖 Ens Inexorabile / 隐秘核心 Systematic Violation）；`m.public.version` 选择版本，缺包时按 `resolveBgm` 回落到默认大厅曲。测试 `test/ui/audio-version.test.js`
- [x] **3D 简报图（静态降级）**：规程简报的背景改用官方入口图 `stage_act_entry_act3autochess.png`，右下角以官方赛季徽记 `entry_anim_season_logo.png` 作水印（`public/css/ui-theme.css`，仅 `data-ui-theme`）；不做实时 3D，避免与 §0 的 `board3d` 冲突。资产路径由 `tools/theme-template.mjs --check` 与 `test/ui/ui-theme.test.js` 校验

### P4 素材（3–5 人日）
- [x] 关卡 `.dat` 先解 zip；规程三段场景导出（`import_scenes.py` + `regulation_scenes.py`，m01 实跑通过；见 §3.1）
- [x] 合并两个 AB 根（`bundles.py`：`--game` 安装目录 + 硬链接缓存树，实测 1388 下载 / 13355 打包）
- [x] act3 的 activity / 主题 opt-in 任务（`EXTRA_JOBS`，270 + 1 文件）；enemy-fx 已由 `fx.py` 的 glob 覆盖
- [x] **按版本素材并集规划**：`tools/assets/versions.mjs` 读取各版本 `chess/backups/tokens/enemies/items/bands/bonds/bosses/stages`，按美术身份并集（干员 216 / 敌人 343 / 策略 61 / 盟约 26 / 装备 70 / 召唤 57 / 模块类型 133），并对照 web manifest 与本地客户端 manifest 报告缺口；`--check` / `--json` / `--junctions`。测试 `test/versions-assets-plan.test.js`
- [x] 规程 4 首音乐：已从本地客户端 / Monster Siren 入 `var/music`（Kernel Overflow / Restore / Ens Inexorabile / Systematic Violation），客户端由 `VERSION_BGM` 使用
- [x] **本地客户端素材补全**：从本机 B 服客户端抽取 Amiya 基础形态 avatar/portrait/Spine、阿米娅·医疗的 avatar/portrait/Spine 与 `skchr_amiya3_1/_2` 技能图标、**79 个规程敌人图标**、**44 个策略图标 / 4 个盟约图标 / 47 个装备图标 / 75 个技能图标**（`public/assets/local/{enemy/icon,band,bond,item,skill}`，经 `data/local-assets.committed.json` 登记；`ui/assetUrls.js` 的 enemy/band/bond/item/skill/avatar/portrait 解析回落本地，客户端只带 E2 图的形态回落 E2）；40/40 规程套件干员、98/98 敌人 Spine、10/10 战场场景、主题均已覆盖。24 个 act3 专属 Boss/召唤在客户端无图鉴图标，UI 回落为字形。测试 `test/versions-assets.test.js`、`test/ui/assetUrls.test.js`
- [ ] 中继发布与手机端首包评估

### P5 golden / 测试 / CI（3–5 人日）
- [x] 按版本分目录 golden（`test/golden/act3autochess-v3_1/*.json`）+ `tools/golden.mjs --version <id>` + `tools/versions/runtime.mjs`；默认 6 文件不动（`npm run golden` 仍逐项匹配）
- [x] 规程 golden 在**我们树**上生成：304 个场景（roster 102 = 62 干员/负载 + 40 地图矩阵 / bonds 52 / fields 34 / matches 21 / standins 13 / diy 82），0 引擎错误；`test/golden-versions.test.js` 校验文件并重算 fast 子集
- [x] **地图矩阵**：10 张普通地图 × 4 个代表模式（等级5 / 等级20 / 险境 / 终极），每张地图跑该模式的真实第 7 回合波次（`map-<stage>-<mode>`，roster 家族内；两张联防地图在 fields 家族覆盖）；默认语料不受影响
- [x] `ci-shards.json` 配重：新的规程 golden 测试按 23 s 计入（4 个分片 426.8 s / imbalance 1.00）
- [x] `test/ui` 规程套件：`test/ui/regulation-ui.test.js` 用真实规程对局帧串起房间等级、简报核心盟约、追随者们指令、band 技能模型与装备报告，并断言默认盟约没有这些版本模型

### P6 冲突适配（3–5 人日）
- [ ] 逐块重写 14 条 §0 路径：`public/js/screens/game.js`、`server/match/{Match,gamedata,bondsMeta}.js`、`match/spDraft.js`、`data/assets.json`、`public/js/audio.js`、`public/js/render/board3d/*`、`assetDownload/assetPack.js`、`public/js/screens/title.js`
- [ ] 保留：予愿安洁莉娜/自定义干员、`grounded`/`groundbind`、B4 固定穿透公式、65 批 VFX、插件内容集、admin/DIAGNOSTICS、i18n 四语言、潜能/练度默认

## 6. 还原度验收

| 维度 | 怎么核 | 通过标准 |
|---|---|---|
| 数值 | `test/data-versions`：离线重建 16 表 | 与 pin 逐字节一致 |
| 模式 | 26 条模式可创建；解锁链与 PRTS §2 一致 | 名称/代码/难度/回合数/效率全对 |
| 地图 | 10 张战场，布局/出怪点/敌人分组对照本地关卡 prefab + 上游 research | 每张 1 场标准/险境各跑通 |
| 干员 | 名单/等阶/技能/模组/自选；37 kits 对照官方技能文本 | 技能行为测试 + 录屏抽查 |
| 盟约/策略/装备 | 26/61/116 与官方文本、层数、触发 | 上游对应测试 + PRTS 对照 |
| 联机 | 联防、合血、双组领袖、机变轮流 | 4 人 e2e 场景 |
| 表现 | HUD/简报/商店/主题/音乐对照官方截图/录屏 | 人工抽查清单 |
| 回归 | 默认盟约版本 golden 不变 | 279 场景全等 |

## 7. 风险 / 开放问题

- **音乐与部分模型未缓存**：本地客户端只缓存了已播放/进入过的内容；规程 4 首曲目、部分新干员与敌人模型需要客户端内触发下载后重扫，或用社区 dump。
- **官方仍在更新**：序列Ⅰ 已进入修订期、序列Ⅱ 将开；本清单钉 `e31e7bbae` + pin `6f63c14e`，不追流水。
- **未公开数值**：装备池权重、部分禁用组合、隐秘核心血量是 [ASSUMED]；标注来源与日期，按录屏复核。
- **版权**：素材不进 git、不复制官方文本长段；代码 GPL，素材仅本地/中继用于非商业同人。
