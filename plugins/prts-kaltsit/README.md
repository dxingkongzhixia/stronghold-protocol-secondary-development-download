# PRTS：凯尔希 / PRTS: Kal'tsit

PRTS 主题的**策略**插件（分类：新增策略）。它只带一张公共策略和策略授予的干员，不含 Boss；Boss 在
[`../prts-source-code/`](../prts-source-code/)（分类：新增敌人）。

## 内容

- 公共策略 `band_x_prts_kaltsit_touch`「凯尔希」：全队授予（含 AI 队友），不需要写死 Boss 绑定
- 隐藏干员 `char_x_prts_kaltsit_one`：凯尔希，固定 S3，坚毅 / 精准，**不进商店 / 图鉴 / 自选**，只由策略授予
- M3 `token_x_prts_kaltsit_mon3tr`：被击倒后 20 秒回到原格，最多 2 次，第 3 次永久退场
- 队友的凯尔希占用预备医疗格；移出该格后不会重新生成
- 每回合休整期随机获得 1 名 1–3 星本干员（`grants.restEndRandomChess`）
- 凯尔希使用官方 `char_003_kalts` 的 kit 与立绘/语音（`kit.ref` / `art.ref`），策略图标与 M3 模型在插件自己的 `assets/`

## 启用

房主在房间的「插件」面板 → **新增策略** 分组里打开本插件；凯尔希随后出现在策略选择中。它与
`prts-source-code`（新增敌人）可以同时开启。

## 维护

记录 id 的命名空间是 `prts_kaltsit`（来自文件夹名 `prts-kaltsit`）。改过皮肤/ Spine 后运行：

```bash
node tools/plugin.mjs check prts-kaltsit --strict
node tools/plugin.mjs pack prts-kaltsit --zip
```
