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

**仍需处理**（P4）：

- [x] 关卡 `.dat` 解 zip（`import_scenes.py`）；规程三段场景表（`regulation_scenes.py`，10 张图）
- [ ] 提取任务表（`extract.py` 的 `JOBS`）没有 act3 的 activity / 主题 / skills / equips / enemy-fx 条目；`skills/equips/dynamicabilities` 是逻辑预制体（无美术），美术在 `pkgrps/btl_pfb_fx_enemy_*`
- [ ] 两个根（`StreamingAssets/AB/Windows` 与 `PersistentData/Bundles`）内容互补，提取要合并（本次用基础根取材质、`--scenes` 取关卡）
- [ ] 规程 4 首音乐仍缺（客户端未缓存）
- [ ] 77 个规程敌人模型：本地客户端只有部分；需扩充 `ENEMY_SPINES` 列表并确认 `anon/*.bin` 的映射

## 4. 与我们的差距（概览）

| 层 | 现状 | 需要 |
|---|---|---|
| 版本系统 | 注册表 + 数据层已落地（`f39e2cb91`）；服务端托管/网页加载/对局宿主未做 | P0.2–P0.5 |
| 规程数据 | 无 `data/versions/act3autochess-v3_1/` | P1：构建 profile + pin + 16 表 |
| 规则/内容 | 无 37 kits、6 个规程模块、模式表、装备区、隐秘核心、指令 | P2 |
| UI | 无规程 HUD/简报/装备报告/徽章/自选/主题 | P3 |
| 素材 | 本机有官方 bundle；未提取、未进 manifest | P4 |
| golden/测试 | 单一语料 279 场景，无按版本语料 | P5 |
| 冲突面 | 14 条 never-merge 路径全部被上游规程改动触及 | P6 |

## 5. 合并清单

### P0 版本宿主（5–8 人日）
- [x] **P0.1** 注册表 `shared/versions.js`（默认 + `act3autochess@V3_1`）、`server/data.js` 的 `versionDataDir/getVersionData/resetVersionData`、`test/versions.test.js` — `f39e2cb91`
- [ ] **P0.2** `server/http/config.js` 的 `versionsFrom`（`SP_VERSIONS` / `SP_VERSION_DEFAULT` / `SP_MAX_VERSION_HOSTS`）；`server/versions.js`（每版本 `cs`、模式表、bounds、可用性）；`http/static.js` 的 `/data/versions/<slug>/` 与 `/cs/`；`buildTag` 只计**启用**版本；`/healthz.versions`；启动日志
- [ ] **P0.3** `lobby` 版本字段 + `room.create/proposeVersion` + `VERSION_UNSUPPORTED`；`server/match/host/` 的 `kind:'version'`（复用现有 child/worker/ipc/proxy）；每版本 `officialBounds`
- [ ] **P0.4** `public/js/versions.js` + 大厅版本选择器 + 4 语言标签；页面按版本拉取数据与 `/cs/` 清单
- [ ] **P0.5** `tools/versions/*`（profiles/adapters/sources/layouts/runtime/tables）+ `build-data.mjs --version`；`test/data-versions` 等价物

### P1 规程数据（3–5 人日）
- [ ] `tools/versions/act3autochess-v3_1.mjs` + `tables/act3autochess-v3_1.mjs`；`layout: 'regulation'`、`section: ['AUTOCHESS','act3autochess','V3_1']`、pin `6f63c14e`、`sources`（Kengxxiao/ArknightsAssets 两形态）
- [ ] 隐藏输入：`data/assets.json` 的 `spineLocal` 片段、`data/tuning.json` 字节副本、`docs/research/*` 输入
- [ ] `node tools/build-data.mjs --version act3autochess@V3_1` → 16 文件、6.4–6.5 MB；离线重建与上游逐字节一致
- [ ] 计数核对：chess 310、bonds 26、bands 61、items 116、choices 9、enemies 343、stages 12、effects 465、visibleNonDiy 141

### P2 规则与内容（8–12 人日）
- [ ] 37 个 kits（batch1–4）+ 6 个模块：`regulation-bosses.js`、`bonds/regulation.js`、`bonds/lethania.js`、`enemies/regulation.js`、`garrisons/regulation.js`、`bands/commands.js`
- [ ] 模式 26 条：入门/标准/险境/绝境/终极/极速/规程等级 1–20（`AC-*`），14/9 回合、60 s+ 决策、特殊准备回合 `spRounds [3,9,11]`
- [ ] 核心盟约二选一（个人）/ 禁用半数（联合）；自选 Ⅴ/Ⅵ 各 0–2；自选无特质、按阵营分盟约
- [ ] 装备区：独立 5 格 `equipHand`、容量 `equipSlotNum`（Ironhide 4/6）、招募例外 `recruitTierExempt`
- [ ] 隐秘核心（350/1200 [ASSUMED]，待官方/录屏复核）；领袖轮合血、超时扣血；联防（不叠层）
- [ ] 地图规则：MAP09 双方隐匿地块、草丛秒数、Boss 受击区、茧隐匿索敌、萨卡兹亡语与延迟召唤、莱塔尼亚召唤与地面接敌
- [ ] 指令（主动策略）：点击/拖放、每回合次数/资金/冷却；变换策略
- [ ] 寻宝人模拟宝藏、领袖战 top-3 伤害统计、装备报告
- [ ] 对局侧修复：#925 装备奖励池、#930 人事部记录、#932 暴躁铁皮、#934 极光/忍冬、#937 白铁、#944 组合装备、#939/#943/#947 规程战斗、#946 阶段横幅（随本阶段一并落地）

### P3 UI / 主题（8–12 人日）
- [ ] 规程 HUD 布局、双栏简报、装备报告 tab、领袖战徽章、选择自编、版本选择器
- [ ] 官方主题包 + 主题提取器（`shared/uiTheme.js`、`public/js/uiTheme.js`、`public/css/ui-theme.css`、`tools/theme-template.mjs`）
- [ ] 每版本音乐（4 首）与结算提示
- [ ] 3D 简报图：与 §0 的 `board3d` 冲突，**降级为静态渲染图**（先不做实时）

### P4 素材（3–5 人日）
- [x] 关卡 `.dat` 先解 zip；规程三段场景导出（`import_scenes.py` + `regulation_scenes.py`，m01 实跑通过；见 §3.1）
- [ ] 合并两个 AB 根（基础包 + 下载目录）——本次以基础根取材质、`--scenes` 取关卡，仍需统一到 `--game`
- [ ] `extract.py` 任务表加 act3 的 activity / 主题 / enemy-fx 条目
- [ ] `tools/assets/versions.mjs` 按版本并集规划；`fetch-assets`/`local-extract` 覆盖 77 个敌人 Spine、37 个新干员、10 张地图、主题、敌人特效
- [ ] 规程 4 首音乐：先在客户端内播放一次以缓存，再 `music.py`；缺失则用社区 dump
- [ ] `data/assets.json` 的 `spineLocal`/模型清单更新；中继发布与手机端首包评估

### P5 golden / 测试 / CI（3–5 人日）
- [ ] 按版本分目录 golden（`test/golden/<slug>/*.json`）+ `tools/golden.mjs --version`；默认 6 文件不动
- [ ] 规程 golden 在**我们树**上生成（引擎/干员/伤害公式与主线不同，不能复制）；归因 = 只回退本批 → 零 diff
- [ ] 12 张地图 × 模式矩阵场景；`test/ui` 规程套件；`ci-shards.json` 重新配重

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
