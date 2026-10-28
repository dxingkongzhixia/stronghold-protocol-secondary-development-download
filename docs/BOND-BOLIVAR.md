# 玻利瓦尔国家盟约（初设 / Bolívar）

> **状态：草案 v0.1（2026-10-28），未实现。** 本文是 fork 自造内容的设计提案，**不是** `DESIGN.md` 的规范
> 章节；实现并验收后，规则正文再并入 `docs/design/`。
>
> 结论先行：**要做就必须补干员。** 本季 `data/chess.json` 里只有 2 名 `nationId=bolivar` 的干员，
> 而国家盟约最低 3 人激活，现有名单连门槛都够不到。

---

## 0. 一句话

新增第 9 条核心国家盟约「玻利瓦尔」：**3 / 6 名成员**，主题是**战功**——成员击杀敌人累积战功换取
攻击力；6 人时击杀精英 / 领袖给全队加战功并回血。

成员以 `nationId=bolivar` 的 8 人为核心，另按“出身玻利瓦尔”纳入刻俄柏、缪尔赛思、承曦格雷伊、
杜宾、米格鲁（2026-10-28 业主提出，待最终确认，见 §7）。

---

## 1. 现状：为什么不是“改一条 JSON”

| 事实 | 证据 |
|---|---|
| 23 条盟约全部由官方 `act.bondInfoDict` 构建，官方赛季**没有**玻利瓦尔盟约 | `tools/build-data.mjs` `buildBonds()`；`data/bonds.json` 共 23 键 |
| 盟约成员 = 官方 `bondInfoDict[bondId].chessIdList`，并与每条棋子的 `bonds` 互为镜像（测试钉住） | `tools/build-data.mjs`（`members` 行）；`docs/CONTENT-AUTHORING.md` §2.1 |
| 本季棋子里 `nationId=bolivar` 只有 **跃跃、格雷伊** | `data/chess.json` |
| 自造**干员**已有通道（`CUSTOM_CHESS`），自造**盟约**没有通道 | `tools/build-data.mjs` `CUSTOM_CHESS` |
| 盟约层数 `L` 只能由分队 / 藏品在备战或战斗开始时给，战后结算会校验 | `server/match/fields.js`（`bad('layer bound')`） |
| 盟约图标走 `docs/research/07-assets.json` → `tools/assets/plan.mjs`，有 `fallbackCampLogo` 兜底 | `plan.mjs` `bonds[bondId] = leaf(...)` |

所以至少要做三件事：构建期新增 `CUSTOM_BONDS`、运行时新增 handler、补齐干员条目。

---

## 2. 成员

### 2.1 官方玻利瓦尔（`nationId=bolivar`，8 人）

| 干员 | charId | 星级 | 职业 · 子职业 | 当前 chess | 美术素材 |
|---|---|---|---|---|---|
| 跃跃 | `char_4100_caper` | 4★ | 狙击 · 回环射手 | t1，`preciShip` | 立绘 + Spine 有 |
| 格雷伊 | `char_253_greyy` | 4★ | 术师 · 扩散术师 | t1，`skillfulShip` | 立绘 + Spine 有 |
| 露托 | `char_4130_luton` | 4★ | 重装 · 不屈者（`unyield`） | 无 | 需抽取 |
| 羽毛笔 | `char_421_crow` | 5★ | 近卫 · 收割者 | 无 | 需抽取 |
| 龙舌兰 | `char_486_takila` | 5★ | 近卫 · 解放者 | 无 | 需抽取 |
| 特克诺 | `char_4164_tecno` | 5★ | 术师 · `soulcaster` | 无 | 需抽取 |
| 聆音 | `char_4187_graceb` | 5★ | 近卫 · 本源近卫 | 无 | 需抽取 |
| 佩德洛 | `char_4234_pedro` | 5★ | 辅助 · `supportiveranger` | 无 | 需抽取 |

### 2.2 按出身纳入（5 人，待确认）

