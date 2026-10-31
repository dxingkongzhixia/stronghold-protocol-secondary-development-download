# keel-bond

一个新**盟约**的最小插件：一条 `bonds` 记录 + 一个 `sim` 模块，用击杀叠层演示 `api.bonds`。

## 文件

```text
plugin.json           清单（manifest 3）
content/bonds.json    bond_x_keel_bond_demo（thresholds [3, 6]）
sim/index.js          每次击杀 +1 层（api.bonds.addLayers）
```

## 它演示什么

- content 的记录文件用 `parts: { data: [...] }`，entry 写 `"file": "bonds"`；
- 记录 id 必须是 `bond_x_<插件 id 的下划线形式>_<后缀>`（本模板 `bond_x_keel_bond_demo`）；
- `sim` 模块用 `api.bonds.get/list/addLayers` 读层数、写层数；写层数受 `BOND_LAYER_CAP`（999）和
  `layerGains` 开关约束；
- 权限：`sim.bond.read` / `sim.bond.write`（`sim.read` 用于读单位）。

## 成员

模板默认**没有成员**，所以不会激活。让干员/棋子加入：

1. 在自己的 `operators` 记录里给 `chess.bonds` 加 `bond_x_keel_bond_demo`；或
2. 用 patch 把一条现有棋子加进去（`op: "append", file: "chess", path: ["bonds"]`）。

最少 3 名、最多按阈值 3 / 6 分档；计数只看 `chess.bonds`，不看 `nationId`。

## 图标

在 `asset` 模块里加：

```json
{ "bonds": { "bond_x_keel_bond_demo": "assets/icon.png" } }
```

## 验证

```bash
node tools/keel.mjs check _template/keel-bond --strict
node tools/keel.mjs run _template/keel-bond --frames 60 --json
node tools/plugin.mjs pack _template/keel-bond
```

`keel run` 的 fake host 不产生击杀；在真实房间里由 `sim.kill` 触发。写真实效果时，建议在
`sim.battleStart` 里用 `api.bonds.get(...)` 读起始层数，再按层数加 buff（`api.buffs`）或改伤害
（`sim.hit`）。
