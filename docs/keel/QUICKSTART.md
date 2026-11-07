# Keel 15 分钟快速上手

目标：从零生成一个原生 Keel 插件，在本地检查和运行，然后在真实房间里看到它的效果。

> 使用标准参考插件 `keel-reference`：content + asset + sim + policy + ui 五个模块，覆盖最常见的作者链路。
> 更完整的架构见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，流程细节见 [`WORKFLOW.md`](WORKFLOW.md)。

## 准备

- Node.js 22 或 24
- 仓库已 `npm install`
- 浏览器（Chrome / Edge）

## 1. 生成插件

```bash
cd <仓库根目录>
node tools/keel.mjs new keel-reference my-first-plugin
```

得到 `plugins/my-first-plugin/`：

```text
plugin.json              manifest 3（五个模块）
plugin.lock.json         pack 生成的 pin
content/enemies.json     合成敌人
content/bands.json       合成策略
assets/icon.png          策略图标
sim/index.js             原生 sim
policy/index.js          原生 policy
ui/index.json            hud.right 声明
```

## 2. 严格检查

```bash
node tools/keel.mjs check my-first-plugin --strict
```

预期：0 problem / 0 warning。检查不执行代码。

## 3. 看模块图

```bash
node tools/keel.mjs graph my-first-plugin --json
node tools/keel.mjs explain my-first-plugin
```

`graph --json` 给 kinds / modules / permissions / problems / warnings；**`provides` / `consumes` 只在 `explain` 里输出**。
确认五类模块与 `provides` 都在。

## 4. 在 fake host 上跑 sim

```bash
node tools/keel.mjs run my-first-plugin --frames 60 --json
```

预期：输出 60 帧、模块 state、hash 和 `errors: []`。这一步不碰真实对局。

## 5. 打包

```bash
node tools/plugin.mjs pack my-first-plugin
```

确认 `plugin.lock.json` 已更新。以后每次改文件都要重新 pack。

## 6. 启动服务器

```powershell
$env:SP_PLUGIN_SCRIPTS='sandbox'
node server/index.js
```

打开 `http://localhost:3000`。

> 原生代码需要 owner 模式 + 有效 lock；`SP_PLUGIN_SCRIPTS=sandbox` 是本地开发最常用的组合。

## 7. 在房间打开插件

1. 进入联机 / 创建同盟。
2. 打开插件面板，启用 `my-first-plugin`。
3. 房间内容变为非 vanilla（`cs` 改变）。

## 8. 确认原生代码

第一次进入含原生代码的房间时，页面会弹出 **原生代码确认**：

- 允许：本浏览器记住该 content set 的确认；
- 拒绝：座位保持未 ready，原生代码不执行。

这是设计，不是故障。

## 9. 开始一场

- 准备并开始模拟；
- 进入战斗后，`sim/index.js` 会生成结晶并按节奏造成伤害；
- `ui/index.json` 在 `hud.right` 显示两行文字。

## 10. 开发循环

```bash
node tools/keel.mjs dev my-first-plugin      # 修改后自动 check + graph
node tools/keel.mjs test my-first-plugin     # smoke run
node tools/plugin.mjs pack my-first-plugin   # 改完重新 pin
```

改完代码/内容后：

1. `check --strict`
2. `test`
3. `pack`
4. 刷新房间 / 重新进入验证

## 11. 做成自己的插件

- 改 `plugin.json` 的 `id` / `name` / 描述；
- 把 `enemy_x_keel_reference_crystal`、`band_x_keel_reference_sigil` 换成自己的命名空间；
- 只保留需要的模块（纯数据插件可以只留 `content`）；
- 更新 `provides` / `consumes`；
- 重新 `check` / `run` / `pack`。

## 12. 接下来读什么

- [`MANIFEST-V3.md`](MANIFEST-V3.md)：字段、模块、能力
- [`MODULES.md`](MODULES.md)：七种模块、31 个能力、hooks、模板覆盖、已知差异
- [`ARCHITECTURE.md`](ARCHITECTURE.md)：N1/V2 实现
- [`WORKFLOW.md`](WORKFLOW.md)：开发 / 兼容 / 测试流程
- [`DEBUGGING.md`](DEBUGGING.md)：错误、日志、指标、lock/pin
- [`../../plugins/_template/keel-reference/README.md`](../../plugins/_template/keel-reference/README.md)：参考插件完整说明
