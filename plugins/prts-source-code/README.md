# PRTS：源代码 / PRTS: Source Code

PRTS 主题的**敌人**插件（分类：新增敌人）：PRTS / 拟态机械 Boss、隐藏协议与专属波次。凯尔希策略已拆到
[`../prts-kaltsit/`](../prts-kaltsit/)（分类：新增策略），两个插件可以同时开启。

## 内容

- 普通 Boss `boss_x_prts_source_code_prts`（PRTS）与隐藏 Boss `boss_x_prts_source_code_prts_hidden`（拟态重构）
- 拟态机械 `enemy_x_prts_source_code_mimic`，以及三只 Boss 敌人的协议逻辑（链接 / 复活 / 清除协议 / DP 回复 /
  部署锁定 / 弹道 / 飞行 / 光束 / HUD）
- 普通 / 隐藏、单人 / 多人的专属波次（`wave_x_prts_source_code_*`）
- 把上面这些 Boss 并入八个官方模式的对手池与隐藏对手池（`content/modes.json`，只做 merge，不新增模式）
- Boss 音乐（官方 `boss_8` 引用）、Spine、图标、20 个官方 FX prefab + 贴图 + 网格

## 启用

房主在房间的「插件」面板 → **新增敌人** 分组里打开本插件；PRTS 随后出现在对应难度/模式的 Boss 池中。

## 维护

记录 id 的命名空间是 `prts_source_code`（来自文件夹名）。`server/sim/content/bossProtocol.js` 里的 FX 键
`plugin:prts-source-code:<key>` 与 `enemies.json` 的 `protocol.ui.id` 依赖文件夹 id，**不要改文件夹名**。改过 Spine 后运行：

```bash
node tools/plugin.mjs check prts-source-code --strict
node tools/plugin.mjs pack prts-source-code --zip
```
