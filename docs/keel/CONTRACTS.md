# Keel 扩展点契约

> 本表是扩展点名称/域/能力/预算的权威版本；`shared/keel/contracts.js` 与 `node tools/keel.mjs surface --check` 必须与它一致。  
> 运行时是否已接、当前边界见 [`FEATURES.md`](FEATURES.md)；实现细节见 [`RUNTIME.md`](RUNTIME.md)。

## 1. Content（4）

| ID | 域 | 扩展点 | 可读 | 可写 | 能力 | 预算 | 稳定性 |
|---|---|---|---|---|---|---|---|
| C1 | content | `content.define` | 内容图 | 新增资源 | `content.define` | 构建期 ≤ 200ms/插件 | stable |
| C2 | content | `content.extend` | 目标资源 | 追加/合并 | `content.extend` | 构建期 | stable |
| C3 | content | `content.patch` | 字段路径 | 改标量 | `content.patch` | 构建期 | stable |
| C4 | content | `content.override` | 目标资源 | 整体替换 | `content.override` | 构建期，需审计 | stable |

## 2. Sim（10）

| ID | 域 | 扩展点 | 可读 | 可写 | 能力 | 预算 | 稳定性 |
|---|---|---|---|---|---|---|---|
| S1 | sim | `sim.setup` | 关卡/编队/种子 | 注册 buff/效果 | `sim.read` | 1ms/局 | stable |
| S2 | sim | `sim.battleStart` | 全场 | 初始单位/装置 | `sim.spawn` | 0.5ms/局 | stable |
| S3 | sim | `sim.deploy` | 单位/初始/再部署 | 初始属性/一次性 buff | `sim.buff.write` | 0.2ms/次 | stable |
| S4 | sim | `sim.tick` | `dt`/全场视图 | 通过句柄改状态 | `sim.read` | 0.05ms/帧 | stable |
| S5 | sim | `sim.beforeAttack` | 攻击者/目标 | 过滤/替换目标 | `sim.read` | 0.2ms/次 | stable |
| S6 | sim | `sim.hit` | 伤害包 | `amount/type/tags/取消` | `sim.damage.write` | 0.2ms/次 | stable |
| S7 | sim | `sim.damaged` | 实际伤害 | 触发反击（重入防护） | `sim.damage.write` | 0.2ms/次 | stable |
| S8 | sim | `sim.heal` | 治疗包 | 改治疗量 | `sim.heal.write` | 0.2ms/次 | stable |
| S9 | sim | `sim.kill` | 击杀者/死者 | 复活/掉落/计数 | `sim.damage.write` | 0.2ms/次 | stable |
| S10 | sim | `sim.battleEnd` | 结果 | 追加结算 | `sim.read` | 1ms/局 | stable |

## 3. Match（4）

| ID | 域 | 扩展点 | 可读 | 可写 | 能力 | 预算 | 稳定性 |
|---|---|---|---|---|---|---|---|
| M1 | match | `match.onMatchStart` | 比赛视图 | 受控命令 | `match.read` | 1ms/局 | stable |
| M2 | match | `match.onRoundStart` | 回合/经济/商店 | 候选/状态 | `match.economy.write` | 0.5ms/回合 | stable |
| M3 | match | `match.onRoundEnd` | 结算 | 奖励/状态 | `match.economy.write` | 0.5ms/回合 | stable |
| M4 | match | `match.checkEnd` | 比赛视图 | 返回胜负 | `match.read` | 0.2ms/回合 | stable |

## 4. Policy（2）

| ID | 域 | 扩展点 | 可读 | 可写 | 能力 | 预算 | 稳定性 |
|---|---|---|---|---|---|---|---|
| P1 | policy | `policy.decide` | 观察 + 合法动作 | 返回一个动作 | `policy.observe` | `budgetMs`（默认 50ms） | stable |
| P2 | policy | `policy.onDraft` | 选秀/商店 | 返回选择 | `policy.act` | 50ms | stable |

## 5. UI（2）

| ID | 域 | 扩展点 | 可读 | 可写 | 能力 | 预算 | 稳定性 |
|---|---|---|---|---|---|---|---|
| U1 | ui | `ui.render` | 只读 `pluginView` | 声明式组件树 | `ui.frame` | 16ms/帧 | stable |
| U2 | ui | `ui.slot` | 槽位声明 | 占用一个槽位 | `ui.frame` | 加载期 | stable |

## 6. Asset（2）

| ID | 域 | 扩展点 | 可读 | 可写 | 能力 | 预算 | 稳定性 |
|---|---|---|---|---|---|---|---|
| A1 | asset | `asset.add` | 资产清单 | 新增文件 | `asset.add` | 安装期 | stable |
| A2 | asset | `asset.override` | 官方条目 | 替换条目 | `asset.override` | 安装期，需审计 | stable |

## 7. Experimental（不承诺稳定）

`sim.death`、`sim.skillStart`、`sim.skillEnd`、`sim.statusApplied`、`sim.enemySpawn`、`sim.enemyLeak`、`sim.elementBurst`、`sim.hpDamage`、`match.onPhase`、`match.onSettle`、`policy.review`、`ui.theme`。

## 8. 规则

1. **ID 不重编号**；新增只能追加。
2. stable 点的签名在主版本内不改；弃用至少提前一个小版本。
3. 每个点必须有：可读、可写、能力、预算、稳定性。
4. 能力必须来自 `KEEL_PERMISSIONS`；模块种类越权直接拒绝。
5. `surface --check` 校验本表与常量一致；本表缺行或多行都失败。

## 9. 当前运行时状态

| 扩展点 | 调度 | host 自动触发 | 备注 |
|---|---|---|---|
| `sim.setup` / `sim.battleStart` | 是 | 是 | Worker 内 `runtime.start()` |
| `sim.tick` | 是 | 是 | `runtime.tick()` |
| `sim.battleEnd` | 是 | 是 | `runtime.end()` |
| `sim.hit` / `sim.damaged` / `sim.heal` / `sim.kill` | 是 | 是 | Battle 事件；白名单回写 `dmg` / `amount` |
| `sim.beforeAttack` | 是 | 是 | 可过滤/替换 `targets` |
| `sim.enemySpawn` / `sim.enemyLeak` / `sim.blocked` | 是 | 是 | 扩展 hook |
| `match.*` | 是 | 是 | 服务端 match host meta |
| `policy.*` | 是 | 是 | 服务端 match host meta |
| `content.*` | 构建期 | — | content set 编译 |
| `ui.*` / `asset.*` | 加载/构建期 | — | UI frame / visual set / FX |

运行时实现：`shared/keel/runtime.js`；host 接口：`shared/keel/host.js`；当前能力与边界：[`FEATURES.md`](FEATURES.md)、[`RUNTIME.md`](RUNTIME.md)。
