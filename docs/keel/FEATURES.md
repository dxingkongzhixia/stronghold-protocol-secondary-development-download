# Keel（龙骨）功能总览

> 状态：**可用 / 第一阶段完成**。Keel 是当前唯一的插件 loader；manifest 2 不再直接加载，主线插件通过 `keel import --write` 迁移到 manifest 3。
> 兼容线：**manifest 3 + `compat.v2Script` 运行时**是正式支持，不是遗留缺陷；`trusted.server/page` 明确不支持。
> 本文按“功能”组织，回答“Keel 现在能做什么、边界在哪”。字段细节见 [`MANIFEST-V3.md`](MANIFEST-V3.md)，运行时细节见 [`RUNTIME.md`](RUNTIME.md)，扩展点见 [`CONTRACTS.md`](CONTRACTS.md)。

## 1. 一句话

一个插件是一个 **manifest 3**，由若干**模块**组成；模块可以是数据、资源、浏览器战斗代码、服务端比赛逻辑、策略、界面或语言。浏览器负责战斗模拟，服务端负责房间、经济、比赛流程和验证。

## 2. 功能矩阵

| 领域 | 能力 | 状态 |
|---|---|---|
| 插件格式 | manifest 3、七类模块、能力（capability）、依赖/顺序、`provides/consumes` | 完成 |
| 内容 | 记录、补丁、干员、敌人/Boss、波次、模式/关卡、盟约、装备、DSL、offers、i18n | 完成 |
| 资源 | 立绘/Spine/音频/FX/主题、视觉覆盖、UI 资源、`/vs` `/p` | 完成 |
| 原生战斗 | `sim` 模块、hooks、状态/视图/命令/RNG、token/装置生成、自定义状态、客户端 Worker | 完成 |
| 比赛逻辑 | `match` 模块、服务端 meta runtime、经济/回合/结束判定 | 完成 |
| 策略 | `policy` 模块、决策/选秀 | 完成 |
| 界面 | `ui` 模块、槽位、postMessage、沙箱 frame | 第一版完成 |
| 语言 | `lang` 模块、UI/游戏文本覆盖 | 完成 |
| 作者链路 | `keel new/dev/test/pack/exit`、`check/graph/import/migrate`、studio、Forge | 完成 |
| 运行时 | `/cs` content set、`index.keel`、原生源码下发、确认 | 完成 |
| 多人 | 1–4 座、AI、bot/接管/无人类 boss 委托、房主迁移 | 完成 |
| 兼容 | manifest 2 → 3 迁移、`compat.v2Script` 沙箱脚本 | 完成（按迁移后兼容的口径） |
| 安全 | lock/pin、`SP_PLUGIN_SCRIPTS`、parse-only、Worker、CSP | 完成 |
| 验证 | 全量测试、Keel 测试、真实 Chrome E2E | 通过 |
| 低端设备压测 | 真实低端机 / 更多设备组合 | 暂缓（不影响功能） |
| 受信页面/服务端代码 | `trusted.server/page` | 不支持（设计决定） |

## 3. 插件格式

### 3.1 manifest 3

- 文件：`plugin.keel.json`，或带 `"manifest": 3` 的 `plugin.json`。
- 必填：`id`、`name`、`version`、`app`、`api`、`scope`、`trust`、`modules`。
- `modules` 至少一个；每个模块声明 `kind`、`entry`/`files`、`permissions`，可选 `parts`、`assets`、`slots`、`state`、`provides`、`consumes`、`notes`。
- 读取与校验：`shared/keel/manifest.js`；图与依赖：`shared/keel/graph.js`。
- manifest 2 旧文件夹不会被加载，返回 `PLUGIN_LEGACY_REMOVED`。

### 3.2 模块种类

