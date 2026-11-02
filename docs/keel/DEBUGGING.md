# Keel 调试、错误与指标

> 面向“插件不工作 / 报错 / 想量性能”的排查。功能见 [`FEATURES.md`](FEATURES.md)，架构见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，流程见 [`WORKFLOW.md`](WORKFLOW.md)。

## 1. 先分清错误发生在哪一层

| 层 | 典型错误 | 看哪里 |
|---|---|---|
| manifest / 图 | `KEEL_*`、`PLUGIN_LEGACY_REMOVED` | `node tools/keel.mjs check --strict --json` |
| 内容 / 资源 | `PLUGIN_DATA_*`、`PLUGIN_PATCH_*`、`PLUGIN_VISUAL_*` | `keel check`、`tools/plugin.mjs check` |
| lock / 信任 | `PLUGIN_TRUST_PIN`、`PLUGIN_SCRIPTS_DISABLED`、`PLUGIN_KEEL_NATIVE` | 服务端启动日志、房间插件面板 |
| 原生 sim | `PLUGIN_WORKER_FAILED`、`PLUGIN_WORKER_TIMEOUT`、`PLUGIN_WORKER_STOPPED` | 浏览器 console、`battleRunner.stats()`、`keel.errors` |
| 浏览器确认 | 座位不 ready / 原生代码不执行 | 页面确认弹窗、`__SP_CONTENT__.state().nativeConsent` |
| match / policy meta | match 日志、`m.errors` | match host 日志、`/healthz`、房间诊断 |
| 构建 / 缓存 | 内容集构建失败、缓存旧 | `SP_CONTENT_BUILDER` / `SP_CONTENT_CACHE`、服务端日志 |

## 2. 命令行排查

```bash
# 只读检查；--strict 把 warning 当失败
node tools/keel.mjs check <id|dir> --strict --json

# 模块图 / provides / consumes
node tools/keel.mjs graph <id|dir> --json

# fake host 上跑原生模块；不碰真实对局
node tools/keel.mjs run <id|dir> --frames 60 --json

# 作者测试
node tools/keel.mjs test <id|dir>

# 打包并重新生成 pin
node tools/plugin.mjs pack <id|dir>
```

`keel check` 不会执行代码；`keel run` 不会进入真实房间；两者都不能替代真实浏览器 E2E。

## 3. 浏览器内排查

在页面 console 里：

```js
// runner 的测量值：ticks / stepMs / avgTickMs / maxFrameMs / catchups / errors / battles
globalThis.__SP_RUNNER__.stats()

// 当前房间 / 比赛 / 玩家视图
globalThis.__SP__.store.get()

// 当前 content set 的确认与加载状态
globalThis.__SP_CONTENT__.state()

// 当前 field 的视图 debug（如果页面提供）
globalThis.__SP_VIEW__?.raw?.debug
```

原生 sim 的每个 Worker：

- `battle.keelAll`：每个原生 runtime 的 `views` / `errors` / `modules`；
- `keelError` / `keelInfo`：attach 失败或模块信息；
- `ui/native-code-mark`：HUD 的“原生代码”标记。

## 4. 运行时错误策略

### Worker sim

- Worker RPC 超过预算：`PLUGIN_WORKER_TIMEOUT`；
- Worker `error` / `messageerror`：`PLUGIN_WORKER_FAILED`；
- 已停止的 Worker：`PLUGIN_WORKER_STOPPED`；
- 失败时 `WorkerSimHost.fail()` 会停止该 Worker，并调用 `onFailure`；
- runner 的 `onFailure` 会把该 field `forceEnd('timeout')`，结束该 entry；
- 其他 field 有各自独立的 Worker，不受影响；
- 如果是委托/背景 field，服务器按房间的验证/委托规则处理（clients-only 模式没有 server 重算，直接按 no-executor 规则结束）。

### 模块预算 / 异常

- hook 超过预算 → `KEEL_BUDGET`，该模块被禁用；
- 未捕获异常由 runtime/runner 记录到 `errors`；页面不崩溃；
- `match` / `policy` 的异常由 match host 记录，不会影响 HTTP 进程。

### 原生代码不执行

按顺序检查：

1. 是否有有效 `plugin.lock.json`；
2. 服务端是否设置 `SP_PLUGIN_SCRIPTS=sandbox`（或受信模式）；
3. lock 是否和当前文件字节一致（改文件后重新 `pack`）；
4. 浏览器是否确认了该 content set 的原生代码；
5. 插件是否被 `PLUGIN_KEEL_NATIVE` / `PLUGIN_TRUST_PIN` 拒绝。

## 5. 错误码速查

