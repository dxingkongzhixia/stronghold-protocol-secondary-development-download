# 玩法插件平台改造方案（草案 v0.1）

> 状态：**待 owner 审核，尚未实施**。  
> 目标：把当前 fork 从「PRTS 内容插件 + 局部核心扩展」升级为「可复用的玩法插件平台」。  
> 原则：不重写现有游戏；默认不改变 vanilla 行为；所有生产变更仍需单独批准。
>
> **2026-10-21 方向修订：插件资产包提前为硬约束。**  
> PRTS 的模型、图标、BGM、FX 不再写入主程序的 `public/assets` / `data/assets.json` / `data/local-assets*.json`，而是放进 `plugins/prts-source-code/assets/`，由插件资产覆盖层解析；卸载插件即移除素材。  
> 现有 manifest 的 `assets` part 已能承载 enemy/token Spine、图标和 BGM；FX 需要新增插件 FX 容器后才能完全迁入，不能把 FX 继续硬塞进全局清单。

---

## 1. 目标与非目标

### 1.1 目标

平台应支持插件完成：

- 新敌人、Boss、波次、模式权重
- 新干员、token、召唤物、技能
- 新策略卡 / band / 盟约
- 新 Boss 协议与战斗机制
- 新模式的基本阶段、回合规则、胜负条件
- 新 HUD 插槽和小型信息面板
- 插件自带的模型、图标、BGM、特效
- 在上述基础上组合出 PRTS 这类完整玩法

### 1.2 非目标（至少 MVP 不做）

- 不让客户端插件执行任意 JavaScript / 操作 DOM
- 不让插件直接访问文件系统、网络或进程
- 不让插件直接改 `Match` / `Battle` 内部对象
- 不支持完全替换渲染器、网络层或客户端框架
- 不承诺任意玩法都能零核心代码实现
- 不把官方素材无条件打包进插件分发

### 1.3 成功定义

MVP 达标标准：

1. 新建一个非 PRTS 的示例玩法插件，只写数据 + 规则 + UI 声明，核心代码不改。
2. PRTS 完整迁移到平台 API，核心中不再保留 PRTS 专属分支。
3. 不启用插件时，vanilla 数据、战斗、hash 与当前版本一致。
4. 规则插件可确定性回放；断线恢复后状态一致。
5. 插件缺少资源时有明确回退，不白屏、不崩溃。
6. `plugin check --strict`、内容组合、sim、UI、回放测试全部通过。
7. 插件权限在安装、房间启用、运行时三处一致执行。

---

## 2. 设计原则

1. **服务端权威**：规则、战斗、资源和结算以服务端为准。
2. **确定性**：随机数、计时、事件顺序必须可回放。
3. **能力最小化**：插件只拿到声明的能力，不默认拿到全部 API。
4. **数据优先**：能用数据表达的，不要求写代码。
5. **受控扩展**：规则脚本运行在沙箱；客户端 UI 以声明式为主。
6. **向后兼容**：现有 content plugin、DSL、script plugin 不因平台升级失效。
7. **可回退**：插件关闭/卸载后，房间回到 vanilla 行为。
8. **可审计**：插件来源、权限、资源、版本、hash 可查。
9. **资产隔离是硬约束**：插件素材只放在插件自己的 `assets/` 下，不写 `public/assets`、不写 `data/assets.json`、不写 `data/local-assets*.json`。运行时通过插件资产覆盖层解析，卸载时随插件目录一起移除。

---

## 3. 现状与差距

### 3.1 已有基础

- 插件 manifest / 权限 / 命名空间
- `data.add` / `data.patch`
- `buildContentSet` 内容组合
- 内容 hash、版本校验
- 房间级插件启用
- sim host 进程隔离
- DSL / JSON SkillSpec / 脚本插件
- 服务端权威战斗与回放
- 资源清单、本地素材提取
- `plugin check` / `pack`
- 官方 kit 复用
- PRTS 已验证：Boss、波次、band、协议、M3、HUD、FX、图标、BGM

### 3.2 主要缺口

