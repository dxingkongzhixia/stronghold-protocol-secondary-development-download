# 龙骨生存示例（Keel survival）

一个 **Keel-native** 的最小插件模板：只有一个 `sim` 模块，不依赖官方脚本 SDK。

```bash
node tools/keel.mjs run _template/keel-survival --seed 1 --frames 60 --json
```

它会：

- `sim.setup` 生成一个敌人；
- 每 30 帧生成一个敌人；
- 每 10 帧对第一个活着的敌人造成 30 点真实伤害；
- 把 `ticks / spawned / hits / kills` 写进插件状态；
- `sim.battleEnd` 记下结束帧。

## 复制成自己的插件

```bash
cp -r plugins/_template/keel-survival plugins/keel-survival
# 改 plugin.json 的 name / description；文件夹名就是 id
```

`KEEL=1` 启动服务器时，`loadKeelPluginMap` 会扫描 `plugins/*` 下的 manifest 3 插件；房间内容集里选中它后，`Match` 会在 `newBattle` 里 attach。

## 边界

- 这是 **sim-only** 模板：没有 `content` / `match` / `policy` / `ui` / `asset` 模块；
- 生成本身用 `api.spawn`，真实 Battle host 只支持敌人（token/device 是 M2）；
- 预算默认 0.01ms/hook 是估值，不是实测。
