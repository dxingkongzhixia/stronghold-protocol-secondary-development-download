# keel-policy

一个最小的 **Keel 原生 policy 插件**：读一条观察值（金币），把决策写进模块自己的 state，并发布一个 view。

## 文件

```text
plugin.json       清单（manifest 3）
policy/index.js   决策模块
```

## 它演示什么

- `modules[].kind: "policy"`；
- `permissions: ["policy.observe", "policy.act"]`；
- `setup()` 初始化 state；
- `policy.decide(ctx, api)` 里用 `api.state.patch` 和 `api.setView`；
- 决策不进全局状态，只留在自己模块里。

规则：`observation.gold >= 5` 时选 `upgrade`，否则 `save`。

## 检查与运行

```bash
node tools/keel.mjs check _template/keel-policy --strict
node --test test/keel/templates.test.js
```

`keel run` 只驱动 sim 钩子，policy 的 `policy.decide` 由测试或未来的 match 模块调用。

## 改成自己的插件

1. 复制到 `plugins/<你的 id>/`；
2. 改 `id`、`name`、`description`；
3. 改 `policy/index.js` 的决策规则；
4. 如果要读更多观察值，在 `ctx.observation` 里取，并保持 `policy.observe` 权限。