| 缺口 | 现状 | 影响 |
|---|---|---|
| 比赛规则未插件化 | PRTS 规则仍在 `Match` / `phases` / `round` / `economy` | 新模式必须改核心 |
| 客户端 UI 未插件化 | PRTS HUD 写在 `hud.js` | 新插件不能自带 HUD |
| 插件事件通道有限 | 主要消费固定协议字段 | 插件无法表达自己的状态 |
| 资产不是插件包 | 图标/BGM/部分 FX 写全局清单 | 安装/卸载/分发不完整 |
| 权限模型偏内容 | 主要是 `data.*` / `dsl` / `sim.code` | 规则/UI/资产权限不可细分 |
| 缺少玩法开发工具 | 需要手工拼装、跑局 | 开发体验不足 |
| API 版本策略未定义 | 只有 manifest/api 粗粒度 | 平台升级易破坏插件 |

---

## 4. 目标架构

### 4.1 分层

```text
┌─────────────────────────────────────────────┐
│ 客户端                                      │
│  核心画面 + 插件 UI 插槽 + 只读 pluginView  │
├─────────────────────────────────────────────┤
│ 网络协议                                    │
│  固定消息 + 受控 pluginEvent / pluginView    │
├─────────────────────────────────────────────┤
│ 比赛运行时                                  │
│  核心阶段机 + 规则插件钩子 + 权威命令        │
├─────────────────────────────────────────────┤
│ 战斗运行时                                  │
│  现有 sim + 战斗钩子 + 确定性随机            │
├─────────────────────────────────────────────┤
│ 内容 / 规则 / UI / 资产 插件层               │
├─────────────────────────────────────────────┤
│ 安装、权限、版本、hash、资源、隔离           │
└─────────────────────────────────────────────┘
```

### 4.2 插件类型

建议引入四种逻辑类型，可以是同一个 manifest 的能力组合：

| 类型 | 内容 | 是否执行代码 |
|---|---|---|
| `content` | 数据、干员、Boss、波次、band | 否 |
| `rules` | 阶段、回合、胜负、结算 | 服务端沙箱脚本 |
| `ui` | HUD 插槽、声明式组件 | 否 |
| `assets` | 模型、图标、音频、FX | 否 |

一个完整玩法插件可以同时声明 `content + rules + ui + assets`。

### 4.3 Manifest 扩展

保持现有 manifest 2 兼容，新增可选字段：

```json
{
  "manifest": 2,
  "class": "gameplay",
  "capabilities": [
    "content.enemies",
    "content.bosses",
    "match.rules",
    "ui.hud",
    "assets.spine"
  ],
  "contributes": {
    "content": ["data/", "content/"],
    "rules": "rules/index.js",
    "ui": "ui/index.json",
    "assets": "assets/manifest.json"
  }
}
```

兼容规则：

- 没有 `capabilities` 的旧插件按现有方式加载。
- `class` 新值 `gameplay` 是组合类型。
- 所有新字段可选；缺失时行为不变。
- `manifest` 仍为 2，避免一次性大迁移；后续再考虑 3。

### 4.4 规则运行时

#### 服务端接口

```js
export default {
  setup(ctx) {},
  onMatchStart(ctx) {},
  onRoundStart(ctx, round) {},
  onBattleStart(ctx, battle) {},
  onBattleEvent(ctx, event) {},
  onRoundEnd(ctx, result) {},
  onSettle(ctx) {},
  checkEnd(ctx) { return null; },
  serialize() { return {}; },
  restore(state) {},
};
```

#### `ctx` 能力

只暴露受控能力：

```text
ctx.match.read(...)       只读比赛视图
ctx.players.read(...)
ctx.rng                   确定性随机
ctx.emit(event)           插件事件
ctx.command(cmd)          受控命令
ctx.state.get/set         插件自己的命名空间状态
ctx.assets.resolve(...)
ctx.i18n
ctx.log
```

禁止：

```text
ctx.match.players.get(...).funds = 999
ctx.fs
ctx.fetch
ctx.process
```

#### 生命周期

```text
MATCH_CREATED
→ PLUGIN_SETUP
→ ROUND_START
→ PREP
→ BATTLE_START
→ BATTLE_EVENT*
→ BATTLE_END
→ SETTLE
→ ROUND_END
→ ...
→ MATCH_END
```

核心负责阶段推进；插件只能通过返回值或受控命令影响，不直接改阶段机。

#### 状态与回放

- 插件状态必须是 JSON 可序列化数据。
- 禁止保存函数、DOM、类实例、Promise。
- 插件随机数必须通过 `ctx.rng`。
- 插件计时必须走比赛调度器。
- 回放时只恢复状态和事件，不重新执行不可信副作用。

