# keel-multi-module

一个 **Keel 原生多模块插件**：同一个插件同时带 content、sim、policy 和 ui。

## 文件

```text
plugin.json            清单（manifest 3，四个模块）
content/enemies.json   一条敌人记录（enemy_x_keel_multi_module_demo）
sim/index.js           每 30 帧生成一个敌人，每 10 帧对最多 3 个敌人造成伤害
policy/index.js        金币 >= 5 时 upgrade，否则 save
ui/index.json          hud.right 的两行文本
```

## 它演示什么

- 一个插件可以有多个模块，每个模块有自己的权限；
- content 提供记录，sim 用同一个敌人 id 作战；
- policy 用模块自己的 state 和 view；
- ui 在 `hud.right` 声明界面；
- 四个模块共享同一份 manifest 与版本。

## 检查与运行

```bash
node tools/keel.mjs check _template/keel-multi-module --strict
node tools/keel.mjs run _template/keel-multi-module --frames 60 --json
```

`run` 应看到 sim 模块的 tick / spawn / hit，state 无 error。

## 改成自己的插件

1. 复制到 `plugins/<你的 id>/`；
2. 改 `id`、`name`、`description`；
3. 把 `enemy_x_keel_multi_module_demo` 换成自己的命名空间；
4. 按需删掉模块或调整权限；
5. 重新跑检查与 `run`。

原生模板不写 `legacy` / `compat`，也不依赖 `keelToV2`。
