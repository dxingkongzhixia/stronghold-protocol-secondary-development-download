# Keel 架构与实现

> 本文回答“系统怎么组成、N1/V2 怎么实现”。开发/兼容/测试流程见 [`WORKFLOW.md`](WORKFLOW.md)，功能清单见 [`FEATURES.md`](FEATURES.md)。
> 代码路径以仓库根目录为准。

## 1. 总览

```text
┌────────────────────────────── 作者侧 ──────────────────────────────┐
│  keel new / check / dev / test / pack / import / migrate            │
│  studio (/studio/)          Forge import (pack.json / zip)          │
│  templates: keel-content / keel-lang / keel-policy / ...            │
└───────────────────────────────┬────────────────────────────────────┘
                                │ manifest 3 + files + lock
                                ▼
┌────────────────────────────── 服务端 ──────────────────────────────┐
│  registry (server/plugins/registry.js)                             │
│    manifest 3 -> graph/validate -> Plugin entry                    │
│                                                                    │
│  room source (server/keel/room-source.js)                          │
│    loadKeelPlugin -> content / native / v2 / ui / offers           │
│                                                                    │
│  content set (server/keel/content-sets.js -> contentSet.js)        │
│    data + i18n + offers + dsl + /cs/<cs>/index.json + index.keel   │
│                                                                    │
│  visual set (server/plugins/visualSet.js)                          │
│    /vs/<vs>/overlay.json + /p/<id>/<hash>/...                      │
│                                                                    │
│  lobby / Match (server/lobby.js, server/match/Match.js)            │
│    room, economy, rounds, fields, reports, settlement              │
│                                                                    │
│  match host child (server/match/host/)                             │
│    match / policy meta runtime only (no sim, no page code)         │
└───────────────────────────────┬────────────────────────────────────┘
                                │ /cs, /vs, b.start, m.public
                                ▼
┌────────────────────────────── 浏览器 ──────────────────────────────┐
│  runner (public/js/battle/runner.js)                               │
│    vanilla content -> in-page Battle                               │
│    native sim / compat.v2Script -> WorkerSimHost                   │
│                                                                    │
│  WorkerSimHost (public/js/battle/simHost.js)                       │
│    /worker/simWorker.js -> simWorkerRuntime                        │
│    SES + engine + content set + sim modules                        │
│    page receives b.snap / b.ev / progress / result                 │
│                                                                    │
│  view / HUD / native consent (ui/nativeConsent.js)                 │
└────────────────────────────────────────────────────────────────────┘
```

### 边界

- **服务端不执行原生 sim**；HTTP、room map、match host 都只读 manifest / lock / 源码。
- **浏览器不执行 match/policy meta**；meta 代码不下发。
- **页面不 eval 插件代码**；原生 sim 和 v2 sandbox 脚本都在 Worker 的 SES 里。
- **manifest 3 是唯一入口**；manifest 2 不再直接加载。

## 2. 代码分层

| 层 | 路径 | 作用 |
|---|---|---|
| 共享规格 | `shared/keel/manifest.js` | manifest 3 读取、字段、模块、能力校验 |
| 共享图 | `shared/keel/graph.js` | 依赖、顺序、`provides/consumes` |
| 兼容适配 | `shared/keel/adapt.js` | manifest 2 → 3 投影（仅迁移/工具） |
| 运行时 | `shared/keel/runtime.js`、`state.js`、`commands.js`、`rng.js`、`budget.js`、`host.js`、`loader.js` | 模块状态、命令、预算、hook 调度、host 接口 |
| 房间源 | `server/keel/room-source.js` | 扫描 manifest 3、加载 content/native/v2/ui/offers |
| 内容集 | `server/keel/content-sets.js`、`content-set.js` | 把 Keel 插件交给共享 content 编译器 |
| 原生源码 | `server/keel/native-code.js` | 读取 sim/match/policy 源码、lock、parse-only |
| 客户端运行时 | `public/js/battle/simHost.js`、`simWorkerRuntime.js`、`simWorker.js` | Worker 管理、SES、snap/ev |
| 客户端模拟 | `public/js/battle/runner.js` | 选择页面内 Battle 或 Worker；own/background field |
| 服务端比赛 | `server/match/Match.js`、`match/` | 房间、回合、field、委托、结算 |
| match host | `server/match/host/` | 服务端 meta child；match/policy |
| 作者工具 | `tools/keel.mjs`、`server/studio/`、`public/studio/`、`server/plugins/forgeImport.js` | CLI、工作室、Forge |

## 3. N1：原生 Keel 功能与实现

N1 的目标是“新插件只写 manifest 3，原生代码也能安全运行”。

### 3.1 功能

- 原生模板：`keel-content` / `keel-lang` / `keel-policy` / `keel-multi-module` / `keel-survival` / `keel-cosmetic` / `keel-ui` / `keel-script` / `keel-reference` / `keel-bond` / `keel-item`。
- 原生 `sim`：浏览器 Worker 中运行，页面只收包。
- 原生 `match` / `policy`：服务端 match host meta。
- `ui` / `asset` / `lang`：加载期/构建期接入。
- lock / pin / `SP_PLUGIN_SCRIPTS` / 浏览器确认。
- bot / 接管 / 无人类 boss 的 field 委托。

### 3.2 原生 sim 启动链路

```text
room content set
  -> /cs/<cs>/index.json + index.keel
  -> runner.needsWorker(content)
       native sim present || compat.v2Script present
  -> WorkerSimHost.load(cs, content)
  -> simWorkerRuntime:
       SES lockdown
       load engine modules
       verify index.keel hashes
       load native sim modules (keel/<id>/<entry>)
       attach runtime to Battle
  -> b.start {fieldId, spec, seed}
  -> each step: sim.tick / battle hooks
  -> b.snap / b.ev -> page view
  -> b.result -> server report
```