| 干员 | charId | 官方 `nationId` | 星级 | 职业 · 子职业 | 当前 chess | 美术素材 |
|---|---|---|---|---|---|---|
| 刻俄柏 | `char_2013_cerber` | rhodes | 6★ | 术师 · `corecaster` | 无 | 立绘 + Spine 有 |
| 缪尔赛思（缪因） | `char_249_mlyss` | columbia | 6★ | 先锋 · 战术家 | **t6，`maniShip`** | 立绘 + Spine 有 |
| 承曦格雷伊 | `char_1027_greyy2` | rhodes | 5★ | 狙击 · 投掷手 | 无 | 需抽取 |
| 杜宾 | `char_130_doberm` | rhodes | 4★ | 近卫 · 教官 | 无 | 需抽取 |
| 米格鲁 | `char_122_beagle` | rhodes | 3★ | 重装 · 铁卫 | 无 | 需抽取 |

> 这一档是**出身 / 剧情归属**，不是 `nationId`。写进成员表意味着他们同时保留原有盟约
> （如缪尔赛思仍算调和），不影响其他盟约的计数。

### 2.3 计数与注入规则

- 计数与现有一致：看棋子的 `bonds` 是否含 `bolivarShip`，**运行时不读 `nationId`**。
- 注入点（构建期，二选一，按棋子来源）：
  - 官方棋子：在 `build-data.mjs` 里把 `bolivarShip` 推进它的 `cd.bondIds`；
  - 自造棋子：`CUSTOM_CHESS[i].bonds` 里带上 `bolivarShip`（现有 custom-chess 循环会把它写回
    `bondInfoDict[bondId].chessIdList`）。
- `isCore: true`：调和（`maniShip`）干员**享受**效果，但**不增加**玻利瓦尔的计数（与现有核心盟约一致，
  计数由 `server/match/bondsMeta.js` 按棋子 `bonds` 算）。
- 异格算两个人：格雷伊与承曦格雷伊是两个 chess，各自计数（与官方“同名异格”一致）。

### 2.4 分阶段可玩性

| 阶段 | 可用成员 | 能到的档位 |
|---|---|---|
| 现在 | 跃跃、格雷伊 | 2 人，**无法激活** |
| Phase 1 | ＋刻俄柏、缪尔赛思（都已有素材 / kit） | 4 人，可稳定 3 人档 |
| Phase 2 | ＋露托、羽毛笔、龙舌兰、特克诺、聆音、佩德洛、杜宾、米格鲁、承曦格雷伊 | ≥ 7 人，可到 6 人档 |

Phase 1 只上 4 人时，6 人档在机制上存在但不可达——这是有意接受的分期状态，不是数值问题。

---

## 3. 机制：战功（Battle Merits）

### 3.1 为什么是“击杀滚雪球”

| 现有核心盟约 | 触发 |
|---|---|
| 炎 | 常驻攻击 + 召唤「炎佑」 |
| 萨尔贡 | 开技能 → 全队攻速 / 攻击 |
| 维多利亚 | 携带装备 → 增伤 + 每 25 层发锤 |
| 谢拉格 | 常驻增伤 + 寒冷 / 冻结额外 |
| 拉特兰 | 弹药量 + 消耗弹药叠攻 |
| 阿戈尔 | 生命 + 吞噬 + 复活 |
| 叙拉古 | 部署 → 攻速 / 隐匿 / 真伤 |
| 卡西米尔 | 部署叠攻 + 6 人阻挡真伤 |

**击杀叠层是空位**，也贴合玻利瓦尔“战争 / 佣兵 / 战功”的主题；与“部署”“开技能”“装备”都不重叠。

### 3.2 玩家看到的规则文本（草案）

```text
【玻利瓦尔】干员击杀敌人时获得 1 层「战功」，每层攻击力 +1.2%（有上限；受层数影响）
<在场 6 名不同【玻利瓦尔】干员>击杀精英或领袖时，击杀者额外获得 2 层「战功」，
其他【玻利瓦尔】干员各获得 1 层，并回复 8% 最大生命（受层数影响）
```

英文（`tools/i18n/fallback-remake.json` 用）：