### 4.5 客户端 UI

#### 插槽

第一批只做：

```text
hud.top
hud.boss
hud.bottom
hud.overlay
prep.sidebar
result.extra
```

#### 声明式组件

第一批支持：

```text
text
number
bar
countdown
icon
list
row
button
```

示例：

```json
{
  "slot": "hud.boss",
  "when": "phase == COMBAT",
  "children": [
    { "type": "text", "value": "plugin.protocol.state" },
    { "type": "countdown", "value": "plugin.protocol.clearIn" },
    { "type": "bar", "value": "plugin.protocol.revivesLeft", "max": 5 }
  ]
}
```

要求：

- 只读 `pluginView`
- 组件有上限
- 文本有长度上限
- 样式限制在设计 token 内
- 不执行插件提供的任意函数
- 不支持远程 URL
- 渲染失败只隐藏该插槽

### 4.6 插件视图与事件

服务端：

```text
pluginView: {
  [pluginId]: { ...JSON... }
}
```

注入位置：

```text
m.public.pluginView
b.snap.pluginView
```

事件：

```text
pluginEvent { pluginId, type, payload }
```

限制：

- 单次 payload 建议 ≤ 16 KB
- 每比赛每秒事件数上限
- 事件类型必须在 manifest 声明
- 客户端只读
- 回放记录事件，不记录 DOM

### 4.7 资产包

插件资产 manifest：

```json
{
  "version": 1,
  "spine": { "enemy_x_boss": { "skel": "...", "atlas": "...", "textures": ["..."] } },
  "images": { "icon": "..." },
  "audio": { "bossBgm": { "intro": "...", "loop": "..." } },
  "fx": { "enemy_x_skill": { "prefab": "...", "textures": ["..."] } }
}
```

要求：

- 插件内相对路径
- 内容寻址
- 安装时校验
- 卸载时清理
- 缺失时回退
- 带 license/source 字段
- 不覆盖官方资源，除非显式 `overrides` + 权限

### 4.8 API 版本

新增：

```text
gameplayApi: 1
```

规则和 UI 各自声明 API 版本。  
平台维护：

- 稳定接口
- 实验接口
- 弃用周期
- 兼容性检查
- 迁移提示

---

## 5. 分阶段改造

### 阶段 0：基线审计（2–3 天）

目标：把所有 PRTS 专属代码标出来。

交付：

- 核心改动清单
- PRTS 专属点清单
- 通用原语清单
- 兼容性基线测试
- vanilla hash 基线

验收：

- 不启用插件时，测试与当前 master 一致
- 每个 PRTS 改动都有归属：核心 / 插件 / 资产

### 阶段 1：通用化 PRTS 遗留（1–2 周）

目标：把 PRTS 的一次性实现抽成通用能力。

内容：

- `bossProtocol` 保持通用
- M3 的 `owners` / `reviveLimit` / `tint` 通用化
- `protocolView` 抽成通用 HUD 数据
- `officialKey` FX 接口稳定
- 图标/BGM/模型引用从 PRTS 专用改为通用字段
- 波次模板映射统一

验收：

- PRTS 仍可玩
- 新增一个纯数据 Boss 插件，不改核心即可出怪、出协议、出 HUD、出 FX
- vanilla 不变

### 阶段 2：规则运行时（3–5 周）

目标：插件能定义新模式的基本规则。

内容：

- manifest capabilities
- 规则插件加载/校验
- 生命周期钩子
- 受控 ctx API
- 插件状态命名空间
- 序列化/恢复
- 确定性随机和计时
- 事件/命令通道
- 权限检查

验收：

- 示例玩法「限时生存 10 回合」只写规则 + 数据即可运行
- 断线重连状态一致
- 回放一致
- 非法 API 调用被拒绝

### 阶段 3：UI 插槽（2–4 周）

目标：插件能声明自己的 HUD。

内容：

- 插槽注册
- 声明式组件
- `pluginView` 注入
- 样式 token
- 上限/降级
- 错误隔离
- 移动端适配

验收：

- 示例插件显示自己的资源条和倒计时
- 不修改 `hud.js`
- 插件 UI 崩溃不影响主界面
- 手机布局不溢出

### 阶段 4：插件资产包（2–4 周）

目标：插件自带资源。

内容：

