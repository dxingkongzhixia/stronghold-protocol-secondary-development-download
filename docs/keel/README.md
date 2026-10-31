# Keel（龙骨）插件系统

> **状态：可用 / 第一阶段完成。** Keel 是当前唯一的插件 loader；新插件只写 manifest 3。
> 主线 manifest-2 插件通过 `keel import --write` 迁移后，用 `compat.v2Script` 运行时兼容。
> **功能总览：**[`FEATURES.md`](FEATURES.md)。当前检查点：[`NEXT.md`](NEXT.md)。剩余项：[`REMAINING.md`](REMAINING.md)。

Keel（全称 Keel Plugin System / KPS）把插件定义为一组模块：

```text
manifest 3
├─ content   数据、干员、敌人、波次、模式、DSL、offers、i18n
├─ asset     立绘、Spine、音频、FX、主题、UI 资源
├─ sim       浏览器战斗 hooks（Worker / SES）
├─ match     服务端比赛逻辑（meta）
├─ policy    服务端策略（meta）
├─ ui        槽位界面（沙箱 frame）
└─ lang      语言包 / 文本覆盖
```

## 先读哪一页

| 我想…… | 看 |
|---|---|
| 了解 Keel 现在能做什么、边界在哪 | [`FEATURES.md`](FEATURES.md) |
| 看架构图、N1/V2 实现 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 走开发 / 兼容 / 测试流程 | [`WORKFLOW.md`](WORKFLOW.md) |
| 写一个新插件 | [`MANIFEST-V3.md`](MANIFEST-V3.md)、[`../PLUGIN-GUIDE.md`](../PLUGIN-GUIDE.md) |
| 迁移 manifest-2 插件 | [`COMPAT-V2.md`](COMPAT-V2.md)、`node tools/keel.mjs import <id> --write` |
| 看原生 sim / Worker / 委托 | [`RUNTIME.md`](RUNTIME.md) |
| 看扩展点、能力与预算 | [`CONTRACTS.md`](CONTRACTS.md) |
| 看当前状态、恢复命令 | [`NEXT.md`](NEXT.md) |
| 看还剩什么、明确不做什么 | [`REMAINING.md`](REMAINING.md) |
| 看里程碑/决策/旧文档去向 | [`HISTORY.md`](HISTORY.md) |

## 快速命令

```bash
node tools/keel.mjs new keel-content demo
node tools/keel.mjs check demo --strict
node tools/keel.mjs dev demo
node tools/keel.mjs test demo
node tools/keel.mjs pack demo --zip
node tools/keel.mjs import <legacy-id> --write
node tools/keel.mjs exit
```

## 规格与运行时

| 文件 | 内容 |
|---|---|
| [`FEATURES.md`](FEATURES.md) | **功能总览**：模块能力、作者链路、运行时、兼容、安全、状态 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **架构与实现**：架构图、代码分层、N1/V2 链路 |
| [`WORKFLOW.md`](WORKFLOW.md) | **流程**：开发、兼容、测试、标准试验插件 |
| [`MANIFEST-V3.md`](MANIFEST-V3.md) | manifest 3 字段、模块、能力、校验 |
| [`CONTRACTS.md`](CONTRACTS.md) | stable / experimental 扩展点与预算 |
| [`RUNTIME.md`](RUNTIME.md) | 原生 sim Worker、match/policy meta、委托、边界 |
| [`COMPAT-V2.md`](COMPAT-V2.md) | manifest 2 → 3 映射与迁移边界 |

## 作者链路

- CLI：`tools/keel.mjs`（`new` / `dev` / `test` / `pack` / `check` / `graph` / `import` / `migrate` / `exit`）。
- 工作室：`server/studio` + `public/studio`，编辑 manifest 3、模块字段、`provides/consumes` 图。
- Forge：`server/plugins/forgeImport.js`，默认输出 manifest 3。
- 模板：`plugins/_template/keel-*`；参考模板 `plugins/_template/keel-reference`。
- 代码地图：
  - `shared/keel/`：manifest、图、适配、运行时、契约；
  - `server/keel/`：房间描述符、content set、原生源码、match/attach；
  - `server/match/host/`：match meta host；
  - `public/js/battle/`：Worker 模拟、runner、视图。

## 当前验证

| 检查 | 结果 |
|---|---|
| `npm test` | 8828 tests / 8790 pass / 0 fail / 38 skipped |
| `npm run check:keel` | 178 / 178 |
| docs gates | 35 / 35 |
| `npm run typecheck` | 通过 |
| eslint | 0 errors |

## 兼容口径

- **manifest 3 是唯一入口。**
- 主线 manifest-2 插件先 `keel import --write` 生成 manifest 3，再加载。
- `compat.v2Script` 是**正式兼容运行时**，不是待清理的遗留代码；继续受 lock / pin / sandbox / 浏览器确认约束。
- `keelToV2` 与共享 content/visual 编译器是 Keel 的内部投影实现。
- `trusted.server` / `trusted.page` 不支持；需要原生代码时写 `sim` / `match` / `policy` 模块。

## 历史文档

以下是已完成任务/决策记录，不是当前功能入口；读功能请看 [`FEATURES.md`](FEATURES.md)。

| 文件 | 内容 |
|---|---|
| [`HISTORY.md`](HISTORY.md) | 里程碑、关键决策、为什么删除旧任务文档 |

早期任务文档（M0/M1/M1.5/N1/NATIVE-TASKS/INTEGRATION-PLAN/NATIVE-REBUILD/DECISIONS/DEMO/MIGRATION-REPORT/LEGACY-COMPAT/CUTOVER/EXIT）已删除；备份在本地 `_backup_keel_n5_2026-10-31/docs`。
