# 游戏规则文档 / Rules

> **这是规则文档的单一入口。** 规则以**代码 + 自动化测试**为最终事实；本文件负责告诉你“该看哪一份规范”，不替代规范本身。
> **最后核对**：2026-10-25。

---

## 1. 权威顺序

发生冲突时按以下顺序判断：

1. **代码 + 自动化测试**（最终事实）；
2. **当前规则规范**：
   - [`DESIGN.md`](DESIGN.md)（章节索引）→ [`design/`](design/)（当前规则）
   - [`SIM.md`](SIM.md)（战斗引擎）
   - [`META.md`](META.md)（对局 / 回合 / 经济 / 视图）
   - [`DATA.md`](DATA.md)（`data/*.json` 字段）
   - `shared/protocol.js`（线协议，代码即规范）
3. **官方数据研究**：[`research/`](research/)（官方行为的证据与假设，不等于本 fork 的承诺）；
4. **当前状态**：[`PROJECT-STATE.md`](PROJECT-STATE.md)、[`PLUGIN-BACKLOG.md`](PLUGIN-BACKLOG.md)；
5. **历史记录**：[`history/`](history/)、[`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md)、`CHANGELOG.md`；
6. **草案 / 路线图**：未批准内容不能当作现行规则。

> `history/` 记录的是**发布时的事实**，不是当前实现。当前行为永远回 `design/`、`SIM`、`META`、`DATA` 和代码。

---

## 2. 规则总览（按主题）

| 主题 | 一句话 | 规范 / 细节 |
|---|---|---|
| 目标与人数 | 1–4 人合作塔防，守住目标生命；没有 PvP | [`PLAYING.md`](PLAYING.md)、[`design/overview.md`](design/overview.md) |
| 一局流程 | 确认信息 → 策略轮选 → 休整 / 作战循环 → 结算；险境及以上满足条件进入隐秘核心 | [`META.md`](META.md)、[`design/match.md`](design/match.md) |
| 回合 | 常规 14 回合；隐藏回合条件见模式配置 | [`META.md`](META.md) §回合、`data/config.json` |
| 难度 | 标准 / 险境 / 绝境 / 终极；独立模拟与同盟模拟 | [`PLAYING.md`](PLAYING.md)、[`BALANCE.md`](BALANCE.md) |
| 经济 | 每回合收入、利息 / 资金、商店刷新与升级、冻结 | [`META.md`](META.md)、[`design/match.md`](design/match.md) |
| 商店 / 调度中心 | 按等级刷新干员；升级、冻结、出售、合并 | [`META.md`](META.md)、[`design/match.md`](design/match.md) |
| 盟约 / 层数 | 势力核心 + 附加盟约；层数整局保留（上限 999） | [`design/match.md`](design/match.md)、[`SIM.md`](SIM.md) |
| 策略（band） | 开局轮选；每个策略有初始生命、专属效果、团队 / 个人授予 | [`design/match.md`](design/match.md)、`data/bands.json` |
| 部署 / 朝向 | 休整期从整备区拖到棋盘；方向轮盘选朝向；高台 / 地面限制 | [`design/geometry-time.md`](design/geometry-time.md)、[`PLAYING.md`](PLAYING.md) |
| 战斗 | 自动作战；技能按官方策略自动释放；元素损伤 / 爆发；召唤物手动摆放 | [`SIM.md`](SIM.md)、[`design/engine.md`](design/engine.md) |
| 阻挡 / 位移 | 接触半径阻挡；推开 / 拉拽按力度与重量；近地悬浮 | [`SIM.md`](SIM.md) §阻挡、§位移 |
| 敌人 / Boss | 普通波次、Boss 轮、隐藏 Boss、共享 Boss 血量 | [`META.md`](META.md)、[`design/match.md`](design/match.md) |
| 结算 / 称号 | 目标生命、击杀、伤害、晋升、资金等称号 | [`META.md`](META.md)、[`PLAYING.md`](PLAYING.md) |
| 断线 / 重连 | 同盟 10 分钟内、独立 24 小时内可回座 | [`META.md`](META.md)、[`design/network.md`](design/network.md) |
| 分血救援 | 目标生命归零先击倒；队友休整期分 1 点救回（1 血，每人每局最多 2 次） | [`PLAYING.md`](PLAYING.md)、[`META.md`](META.md) |
| 统计 | 总览、称号、单局纪录、常用盟约 / 策略 | [`META.md`](META.md)、[`PROJECT-STATE.md`](PROJECT-STATE.md) |

> 上表的数字是**当前实现**的摘要；具体模式差异（收入表、目标生命、敌人倍率、回合数）以 `data/config.json`、模式记录和规范文档为准。

### 2.1 核心数字（速查）

| 项 | 值 | 来源 |
|---|---|---|
| 席位 / 合作人数 | 4 席，1–4 人合作 | `shared/constants.js MAX_SEATS`、`README.md` |
| 常规回合 | 14 回合；满足条件进入第 15 回合「隐秘核心」 | `README.md`、`PLAYING.md`、`META.md` |
| 策略（band） | 40 名；每人 1 个，队友不能重复选 | `data/bands.json`、`PLAYING.md` |
| 难度 | 标准 / 险境 / 绝境 / 终极 | `data/config.json`、`BALANCE.md` |
| 盟约层数上限 | 999 | `shared/constants.js BOND_LAYER_CAP` |
| 单次伤害上限 | 300000（限伤） | `shared/constants.js BOSS_HIT_LIMIT` |
| 策略轮选倒计时 | 每人 50 秒 | `server/match/match/common.js BAND_TURN_SECONDS` |
| 断线重连 | 同盟 10 分钟；独立 24 小时 | `META.md`、`PLAYING.md`、`shared/constants.js` |
| 标准模式战场 | 固定「战场#01」 | `PLAYING.md`、`data/config.json` |

---

## 3. 规范文档地图

### 3.1 规则索引与当前规则

| 文档 | 内容 |
|---|---|
| [`DESIGN.md`](DESIGN.md) | 全局章节索引；§0–§49 的编号永久不变 |
| [`design/overview.md`](design/overview.md) | 范围、技术栈、仓库布局、质量门槛 |
| [`design/geometry-time.md`](design/geometry-time.md) | 坐标、战场、几何、时间模型 |
| [`design/match.md`](design/match.md) | 对局状态机、玩家状态、盟约、休整期效果、波次、AI、编队 |
| [`design/engine.md`](design/engine.md) | 战斗引擎契约、单位 / buff / 伤害 / 钩子 / 技能、内容模块 |
| [`design/network.md`](design/network.md) | 网络协议、客户端战斗、内容身份 |
| [`design/client.md`](design/client.md) | 渲染、UI、本地素材、3D 棋盘 |
| [`design/vfx-format.md`](design/vfx-format.md) | 官方战斗特效格式 |

### 3.2 专题规范

| 文档 | 内容 |
|---|---|
| [`SIM.md`](SIM.md) | 战斗引擎：单位、属性、伤害、buff、技能、职业、目标选择、投射物 |
| [`META.md`](META.md) | 对局 / 匹配 / 回合 / 经济 / 联防 / 视图 / 结算 |
| [`DATA.md`](DATA.md) | `data/*.json` 的字段、生成方式、校验 |
| [`BALANCE.md`](BALANCE.md) | 难度模型、数值测量、平衡记录 |
| [`PLAYING.md`](PLAYING.md) | 面向玩家的规则指南（中文） |
| [`I18N.md`](I18N.md) | UI 文案、游戏文本、服务器消息、语言包 |
| [`OUR-FEATURES.md`](OUR-FEATURES.md) | 仅本 fork 的机制（合并时不得丢失） |

### 3.3 历史与研究

| 文档 | 用途 |
|---|---|
| [`history/`](history/) | 每个版本改了什么规则、证据与 QA |
| [`research/00-INDEX.md`](research/00-INDEX.md) | 官方数据研究索引（可读 + JSON） |
| [`UPSTREAM-MERGES.md`](UPSTREAM-MERGES.md) | 主线合并日志、never-merge 清单 |
| [`MATCHMAKING.md`](MATCHMAKING.md) | 我们自己的机制决策记录（§0–§49） |
| `CHANGELOG.md` | 玩家可见的版本记录 |

---

## 4. 查规则：按问题跳转

| 你想知道 | 先看 |
|---|---|
| 玩家怎么玩、界面怎么操作 | [`PLAYING.md`](PLAYING.md) |
| 这一局有几个回合、什么时候进 Boss 轮 | [`META.md`](META.md)、[`design/match.md`](design/match.md) |
| 收入 / 利息 / 升级 / 刷新价格 | [`META.md`](META.md)、`data/config.json` |
| 某个干员的技能 / 天赋怎么算 | [`SIM.md`](SIM.md)、`server/sim/content/kits/` |
| 伤害类型、元素、爆发、限伤 | [`SIM.md`](SIM.md) §伤害、`server/sim/damage.js` |
| 阻挡、位移、飞行、近地悬浮 | [`SIM.md`](SIM.md)、[`design/geometry-time.md`](design/geometry-time.md) |
| 盟约层数、上限、激活条件 | [`design/match.md`](design/match.md)、`data/bonds.json` |
| 某个策略（band）的效果 | `data/bands.json`、对应插件 / 策略文档 |
| 商店 / 卡池 / 概率 | [`META.md`](META.md)、`data/config.json` |
| 波次 / 敌人 / Boss | [`META.md`](META.md)、[`design/match.md`](design/match.md)、`data/waves.json` |
| 协议消息 / 视图字段 | `shared/protocol.js`、[`design/network.md`](design/network.md) |
| 数据字段 / 生成 | [`DATA.md`](DATA.md)、`tools/build-data.mjs` |
| 难度 / 数值测量 | [`BALANCE.md`](BALANCE.md) |
| 官方原版是怎么做的 | [`research/`](research/)、`docs/history/` |

---

## 5. 当前规则 vs 历史 vs 研究

- **当前规则**：`docs/design/` 与 `SIM` / `META` / `DATA`。改规则时**必须重写这里的规范行**。
- **历史**：`docs/history/` 是发布时的证据与修订记录；只追加，不改写过去。
- **研究**：`docs/research/` 是官方数据的观察、引用与 `[ASSUMED]`；研究结论不自动等于本 fork 的行为。
- **决策记录**：[`MATCHMAKING.md`](MATCHMAKING.md) 记录我们 fork 自己的取舍；与当前规则冲突时，先看代码与测试。

---

## 6. 改规则的流程

1. **定位规范**：在 §3 找到拥有该主题的文档；不要只改 `PLAYING.md`。
2. **定位实现**：用 [`QUERY-INDEX.md`](QUERY-INDEX.md) / [`ARCHITECTURE.md`](ARCHITECTURE.md) 找到唯一实现点。
3. **先加测试**：规则 / 引擎改动必须有能防回归的测试。
4. **改实现**：保持服务器权威与确定性；不要客户端 / 服务器两份规则。
5. **改当前规范**：更新 `docs/design/*` 或 `SIM` / `META` / `DATA` 的规范行；必要时追加 `docs/history/` 的发布记录。
6. **改玩家文档**：`PLAYING.md` / `README.md` / `CHANGELOG.md`（玩家可见变化时）。
7. **跑门禁**：
   ```bash
   node --test <相关测试>
   npm test
   node tools/build-data.mjs --offline   # 若碰数据
   node tools/golden.mjs                 # 若碰玩法 / 数值
   node --test test/docs-links.test.js test/docs-consistency.test.js test/docs-paths.test.js test/docs-mojibake.test.js
   ```

### Golden 纪律

任何改变 `test/golden/*.json` 的规则改动，必须：

- 先证明“只回退自己的改动 → golden 零 diff”；
- 再单独提交重新生成；
- 不手改 golden，不放宽引擎守卫。

---

## 7. 规则文档维护清单

- [ ] `docs/design/` 的当前规则已更新，而不是只改历史
- [ ] `SIM` / `META` / `DATA` 中对应规范行已更新
- [ ] `PLAYING.md` / `README.md` 的玩家说法一致
- [ ] 相关测试已加 / 已改
- [ ] golden 已按纪律处理
- [ ] `docs/DESIGN.md` 的章节索引未被破坏（§编号不改）
- [ ] 文档门禁通过
