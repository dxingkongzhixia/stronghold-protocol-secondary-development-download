# 内容制作手册：盟约 / 策略 / 悬赏敌人 / 干员

> 这份文档把「加一条内容」的**端到端**链路写清楚：数据从哪来、运行时谁读它、要补哪些文件、跑哪些校验。
> 现有文档是它的入口：新增**干员**的完整配方在 [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md)（本文 §1 是补充与交叉引用）；
> 数据格式见 [`docs/DATA.md`](DATA.md)、战斗引擎见 [`docs/SIM.md`](SIM.md)、对局/匹配见 [`docs/MATCHMAKING.md`](MATCHMAKING.md)、
> 素材流水线见 [`docs/ASSETS.md`](ASSETS.md)。**数据全部是构建产物**：`data/*.json` 由 `tools/build-data.mjs` 从官方表生成，
> 任何手改都会被下一次构建覆盖，且 `test/data.test.js` 会逐字节比对。自造内容走 `tools/build-data.mjs` 的
> `CUSTOM_CHESS` / 官方表读取两条通道，见下。

本文对应的**浏览器**（资料库 / CODEX）在 `public/js/ui/codex.js` + `public/js/ui/codexModel.js`（§0）。

> **导航**：§0 资料库（CODEX） · §1 新干员 · §2 新盟约（bond） · §3 新策略（band） · §4 新悬赏敌人 · §5 验证清单 · §6 踩过的坑 · §7 相关文档 · §8 战场主题配色（3D 板）。相关：[`docs/QUERY-INDEX.md`](QUERY-INDEX.md)。

---

## 0. 资料库（CODEX）：盟约 / 策略 / 干员 + 悬赏决策 + 两阶段领袖池

一个**只读、数据驱动**的浏览器。入口：
- **大厅顶栏** `资料库`（`public/js/screens/lobby.js`，`.topbar__right` 内的 `codex-entry`，在档案牌左侧）——不用开设置就能进；
- （设置弹窗动作行里原来的 `资料库` 入口已于 **2026-10-12 移除**，见 `MATCHMAKING.md` §36.9；只留大厅顶栏这一个。）

覆盖层本体挂在根节点一次（`public/js/main.js` 的 `<CodexHost/>`），和 `玩法说明`（`ui/guide.js`）、`bug提交`（`ui/community.js`）
同一套全局 host 模式，Esc / 点背景关闭，`ensureStylesheet('/css/screens/codex.css')` 让它在 **过期的 `index.html`** 下也能正常显示（见 §6）。

- **纯映射**（无 DOM，Node 单测 `test/ui/codex.test.js`）：`public/js/ui/codexModel.js`
  - `bondView / filterBonds / bondKind / bondScope / bondStages / bondMilestones / bondEquipment / bondMembers` —— 盟约；
  - `bandView / filterBands / bandBondIds / bandBuffKeys / bandsForBonds` —— 策略；
  - `chessRoster / chessRosterFacets / filterChess / chessView / chessMatches / chessIsCustom / chessBonds / chessGarrisons / skillIconUrl / itemsForBonds` —— 干员与「所属盟约 / 策略 / 装备」交叉链接；
  - `bossPhasePools / bossPoolModes / bossEscorts / enemyStats` —— 两阶段领袖池（§4）；
  - `bountyDraftPools` —— 悬赏决策卡池；
  - `enemyView / enemySources`、`itemView` —— 敌人 / 装备详情弹层。
- **界面**：`public/js/ui/codex.js`（**六个分页** `盟约 / 策略 / 干员 / 悬赏 / 最终攻势 / 隐秘核心`，搜索 + 筛选 chips，列表 + 详情两栏；`悬赏` 与两个领袖分页各自独立，是两套机制）。`悬赏` 只放**悬赏决策**卡池，领袖池有自己的分页。
- **点击穿透**：盟约详情的 **成员头像** → 干员详情；**相关装备** → 装备详情弹层；干员详情的 **盟约 / 策略 / 装备** → 对应分页 / 详情；敌人行 / 卡 → **敌人详情弹层**（含它来自哪个池 / 权重）。
- **数据源**（`CODEX_FILES`，全部是游戏本来就加载的本地文件，离线可用）：`bonds.json`、`bands.json`、`items.json`、
  `chess.json`、`garrisons.json`、`bosses.json`、`enemies.json`、`choices.json`、`config.json`、`assets.json`（图标 / 技能图标清单）。
- 界面**不写死任何列表**：新加一条盟约 / 策略 / 干员 / 领袖 / 敌人 / 悬赏卡，重开资料库就会出现。

| 分页 | 展示 | 精确数据源 |
|---|---|---|
| **盟约** | 卡片网格（核心/附加、战斗中/全程生效、已收录计数、成员数/装备数）、搜索（名称/效果/成员）、详情（激活阈值 = 阶段、逐层效果文本 + 层数滑杆、完整描述、层数里程碑、相关装备、成员头像、`spec` 折叠） | `bonds.json`（`thresholds / effectDescRaw / descRaw / layerMilestones / noStack / countsHand / activeType`）、逐层数值解析 `public/js/ui/richText.js formatBondEffect`；装备 `items.json`（`giveBondId` / `requiresBondId`）；成员 `chess.json`（`bonds`）；图标 `assets.json bonds[<bondId>]` |
| **策略** | 列表 + 详情（策略效果、初始目标生命、胜利条件、奖励系数、可用模式、解锁条件、**相关盟约**、`spec` 折叠 = buff 处理器 key） | `bands.json`（`descRaw / totalHp / victorCount / rewardModulus / modeTypeList / unlockDesc / bondIds / buffs[].key`） |
| **干员** | 名册网格（`chess.json` 的 `visible && !isGolden` 基础记录，含自造 `identifier ≥ 900` 的 `CUSTOM_CHESS`）+ 搜索 / 稀有度 / 阶数 / 职业 / 仅自造筛选；详情（名称 / 称号 / 稀有度 / 职业分支 / 阶数 / 部署费用、数值、盟约、特质与整备、天赋、技能 + `assets.json skills` 图标、所属策略、相关装备） | `chess.json`（`name / appellation / rarity / profession / subProfessionName / tier / stats / talents / skills[] / trait / bonds / garrisonIds / module / tokens`）、`garrisons.json`、`bonds.json`、`bands.json`、`items.json`、`assets.json`（`skills` / `skillsById`） |
| **悬赏** | **只**放悬赏决策卡池（initial / boss / hunter），每张卡可点开目标敌人的详情 | `choices.json cards.bounty + bountyDrafts`、`enemies.json` |
| **最终攻势** | 难度选择器 → `bossWeights` 池（领袖、权重、敌方图标/数值/描述、波次模板、护卫、能力/部件计数），每个敌人 / 护卫可点开详情 | `config.json modes[modeId].bossWeights / .bossRound`、`bosses.json`（`hidden:false`）、`enemies.json` |
| **隐秘核心** | 同上，读 `hiddenBossWeights`；没有 hidden 轮的模式（如 `FUNNY`）如实显示空状态，不编造 | `config.json modes[modeId].hiddenBossWeights / .hiddenRound`、`bosses.json`（`hidden:true`）、`enemies.json` |