```text
[Bolívar] Operators gain 1 stack of Battle Merit when they kill an enemy; each stack grants +1.2% ATK
(capped; affected by no. of stacks)
<With 6 different [Bolívar] Operators on field> Killing an elite or leader grants the killer 2 extra stacks,
1 stack to every other [Bolívar] Operator, and restores 8% max HP (affected by no. of stacks)
```

### 3.3 数值（全部走 `bb`，禁止硬编码）

| 项 | `bb` 字段 | 3 人档（L=0） | 6 人档（L=0） |
|---|---|---|---|
| 每层攻击力（直接乘算 `S.directMods({ atk })`） | `atk_per_merit` 0.012 ＋ `atk_per_merit_per_stack` 0.001×L | 1.2% / 层 | 1.2% / 层 |
| 战功上限（层） | 3 人 `merit_cap_base` 15 ＋ `merit_cap_per_stack` 3×L；6 人 `merit_cap_six` 25 ＋ 3×L | 15 层 → **+18.0%** | 25 层 → **+30.0%** |
| 普通击杀 | — | 击杀者 +1 | 击杀者 +1 |
| 精英 / 领袖击杀 | `elite_merit_bonus` 2、`ally_merit_on_elite` 1 | 击杀者 +1 | 击杀者 +3，其他成员各 +1 |
| 精英 / 领袖击杀治疗 | `elite_heal_scale` 0.08 ＋ `elite_heal_per_stack` 0.01×L | — | 8% 最大生命 |

`L > 0` 是给以后的分队 / 藏品留的成长空间（`L=5` 时约 1.7%/层，3 人档上限 30 层 ≈ +51%，
6 人档上限 40 层 ≈ +68%）。**上线数值必须按 `L=0` 平衡**——玻利瓦尔目前没有任何分队或藏品能给它加层。

### 3.4 关键：战功 ≠ 盟约层数

- `L`（盟约层数）由分队 / 藏品在备战或战斗开始时给；战后客户端上报的 `p.layerGains` 会在
  `server/match/fields.js` 里按“策略允许的加层”校验，**击杀不能写回 `layerGains`**。
- 所以「战功」是**每名干员自己的战斗内计数**（`battle` 侧 `Map`，按 `chessId` 记录），不进入
  `bondState(...).layers`，也不影响 `bondLayers()`。
- 好处：不会改变“激活层数”的统计口径（统计页 / 成就 / 联防守卫），也不会和 `layerGain` 钩子打架。

### 3.5 触发与结算边界

- 只算敌人：`victim.side === 'enemy'`；召唤物 / token 击杀归给操作者（`killer.ownerUnit ?? killer`）。
- 每名干员独立计数，**死亡或再部署后保留**（按 `chessId` 存，符合“战功是战役累积”的设定）；
  同一 chess 的普通 / 黄金算两个 `chessId`。
- 达到上限后不再增加；治疗只作用于场上存活的玻利瓦尔成员。
- 击杀结算在 `battle.on('kill', { killer, victim })`（`server/sim/battle/deploy.js` → `kill()`），
  在 `death` 之前触发；复活类效果（阿戈尔等）不影响战功。
- 与真实伤害 / 闪避 / 暴击无关：战功只加攻击力百分比，走 `S.directMods` 的加法口径。

---

## 4. 实现清单

