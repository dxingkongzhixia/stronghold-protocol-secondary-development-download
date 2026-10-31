# keel-reference

一个**原生 Keel 参考插件**：把真实插件常见的 `content + asset` 组合，和原生 `sim + policy + ui` 放在同一个
manifest 3 里，用来验证“作者只写 manifest 3”的完整链路。

> 这不是任何真实插件的复制品：内容记录、图标和数值都是合成的示例，只保留真实插件用到的**结构**。

## 它演示什么

| 模块 | 内容 |
|---|---|
| `content` | 一个敌人 `enemy_x_keel_reference_crystal`，一个策略 `band_x_keel_reference_sigil` |
| `asset` | 策略图标 `band_x_keel_reference_sigil → assets/icon.png`（真实插件的 art 组合方式） |
| `sim` | 在战斗里生成结晶、每 5 帧对最多 2 个敌人造成伤害；`refractor` 标签减伤一半 |
| `policy` | 金币 ≥ 4 且手牌未满 → `deploy`，否则 `save`；决策写进模块自己的 state |
| `ui` | `hud.right` 两行文字；`sim` 同时发布只读 view |

## 文件

```text
plugin.json             清单（manifest 3，五个模块）
plugin.lock.json        pack 生成的 pin（原生代码在真实房间运行的前提）
content/enemies.json    敌人记录
content/bands.json      策略记录
assets/icon.png         策略图标
sim/index.js            原生 sim
policy/index.js         原生 policy
ui/index.json           hud.right 声明
```

## 本地验证

```bash
# 严格检查：manifest、能力、provides、文件
node tools/keel.mjs check _template/keel-reference --strict

# 在 fake host 上跑 60 帧 sim；应看到 waves 3 / hits 24 / kills 1 / mitigated 21 / ended true
node tools/keel.mjs run _template/keel-reference --frames 60 --json

# 重新生成 pin（改了任何文件之后都要跑）
node tools/plugin.mjs pack _template/keel-reference
```

`keel check` 不执行代码；`keel run` 只在 fake host 里跑原生模块，不碰真实对局。

## 在真实房间使用

1. 复制到 `plugins/keel-reference/`（`plugins/*` 不随仓库提交）。
2. 确认 `plugin.lock.json` 是最新的：`node tools/plugin.mjs pack plugins/keel-reference`。
3. 服务端显式允许沙箱原生代码：`SP_PLUGIN_SCRIPTS=sandbox`。
4. 房间插件面板打开它；浏览器第一次会要求**本浏览器对该 content set 的原生代码确认**，拒绝则座位保持未就绪，
   代码不会执行。
5. 进入战斗：结晶按 `sim/index.js` 的节奏出现；含原生 sim 的房间里，bot / 接管 / 无人类 boss 的 field 会委托给
   在线浏览器（房主优先，每浏览器最多 8 个 field）。

没有 lock、lock 过期、或服务端没有 `SP_PLUGIN_SCRIPTS` 时，原生模块不会执行——这是设计，不是故障。

## 改成自己的插件

1. 复制整个目录到 `plugins/<你的 id>/`。
2. 改 `plugin.json` 的 `id` / `name` / `description`，把 `enemy_x_keel_reference_crystal`、
   `band_x_keel_reference_sigil` 换成自己的命名空间。
3. 按需删模块：只留 `content` 就是纯数据插件；删掉 `policy` 不影响 `sim`。
4. `keel check --strict` → `keel run` → `tools/plugin.mjs pack`。
5. 再进真实房间验证一次确认 gate 与战斗表现。

## 从旧插件（manifest 2）参考重写

1. **先跑迁移建议**：`node tools/keel.mjs migrate <旧插件目录>` 看模块拆分；确认后用 `node tools/keel.mjs import <id> --write` 生成 `plugin.keel.json`。
2. **content**：把 `data/*.json` / `operators` / `enemies` 等文件列进 `modules[kind=content].files` 和
   `parts`；`provides` 写清楚新增的 record id；`permissions` 只留 `content.define`。
3. **asset**：旧 `assets` / `visual` 的覆盖关系改写成 `modules[kind=asset].assets`（本模板的 `bands` 就是
   真实插件常见写法）；文件列进 `files`。
4. **sim / match / policy**：旧 `entry.sim` / 服务端 meta 代码分别落到 `sim` 与 `match` / `policy` 模块；
   浏览器只下载 `sim`，`match` / `policy` 只在服务端 meta runtime 执行。
5. **ui / lang**：`hud.right` 等声明放 `ui`，语言包放 `lang`。
6. **trust**：数据插件用 `trust: "data"`；需要原生代码才用 `trust: "sandbox"`，并接受 lock + 浏览器确认。
7. **不要写** `legacy`、`compat.manifest2`、`keelToV2` 字段；旧 loader 已删除，manifest 2 必须先迁移到 manifest 3 才会加载。
8. 跑 `keel check --strict` → `keel run` → `tools/plugin.mjs pack` → 真实房间。

旧插件的 `plugin.json` 会被 `keel import` 转成草稿，但草稿只做参考：模块边界、权限和 `provides` 仍要人工确认。

原生模板不写 `legacy` / `compat`，也不依赖 `keelToV2`；`match` / `policy` 在服务端 meta runtime 执行，
`sim` 只下发给浏览器。
