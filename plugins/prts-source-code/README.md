# PRTS：源代码

这是一个 fork 独有的内容插件原型。

## 当前内容

- 凯尔希（来自本机官方数据的 `char_003_kalts` 记录）
- 3 盟约、默认非精锐
- 固定 S3（技能的默认标记已切到第 3 个技能）
- 默认盟约：助战 / 坚守 / 精准
- 凯尔希使用真实 `char_003_kalts` kit；M3 被击倒后 20 秒回到原格，最多 2 次，第 3 次永久退场

## 已完成

- PRTS / 拟态 Boss 数据
- 隐藏 Boss 与强制配对
- PRTS 专属普通 / 隐藏 / 单双人波次
- `band_x_prts_source_code_touch` 策略卡和 Boss 过滤
- 清除协议、拟态重构、M3 击倒复活
- 从本机官方客户端提取 PRTS / 拟态 Spine、20 个官方特效 prefab、特效贴图与网格，并写入本地素材清单
- PRTS / 拟态敌人图标已补齐，Boss 结算头像可用
- Boss 音乐使用官方 PRTS 战场 BGM
- 普通/隐藏 PRTS 的协议事件已接官方 FX：start / buff / die / line / skill / projectile / deploy-lock
- 隐藏 PRTS 使用独立紫色染色

## 尚未完成

- 实际房间联机回归
- 清除协议的全屏演出（当前为 Boss 胶囊 HUD 计数与预警）

## 美术

使用本安装已有的官方凯尔希素材（`art.ref: char_003_kalts`）和官方客户端提取的 PRTS / 拟态 Spine；不复制官方资源到插件包。

正式发布前仍需按 `docs/PRTS-SOURCE-CODE.md` 完成授权和回退模型检查。

## 检查

```bash
node tools/plugin.mjs check prts-source-code --strict
```