| 错误 | 含义 | 处理 |
|---|---|---|
| `PLUGIN_LEGACY_REMOVED` | 还是 manifest 2 | `node tools/keel.mjs import <id> --write` |
| `PLUGIN_KEEL_NATIVE` | `trust: "native"` | 改成 `trust: "sandbox"`，写 sim/match/policy |
| `PLUGIN_TRUST_PIN` | lock 缺失/过期/不匹配 | 重新 `pack`，确认模式与 pin |
| `PLUGIN_SCRIPTS_DISABLED` | 服务端没开脚本模式 | `SP_PLUGIN_SCRIPTS=sandbox` |
| `PLUGIN_WORKER_TIMEOUT` | Worker RPC 超时 | 检查死循环/重计算；该 field 结束 |
| `PLUGIN_WORKER_FAILED` | Worker 异常/崩溃 | 看 console、`keel.errors`；缩小复现 |
| `KEEL_BUDGET` | hook 超预算 | 优化 hook；模块会被禁用 |
| `PLUGIN_NO_MANIFEST` | 文件夹没有清单 | 放 `plugin.keel.json` 或 manifest 3 的 `plugin.json` |
| `PLUGIN_JSON` / `PLUGIN_JSON_LIMIT` | JSON 无效/超限 | 修正 JSON；单文件 8 MB、嵌套 64 层 |

完整列表：`shared/plugins/errors.js`。

## 6. 指标

已有：

- `battleRunner.stats()`：`ticks`、`stepMs`、`avgTickMs`、`maxFrameMs`、`catchups`、`errors`、`battles`、`entries`、`workers`、`workerHeap`（有 Worker 堆数据时）；
- `WorkerSimHost`：Worker 心跳、RPC 超时、`stats` 缓存（内部）、`workerMemory`（心跳带回的 best-effort 堆；Chromium `performance.memory` 或 Node harness 的 `process.memoryUsage()`，Firefox / Safari 为 null）；
- 原生模块：`runtime.modules[].loadMs`（`keelSandbox.js` 逐模块计时，随 `battle.keel.modules` / Worker `keel` 包 / diag 带出）；
- 服务端 `contents.stats()`：`sets` / `held` / `builds` / `requests` / `memoHits` / `cacheHits` / `refused` / `lastBuildMs` / `maxBuildMs` / `dataBytes`；
- `/admin` 插件页的「运行指标」：每个已安装插件的 `scanMs`、大小、状态，以及内容集缓存命中率、构建耗时、数据字节（`buildPluginSnapshot`）；
- `GET /admin/api/plugins/stats?token=…`：同一份指标的只读 JSON，供外部监控脚本读取；
- 4× CPU throttle 基准：`test/ui/native-room-bench.e2e.test.js`。

暂缺（可选改进）：

- 每 field 的细分资源（目前只有 Worker 总数与总堆）；
- SES 错误堆栈的稳定 source map（`sourceURL` 已传入，但 SES 下 `Error.stack` 可能为空；错误对象仍带 `module: <id>:<kind>:<entry>`）。

需要这些时，先看 [`REMAINING.md`](REMAINING.md) 的“可选项”，不要在没有基线的情况下改热路径。

## 7. Lock / pin 工作流

```bash
# 改完文件后重新生成
node tools/plugin.mjs pack plugins/<id>

# 检查 lock 是否有效（服务端扫描时也会做）
node tools/keel.mjs check plugins/<id> --strict
```

- `plugin.lock.json` 记录文件 sha256、字节数、Spine 模型信息；
- **不要手写/手改** lock；
- 分发插件时，文件夹和 lock 一起分发；
- `SP_PLUGIN_SCRIPTS=sandbox` 要求 lock 有效；
- 受信模式还需要 owner 的 pin 与 review（Keel 不支持 `trusted.server/page`）；
- 浏览器第一次使用原生代码时按 content set 确认；换 cs 需要重新确认。

## 8. 分发 / 安装

当前有：

- `node tools/plugin.mjs pack <id> --zip` → `plugins/_dist/<id>-<version>.zip`；
- `/admin/api/plugins/install`；
- `node tools/plugin.mjs install <zip|https>`；
- 插件市场：`server/market.js`、`docs/PLUGIN-MARKET.md`。

没有：

- 公开 npm 式 registry；
- 玩家侧自动更新 + 版本锁文件。

所以当前分发是“zip / 本地安装 / 管理端 / 市场条目”，不是公共插件商店。

## 9. 标准复现顺序

1. `keel check --strict --json`
2. `keel run --frames 60 --json`
3. `tools/plugin.mjs test`
4. `node --test test/keel/<target>.test.js`
5. 真实浏览器：`SP_E2E=1` + `node --test test/ui/native-room.e2e.test.js`
6. 需要服务器行为时看 `server/match/host` 日志与 `/healthz`

## 10. 相关阅读

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`WORKFLOW.md`](WORKFLOW.md)
- [`RUNTIME.md`](RUNTIME.md)
- [`COMPAT-V2.md`](COMPAT-V2.md)
- [`REMAINING.md`](REMAINING.md)