| kind | 运行位置 | 用途 |
|---|---|---|
| `content` | 构建期 / 房间 | 数据记录、补丁、干员、敌人、波次、模式、DSL、offers、i18n |
| `asset` | 构建期 / 客户端 | 视觉覆盖、Spine/音频/FX/主题、UI 资源 |
| `sim` | 浏览器 Worker | 战斗 hooks、状态、视图、命令、RNG |
| `match` | 服务端 meta | 比赛开始/回合/结束、经济与胜负 |
| `policy` | 服务端 meta | 观察/决策/选秀策略 |
| `ui` | 客户端沙箱 frame | 槽位界面、只读视图、postMessage |
| `lang` | 构建期 / 客户端 | UI 与游戏文本覆盖 |

### 3.3 信任与能力

- `trust`: `data`（纯数据，不能带代码）、`sandbox`（代码在沙箱/Worker）、`native`（Keel 不执行，拒绝）。
- 能力来自 `KEEL_PERMISSIONS`，按模块种类限制；越权直接拒绝。
- 依赖：`requires` / `optional` / `conflicts` / `loadAfter` / `loadBefore` / `priority`。
- 提供/消费：`provides` / `consumes`，用于模块关系图与缺失提供者提示。
- 锁：`plugin.lock.json` 记录文件 sha256；原生代码还要求 owner 的 `SP_PLUGIN_SCRIPTS` 与 pin。

## 4. 内容（content）

- **记录**：enemies / bosses / waves / tokens / bands / modes / stages / **bonds** / **items** 等；支持新增、覆盖、补丁。
- **新盟约**：在 `parts.data` 的记录文件里写 `file: "bonds"` 的 entry（id 形如 `bond_x_<plugin-id>_<suffix>`，字段 name / desc / thresholds / countMode / isCore）+ 成员干员或棋子的 `bonds`；`provides: ["bond:<id>"]`。
  图标走 `asset` 模块的 `bonds` 覆盖。机制由 `sim` 模块用 `api.bonds.get/list/addLayers` 实现（读层数/激活/档位，写层数受 `BOND_LAYER_CAP` 约束）。
  最小示例：`test/fixtures/keel-bond`（`bond_x_keel_bond_demo`）。
- **新装备**：`item_x_<id>` 记录，复用现有 buff 解释器；行为完全自定的装备写 `custom: true` + `buffs: []`，由 `sim` 模块读 `unitView.items` 实现。
  图标走 `asset` 模块的 `items` 覆盖。
- **干员**：`operators` 记录；`mergeKeelData` 展开为 `data.chess`（normal/elite）与 DIY 记录。
- **补丁**：`patch: 1` 文档；支持字段路径 set/merge/append 等。
- **DSL**：干员 kit / 准备阶段效果；构建期校验。
- **Offers**：声明式交互窗口，服务端拥有窗口生命周期，数据只读。
- **i18n**：内容语言覆盖，随 content set 下发。
- **阶段/波次**：关卡、波次路线与地面路径派生。
- **顺序与依赖**：按 `requires` / `loadAfter` 等排序；`provides/consumes` 图。
- **内置阵营插件**：7 个 `faction-*` 内置 manifest 3 数据插件。

## 5. 资源（asset）

- 结构化覆盖：`chars` / `enemies` / `tokens` / `bands` / `audio` / `fx` 等。
- 文件：立绘、Spine（`.skel`/`.atlas`）、音频、字体、FX 资源。
- 主题：`--var` 主题变量；个人主题值与公告不进入房间身份。
- UI：frame 的 HTML/CSS/JS 资源，`/p/<id>/<hash>/...`。
- 视觉集：`/vs/<vs16>/overlay.json`；组合、覆盖顺序、hash。
- FX：prefab、材质、纹理、mesh、flipbook；构建期校验。
- 音频：BGM、语音、音效；支持文件名覆盖。

## 6. 原生战斗（sim）