**敌人详情弹层**（`enemyView` + `enemySources`）：名称 / key / 位阶 / 等级 / 图鉴号 / 数值（`enemies.json stats`）/ 描述 / 能力 / 标签与免疫，加上它**来自哪个池**（领袖权重、护卫 ×数量、悬赏决策卡、以及所属领袖的 `bosses.json abilities / parts`）。**装备详情弹层**（`itemView`）：名称 / 阶 / 类型 / 类别 / 效果 / 风味 / 相关盟约 / 效果键。

组件/主题复用现有设计系统（`ui/components.js` 的 `Button / Panel / MicroLabel / Tabs / TierChip / Spinner / DifficultyIcon / AvatarFrame`、
`ui/gameComponents.js` 的 `BondGlyph / BandIcon / ItemIcon / UnitThumb / RichText`、`brackets` 角标、mint 主题变量），文案全部走 `t()` / `N_()`（§5 的 i18n）。

---

## 1. 新干员（`docs/NEW-OPERATOR.md` 的补充）

完整配方在 [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md)，这里只补我们踩过的点，别重复查：

- **缓存最小合并**：`.cache/gamedata/` 是本机产物，若某张表早于新干员，**只把她的行插进缓存**（`character_table` + `skill_table`，
  有模组再加 `uniequip_table`），不要 `--refresh` 整表重下（会带上游对既有干员的平衡改动）。见 NEW-OPERATOR §1.1。
- **`CUSTOM_CHESS`**：`tools/build-data.mjs` 里加一条（`charId / baseId / goldenId / tier / bonds / normal / golden / garrison`），
  构建时并进官方赛季表，`data/chess.json`+`bonds.json`+`garrisons.json` 自然生成。
- **kit**：`server/sim/content/kits/ops/<chessId>-<codename>.js`（一干员一文件；契约见 `server/sim/content/kits/README.md`）；
  `node tools/kit-coverage.mjs --missing` 必须为空（每个可选技能的普通/精锐都要手写 spec）。
- **美术 / 语音**：`docs/research/07-assets.json` 加条目 → `node tools/fetch-assets.mjs`；语音两棵树（`audio.voice` 中配 /
  `audio.voiceJp` 日配，缺日配回退中配）。见 NEW-OPERATOR §4 / [`docs/ASSETS.md`](ASSETS.md)。
- **计数**：名册数量变化要同步 `tools/build-data.mjs validateAll` + 一批写死的断言（清单见 NEW-OPERATOR §5）。
- **golden 归属**：任何**改变战斗行为**的改动都要 `npm run golden:update`，审 diff 后随改动一起提交（干净的重构必须让
  `test/golden.test.js` 的摘要不变）；把这笔行为变化记进变更的 `docs/MATCHMAKING.md` 小节。
- **i18n**：**游戏文本**（干员名、技能、描述）走 `data/i18n/<lang>.json` 覆盖层（`tools/build-i18n.mjs` 从官方 EN 客户端生成），
  新干员的英文名会自动带上；**界面字符串**走 `public/i18n/<lang>.json` 四包（见 §5）。
- **特效**：干员的攻击 / 技能特效**优先走官方特效运行时**（`public/js/render/vfx/**`，按本机提取的 prefab 播放；见
  [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) §9.1 与 [`docs/OUR-FEATURES.md`](OUR-FEATURES.md) §2）——新干员只要**本机提取到**
  对应的 `battle/prefabs/effects/<stem>.ab`，攻击与技能就有官方特效，**不需要**在客户端手写特效。**兜底**才是下面这两层。
- **FX 白名单（兜底层）**：官方特效贴图有**准入清单**——只收软性 in-place 的 `flow/ray/glow/ring/star/light/smoke/aura/halo` 家族，
  排除动画网格（`flipbook*`/图集 `SHEET`）、排除 `char_*`/`object_*`/`bg_*`/`pattern_*` 等「像物体」的贴图，且只在
  AREA / SELF 的 kind 上生效；每层绘制**统一缩放到 ≈ 一个身位**（`render/fx/localart.js LOCAL_FX_MAX_R = 1.1` 图块，
  `render/fx/simfx.js _fxLocal`）。细节与开关见 [`docs/ASSETS.md`](ASSETS.md)（「按动作类型 / 白名单 / 尺寸封顶」几段）。

---

## 2. 新盟约（bond）

### 2.1 数据（`data/bonds.json`，构建产物）

一条记录的关键字段（以 `yanShip` 为例）：

| 字段 | 含义 |
|---|---|
| `bondId` / `name` / `identifier` / `iconId` | 标识 / 显示名 / 排序 / 图标清单键（`assets.json bonds[<bondId>]`） |
| `isCore` | 核心盟约（8 条）/ 附加盟约（15 条） |
| `activeType` | `BATTLE`（战斗中生效）/ `ALL`（全程生效，如 远见 奇迹 投资人）/ `MANI`（调和）→ 资料库按此分「战斗中 / 全程」 |
| `thresholds` / `activeCount` / `maxCount` / `thresholdTemplate` | 激活阈值（如 `[3,6,9]`）；资料库的「阶段 I/II/III」= 这些阈值 |
| `countMode` / `countsHand` / `countsGoldenOnly` | 计数来源：`BOARD` = 场上；`BOARD_AND_DECK` + `countsHand` = 含整备区（投资人 远见 奇迹） |
| `noStack` | 无层数效果（调和 协防干员 独行 绝技）：层数仍统计但不缩放，资料库显示「层数不显示」 |
| `effectDesc` / `effectDescRaw` | **逐层**效果文本，含 `{i:fmt}` 占位 |
| `effectDescParams` | `[{ index, format, base, perStack }]`：占位值 = `bb[base] + bb[perStack] × 层数`（`richText.js formatBondEffect`，概率类 `…prob…` 封顶 100%） |
| `bb` / `bbStr` / `buffs` | 黑板数值 + 官方 buff key；运行时按 `bbStr.key` 派发处理器 |
| `baseParams` / `perStackParams` | 基础 / 每层参数名 |
| `desc` / `descRaw` | 完整描述（阶段条件写在 `<在场6名…>` 这类标记里，资料库整段展示） |
| `members` / `visibleMembers` | 成员干员（`visibleMembers` 是「可用」列表；`members` 与 `chess.json` 的 `bonds` 一致，资料库§0 已用测试钉住两者相等） |
| `spec` | 研究实施规格（英文；`spec.tiers[]` = 逐阶段 `need/effect`，资料库折叠在「数据规格」里；`null` = 无研究） |
| `layerMilestones` | 层数里程碑（`{layer, mode: every/reach/first, effect}`，如 维多利亚 每 25 层发装备） |