- 资产 manifest
- spine / image / audio / fx
- 内容寻址
- 安装/卸载
- 回退
- 授权信息
- 与现有 `data/assets.json` / `data/local-assets.json` / `data/local-fx.json` 合并

验收：

- 示例插件自带 Boss 模型、图标、BGM、FX
- 缺一个文件时回退而不是白屏
- 卸载后无残留引用

### 阶段 5：开发工具（2–3 周）

目标：让第三方能开发。

内容：

- `plugin new gameplay`
- 脚手架模板
- 本地开发模式
- 热重载
- 规则事件日志
- 模拟战斗
- 快速开房
- 兼容性检查
- 迁移工具
- 文档和示例

验收：

- 新开发者按文档 30 分钟内跑起示例
- 修改规则后不重启整局
- 错误信息可定位到插件文件/行

### 阶段 6：安全与发布（2 周）

目标：可审核、可回退。

内容：

- 权限矩阵
- 沙箱测试
- 资源/大小/频率上限
- 插件签名或 hash pin
- 安装审核
- 版本兼容
- 生产回滚
- 部署清单

验收：

- 恶意插件无法访问 fs/network/process
- 超限插件被拒绝
- 插件异常不拖垮房间
- 可一键回退 vanilla

---

## 5.1 已开工记录\n\n- 2026-10-21：content 插件资产打包（server/plugins/pack.js）与 PRTS 模型/图标/BGM 迁移完成。\n- 2026-10-21：比赛生命周期 onMatchStart / onRoundEnd / onMatchEnd 与 m.public.pluginView 完成。\n- 2026-10-21：gameplay:<id> 规则处理器、只读 match ctx、ctx.setView、ctx.finish 和 checkEnd 完成；规则运行时进入第一阶段。\n- 2026-10-21：新增 onPhase 阶段变化钩子（from/to/round），规则层可观察固定阶段机。
- 2026-10-21：通用声明式 HUD（text/bar/countdown/list）与战斗快照 .snap.pluginView 已接入客户端 PluginHud。
- 2026-10-21：PRTS 协议 HUD 通过 protocol.ui 发布到 Battle pluginView；核心协议条只作为无插件视图时的回退。\n\n## 6. PRTS 迁移映射

| 当前实现 | 迁移目标 |
|---|---|
| `plugins/prts-source-code/*` | 保留为 `content + assets` 插件 |
| `bossProtocol.js` 通用字段 | 保留为核心战斗原语 |
| `op-kalts.js` 的 M3 扩展 | 抽成 token 通用字段或 kit 扩展接口 |
| `hud.js` 协议 HUD | 迁移到 `hud.boss` 插槽 |
| `battle/events.js` protocol snapshot | 保留为通用快照能力 |
| `officialKey` FX 分支 | 保留为客户端通用 API |
| `tint` | 保留为敌人通用字段 |
| 图标/BGM 全局 entries | 迁移到 PRTS 插件资产包 |
| PRTS 模式模板 patches | 保留为内容插件数据 |

目标：核心只认通用字段，不认 `prts` / `mpprts` / `kalts`。

### 6.1 PRTS 资产迁移顺序（建议先做）

1. 在插件内建立：
   ```text
   plugins/prts-source-code/assets/
     spine/enemy/enemy_x_prts_source_code_prts/
     spine/enemy/enemy_x_prts_source_code_prts_hidden/
     spine/enemy/enemy_x_prts_source_code_mimic/
     spine/token/token_x_prts_source_code_mon3tr/
     images/enemy_icon/...
     audio/bgm/...
   ```
2. 插件 manifest 增加 `assets.add` 权限和 `assets` 文件。
3. 资产覆盖层按插件记录 id 命名：
   ```text
   enemies.enemy_x_prts_source_code_prts.spine
   enemies.enemy_x_prts_source_code_mimic.spine
   tokens.token_x_prts_source_code_mon3tr.spine
   enemies.<id>.icon
   audio.bossBgm.boss_x_prts_source_code_prts
   ```
4. 插件敌人 `spine` / token `assets.spine` 改为引用插件记录 id。
5. 删除主程序里的 PRTS 全局 entries 和素材副本，只保留 vanilla 资产。
6. FX 单独处理：先在插件 `assets/fx/` 存放，平台补 `fx` 容器后接入；在此之前不新增全局 FX 引用。