- 运行位置：**浏览器 Worker**（`WorkerSimHost`）；页面只收 `b.snap` / `b.ev`。
- 执行前：本浏览器对 content set 的原生代码确认；未确认不 ready、不执行。
- Hooks：`sim.setup` / `battleStart` / `deploy` / `tick` / `beforeAttack` / `hit` / `damaged` / `heal` / `kill` / `battleEnd`；另有 `enemySpawn` / `enemyLeak` / `blocked` 等。
- API：只读单位/战场视图（含 `items` / `sp` / `blockCnt` / `rangeGrid`）；白名单写回 `dmg` / `amount` / `targets`；状态 `api.state`；视图 `api.setView`；命令；RNG；预算；生成敌人 / 己方 token / 装置；施加自定义状态。
- 隔离：Worker 无 DOM / 同源存储；SES 编译；每 field 一个 Worker；心跳、按步数放大的超时、terminate。
- 服务端：**不 import 原生 sim**；服务端自己跑的 field（bot/接管/boss 兜底）只用 content 数据。
- 源码下发：`/cs` 的 `index.keel` + `keel/<id>/<entry>`；sha256 与 lock 固定。

## 7. 比赛逻辑（match）与策略（policy）

- `match`：`match.onMatchStart` / `onRoundStart` / `onRoundEnd` / `checkEnd`；可读比赛视图、受控经济/状态命令。
- `policy`：`policy.decide` / `policy.onDraft`；服务端 meta，预算默认 50ms。
- 运行位置：match host child（`server/match/host`），不在浏览器；浏览器不下载 meta 代码。
- 适用：比赛规则、回合经济、胜负条件、AI/策略选择。

## 8. 界面（ui）

- `ui` 模块声明 `entry`（HTML）和 `slots`（如 `hud.right`）。
- 页面在沙箱 frame 中加载，只读 `pluginView`，通过 postMessage 与宿主通信。
- 不能发比赛 intent；不能读页面 DOM/存储。
- 第一版完成；更细的模块表单/可视化仍可继续深化。

## 9. 语言（lang）

- `lang` 模块：一个 entry（UI JSON）或文件；支持 UI 字符串与游戏文本覆盖。
- 语言包与插件 lang 都按 manifest 3 读取；旧 manifest 2 需要迁移。
- i18n 覆盖参与 content set 身份；个人语言包不影响房间 gameplay。

## 10. 作者链路

### CLI

```bash
node tools/keel.mjs new <template> <id>
node tools/keel.mjs dev <id|dir>
node tools/keel.mjs test <id|dir>
node tools/keel.mjs pack <id|dir> [--zip]
node tools/keel.mjs check <id|dir> --strict
node tools/keel.mjs graph <id|dir> --json
node tools/keel.mjs import <id|dir> --write
node tools/keel.mjs migrate <id|dir> --write
node tools/keel.mjs exit
```

- `new`：复制原生模板并改写 id、重新生成 lock。
- `dev`：先 check + graph，之后监听修改。
- `test`：check + 可执行模块 smoke run。
- `pack`：统一写 `plugin.lock.json`，可选 zip。
- `exit`：扫描 `plugins/` 的迁移状态与 blocker。

### 工作室 / Forge / 模板

- 工作室：编辑 manifest 3、基本信息、模块列表、模块字段、`provides/consumes` 图；保存前校验。
- Forge：导入 Forge 包，默认输出 manifest 3（保留 v2 副本供工具读取）。
- 模板：`keel-content` / `keel-lang` / `keel-policy` / `keel-multi-module` / `keel-survival` / `keel-cosmetic` / `keel-ui` / `keel-script` / `keel-reference` / `keel-bond` / `keel-item`。

## 11. 房间与多人运行时

- 1–4 座；人类 + AI 混合；content set 由房间选中的插件组成。
- `/cs/<cs16>/` 提供 data、i18n、offers、DSL、`index.json`、`index.keel`。
- 原生 sim 房间：每个 field 一个 Worker；最多 4 个 field（真实房间 4 座）。
- bot / 接管 / 无人类 boss：委托在线浏览器（房主优先，每浏览器最多 8 个 field），没有浏览器时服务器只用 content 数据跑。
- 房主断线 / 主动离开：剩余真人接管 host 与 field；没有真人时房间进入 server fallback / 最后一人离开销毁。
- 真实浏览器已覆盖：2 真人 + 2 AI、1 真人 + 3 AI、房主断线、房主主动离开、无人类 boss 的 pool/LP/结果、最后一人离开。

