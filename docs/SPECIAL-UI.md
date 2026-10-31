# 特殊 UI 版本（参考）

> 这里收录**非官方 UI 的静态快照**，用于研究版式、动效与交互。它们**不参与构建**，也不被应用加载。
> 版权归原站 / 鹰角网络所有，仅作非商业同人项目的参考。

| 版本 | 来源 | 抓取 | 内容 | 状态 |
|---|---|---|---|---|
| ark-proto 访问终端 `ae-12` | `https://ark-proto.stardust.matce.cn/entry?next=/` | 2026-10-31 | PRTS 登录门禁（HTML/CSS/JS + three.js 背景 + ALTCHA） | 参考；登录后的游戏 UI 待口令后补 |

- 快照目录：[`special-ui/ark-proto-gate/`](special-ui/ark-proto-gate/README.md)
- 站点 `/healthz`：app **0.3.3**、build `b85985a86b2c`。
- 抓取范围：只有公开路径（`/_gate/**`、`/fonts/**`、`/vendor/**`）；`/js`、`/css`、`/data`、`/packs` 均为 401。

## 新增一个特殊 UI 版本

1. 建 `docs/special-ui/<name>/`，放入静态快照（保留来源、日期、build）。
2. 写 `README.md`：来源 URL、抓取日期、包含/不包含、预览方式、版权。
3. 在上表加一行。
4. 不要把快照接进 `public/` 或构建流程；它是参考，不是产品代码。
