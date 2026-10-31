# Keel 开发、兼容与测试流程

> 架构与 N1/V2 实现见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，功能清单见 [`FEATURES.md`](FEATURES.md)。
> 标准试验插件：[`../../plugins/_template/keel-reference`](../../plugins/_template/keel-reference/README.md)。

## 1. 开发流程

### 1.1 新建

```bash
node tools/keel.mjs new keel-content demo
# 或
node tools/keel.mjs new keel-reference demo
```

`new` 会复制模板、改写 `id` 命名空间、重新生成 lock。

### 1.2 写 manifest 3

一个插件至少包含：

```json
{
  "manifest": 3,
  "id": "demo",
  "name": { "zh": "示例", "en": "Demo" },
  "version": "1.0.0",
  "app": ">=0.4.0 <0.5.0",
  "api": { "content": 1 },
  "scope": ["room"],
  "trust": "sandbox",
  "modules": [
    { "kind": "content", "files": ["content/enemies.json"], "parts": { "enemies": ["content/enemies.json"] }, "permissions": ["content.define"] }
  ]
}
```

规则：

- manifest 3 是唯一入口；
- `trust: "data"` 不能带 `sim` / `match` / `policy`；
- 需要代码用 `trust: "sandbox"`；
- `trust: "native"` 被拒绝；
- 每个模块声明 `entry` 或 `files`；
- 权限只声明实际用到的能力。

### 1.3 开发循环

```bash
node tools/keel.mjs check demo --strict
node tools/keel.mjs graph demo --json
node tools/keel.mjs dev demo        # 修改后自动 check + graph；Ctrl+C 停止
node tools/keel.mjs test demo       # check + 可执行模块 smoke run
```

`check` 不执行代码；`dev`/`test` 也不会把代码放进真实房间。

### 1.4 打包

```bash
node tools/plugin.mjs pack demo
node tools/keel.mjs pack demo --zip
```

会写 `plugin.lock.json`；原生代码在真实房间运行前必须有有效 lock。

### 1.5 真实房间验证

1. 把文件夹复制到 `plugins/<id>/`。
2. 服务端允许沙箱原生代码：`SP_PLUGIN_SCRIPTS=sandbox`。
3. 房间插件面板打开插件。
4. 浏览器第一次要求本浏览器对该 content set 的原生代码确认；拒绝则座位不 ready。
5. 进入战斗，确认 sim / content / asset / ui 行为。
6. 确认 bot / 接管 / 无人类 boss 的 field 委托没有回退服务器（含原生 sim 时）。

### 1.6 完成标准

- `check --strict` 0 problem / 0 warning（或 warning 有解释）；
- `test` smoke run 通过；
- `pack` 成功；
- 真实房间验证通过；
- 需要时补测试与文档。

## 2. 兼容流程（manifest 2 → manifest 3）

### 2.1 预览

```bash
node tools/keel.mjs import <legacy-id> --json
# 或
node tools/keel.mjs migrate <legacy-id> --json
```

只读，不写文件；输出模块拆分、能力、warning。

### 2.2 写入

```bash
node tools/keel.mjs import <legacy-id> --write
```

- 生成 `plugin.keel.json`；
- 不覆盖已有 Keel 清单；
- 不改原 `plugin.json`；
- `trusted.server/page` 仍然拒绝。

### 2.3 人工确认

自动迁移只是草稿，必须人工确认：

- content 的 `parts` / `provides` / `consumes`；
- asset 的覆盖关系与文件；
- sim / match / policy 的模块边界；
- 权限是否最小；
- `app` / `api` / `scope`；
- 是否需要 `compat.v2Script`。

### 2.4 验证

```bash
node tools/keel.mjs check <id> --strict
node tools/plugin.mjs pack <id>
node tools/keel.mjs exit
```

`keel exit` 必须 0 blocker；三个本地真实插件已经是 Keel。

### 2.5 V2 脚本兼容

主线插件/Forge kit 的 `setup(sp)` 用：

```json
{
  "manifest": 3,
  "compat": { "v2Script": true },
  "legacy": { "entry": { "sim": "sim/index.js" }, "permissions": ["sim.code"] },
  "modules": [{ "kind": "sim", "entry": "sim/index.js", "permissions": ["sim.code"] }]
}
```

运行时：

- `loadV2ScriptPlugin` 读取源码；
- `readScripts` 校验 lock；
- content set 下发 `/cs/.../scripts/...`；
- 浏览器 Worker 的 SES 执行 `setup(sp)`；
- `Match` 在战斗前运行 `runV2Setups`。

边界：

- 不恢复 manifest-2 文件夹直接加载；
- `trusted.server/page` 不支持；
- v2 脚本仍受 lock / pin / sandbox / 浏览器确认约束。