## 12. 兼容线（V2）

- **正式支持**：manifest 3 + `compat.v2Script`，用于主线插件/Forge kit 的 `setup(sp)`。
- 运行：仍受 lock/pin、sandbox、浏览器确认约束；客户端战斗在 Worker 的 SES 中执行。
- 迁移：主线 manifest-2 插件需要先 `keel import --write`；**不恢复 manifest-2 文件夹直接加载**。
- 投影：`keelToV2` 把 manifest 3 投影成共享 content/visual 编译器读取的 v2 形状；这是 Keel 的内部实现，不是对外旧 loader。
- 不支持：`trusted.server` / `trusted.page`；需要原生代码时写成 `sim` / `match` / `policy` 模块。

## 13. 安全边界

- 游戏页面：严格 CSP；不 page-wide lockdown；不加 `unsafe-eval`。
- 原生 sim：只在 Worker 的 SES 中编译/执行；页面不做。
- 服务端：HTTP/room map 只读 manifest/lock/源码；不 import 原生 sim。
- 原生代码：`SP_PLUGIN_SCRIPTS` + lock + pin + 浏览器确认。
- 解析：`keel check` / `code:false` 扫描 / 工作室保存时用 acorn 做 parse-only 校验。
- 超时：Worker step 有按步数放大的预算；失败终止 field 并交服务器兜底。
- 受信代码：不支持；`trust: "native"` 拒绝。

## 14. 验证与基线

| 检查 | 结果 |
|---|---|
| `npm test` | 8823 tests / 8785 pass / 0 fail / 38 skipped |
| `npm run check:keel` | 178 / 178 |
| docs gates | 35 / 35 |
| `npm run typecheck` | 通过 |
| eslint | 0 errors |
| 房主主动离开 E2E | 通过 |
| 无人类 boss E2E | 通过 |

真实浏览器 E2E：

```powershell
$env:SP_E2E='1'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/ui/native-room.e2e.test.js
node --test test/ui/native-boss.e2e.test.js
```

> 两个 E2E 文件各自启动多个浏览器，建议分开跑，避免资源竞争影响时序。

## 15. 明确不做 / 暂缓

- manifest-2 文件夹零改动直接加载：不做；先迁移。
- `trusted.server` / `trusted.page`：不支持。
- 服务端执行原生 sim：不做；服务端只用 content 数据兜底。
- 页面内执行插件代码：不做；原生/兼容脚本都进 Worker。
- 新伤害类型 / 新状态机 / 新索敌规则：不做成插件 API；它们是核心引擎改动。插件可用 `sim.beforeAttack` 替换目标、`api.status` 自定义 flag、`api.spawn` 生成 token/device。
- 低端设备 / 更多设备组合压测：暂缓。
- 工作室模块表单深化：可继续做，不是功能阻塞。

## 16. 从哪里开始

| 我想…… | 看 |
|---|---|
| 写一个新插件 | [`MANIFEST-V3.md`](MANIFEST-V3.md)、[`../PLUGIN-GUIDE.md`](../PLUGIN-GUIDE.md) |
| 迁移旧插件 | [`COMPAT-V2.md`](COMPAT-V2.md)、`node tools/keel.mjs import --write` |
| 看架构图/N1/V2 实现 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 看开发/兼容/测试流程 | [`WORKFLOW.md`](WORKFLOW.md) |
| 看运行时/Worker/委托 | [`RUNTIME.md`](RUNTIME.md) |
| 看扩展点/预算 | [`CONTRACTS.md`](CONTRACTS.md) |
| 看还剩什么 | [`REMAINING.md`](REMAINING.md) |
| 看当前检查点/命令 | [`NEXT.md`](NEXT.md) |
| 看历史/决策 | [`HISTORY.md`](HISTORY.md) |