### 2.2 运行时（战斗 + 备战）

- `server/sim/content/bonds.js` 是入口，把逻辑拆成 `bonds/core.js`（8 核心）与 `bonds/addon.js`（15 附加），
  各自 `install(battle)`（战斗侧）/ `registerMeta(registry)`（备战侧，`band:<bondId>` 之外的 bond 前缀）。
- 出战成员判定（自身的 `bonds` + **变形同构体** `giveBondId` 授予 + 调和享受核心盟约）在 `server/sim/content/support/index.js`；
  **调和 +1** 的核心计数在 `server/match/bondsMeta.js`（视图里的 `harmony` 由服务端给出，客户端不重算，DESIGN §21.26）。
- 数值一律取黑板（`bb` / `bbStr`），**禁止硬编码**。

### 2.3 禁用 / 本局禁用（我们与主线的取舍）

- `config.json modes[modeId].inactiveBondIds` 是**本模式下永不激活**的盟约（本仓库数据里只有 `FUNNY` 模式列了 10 条：
  拉特兰 阿戈尔 卡西米尔 灵巧 奥术 奇迹 投资人 突袭 独行 绝技）；`activeBondIds` 是名单。运行时 `GameData.modeInactiveBonds`
  读它（`server/match/gamedata.js`），抽卡池 `server/match/pool.js` 据此剔干员。
- **「禁用但已激活仍生效」**（本仓库的规则）：被禁的盟约**没有**到阈值时，客户端显示灰色 **本局禁用** 圆牌（`off: true`，
  由 `server/match/bondsMeta.js offBondCounts` 下发）；一旦其成员**实际凑够阈值**（成员因所属的**其他**盟约进了场），它就是
  **激活态、效果照常生效**——禁用只挡「常规激活途径」（`public/js/ui/bondStrip.js` 的 `active` / `showOff` 即此规则）。
- 运行时还有一个**每局抽出来的禁用集 D**（`m.public.drawnDisabledBonds`，`server/match/pool.js drawDisabledBonds`）：
  只有「全部盟约都在 D 里」的干员才会离开池子，所以 D 里的盟约**仍可能激活**（「部分盟约所含干员阵容不完整」，`gameLogic disabledBondSets drew`）。
  两者别混：`inactiveBondIds` = 模式静态禁用（本局禁用），`drawnDisabledBonds` = 本局抽卡禁用（阵容不完整）。

### 2.4 加一条盟约要动什么

1. **数据**：本季盟约随官方表构建（`tools/build-data.mjs`）；自造盟约要走同一读取通道（官方表里没有就按干员的 `CUSTOM_*` 思路扩构建脚本）。
2. **图标**：`assets.json bonds[<bondId>]`（素材流水线 + `ui/assetUrls.js bondIconUrl`）。
3. **处理器**：在 `server/sim/content/bonds/core.js` 或 `addon.js`（战斗侧 `install` / 备战侧 `registerMeta`）按 `bbStr.key` 接一个；
   需要 `support` 的成员判定就用 `support/index.js`。
4. **名单**：`config.json modes[*].activeBondIds`（以及该模式的 `inactiveBondIds`，若该模式禁用）。
5. **测试**：`test/content/bonds.test.js`、`test/ui/gameLogic.test.js`（成员/调和/禁用），行为变化跑 `npm run golden:update`。
6. **资料库**：无需改动——`codexModel.js` 直接从 `bonds.json` 派生。

---

## 3. 新策略（band / 分队）

### 3.1 数据（`data/bands.json`，构建产物）

`bandId / sortId / name / iconId / modeTypeList`（`LOCAL/SINGLE/MULTI`，可用模式）/ `totalHp`（初始目标生命）/
`effectId / effectName / desc / descRaw`（效果文本）/ `buffs[].key`（处理器）/ `params`（黑板）/ `victorCount` /
`rewardModulus` / `unlockDesc` / `bondIds`（该策略围绕的盟约，构建期由 `shared/bandBonds.js` 计算，服务端 bot 也读它，
即 `GameData.bandBondIds`）。全 40 条。

### 3.2 运行时（`server/sim/content/bands/**`）

入口 `server/sim/content/bands.js`，拆成：

- `bands/battle.js` —— **IN_BATTLE** 策略（阿米娅 众志合一、埃芒加德 命结之秘、克莱门莎 崇高牺牲、大帝 加急调派、桑葚 药枚实验、
  休谟斯 回收利用、卡莱莎 食腐之蝶、陈 以己之长、夕 墨色真颜、伊奥莱塔 统御号令、Touch 外勤医疗…）。按 buff 的 `bbStr.key`
  派发；在**所有**战斗类型（普通 / 联防 / 领袖 / 隐秘核心）生效；`IN_BATTLE` 的加层在比赛禁用加层时是 no-op（`support.gainLayers`）。
- `bands/meta.js` —— **备战侧**。大量 **`preparation_start_*`** 处理器（回合开始发棋子 / 发道具，如
  `preparation_start_gain_chess_from_round`、`_every_n_round`、`preparation_start_add_special_goods_every_n_round`）、
  `prep_finish_char_bond_add_layer`（华法琳）、`round_start_*`（余 的加层、鸭爵 的换敌人、铃兰 的触发、松桐 的商店白给…）、
  经济类（`give_coin_in_round`、`coin_carry_over`、`band_coin_cost_*`…）。「进入休整期时 / 回合开始时」= `onRoundStart`。

**加层语义 `requireActive`**：

- `requireActive: true` —— 只给**已激活**的盟约加层（如 `bands/battle.js` 的 `gainLayers(..., { requireActive: true })`、`meta.js` 里余 的加层）；
- `requireActive: false` —— 文本里没有「已激活」前提，落点盟约即使未激活也加层（如 克莱门莎 崇高牺牲；
  余 也**不**给 `noStack`（无层数）的盟约加层——所有者的 2026-10-08 决定，见 `bands/meta.js` 注释第 22 行）。