## 3. 测试流程

### 3.1 分层

| 层 | 代表文件 | 验证 |
|---|---|---|
| 规格/图 | `test/keel/manifest.test.js`、`graph.test.js`、`provides.test.js` | manifest 3、依赖、能力、图 |
| 运行时 | `test/keel/runtime.test.js`、`state.test.js`、`commands.test.js`、`budget.test.js`、`rng.test.js`、`stronghold-host.test.js` | hook、状态、命令、预算、host |
| 原生 | `test/keel/native-sandbox.test.js`、`native-delivery.test.js`、`native-gate.test.js`、`native-browser.test.js` | SES、下发、lock/pin、委托 |
| V2 | `test/keel/v2-script.test.js`、`content-set-script.test.js`、`test/plugins/sandbox-*.test.js` | setup(sp)、lock、sandbox |
| 内容/资源 | `test/keel/content.test.js`、`content-extras.test.js`、`test/plugins/contentSet.test.js`、`visualSet.test.js`、`fx.test.js` | content set、visual set、FX |
| 房间/比赛 | `test/keel/e2e*.test.js`、`test/match/*.test.js` | 房间、回合、field、委托、结算 |
| 作者链路 | `test/keel/cli*.test.js`、`studio-keel.test.js`、`tooling.test.js`、`templates.test.js` | CLI、studio、pack |
| 真实浏览器 | `test/ui/native-room.e2e.test.js`、`native-boss.e2e.test.js`、`native-room-fallback.e2e.test.js`、`native-room-bench.e2e.test.js` | Worker、确认、房主迁移、无人类 boss |
| 文档/发布 | `test/docs-*.test.js`、`test/package.test.js` | 链接、路径、mojibake、发布清单 |

### 3.2 常用命令

```bash
npm run check:keel
node --test test/keel/manifest.test.js
node --test test/keel/native-gate.test.js
node --test test/plugins/contentSet.test.js
node --test test/match/finalAssault.test.js
npm run typecheck
npx eslint .
npm test
```

真实浏览器 E2E：

```powershell
$env:SP_E2E='1'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/ui/native-room.e2e.test.js
node --test test/ui/native-boss.e2e.test.js
```

> 两个 E2E 文件各自启动多个浏览器，建议分开跑。

### 3.3 回归顺序

1. 改动的目标测试；
2. `npm run check:keel`；
3. docs gates（改文档时）；
4. `npm run typecheck` + `npx eslint .`；
5. `npm test`。

当前基线：

- `npm test`：**8799 / 8758 / 0 / 41 skipped**
- `check:keel`：**169 / 169**
- docs gates：**35 / 35**
- typecheck：通过
- eslint：0 errors

## 4. 标准试验插件

### 4.1 `keel-reference`

位置：`plugins/_template/keel-reference`。

它把真实插件常见的组合放在同一个 manifest 3 里：

| 模块 | 示例 |
|---|---|
| `content` | 合成敌人 + 合成策略 |
| `asset` | 策略图标覆盖 |
| `sim` | 生成结晶、周期伤害、标签减伤 |
| `policy` | 金币/手牌决策，写入模块 state |
| `ui` | `hud.right` 两行文字 + 只读 view |

验证：

```bash
node tools/keel.mjs check _template/keel-reference --strict
node tools/keel.mjs run _template/keel-reference --frames 60 --json
node tools/plugin.mjs pack _template/keel-reference
```

真实房间步骤见 [`../../plugins/_template/keel-reference/README.md`](../../plugins/_template/keel-reference/README.md)。

### 4.2 其他模板

| 模板 | 用途 |
|---|---|
| `keel-content` | 最小 content 插件 |
| `keel-lang` | 语言覆盖 |
| `keel-policy` | 服务端策略 |
| `keel-multi-module` | content + sim + policy + ui 组合 |
| `keel-survival` | 最小原生 sim 生存示例 |
| `keel-cosmetic` | 资源/主题 |
| `keel-ui` | `hud.right` 界面 |
| `keel-script` | 原生 sim 脚本 |
| `keel-reference` | 标准完整参考 |

### 4.3 CLI fixture

`test/fixtures/keel-demo` 是 headless CLI 测试用的最小 sim fixture；`keel run` 不需要真实浏览器。

## 5. 相关阅读

- [`ARCHITECTURE.md`](ARCHITECTURE.md)：架构图、N1/V2 实现。
- [`FEATURES.md`](FEATURES.md)：功能矩阵。
- [`COMPAT-V2.md`](COMPAT-V2.md)：迁移映射。
- [`MANIFEST-V3.md`](MANIFEST-V3.md)：字段。
- [`RUNTIME.md`](RUNTIME.md)：运行时。
- [`REMAINING.md`](REMAINING.md)：剩余/边界。
