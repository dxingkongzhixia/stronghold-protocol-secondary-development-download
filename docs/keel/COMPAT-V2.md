# manifest 2 → Keel 兼容

> 适配器：`shared/keel/adapt.js`；CLI：`node tools/keel.mjs migrate <id> --json`。  
> 原则：**旧插件零改动迁移**（N5 后仅用于 `keel import/migrate` 与 Forge/studio 生成 manifest 3，loader 不再读取 manifest 2）；适配器只读，不执行、不重写、不改 `plugin.json`。

## 1. 类 → 模块

| v2 `class` | Keel `trust` | Keel 模块 | 说明 |
|---|---|---|---|
| `lang` | `data` | `lang` | `files.ui` 作为 entry |
| `cosmetic` | `data` | `asset` | assets / theme 文件 |
| `content` | `data` | `content` + `asset` | records 与美术分开 |
| `script` | `sandbox` | `content` + `sim` + `match` | 按 `entry.sim/meta` 拆 |
| `trusted` | `native` | `content` + `sim`/`match`/`ui` | 保留 pin + consent + review |
| `ui` | `sandbox` | `ui` | `entry.client` + `slots` |

## 2. 权限映射

| v2 permission | Keel capability |
|---|---|
| `assets.override` | `asset.override` |
| `assets.add` | `asset.add` |
| `theme` | `asset.theme` |
| `data.patch` | `content.patch` |
| `data.add` | `content.define` |
| `dsl` | `content.dsl` |
| `offers` | `content.offers` |
| `sim.code` | `sim.code` |
| `meta.code` | `match.code` |
| `mode.code` | `match.code` |
| `ui.frame` | `ui.frame` |
| `trusted.page` | `ui.native` |
| `trusted.server` | `native.execute` |

未知权限不会丢：保留在 `legacy.permissions`，并给 warning。

## 3. 字段映射

| v2 | v3 |
|---|---|
| `manifest: 2` | `manifest: 3` + `legacy.class` |
| `app` | `app` + `compat.mainline`（命中 0.3.2 → `"0.3.x"`，否则 `false`） |
| `requires/optional/conflicts` | 原样保留 |
| `loadAfter/loadBefore/priority` | 原样保留 |
| `settings` | 原样保留 |
| `parts.data/operators/enemies/modes/stages/dsl/offers/i18n` | `content` 模块的 `files` + `parts`（保留文件角色） |
| `parts.assets` + `assets` | `asset` 模块的 `files` + 结构化 `assets` |
| `entry.sim` | `sim` 模块的 `entry` |
| `entry.meta` / `entry.server` | `match` 模块的 `entry` |
| `entry.client`（ui） | `ui` 模块的 `entry` |
| `entry.client`（trusted） | `ui` 模块的 `entry`，`ui.native` |
| `slots` | `ui` 模块的 `slots` |
| `api` / `class` / `type` | `legacy.api` / `legacy.class` / `legacy.type` |

## 4. 自动适配的边界

- **只做结构映射**：适配器不解析 `content/*.json` 的记录；运行时由 `mergeKeelData` 负责记录、operator 展开和 patch。
- **不改 `plugin.json`**：`migrate --write` 只写 `plugin.keel.json`，默认拒绝覆盖。
- **加载时优先 Keel**：有 `plugin.keel.json` 时 registry 不再读 `plugin.json`。
- **PRTS 的 fx 资产**：CLI 使用 `server/plugins/fxAssets.js` 的 `readFxManifest`，所以 `assets.fx.index` 能读；迁移后它进入 asset 模块的 `assets.fx`。
- **平衡差异**：本分支的 `data/tuning.json` 与默认潜能/练度会在运行时叠加；格式兼容 ≠ 数值一致。

## 5. 手动工作（迁移时）

| 情况 | 需要做什么 |
|---|---|
| 新内容要归属到插件 | 在 `content` 模块补 `provides: ["enemy:<id>", ...]` |
| 需要 `sim`/`match` 代码 | M1 运行时接好后，补 module 的 `state.schema` 与确定性测试 |
| `trusted` | 不能自动升级；需要 review、lock pin、玩家同意 |
| `theme` | 仍由 asset 模块承载；主题变量保留在 `legacy.themeVars` |
| 官方素材 | 只允许引用安装内素材；不得把官方文件打进插件 |

## 6. 验收

```bash
node tools/keel.mjs graph _template/content
node tools/keel.mjs graph _template/script
node tools/keel.mjs graph _template/ui
node tools/keel.mjs graph _template/cosmetic
node tools/keel.mjs graph prts-source-code
node tools/keel.mjs graph prts-kaltsit
```

每个插件应至少产生一个模块；没有 problem，只有预期 warning。

## 7. v2 `setup(sp)` 的 opt-in

纯 v2 插件仍然走旧加载器。要让它在 Keel 路径里跑：

1. `keel migrate <id> --write` 生成 `plugin.keel.json`；
2. 在 `plugin.keel.json` 写 `"compat": { "v2Script": true }`，并保留 `legacy.entry` / `legacy.permissions`；
3. 启动时 `KEEL=1`（v2 setup 默认执行；`KEEL_V2=0` 是唯一的 opt-out）；
4. `Match` 构造阶段执行 `runV2Setups`，得到该 match **自己的** extension registry；
5. `Match.newBattle` 把它作为 `opts.extensions` 交给 `Battle`，kit / enemy / content / meta 都从这份 registry 安装。

限制：`sim` / `meta` 两个 entry 会按声明顺序在同一个 `sp` 上执行；两个 room 的脚本互不影响。信任、lock、pin、consent 仍由旧加载器负责。Keel 房间的内容集会把同一份脚本以 `/cs/<cs>/scripts/<id>/<entry>` 下发给浏览器，页面执行同一个 `setup(sp)`（战斗在浏览器模拟，只有服务端 registry 不够）。

## 8. `trusted` 不迁到 Keel 路径

`class: "trusted"` 的 `entry.server` / `entry.client` 是原生执行面（主进程、玩家同意、pin、review）。
Keel 的 host child 只执行 v2 的 `entry.sim` / `entry.meta`，因此：

- `keel migrate <id> --write` 对带 server / client 的 trusted 插件直接拒绝，不写 `plugin.keel.json`；
- `loadKeelPlugin` 也拒绝 `trust: "native"`（`PLUGIN_KEEL_NATIVE`）：Keel 不执行受信页面/服务端代码；
- `adaptV2` 仍给出结构映射和 warning，供阅读与未来移植；
- 这类插件不再有旧 loader 可回退；需要原生代码时写成 `sim` / `match` / `policy` 模块。

历史任务与决策见 [`HISTORY.md`](HISTORY.md)。