实现文件：

| 步骤 | 文件 |
|---|---|
| 判断是否 Worker | `public/js/battle/runner.js`（`needsWorker`） |
| Worker 生命周期 | `public/js/battle/simHost.js` |
| Worker 入口 | `public/js/battle/simWorker.js` |
| Worker 内运行时 | `public/js/battle/simWorkerRuntime.js` |
| SES 加载原生模块 | `public/js/battle/keelSandbox.js`、`shared/plugins/sandbox.js` |
| 原生源码读取/校验 | `server/keel/native-code.js` |
| content set 下发 | `server/plugins/contentSet.js`（`keel/<id>/<entry>` + `index.keel`） |
| 服务端 meta | `server/match/host/entry.js` + `Match.keelMatch` |

### 3.3 原生代码信任链

```text
owner: SP_PLUGIN_SCRIPTS=sandbox (or trusted mode)
  -> readNativeCode
       lockValid = lock.files 与磁盘字节一致
       parseProblems = acorn parse-only
  -> applyTrust / native trust gate
  -> room source includes plugin only when allowed
  -> /cs serves index.keel + source
  -> browser consent per content set
  -> Worker compiles/runs
```

没有 lock、lock 过期、服务端没开 `SP_PLUGIN_SCRIPTS`、浏览器未确认：原生代码不执行，座位不 ready（按具体阶段）。

### 3.4 服务端 meta

- `loadKeelPlugin(dir, { code: 'meta' })` 只加载 `match` / `policy`。
- match host child 运行 `Match.keelMatch` / policy；浏览器只收 `sim`。
- 原生 `match`/`policy` 不进入 content set 的浏览器文件。

### 3.5 委托

- `server/match/match/clientCombat.js`：`_executorCandidates` / `_delegateField` / `_authorityLost`。
- 房主优先，其次其他在线真人；每浏览器最多 8 field（含自己的）。
- 没有在线浏览器：服务器只用 content 数据跑该 field。
- 房主断线/离开：先委托剩余真人；没有真人时 server fallback / 房间销毁。

## 4. V2：兼容功能与实现

V2 的定位是**正式兼容运行时**，不是旧 loader。它让已迁移到 manifest 3 的主线插件/Forge kit 继续执行 `setup(sp)`。

### 4.1 功能

- manifest 3 可带 `compat: { v2Script: true }`。
- `legacy.entry.sim` / `legacy.entry.meta` 指向 v2 脚本入口。
- 服务端读取源码、lock、pin；客户端在 Worker 的 SES 中执行。
- `Match` 在战斗前运行 `runV2Setups(v2)`，把注册表交给 Battle。
- 服务端 match host 也支持 sandbox v2 preload。

### 4.2 迁移链路

```text
manifest 2 folder
  -> node tools/keel.mjs import <id> --write
       readPluginManifest -> adaptV2 -> plugin.keel.json
  -> node tools/keel.mjs check <id> --strict
  -> node tools/plugin.mjs pack <id>
       plugin.lock.json
  -> room selects the manifest 3 plugin
       compat.v2Script -> v2 runtime
```

`adaptV2` 只读、不执行、不改原 `plugin.json`；迁移后 loader 不再读取 manifest 2。

### 4.3 运行时链路

```text
server/keel/room-source.js
  loadKeelPlugin
    compat.v2Script
      -> loadV2ScriptPlugin (v2-script.js)
      -> readScripts (trusted.js) = sources/files/lockValid
      -> p.v2 { setup, script, plugin, settings }

server/keel/content-sets.js
  -> scriptDescriptor(p.v2)
  -> content set scripts + /cs/<cs>/scripts/<id>/<entry>

browser
  runner.needsWorker(content) -> true (scripts)
  simWorkerRuntime -> prepareScriptRuntime
    -> verifyScripts / scriptExecution
    -> SES lockdown
    -> loadScripts / installSandboxScripts
    -> run setup(sp) registrations
  Match / Battle uses the registry
```

实现文件：

| 步骤 | 文件 |
|---|---|
| manifest 2 → 3 | `shared/keel/adapt.js`、`tools/keel.mjs` |
| 读取 v2 脚本 | `server/keel/v2-script.js` |
| 源码 / lock 快照 | `server/plugins/trusted.js`（`readScripts`） |
| content set 描述符 | `server/keel/content-sets.js` |
| 浏览器 Worker 执行 | `public/js/battle/simWorkerRuntime.js`、`shared/plugins/scriptLoad.js`、`shared/plugins/sandbox.js` |
| Match 注册表 | `server/match/Match.js`（`keelV2`） |
| match host preload | `server/match/host/entry.js` |

### 4.4 边界

- `compat.v2Script` 只用于 sandbox 脚本；`trusted.server` / `trusted.page` 不支持。
- v2 脚本仍受 lock / pin / sandbox / 浏览器确认约束。
- 不恢复 manifest-2 文件夹直接加载。
- `keelToV2` + 共享 content/visual 编译器是 Keel 内部投影，不是对外 loader。

## 5. 相关阅读

- [`FEATURES.md`](FEATURES.md)：功能矩阵与边界。
- [`WORKFLOW.md`](WORKFLOW.md)：开发、兼容、测试、标准试验插件。
- [`MANIFEST-V3.md`](MANIFEST-V3.md)：manifest 3 字段。
- [`CONTRACTS.md`](CONTRACTS.md)：扩展点。
- [`RUNTIME.md`](RUNTIME.md)：运行时细节。
- [`COMPAT-V2.md`](COMPAT-V2.md)：V2 迁移映射。
- [`HISTORY.md`](HISTORY.md)：里程碑与决策。
