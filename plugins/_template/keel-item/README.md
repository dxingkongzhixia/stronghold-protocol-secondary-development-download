# keel-item

一个**自定义装备**的最小插件：`item_x_keel_item_demo`，装备效果完全由 `sim` 模块实现。

## 文件

```text
plugin.json           清单（manifest 3）
content/items.json    item_x_keel_item_demo（custom: true, buffs: []）
sim/index.js          战斗开始时给装备者上自定义状态；击杀计数
```

## 它演示什么

- `item_x_<插件 id 的下划线形式>_<后缀>` 命名；content 记录走 `parts: { data: [...] }`、entry `file: "items"`；
- `custom: true` + `buffs: []`：引擎不套任何 buff，效果由插件负责；
- `unitView.items`（`api.units()`）给出装备者；
- `api.status.apply(target, key, opts)` 施加自定义状态 key（`STATUS[key]` 不存在时按同名 flag 处理）；
- 权限：`sim.read` + `sim.status.write`。

## 两种写法

| 写法 | 记录 | 效果 |
|---|---|---|
| 复用引擎 buff | `buffs: [{ key, bb, bbStr }]`，key 必须是现有装备用过的组合 | 装备时由引擎自动加成 |
| 完全自定义 | `custom: true` + `buffs: []` | 本模板：`sim` 里读 `items` 后自己实现 |

## 图标 / 商店

- 图标走 `asset` 模块的 `items` 覆盖：`{ "items": { "item_x_keel_item_demo": "assets/icon.png" } }`。
- `tier` 1–6、`price` ≥ 0；`itemType` 只能是 `EQUIP` / `TRAP`。
- `giveBondId` / `requiresBondId` 必须指向已存在的盟约。
- 想进商店池，还需要插件声明对应的 `bands` / `choices` 或 patch 现有池子；模板默认不进商店。

## 验证

```bash
node tools/keel.mjs check _template/keel-item --strict
node tools/keel.mjs run _template/keel-item --frames 60 --json
node tools/plugin.mjs pack _template/keel-item
```

`keel run` 的 fake host 里没有装备者，所以 `carriers` 为 0；真实房间由 `unitView.items` 命中。
