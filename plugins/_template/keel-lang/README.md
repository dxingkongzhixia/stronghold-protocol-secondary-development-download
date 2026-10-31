# keel-lang

一个最小的 **Keel 原生 lang 插件**：一份小翻译表，作为个人语言包使用。

## 文件

```text
plugin.json     清单（manifest 3）
lang/en.json    翻译表（中文 msgid → 英文）
```

## 它演示什么

- `modules[].kind: "lang"`，`entry` 指向翻译文件；
- `scope: ["personal"]`：语言包只影响自己的页面；
- `sourceLang: "en"`：这是英文包。

示例里的三个键是游戏已有的界面文本，所以装上后界面基本不变；它只是让你看到格式。

## 检查

```bash
node tools/keel.mjs check _template/keel-lang --strict
node tools/plugin.mjs check _template/keel-lang --strict
```

## 改成自己的插件

1. 复制到 `plugins/<你的 id>/`；
2. 改 `id`、`name`、`sourceLang`；
3. 在 `lang/<lang>.json` 里写 `"中文原文": "你的翻译"`；
4. 重新跑检查命令。

语言包不改变战斗，也不影响别人。