**#488（道具库存）**：`<获得时>` 特质与策略的**白给**（发装备）**不是商店购买**，官方文本没有库存前提。上游
`6bfc08270c` 把 `acquireItem` 加上 `itemPool.canGain` 卡库、且 `effectsMeta.js grantItem` 丢掉了调用方已传的 `requirePool:false`，
导致缪尔赛思特质 / 「变形者集群」策略发到第 3 张「变形同构体」就不发了（GitHub #488）。**本分支不改**：`acquireItem`
**没有** `itemPool` 检查，白给不受库存约束；`bands/meta.js` 的 `preparation_start_gain_chess_from_round` 调用 `grant` 时显式传
`{ requirePool: false, source: 'band' }`。自检：`grep -rn "itemPool\|canGain" server` 应为空（或上述发放处传 `requirePool:false`）；
`test/content/garrisons_meta.test.js` #488。详见 [`docs/MATCHMAKING.md`](MATCHMAKING.md) §39.2 / §22 与
[`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) §0。

**模式对策略的禁用**：`gameLogic bandOffBonds` / `modeOffBonds`（`bands.json bondIds` ∩ `inactiveBondIds`）——策略仍可选，
草稿界面标「本局禁用【X】盟约，此策略效果可能无法发挥」（潘格尼尼 拉特兰 / 克莱门莎 阿戈尔 / 玛恩纳 卡西米尔）。

### 3.3 加一条策略要动什么

1. **数据**：`bands.json` 一条（本季随官方表构建）；`bondIds` 由 `shared/bandBonds.js` 在构建期算。
2. **图标**：`assets.json bands[<bandId>]`。
3. **处理器**：在 `bands/battle.js`（IN_BATTLE）或 `bands/meta.js`（备战）按 `bbStr.key` 接一个；数值取 `bb`/`bbStr`。
4. **测试**：`test/content/bands.test.js`，行为变化 `npm run golden:update`。
5. **资料库**：无需改动（`bandView` 直接派生）。

---

## 4. 新悬赏敌人（领袖 / 悬赏）

### 4.1 「两阶段」到底是什么（诚实结论）

任务里说的「悬赏两阶段，各有自己的敌人池」在本仓库对应**敌方领袖（boss）的两场**：

- **阶段一 最终攻势（`FINAL_ASSAULT`，R14 / FUNNY R9）** —— 池 = `config.json modes[modeId].bossWeights`（`boss_1…boss_7`）。
- **阶段二 隐秘核心（`HIDDEN_CORE`，R15）** —— 池 = `modes[modeId].hiddenBossWeights`（`boss_8…boss_10`，`bosses.json hidden: true`）。

**phase → pool 的映射是数据**：`config.json` 的 `bossWeights` / `hiddenBossWeights` 给出 id→权重，`bosses.json` 的 `hidden`
给阶段归属，代码只是应用它——`server/match/waves.js setupMatchWaves` 调 `gd.bossWeights(false/true)` 再 `weightedPick`，
`server/match/gamedata.js bossWeights()` 读 `mode.bossWeights` / `mode.hiddenBossWeights`。所以资料库的 **最终攻势 / 隐秘核心**
两个分页各自直接从一个池生成（`codexModel.bossPhasePools`）；没有 hidden 轮的模式（如 `FUNNY`）在「隐秘核心」分页池为空——**如实显示，不编**。

> 另注：本仓库里「悬赏」**也**指**悬赏决策**（`choices.json` 的 card 机制：`cards.bounty` + `bountyDrafts`，R3/R6 `initial`、
> R9 `boss`、R11 `hunter`，每个 `enemyKey` 是卡上要打死的目标），它与上面的领袖两阶段是**两套**东西。「悬赏」分页只放**悬赏决策**
> 卡池，领袖两阶段各有自己的分页（最终攻势 / 隐秘核心），两者不混在一个面板里。

### 4.2 数据

- `data/bosses.json`：`bossId / enemyKey / handbookId / name / sortId / weight / hidden / bloodPoint{难度} / lpr /
  templates{modeId: {round, template}} / escortsByTemplate{template: [{key, slot, count}]} / parts[] / abilities[]`。
  共享血量池（每名存活玩家一份，`server/match/finalAssault.js`）＝ `bloodPoint[难度] × 存活数 × 调参`。
- `data/enemies.json`：`key / name / rank(BOSS/ELITE/NORMAL) / level / stats{maxHp,atk,def,res,moveSpeed,bat,lpr,…} /
  abilities[] / talents / skills / tags / iconId / templateSlot / summons / seasonOverride` 等（`server/sim/content/enemies.js` 读它）。
- `data/waves.json` / `data/stages.json`：波次模板与路线（`server/match/waves.js buildBossWave` 用 `templates` + `escortsByTemplate` 造场）。

### 4.3 运行时行为

- **领袖行为**：`server/sim/content/bosses.js`（`BOSS_KITS`，`enemyKey → kit`；boss_1…boss_10 与它们的部件、隐秘核心变体）。
  领袖/部件的技能、阶段（`<20%`、`≤50%`）、召唤、`lpLoss`（由 match 记）、`PART_TRANSFER`（部件把伤害等量传给领袖）都在这里。
- **小怪 / 悬赏领袖**：`server/sim/content/enemies.js` + `enemies/leaders.js`（`kitLeaderMisc` 与多形态 kit）、
  `enemies/archetypes.js`、`enemies/fly.js`、`enemies/element.js`、`enemies/dot.js` 等。
- **出生 / 路线**：`waves.js`（波次、占位替换、护卫），`stages.json` 的路线；`server/sim` 的出生/寻路见 `docs/SIM.md`。
- **结算**：`server/match/match/bossRounds.js`（共享池、团队 LP、超时扣血、悬赏结算）、`finalAssault.js`（配对、`bossPoolHp`、`hiddenEligible`）。

### 4.4 加一个悬赏敌人 / 领袖要动什么

1. **数据**：`enemies.json` 一条（若官方表已有则自动生成）；若是领袖，加 `bosses.json` 一条，并把 id 放进对应
   `config.json modes[*].bossWeights`（最终攻势）或 `hiddenBossWeights`（隐秘核心）。`hidden: true` 的必须只进 hidden 池。
2. **护卫**：`escortsByTemplate[<template>]`（`{key, slot, count}`）；模板本身在 `waves.json`。
3. **行为**：在 `server/sim/content/bosses.js` 的 `BOSS_KITS` 里给 `enemyKey` 挂一个 kit（普通领袖同 kit，隐秘核心变体单独一条）。
   小怪行为进 `enemies/`。
4. **测试**：`test/content/enemies_bosses.test.js`（敌人/领袖数据完整性）、行为变化跑 `npm run golden:update`。
5. **资料库**：无需改动（`bossPhasePools` 直接派生两阶段池）。

---

## 5. 验证清单（每次加内容都跑一遍）

1. **数据重建逐字节复现**：`node tools/build-data.mjs --offline` 后 `git status data/` 必须干净（或只含预期的改动）；
   `test/data.test.js` / `test/build-data-refresh.test.js` 绿。
2. **计数**：`tools/build-data.mjs validateAll` 的 `expected N visible …` 与一批写死断言（清单见
   [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) §5）同步。
3. **kit coverage**：`node tools/kit-coverage.mjs --missing` 为空（新干员）。
4. **i18n**：新界面字符串进**四个** UI 包（`public/i18n/{en,ja,ko,zh-TW}.json`）；`node tools/i18n.mjs check en --strict` 绿；
   游戏文本走 `data/i18n/`（`tools/build-i18n.mjs --check`）。
5. **golden 归属**：行为变化 `npm run golden:update` 并审 diff；纯重构摘要必须不变（`test/golden.test.js`）。
6. **linter / 全量测试**：`npx eslint .` 干净、`node --test` 全绿（基线见 `README.md` 「测试」一节，README 里写的
   「约 N 项」必须跟上套件规模——`test/docs-consistency.test.js` 会校验）。
7. **资料库**：`node --test test/ui/codex.test.js` 绿（纯映射 + 分页 wiring + 四包文案）。

---

## 6. 我们踩过的坑（gotchas）

- **过期的 `index.html`**：每次新增 `public/css/**` 样式表都要在 `public/index.html` 里加 `<link>`（`test/client-static.test.js`
  会断言「public/css 下每个样式表都被 index.html 引用」——`devices.css` 必须最后）。就算线上发的是旧 `index.html`，
  覆盖层也要在打开时用 `ensureStylesheet(href)` 自带补链（`ui/ensureStylesheet.js`；`stats.css` 事故的原型：工具条挤在
  左上角、背后的界面没被盖住）。资料库已按这套做（`codex.css` + `ensureStylesheet(CX_CSS)`）。
- **道具库存 #488**：白给 `<获得时>` / 策略**不受** `itemPool` 约束（见 §3.2）。若将来并入上游共享卡池，务必把
  `requirePool` 透传到 `acquireItem`，并让发放处传 `requirePool:false`。
- **禁用盟约的「惰性」规则**：`inactiveBondIds` 只挡常规激活；被禁盟约**照样能**通过其他途径凑够阈值并生效（§2.3），
  灰色圆牌 = 未到阈值。别把它当「强制无效」。
- **FX 贴图准入 + 地面 field 封顶**：只收软性 in-place 贴图家族、排除动画网格与「像物体」的贴图、只在 AREA/SELF 的 kind 上用，
  且所有绘制层**等比缩放到 ≈ 一个身位**（`LOCAL_FX_MAX_R = 1.1`）。手写的 `aoe`/`s2`/`champagneBomb`/`takeoff` 也受此上限约束
  （见 [`docs/ASSETS.md`](ASSETS.md) / [`docs/MATCHMAKING.md`](MATCHMAKING.md) §35.11）。
- **统计「2×」上限**：服务端对局统计的上限是本机版规则的 **2 倍**（`STATS_MAX_RECORDS` / `STATS_FULL_KEEP` / `STATS_MAX_CHARS`，
  `shared/constants.js`，[`docs/MATCHMAKING.md`](MATCHMAKING.md) §40.3）。改统计相关常量时别只改一处。
- **合并黑名单条目**：定期并入上游前，先看 [`docs/MATCHMAKING.md`](MATCHMAKING.md) §22 / [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)
  的黑名单与「永不合并」清单——我们自造/改写过的文件（含 `acquireItem`、`bondsMeta.js`、`codex*`）在冲突时要保住我们的版本，
  新增的 `codex*` 文件也要进「保留」一侧。
- **3D 板 IndexedDB 缓存条目按 kind 存**：`render/board3d/load.js` 的 `fetchScene` 对 `json` 存 JSON 编码、对
  `text` 与缓冲区**原样存**（`idbBodyFor` / `idbValueFrom`）。v1 把 `text` 也 `JSON.stringify` 了，于是门的网格
  （`map/fx` 的 `Start_*.obj`，棋盘唯一走 text 的资源）第二次进图起就解析不出网格、**红门蓝门消失**（owner 2026-10-14）。
  改这个编码必须同时把 `assetIdb.js` 的 `IDB_VERSION` +1 并在升级时丢弃 store，否则已缓存的浏览器会一直带着坏数据。
  详见 [`docs/ASSETS.md`](ASSETS.md)。
- **官方 3D 板的坑（2026-10-13 一整轮踩出来的，动手前务必先读 §8）**：
  - **场地格和外围地形/石头共用同一个材质** `MT_AutochessSand`（区别只在 chunk 分组：场地是 `hide01/02/03`，外围是 `(rest)`）。
    **任何"按材质"改颜色/贴图的操作都会同时刷到石头、崖壁、帆布上** —— 就是「石头、帆布全被染成沙色」的根因。
    要动棋盘格，**第一步必须先把材质按 chunk 分组拆开**（`sceneMaterialKey`），否则不要动。
  - **格子 UV 指向的图集小块是木板条/平板**，不是菱形地砖（每块只占 `TX_AutochessSand_A` 约 0.024）。菱形地砖在同一张图集的
    左上角 `(25,32)-(207,214)`。所以"往沙色混一点 / 混到底 / 保亮度换色"都不会出现菱形 —— 花纹根本没被采样到。
  - **顶点色遮罩是严格二值的**：每个面 0 或 255，RGB 相同，alpha 恒为 255（`_BlendRangeCtrl` (0,1) 重映射，`_BlendStrength` 缩放）。
    场地和地形靠 `_BlendNoiseStrength` 区分（场地 0、地形 1）。
  - **世界格网**：场地格 **1.0 世界单位、中心落在整数**（实测 m04：66 块，最近邻间距 1.00、相位 0.00）。所以格内坐标是
    `fract(world)`（格角为 0）；用 `fract(world + 0.5)` 让花纹**错半格**。
  - **图集是线性空间上传的**（`texture2D` 拿到的是线性值），颜色键控阈值别按 sRGB 量级写，否则整个格子都会被判成同一类。
  - **IDM**：Internet Download Manager 会嗅探本地 HTTP 并抢走 2–6 MB 的 `scene.bin`（`application/octet-stream`），
    板子会**静默退回程序化金属板**（三角形数从 ~1.6 万掉到 1762）。把 `127.0.0.1` 加进 IDM 例外。
  - **程序化 sheen** 在官方场景上会在每个光滑像素刷出偏冷的白线（「高台白线」，木箱金属压条），官方场景的反射已在
    自己的 lightmap 里 —— 见 §8.2。
  - **加色青色边界条**在亮沙上加爆成纯白（「白线」），官方战场本来就界定了可玩区 —— 见 §8.2。
  - **投影光方向必须和材质着色用的太阳同侧**：官方场景用 `scene.json` 的 `light.dir` 着色，投影灯若用程序化板的
    `LIGHTING.key.dir`（在另一侧），道具的影子会全落在自己背后、相机看不见（「阴影要处理」）—— 见 §8.2。
  - **场地变体的可见性**（未解决）：`scenes.py` 在没有子图形名时会把每个半场的场地都塞进同一个 `inactive` 桶；
    上游按**组的并集矩形**判定会让两边都通过，出现「场景重复」。修法是改成按 **chunk 自己的矩形**（`sceneChunkRect`）判定，
    但会改变可见内容，需要单独验证后再合。

---

## 7. 相关文档

- [`docs/NEW-OPERATOR.md`](NEW-OPERATOR.md) —— 自造干员端到端配方（本文 §1 是其交叉补充）
- [`docs/DATA.md`](DATA.md) —— `data/*.json` 每个字段的生成说明
- [`docs/SIM.md`](SIM.md) —— 战斗引擎、`server/sim/content/**` 的契约
- [`docs/MATCHMAKING.md`](MATCHMAKING.md) —— 我们的改动与全部决策记录（§22 合并黑名单、§39.2 #488、§40.3 统计）
- [`docs/UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) —— 与上游的差异与合并纪律
- [`docs/ASSETS.md`](ASSETS.md) —— 素材 / 语音 / FX 流水线

---

## 8. 战场主题配色（3D 板）

官方 3D 战场按主题分别调过色（沙地淡雅、城市明亮、工业对比强），我们的移植原来用一套全局参数，导致沙地偏红偏暗、城市偏灰。配色集中在 **`public/js/render/board3d/theme.js`** 的一张表里：**一行全局 `default` + 每个主题一行 override**，渲染器读取它（`BoardScene` 取 `exposure` 作 `renderer.toneMappingExposure`，`sceneMaterial` 取 `ambient` / `tint` / `saturate`）。

| 参数 | 含义 | 来源 |
| --- | --- | --- |
| `exposure` | `renderer.toneMappingExposure`（ACES）；官方是 HDR + 后期曝光。**注意：我们的官方场景材质没有接 three 的色调映射，所以这一项对官方战场其实是空转**（见下方 `gain`） | 官方同地图截图与我们的同区域取色比对 |
| `ambient` | 每个 scene 材质加的中性环境/探针补光（线性） | 同上：官方亮部/暗部的中性分量 |
| `sun` | 关键光（太阳）增益乘子（默认 1）；官方亮面 / 暗面反差大 | 官方亮面与暗面取色的比值 |
| `tint` | 反照率乘子（色偏校正，`[1,1,1]` = 不调） | 官方材质的 `_Color` 与截图的通道比 |
| `saturate` | 最终线性的饱和度（`c = mix(grey, c, saturate)`，<1 = 官方更柔和的观感） | 截图的饱和度比对 |
| `gain` | **最终颜色的线性增益**（默认 1，纯乘法）。官方战场走的是游戏自己的 HDR 后期，我们的官方材质没接 three 的色调映射，画面由**烘焙光照贴图**主导（`ambient` / `sun` 调它几乎无效，实测 p50 只动 5–6）。某主题若实测比官方截图**整体暗**（亮/暗比例一致），就在这一项上整体乘一个系数；因为是纯乘法，实测的**比例**保持不变 | 官方截图与我们的同区域 p20/p50/p90 |

**主题判定**：`sceneTheme(stageId, doc)` 先按 `scene doc` 的贴图族（`THEME_MARKERS`，如 `TX_AutochessSand_*` → `sand`、`TX_Syracuse_metro_*` → `city`、`TX_KXMR_*` / `TX_LMZ_*`）判定，再按 `stageId` 前缀兜底，最后 `default`。现有主题与取值：

| 主题 | 地图 | exposure | ambient | sun | tint | saturate | gain | apron | platforms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sand` | act1 m01–m07、act2 m02/m04 | 2.5 | 0.20 | 3.4 | 1.00/1.00/0.99 | 0.78 | 1 | 有 | 无 |
| `city` | act2 m01（叙拉古·城市） | 2.45 | 0.15 | 3.0 | 1/1/1 | 0.95 | 1 | 无 | 无 |
| `kxmr` | act2 m03（含 TX_KXMR 与 TX_LMZ 两族，取前者） | 2.0 | 0.13 | 2.4 | 0.98/1.00/1.03 | 0.94 | **1.95** | 无 | 无 |
| `lmz` | 暂无仅含 `TX_LMZ` 的场景（`TX_LMZ`-only 时启用），与 kxmr 同值 | 2.0 | 0.13 | 2.4 | 0.98/1.00/1.03 | 0.94 | **1.95** | 无 | 无 |
| `default` | 未列出的场景 | 1.5 | 0.12 | — | 1/1/1 | 0.94 | 1 | 无 | 无 |

取样（同 1280×720 战斗相机，区域 = 画面中部 25–78% × 28–80%；mean / std，0–255 亮度）：

| 主题 | 参考来源 | 官方 mean/std | 我们 改前 | 我们 改后 |
| --- | --- | --- | --- | --- |
| `sand` | 官方沙地**截图** `_shots/official-map01.png`（同相机·同区域取色） | 164 / 40 | 140 / 27 | 154 / 31 |
| `city` | 官方**材质 / 烘焙数据**（盘上无官方截图） | — | 120 / 42 | 157 / 56 |
| `kxmr` | 官方**材质 / 烘焙数据**（盘上无官方截图） | — | 127 / 29 | 135 / 31 |
| `lmz` | 同 `kxmr`（当前无仅含 `TX_LMZ` 的场景） | — | — | — |
| 金属 / 工业（回归基线） | 程序化板（`boardMaterial`），本表不影响 | — | 125.3 / 40.8 | 125.3 / 40.8（**逐像素一致**） |

> ⚠️ **参考来源要分清**：只有 `sand` 有官方截图在盘上（`_shots/official-map01.png`），`city` / `kxmr` / `lmz` **没有**官方截图，是按官方 **`scene doc` 的材质（`_Color` / 方向光 `light`）与烘焙光照数据**校准的——将来若拿到这几种地图的官方截图，应重新取样复核。金属 / 工业走程序化板（`boardMaterial`），本表不影响它。

**加 / 调一个主题**：
1. 在 `SCENE_THEMES` 加一行（或改现有行）——先只动 `ambient` / `sun` / `tint` / `saturate`；整体偏暗再加 `gain`（`exposure` 对我们自己的官方材质是空转的，见 §8.5）。
2. 新贴图族就加一条 `THEME_MARKERS`（贴图名前缀 → 主题名）。
3. 用同一张官方截图与我们的渲染**同区域取色**校准（`docs/ASSETS.md` 记录了各主题的取样值），不要凭手感调。
4. 金属/工业主题是**回归基线**：它走程序化板（`boardMaterial`），不受本表影响，改动后必须复核它没变。

### 8.1 沙地铺边（`apron`）

官方沙地战场（PRTS「盟约」下半 #01）把可玩地面、沙丘与石块**铺在同一层亮沙面上**——不是**一圈**抬高的平台（场地**左中**另有一处**局部**的抬升台，见 §8.3）。我们早期按“高台”理解在 `theme.js` 里手工标定过两级台阶 + 一条跑道（`platforms`），运行后画面里是一圈**很亮的矩形边框 + 底部长木板**，既不像官方也把官方自己的沙地盖住了，因此**删掉**。取而代之的是一条**沙地铺边**（`scene.js` `_buildApron`）：用场景自带的沙地贴图（官方同款 UV 密度）贴场地外一圈，alpha 从场边向外渐隐到 0，读起来是场地周围多出来的沙粒，而不是一块板：

```js
apron: {
  texture: 'TX_AutochessSand_sand_A', // 沙地贴图（scene/tex 里的名字；省略 = 用场景地面贴图）
  tint:    [1.08, 1.06, 1.02],        // 材质乘子
  uv:      0.23,                      // 世界坐标 UV 密度（每格纹理重复数；≈ 官方 _sand 材质的实测值）
  width:   1.6,                       // 铺边向外几格
  gap:     0.5,                       // 内缘离场边的**额外**留白（格）：保证不与任何可玩行/列重叠（含底行）
  rings:   4,                         // 渐变分几圈
  alpha:   0.34,                      // 场边处的起始透明度（向外线性到 0）
  z:       0.014,                     // 略高于场地，避免与官方地面 z-fighting
}
```

**规则**：
- 铺边的**内缘**是 `area` 外接矩形再向外 `0.5 + gap` 格，因此它**永远在最外一行可玩格之外**（owner 反馈：早期 `gap=0` 时沙粒贴着底行、读起来像盖住了底行）。底行格子必须仍是**格子反照率**，不是沙子——用同相机开/关铺边两次取样，底行各列 delta ≈ 0。
- **纯视觉**：不动 `server/sim` 的格子/高度/部署逻辑；`deployTiles`、`AREAS` 一律不变。
- 注意它盖住的是场地**紧邻一圈**的东西（官方场景自带的整备区木板 / 草坪 / 水面也在这圈里），所以 `alpha` 要低（0.34 左右）——高了会把官方自带的景盖成沙色。数值来源：官方沙地截图与我们的同相机渲染比对，记录在 `docs/ASSETS.md`。没有 `apron` 行 = 不铺边。

### 8.2 光照 / 阴影

官方是 Unity HDR：一盏**方向光太阳**（`scene.json` 的 `light .dir/.color/.intensity`，由场景 bundle 的 Light 导出）+ 烘焙光照贴图（间接光 + AO + 阴影遮罩）+ **实时阴影**。我们的移植：
- 方向光 / 环境光来自 `scene.json`（`sceneMaterial` 的 `uLightDir/uLightColor`，`uLmScale` 用烘焙光）。
- **太阳增益**：`uLightColor = scene light.intensity × SCENE_LIGHT.direct × theme.sun`。官方沙地亮沙 ≈ (223,180,131)、背光沙 ≈ (129,104,77)，亮/暗比约 1.7；我们原来只有约 1.25（sun = 1、intensity 1.1），场地偏平、发暗。沙地主题给 `sun: 1.85`，把太阳提亮到官方的反差。
- 官方场景的网格现在 `receiveShadow`（`scene.js` `_buildScene`），`sceneMaterial`（`lights: true`）在片元里对方向光取 `directionalShadowMap[0]` 的阴影，即官方那种道具投在场地上的投影；阴影相机由 `_fitShadow` 贴合场地。
- **道具不合并、地形不投影**（owner 反馈「看不出光照效果」的根因）：官方场景的**地表**（平铺格 / 宽缓沙丘）按材质 + 光照图页合并成一块（省 draw call），但**竖着的道具**（岩石 / 木箱 / 仙人掌 / 草丛，`load.js splitSceneProps` 按三角形连通分量 + 高度/占地阈值判定）拆成**独立的 props 网格**，各自 `castShadow`。地表本身**不投**实时阴影——它的阴影早已烘焙进光照图 A 的 shadowmask（官方 Shadowmask 模式），重投会把整片场地自阴影、把太阳压平。于是：道具把**清晰的投影**投到地面上（这是低分辨率烘焙给不了的），地表只**接收**。实测（act1autochess_m01 战斗相机）：关掉实时阴影只影响约 6.9 万像素（全场 0.92M 的 7%），正是道具投影；关掉太阳则影响约 72 万像素（mean ΔL 37），说明太阳确实在照。
- **合并 / 拆分与 draw call**（提交 `f76a0704` 把竖着的道具从地表里拆出来）：地表仍按材质 + 光照图页合并成一块（省 draw call），道具各自成网格。实测 `act1autochess_m01`（1280×720）：`prep` 13 → 16、`battle` 15 → 18 calls，三角形 **16,561 不变**（道具只是从地表网格里分出来，不是新增几何）；最差的 `act2autochess_m02` 19/20 → 25/26 calls；金属 / 程序化板**完全不动**（9 calls / 2,236 tris，逐像素一致——回归基线）。
- 环境/间接：`uLmScale = lightRange × SCENE_LIGHT.indirect`，`SCENE_LIGHT.indirect` 保持 1（烘焙即官方间接光）；`theme.ambient` 是每主题的中性补光。
- **装置台（射击台 / 特制水上平台 / 封印的地面）用程序化板的材质**：官方场景本身没有这些台子，`setStage` 会把程序化板的 `buckets.raised / raisedDecal` 单独画到场景上（units 的 `heightAt` 依赖它们，GitHub #569），用 `this.mat.board`。中间做过一版“让主题给它一个 `slab` 材质”（沙地主题用场景自己的沙地反照率），**已回退**（owner 2026-10-14：act1 m03 的高台“直接成沙地了”，并指定 **act2 m02 为正确样本**）——`slab` 只写在沙地主题里，而沙地主题覆盖**全部 act1 战场**，所以每张 act1 图的台子都被染成沙色；act2 m02 走 `city` 主题、没有 `slab`，用的就是程序化板材质。现在每个主题每张图都回到 `this.mat.board`。

### 8.3 官方高台（局部抬升块，`platforms`）

> **已关闭（owner，2026-10-14）**：`theme.sand.platforms` 已移除，`_buildPlatforms` 因此不建任何块。原因：它用普通 `MeshStandardMaterial` 建块（不读 `aLm`），**拿不到场景的烘焙光照/AO**，在官方场景上渲染成一块**扁平、发白**的板压在自然沙丘上（owner 的「错误模型」）。重新启用前必须先把它的材质接到场景的烘焙光上，否则会再次发白。下面的标定数据保留备查。

官方战场 #01 的可玩面上有一处**局部的抬升台**（owner 截图标注在场地**左中**：`D:\DOTK\_shots\official-map01.png`）——**不是** §8.1 的「一圈」：官方**没有**周长边框，只有**局部几块**抬升。我们按 §8.2 的方式抽到的官方场景可玩面基本是平的（只约半格落差），这块抬升**不在**可抽数据里，所以它在 `theme.js` 里**按主题手工标定**、由 `scene.js` `_buildPlatforms` 建成几何：

```js
platforms: {                                     // 每个主题可选（省略 = 不加高台）
  texture: 'TX_AutochessSand_sand_A',            // 砂岩反照率（scene/tex 的名字；省略 = 用场景地面贴图）
  tint:    [1.06, 1.04, 1.0],                    // 材质乘子
  uv:      0.5,                                  // 世界坐标 UV 密度（每格纹理重复数）
  blocks: [                                      // 局部块（棋盘坐标；**不是**周长、**不是**底部长板）
    { r0: 9,  r1: 11, c0: 0,  c1: 2,  h: 0.40 }, // 左中：owner 指的那块高台（部署高亮靠着它）
    { r0: 12, r1: 12, c0: 1,  c1: 2,  h: 0.55 }, // 同一台地向后一级（官方再抬一档）
    { r0: 14, r1: 15, c0: 0,  c1: 2,  h: 0.40 }, // 场地左下角（整备木板之上）
    { r0: 9,  r1: 11, c0: 19, c1: 20, h: 0.40 }, // 右场镜像的左中块
  ],
}
```

**规则**：
- 每个 `block` 是**平顶砂岩盒**（顶面 + 四个侧面，法线朝外，世界坐标 UV），由 `sceneMaterial` 用**场景自己的方向光**着色 → 顶面亮、背光侧面暗。
- 每个块的 rect **只落在可玩区之外**：左中是 cols 0–2（部署格从 col 3 起）、右块 cols 19–20、底部是 rows 14–15（敌方整备区，非部署格）——**永不遮挡**部署高亮 / 方向轮盘的点击区。
- **纯视觉**：不动 `server/sim` 的格子 / 高度 / 部署逻辑；`deployTiles`、`AREAS` 一律不变。
- **数值来源**：位置 = owner 截图（`official-map01.png`）标注的**左中**块 + 该处 `data/stages.json` 的 `#`（`tile_forbidden`，`height: "HIGH"`）格（cols 0–2、rows 9–12 正是这片 `#`）；高度 = 官方场景自带的**高台高度 0.4 格**（`tools/local-extract/scenes.py` 记的逻辑格「high ground 0.4」，与 `render/style.js` `TILE_H.wall = 0.42` 同量级）；材质 = 场景自带的沙地反照率（`MT_AutochessSand` / `TX_AutochessSand_sand_A`）。
- **历史**：第一次尝试（提交 `6e988b44`）是**整圈**「两级台阶 + 一条跑道」，画面里是一圈亮矩形边框 + 底部长木板，与官方不符；按提交 `02ebc35a` **删除**，改成沙地铺边（§8.1）。这次只做**局部块**。
- 验证（`act1autochess_m01`，prep 相机同相机对比）：左中块出现在官方位置、部署菱形正落在块顶；砂岩质感与场地一致；顶面亮、侧面暗；金属 / 程序化板回归基线（§8.2）**逐像素不变**。

### 8.4 本版从"上游 + 以下修复"出发（2026-10-13）

在 §8.3 的官方高台之外，本版回到上游 `gitee/master`（`61642335`）并保留下面四处**已经验证过、且 owner 认可**的白线 / 光照修复；其余棋盘格外观的实验性改动**全部回退**（踩的坑见 §6）：

| 保留 | 内容 | 位置 |
|---|---|---|
| **白线（1）** | 官方场景不再叠程序化 sheen（`SCENE_LIGHT.sheen = 0`，`sceneMaterial` 覆盖 `focus` 的 `uSheen`）——官方反射已在自己的 lightmap 里，再叠会在每个光滑像素刷出偏冷白线（「高台白线」，木箱金属压条） | `materials.js` |
| **白线（2）** | 官方场景不画青色**加色**场地边界条（亮沙上加爆成纯白）；程序化板照旧画 | `scene.js` `if (!this.official) this._buildEdges(board)` |
| **光照（1）** | 投影灯改用**场景自己的太阳**方向（`scene.json` 的 `light.dir`）——原来用程序化板的 `LIGHTING.key.dir`（在另一侧），道具影子全落在自己背后、相机看不见 | `scene.js` `_fitShadow` |
| **光照（2）** | 沙地主题配色回到柔和值：`exposure 2.7→2.5`、`ambient 0.12→0.20`、`saturate 0.97→0.78`、`tint [1.01,1.0,0.98]→[1,1,0.99]` | `theme.js` `SCENE_THEMES.sand` |

**没有进这一版**（都做过、owner 否掉，代码在分支 `feat/scene-board-fixes`／tag `backup/scene-board-work`）：格子贴图的混合/重着色/重绘、场地变体命名、按 chunk 的可见性修正。要再动棋盘格，**先按 §6 的坑把材质按 chunk 分组拆开**，再谈效果。

**验证基线**：金属/程序化板必须逐像素不变（9 calls / 2,236 tris）；`act1autochess_m01` 战斗相机下关掉实时阴影只影响约 7% 像素（道具投影）。

### 8.5 act2autochess_m03 的整体亮度（主题 `gain`，2026-10-14）

owner 反馈这张图“光照问题”。测量后发现**比例完全一致、只是整体被压暗**（同一截图同区域，0–255 亮度）：

| | p20（暗部） | p50（中间调） | p90（亮部） | p20/p50 | p90/p50 |
| --- | --- | --- | --- | --- | --- |
| 官方截图 | 80 | 127 | 179 | 0.63 | 1.41 |
| 我们（修前） | 61 | 96 | 138 | 0.64 | 1.44 |
| 我们（`gain: 1.95` + `tint [0.98,1.00,1.03]`） | 83 | 126 | 177 | 0.66 | 1.40 |

所以不是要换一条色调曲线（不要接 three 的色调映射 —— 那会同时改掉其他每一张官方赛场），而是一个**纯乘法的线性增益**：`theme.gain` 由 `sceneMaterial` / `sceneWaterMaterial` 乘在最终颜色上（`uniform float uGain`，缺省 1）。

**为什么不用 `exposure`**：我们的官方场景材质是自己写的 `ShaderMaterial`，只有 `<colorspace_fragment>`、**没有 `<tonemapping_fragment>`**，所以 `renderer.toneMappingExposure`（以及 ACES 曲线）对它们是**空转**的（实测：把 `exposure` 从 2.0 改到 3.4，像素只动 1%）；而程序化金属板是补丁过的**内置**材质，有这段，两者走的是不同管线。
曾经试过给官方材质补上 `<tonemapping_fragment>` 并按各主题重新标定 —— 那会同时改掉全部 11 张战场的观感，owner 明确反对（“我只要改一张图，咋影响全部了？”），已全部回退。

**作用域**：`gain` 只有 `kxmr` / `lmz` 两行带；而 `TX_KXMR_*` / `TX_LMZ_*` 只出现在 **act2autochess_m03** 一张场景的 `scene.json` 里，所以它不可能影响别的地图（验证：同一套代码分别用 `gain=1` 与 `gain=1.95` 渲染 11 张图，逐张取 p20/p50/p90，除 act2autochess_m03 外全部一致）。
