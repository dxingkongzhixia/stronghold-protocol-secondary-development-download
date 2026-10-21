# PRTS：源代码

本 fork 独有的内容插件原型。

## 当前内容

- 凯尔希（`char_003_kalts` 的本机备份数据）
- 3 本、默认非精锐
- 固定 S3（技能的默认标记已切到第 3 个技能）
- 默认盟约：助力 / 坚守 / 精准
- 当前 kit 暂时借用 `char_1052_kalts2` 的通用实现，M3 的实际 kit / downed 复活仍待接

## 尚未完成

- PRTS / 拟态 Boss 数据
- 隐藏 Boss
- `band_prts_touch` 策略卡和房间过滤
- 清除协议、拟态重构、M3 击倒复活
- Boss HUD / 预警

## 美术

使用本安装已有的官方凯尔希素材（`art.ref: char_003_kalts`），不复制官方资源。  
正式发布前仍需按 `docs/PRTS-SOURCE-CODE.md` 完成授权和回退模型检查。

## 检查

```bash
node tools/plugin.mjs check prts-source-code --strict
```