| # | 文件 | 改什么 | 注意 |
|---|---|---|---|
| 1 | `tools/build-data.mjs` | 新增 `CUSTOM_BONDS`（含 `bondId/name/identifier/isCore/thresholds/countMode/activeType/bb/desc/effectDesc/members`），在 `buildBonds()` 之后合并进 `data/bonds.json`；给官方成员棋子注入 `bolivarShip`；把 `bolivarShip` 追加到各模式 `activeBondIds` | **不要手改 `data/*.json`**；`members` / `visibleMembers` 必须与 `chess.bonds` 一致 |
| 2 | `data/bonds.json`、`data/chess.json`、`data/config.json` | 构建产物 | 跑 `node tools/build-data.mjs --offline` 后逐字节稳定 |
| 3 | `server/sim/content/bonds/core.js` | `BUFF_KEYS.bolivarShip`、`installBolivar()`、`INSTALLERS.bolivarShip` | 用 `reached(battle, pid, 'bolivarShip', bb.power_bond_char_cnt)` 判 6 人档；用 `support.isMember` / `bondMembers` |
| 4 | `server/match/bondsMeta.js` | **无需改**（从 `bonds.json` 派生计数 / 激活 / 调和） | 但要确认 `isCore` 进入禁用抽签池 |
| 5 | `docs/research/07-assets.json` + `tools/assets/plan.mjs` | 在 `bonds` 加 `bolivarShip`：`fallbackCampLogo` 指向现有 `ui/campLogo/logo_bolivar`，或提交 `public/assets/bond/bolivarShip.png` | 现成 `logo_bolivar.png`（24 KB）已在本机素材里 |
| 6 | `tools/i18n/fallback-remake.json` | 补「玻利瓦尔」及规则文本的英文 | 其余语言可先回落中文；跑 `node tools/i18n.mjs check en --strict` |
| 7 | `test/content/bonds_core.test.js`（或新增 `bonds_bolivar.test.js`） | 击杀 +1、上限、6 人档精英 +3 / 其他 +1、治疗、非成员不触发、死亡再部署保留、token 归因 | 用现有 battle 测试夹具构造击杀 |
| 8 | `test/ui/gameLogic.test.js`、`data/config.json` | 成员 / 激活 / 禁用 / 抽卡池 | 新增成员会改变“全员盟约都被禁才移出池子”的判定 |
| 9 | `docs/CONTENT-AUTHORING.md` §2.4、`docs/OUR-FEATURES.md` | 把“自造盟约”通道与本条盟约登记为 fork 独有 | 合并主线时保护 |
| 10 | `docs/PROJECT-STATE.md`、`docs/QUERY-INDEX.md` | 实现后记录部署与查询入口 | — |

构建伪代码（`build-data.mjs`）：

```js
const CUSTOM_BONDS = [{
  bondId: 'bolivarShip', name: '玻利瓦尔', identifier: 9, isCore: true,
  bondType: 'SEASON', bondOrder: 2, powerIdList: ['bolivar'], iconId: 'icon_bolivarShip',
  activeCount: 3, thresholds: [3, 6], thresholdTemplate: 'count_threshold_upward',
  countMode: 'BOARD', activeType: 'BATTLE', weight: 10,
  bb: { atk_per_merit: 0.012, atk_per_merit_per_stack: 0.001,
        merit_cap_base: 15, merit_cap_per_stack: 3, merit_cap_six: 25,
        elite_merit_bonus: 2, ally_merit_on_elite: 1,
        elite_heal_scale: 0.08, elite_heal_per_stack: 0.01,
        power_bond_char_cnt: 6 },
  desc: '……', effectDesc: '……',
}]
```

运行时骨架：

```js
function installBolivar(battle, pid, bb, members) {
  const merit = new Map();                       // chessId → 战功层数
  const six = () => reached(battle, pid, 'bolivarShip', num(bb.power_bond_char_cnt, 6));
  const L = () => S.bondLayers(battle, pid, 'bolivarShip');
  const cap = () => (six() ? num(bb.merit_cap_six, 25) : num(bb.merit_cap_base, 15)) + num(bb.merit_cap_per_stack, 0) * L();
  const refresh = (u) => S.passiveBuff(battle, u, 'bond:bolivar:merit', S.directMods({
    atk: (num(bb.atk_per_merit, 0) + num(bb.atk_per_merit_per_stack, 0) * L()) * (merit.get(u.chessId) || 0),
  }));
  battle.on('kill', ({ killer, victim }) => {
    if (!victim || victim.side !== 'enemy') return;
    const who = killer?.ownerUnit ?? killer;
    if (!who || !S.isMember(battle, who, 'bolivarShip')) return;
    // +1，精英 +elite_merit_bonus；6 人档其他成员 +ally_merit_on_elite、回血
  });
}
```

