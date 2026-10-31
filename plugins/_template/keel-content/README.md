# keel-content

一个最小的 **Keel 原生 content 插件**：一条敌人记录，带 `parts` 与 `provides`。

## 文件

```text
plugin.json            清单（manifest 3）
content/enemies.json   一条敌人记录
```

## 它演示什么

- `modules[].kind: "content"`；
- `parts.data` 把文件声明成数据记录；
- `permissions: ["content.define"]`；
- `provides: ["enemy:…"]` 让房间/其他插件能引用这条记录。

## 检查

```bash
node tools/keel.mjs check _template/keel-content --strict
node tools/plugin.mjs check _template/keel-content --strict
```

## 改成自己的插件

1. 复制到 `plugins/<你的 id>/`；
2. 把 `id`、`name`、`description`、`provides` 和记录 id 换成自己的；
3. 改 `content/enemies.json` 里的数值；
4. 重新跑上面的检查命令。

不要写 `legacy` / `compat.manifest2`：这是原生 manifest 3，不是从 manifest 2 迁来的。