验收：

- 删除插件目录后，主程序无 PRTS 素材残留。
- 只安装插件即可显示 PRTS 模型、图标、BGM。
- 不启用插件时，`data/assets.json` 与 vanilla 一致。
- `plugin check --strict` 和 `plugin pack` 包含资产并校验通过。

当前进度：Spine、图标、M3 模型、BGM 已迁入插件资产包；FX 仍留在本地 FX 清单，等待插件 FX 容器迁移。

---

## 7. 文件级影响（预估）

### 服务端

```text
shared/plugins/manifest.js         capabilities / contributes
server/plugins/contentSet.js       规则/UI/资产组合
server/plugins/rules.js            新：规则插件加载与校验
server/match/Match.js              生命周期钩子
server/match/match/phases.js       阶段扩展
server/match/player/*              受控命令
server/sim/Battle.js               战斗插件钩子
server/sim/content/bossProtocol.js 保持通用
shared/protocol.js                 pluginEvent / pluginView
```

### 客户端

```text
public/js/ui/hud.js                插槽容器，不写具体插件
public/js/ui/pluginUi.js           新：声明式 UI 渲染
public/js/render/app.js            pluginView 消费
public/js/data.js                  插件视图/资产
public/css/screens/game.css        插槽样式
```

### 工具

```text
tools/plugin.mjs                   new gameplay / check / pack
schemas/plugin.schema.json         capabilities / contributes
schemas/gameplay.schema.json       新
docs/PLUGINS.md                    平台 API 文档
```

---

## 8. 测试与发布

### 必测

- vanilla 内容 hash 不变
- `plugin check --strict`
- 内容组合
- 规则生命周期
- 权限拒绝
- 序列化/恢复
- 回放一致性
- UI 插槽降级
- 资产缺失回退
- 插件卸载清理
- 移动端布局

### 发布门槛

- 阶段 1 完成前不接第三方插件
- 阶段 2 完成前不开放规则脚本
- 阶段 4 完成前不允许插件自带资源
- 生产部署仍需 owner 明确批准 + 游戏内公告

---

## 9. 风险与应对

| 风险 | 应对 |
|---|---|
| 核心改动导致 vanilla 回归 | golden hash + 全量测试 + 默认关闭 |
| 规则脚本逃逸 | 独立沙箱、白名单 API、无 fs/network |
| 插件 UI 破坏界面 | 插槽隔离、错误边界、移动端测试 |
| 资产包过大 | 大小上限、内容寻址、安装校验 |
| 回放不确定 | 只用 `ctx.rng`、调度器、序列化状态 |
| API 频繁破坏 | `gameplayApi` 版本 + 弃用周期 |
| 范围失控 | 固定 MVP：content + rules + ui 插槽 + assets |
| 素材授权 | license/source 字段，官方素材不默认再分发 |

---

## 10. 需要 owner 决策的点

1. 平台范围是否就按本方案：内容 + 规则 + HUD 插槽 + 资产，不做任意客户端 JS？
2. 规则插件是否允许第三方使用，还是先只允许 owner 安装？
3. UI 是否只做声明式，还是需要受控 sandbox 自定义组件？
4. 官方素材（Spine/图标/BGM/FX）是否允许随插件分发，还是只允许本地提取？
5. API 兼容承诺：`gameplayApi 1` 内保证不破坏，是否接受？
6. 是否接受 MVP 约 2–3 个月、稳定版 4–6 个月的节奏？
7. 生产部署是否仍然维持“先测试、再公告、最后上线”？

---

## 11. 推荐 MVP

建议第一版只做：

```text
content
+ 规则生命周期（阶段/回合/胜负）
+ 一个声明式 HUD 插槽
+ 插件资产包
+ 开发脚手架
```

先不做：

```text
任意客户端 JS
自定义渲染器
完全自定义游戏循环
复杂 UI 编辑器
插件市场自动上架
```

这样能覆盖：

- Boss 玩法
- 生存玩法
- 限时挑战
- 多阶段关卡
- 带自定义 HUD 的模式

同时把风险控制在可维护范围内。

---

## 12. 建议决策

建议批准：

- 本方案作为平台化方向
- 先执行阶段 0 + 阶段 1
- 阶段 1 完成后再决定是否进入规则运行时

阶段 0/1 不改变生产行为，只做通用化和基线审计。