> 具体 API 以 `server/sim/content/bonds/core.js` 里现有的 `S.passiveBuff` / `battle.heal` /
> `reached()` 用法为准；`passiveBuff` 的刷新时机与现有“常驻 buff”一致（`layerGain` 后一拍）。

---

## 5. 平衡与风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 滚雪球过强 | 击杀越多攻击越高，顺风局可能无解 | 上限硬顶（3 人 15 层 / 6 人 25 层）；每层只有 1.2% |
| 6 人几乎占满棋盘 | 部署上限 8，6 人档要求 6 个不同成员 | 6 人档给治疗而不是更多攻击；不额外要求 7/8 人 |
| 6★ 双国籍 | 刻俄柏、缪尔赛思本身强，还能吃第二个国家盟约 | 6 人档才给团队收益；Phase 1 只有 4 人时到不了 6 |
| 抽卡池 / 禁用规则 | 新增成员改变“全员盟约被禁才移出池子”的判定；核心盟约从 8 变 9 会稀释禁用抽签 | 先在全模式 `activeBondIds` 启用；`FUNNY` 是否禁用见 §7 |
| 名单过宽 | 13 名成员会让 3 人档很容易凑 | 3 人档数值保守（+18% 封顶）；如过强，先收紧“出身成员”而不是砍数值 |
| golden / 统计 | 新增盟约进入统计页“最常用盟约”、成就 | 行为变化按仓库规则单独提交并归因 golden |

---

## 6. 分期计划与工作量

| 阶段 | 内容 | 估计 |
|---|---|---|
| **P0 设计** | 本文 + 业主确认名单 / 数值 | 0.5 天 |
| **P1 可玩最小集** | `CUSTOM_BONDS` + `installBolivar` + 图标 + 测试；成员 4 人（跃跃、格雷伊、刻俄柏、缪尔赛思，均无需新 kit / 新美术） | 2–3 天 |
| **P2 补员到 6 人档** | 露托、羽毛笔、龙舌兰、特克诺、聆音、佩德洛（+ 可选 杜宾、米格鲁、承曦格雷伊）：chess 条目、kit、立绘 / Spine / 头像、`assets.json` | 1–1.5 周（每个干员的 kit 与美术是主要成本） |
| **P3 平衡与扩展** | 实战测量、i18n 全语言、是否给玻利瓦尔做分队 / 藏品（让 `L` 生效） | 2–3 天 |

---

## 7. 未决问题（需要业主拍板）

1. **缪尔赛思**按“哥伦比亚 / 玻利瓦尔”双归属纳入是否确定？（她当前 `nationId=columbia`，且已在棋子里，
   纳入只改 `bonds`，不改阵营字段。）
2. **杜宾、米格鲁、刻俄柏、承曦格雷伊**是否全部纳入？这四位的官方 `nationId` 都是 `rhodes`，
   纳入依据是“出身”，需要在文档里写明来源，避免以后被当成数据错误“修掉”。
3. **FUNNY 模式**是否禁用玻利瓦尔？建议**不禁用**（击杀机制简单，且禁用会让只带玻利瓦尔盟约的棋子
   退出该模式抽卡池）。
4. **6 人档的精英判定**用哪套标记：`victim.boss`、精英模板，还是 `victim.tier`？需要在实现前定一个
   统一谓词，并写进测试。
5. 战功上限是否要显示在棋子详情 / buff 图标上？（影响 `bondStrip` / 详情面板文案。）

---

## 8. 参考

- 盟约数据字段与运行时：`docs/CONTENT-AUTHORING.md` §2
- 现有核心盟约实现：`server/sim/content/bonds/core.js`
- 自造干员端到端：`docs/NEW-OPERATOR.md`
- 构建入口：`tools/build-data.mjs`（`CUSTOM_CHESS` 在文件中部，`buildBonds()` 在后部）
- 素材流水线：`tools/assets/plan.mjs`、`docs/research/07-assets.json`、`docs/ASSETS.md`
- 文本：`docs/I18N.md` §2、`tools/i18n/fallback-remake.json`
