# 沙盒（管理员）— 单场景战术演练

> 入口：`/admin/sandbox?token=…`（管理员 token）→ 302 到 `/dev/sandbox.html`。纯静态页面，不改服务端；不重启即可更新。
> 页面用**客户端自己的模拟**（`public/js/battle/runner.js` → `/sim`）跑一场真实战斗，再用**真实渲染**（`render/app.js`）
> 画出来，不是录像。

## 1. 能测什么

| 维度 | 现在（P0） |
|---|---|
| 干员 | `data/backups.json` 的 `diy.operators` 全部 91 个（含 4★ 原型）；按名称/职业/charId 搜索 |
| 技能 | 干员实际技能表（S1/S2/S3，名称 + 描述悬浮） |
| 练度 | 精英一/二、潜能 1–6、练度 0–3、模组（按该干员可用模组列出） |
| 站位 | 面板网格点选、战场直接点击（合法部署格）、朝向 UP/RIGHT/DOWN/LEFT |
| 敌人 | 全部 249 种；任意编组：数量 / 间隔 / 起始时间 / 路线 / HP× / ATK×；或整波刷出；或关闭敌人 |
| **BOSS** | 10 个 BOSS：选目标即带出它的模板波次与护卫；共享血池按难度血点 × 倍率；右上角实时血池百分比与协议 HUD |
| **队伍** | 最多 4 名干员同场（主 + 3 名队友），队友可换人、换技能；位置自动避开已占格 |
| 地图 / 波次 | 13 张地图、38 个波次（波次下拉会标注 BOSS 波）；路线一览（起点 → 终点） |
| 全局 | 敌人 HP/ATK 倍率、种子、1×/2×/4×/8×、单步 1 秒 |

> P2（未做）：插件内容集（在插件房间里测插件干员/技能）。

## 2. 地址参数

地址栏就是场景：改任何控件都会同步，复制链接即可分享/复现。

| 参数 | 含义 | 默认 |
|---|---|---|
| `unit` | 干员 charId | `char_4247_oxi` |
| `s` | 技能下标（0 = S1） | `2` |
| `elite` | `0` = 精英一；缺省 = 精英二 | 精英二 |
| `p` | 潜能 1–6 | `6` |
| `cul` | 练度 0–3 | `0` |
| `mod` | 模组 `uniEquipId` | 无 |
| `row` `col` | 部署格；缺省自动选一条怪线路上的合法格 | 自动 |
| `dir` | 朝向 | `RIGHT` |
| `stage` | 地图 id | `act1autochess_m01` |
| `wave` | 波次 id | `act1autochess_05` |
| `mix` | `1` = 整波刷出 | 步兵流 |
| `e` | 敌人编组 `key:count:interval:time:route:hp:atk;…` | 空 |
| `boss` | BOSS id（`boss_1`…`boss_10`）；带出模板波次与共享血池 | 无 |
| `bd` | BOSS 难度 `FUNNY|NORMAL|HARD|ABYSS`（决定血池） | `NORMAL` |
| `bhp` | 血池倍率（0.001–100，便于几十秒内打完） | `1` |
| `team` | 队友 `unit:skill:row:col:dir;…`（最多 3 名） | 空 |
| `hp` `atk` | 敌人全局倍率 | `6` / `1` |
| `nofoe` | `1` = 不刷敌人 | 空 |
| `seed` | 随机种子（同场景可复现） | `20261103` |
| `speed` | `1|2|4|8` | `2` |

旧链接（`?unit=&s=&stage=&wave=&mix=&elite=&hp=&speed=`）全部兼容。

## 3. 操作

- 面板 **干员**：搜索 → 点一行选中；技能按钮切换 S1/S2/S3；形态/潜能/练度/模组即时重建战斗
- 面板 **部署**：在网格里点合法格（亮色），或直接点战场地面；「自动选格」回到怪线路中间
- 面板 **敌人**：搜索后点一行 = 新增一组；每组可改数量/间隔/起始/路线/HP×/ATK×；「载入原波次」= `mix`
- 面板 **BOSS**：选目标（自动切到它的模板波次）；难度决定基础血池，`血池×` 把它缩到可测大小；血池实时显示在右上角
- 面板 **干员 → 队伍**：「+ 添加当前干员」加一名队友（最多 2 人同场），可换人/换技能；位置自动避开已占格
- 底栏：暂停 / **单步 1 秒**（暂停状态下推进 60 tick）/ 重来 / 1–8× / 复制链接
- 右上统计：释放次数、累计伤害、场上敌人、击杀、灼燃爆发、战斗时间
- 页面暴露 `window.__sandbox`（`battle` / `state` / `start` / `stepSecond`）供控制台调试

## 4. 实现

| 文件 | 职责 |
|---|---|
| `public/dev/sandbox.html` | 三栏布局与样式 |
| `public/dev/sandbox.js` | 载入数据、建目录、主循环、渲染接线、战场点击 |
| `public/dev/sandbox/state.js` | 场景状态 ↔ URL、敌组编码、`BattleSpec` 生成（纯函数） |
| `public/dev/sandbox/panels.js` | 面板 DOM 与事件（搜索、表单、网格） |
| `test/dev/sandbox.test.js` | URL 往返、旧参数、编组、spec 字段、自动选格 |

`state.js` 的 `buildSpec(state, { stages, waves, enemies, bosses })` 直接产 `server/sim/spec.js` 的 spec：
`players[].units[]` 的 `diy`、`potential`、`cultivate`、`row/col/dir`，`spawns`、`enemyOverrides`、`boss/bossId`、`flags.startOpCooldown=0`。

## 5. BOSS 战的地图与站位

BOSS 战不是把普通波次换成 BOSS 波：它使用 `GEO.BOSS_RECT`（地图顶部 0–5 行），部署格取自 `data/stages.json`
的 `deployTiles.bossLeft`，而不是 normal 的 9–12 行。切到 BOSS 时页面会：

- 把波次换成该 BOSS 的模板波次；
- 清掉旧的普通部署位，在 bossLeft 里重新自动选格；
- 战场点击也只接受 bossLeft 的格子。

同一个 BOSS 在普通战场与 BOSS 战场上的站位不同；链接里的 `row/col` 若落在普通区会被自动丢弃。

## 6. 已知限制

- 队伍上限 4 人（主 + 3 名队友）；治疗/光环类的目标选择足够覆盖，更多协同留给后续
- BOSS 的协议 HUD（复活/护盾/阶段）只对带协议的 BOSS 显示，其余显示 `—`
- 插件内容集尚未接入（页面只用服务器原版数据）
- 战场点击只接受**该地图的合法部署格**；非法格会被忽略（用面板网格也只会给合法格）

