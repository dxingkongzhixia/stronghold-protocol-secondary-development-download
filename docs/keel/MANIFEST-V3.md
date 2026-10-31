# Keel manifest 3

> 读取与校验：`shared/keel/manifest.js`；JSON Schema：`schemas/keel-manifest.schema.json`。  
> **manifest 3 是唯一插件入口**；manifest 2 先由 [`adapt.js`](../../shared/keel/adapt.js) 迁移，不再由 loader 直接读取。

## 1. 最小示例

```json
{
  "manifest": 3,
  "id": "my-mode",
  "name": { "zh": "我的玩法", "en": "My Mode" },
  "version": "1.0.0",
  "app": ">=0.4.0 <0.5.0",
  "api": { "content": 1, "sim": 1, "match": 1 },
  "scope": ["room"],
  "trust": "sandbox",
  "modules": [
    {
      "kind": "content",
      "files": ["content/enemies.json", "content/modes.json"],
      "permissions": ["content.define", "content.patch"]
    },
    {
      "kind": "sim",
      "entry": "sim/index.js",
      "permissions": ["sim.read", "sim.damage.write", "sim.rng"]
    },
    {
      "kind": "match",
      "entry": "match/index.js",
      "permissions": ["match.read", "match.economy.write"]
    }
  ],
  "state": { "schema": "state.schema.json", "version": 1 },
  "requires": {},
  "optional": {},
  "conflicts": {},
  "loadAfter": [],
  "loadBefore": [],
  "compat": { "mainline": "0.3.x", "manifest2": true },
  "integrity": { "algo": "sha256", "lock": "plugin.lock.json" }
}
```

## 2. 顶层字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `manifest` | 是 | 固定 `3` |
| `id` | 是 | 2–32 位小写字母/数字/`-`；文件夹名决定 |
| `name` | 是 | 字符串或 `{ "<lang>": "<text>" }` |
| `version` | 是 | 语义化版本 |
| `app` | 是 | 游戏版本范围，如 `">=0.4.0 <0.5.0"` |
| `api` | 是 | `{ "<domain>": <1–99> }`，至少一个域 |
| `scope` | 否 | `room` / `personal` / `server`，默认 `room` |
| `trust` | 是 | `data` / `sandbox` / `native` |
| `modules` | 是 | 1–64 个模块 |
| `state` | 否 | `{ "schema": "<file>", "version": <int> }` |
| `requires` / `optional` / `conflicts` | 否 | `{ "<plugin id>": "<range>" }` |
| `loadAfter` / `loadBefore` | 否 | 插件 id 列表 |
| `priority` | 否 | ±1000 的整数 |
| `compat` | 否 | `{ "mainline": "<range>" \| false, "manifest2": <bool> }` |
| `integrity` | 否 | `{ "algo": "sha256", "lock": "<file>" }` |

未知字段只**警告**，不拒绝；这是为了给后续小版本留余地。

## 3. 模块

```json
{
  "kind": "sim",
  "entry": "sim/index.js",
  "permissions": ["sim.read", "sim.damage.write", "sim.rng"],
  "provides": ["buff:my-mode:echo"],
  "consumes": ["enemy:base:slug"],
  "state": { "schema": "sim-state.json", "version": 1 },
  "notes": "why this module exists"
}
```

规则：

- `kind` 是 `content/sim/match/policy/ui/asset/lang` 之一；
- 必须有 `entry` 或 `files`；
- 路径必须在插件目录内（`..`、绝对路径、隐藏段拒绝）；
- 同一个 `kind + 首个路径` 不能重复；
- `permissions` 必须来自 [`CONTRACTS.md`](CONTRACTS.md) 的能力表，并且属于该模块种类；
- `ui` 模块可以有 `slots`，值来自 `hud.right / result.tab / stats.tab / room.panel`；
- `content` 模块可以有 `parts`：`{ "data": [...], "operators": [...], ... }`，保留每个内容文件的角色；
- `asset` 模块可以有 `assets`：与 v2 `plugin.json.assets` 相同的结构化 overlay（enemies / tokens / bands / audio / fx）；
- `provides/consumes` 形如 `<kind>:<id>`。

## 4. 能力（capability）

能力不是文件类型，而是「这个模块能碰什么」：

| 能力 | 允许的模块 | 含义 |
|---|---|---|
| `content.define` | content | 新增资源 |
| `content.extend` | content | 在已有资源上追加/合并 |
| `content.patch` | content | 按类型化字段改标量 |
| `content.override` | content | 整体替换，需审计 |
| `sim.read` | sim | 读单位/状态/帧 |
| `sim.damage.write` | sim | 造成/修改伤害 |
| `sim.heal.write` | sim | 修改治疗 |
| `sim.buff.write` | sim | 加/删 buff |
| `sim.bond.read` | sim | 读盟约状态（层数 / 激活 / 档位 / 计数） |
| `sim.bond.write` | sim | 增加盟约层数（受 `BOND_LAYER_CAP` 与 `layerGains` 开关） |
| `sim.status.write` | sim | 施加/移除状态（含插件自定义 key；`STATUS[key]` 缺失时按同名 flag 处理） |
| `sim.spawn` | sim | 生成单位/装置 |
| `sim.rng` | sim | 用命名随机流 |
| `sim.fx` | sim | 发表现事件 |
| `match.read` | match | 读比赛视图 |
| `match.economy.write` | match | 改经济/候选 |
| `match.rng` | match | 比赛随机流 |
| `policy.observe` | policy | 读观察与合法动作 |
| `policy.act` | policy | 返回动作 |
| `ui.frame` | ui | 在沙箱帧里渲染 |
| `asset.add` | asset | 新增资产 |
| `asset.override` | asset | 替换官方资产 |
| `native.execute` | sim/match/ui | T2 原生执行，必须 `trust: native` |

## 5. 校验顺序

1. 版本/必填字段；
2. `api` 域与版本；
3. `trust` 与模块能力：
   - `trust: "data"` 不能带 sim / match / policy（代码模块），否则 `KEEL_TRUST_CODE`；
4. 模块路径/重复/`slots`；
5. `state` / `compat` / `integrity`；
6. 输出 `{ manifest, problems, warnings, issues }`，有 problem 时 `manifest` 为 `null`。

## 6. 与 manifest 2 的关系

- manifest 2 需要先迁移：`node tools/keel.mjs import <id> --write` 或 `migrate` 生成 manifest 3。
- **`plugin.keel.json` 优先**；没有它时，`plugin.json` 里 `"manifest": 3` 也会按 Keel 读取。
- 两者都没有 manifest 3 的文件夹返回 `PLUGIN_LEGACY_REMOVED`，不再加载。
- 迁移后的 `plugin.json` 可以保留作为生成来源，也可以删除；加载结果只取决于 manifest 3。
- `compat.v2Script` 是 manifest 3 上的正式兼容运行时；见 [`COMPAT-V2.md`](COMPAT-V2.md)。
