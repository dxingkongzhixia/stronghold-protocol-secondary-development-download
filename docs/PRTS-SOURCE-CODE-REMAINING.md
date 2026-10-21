# PRTS「源代码」B–E 开发计划

> 状态：**A1 + A2 已完成**。A2 提交为 `c31aa81a4`。**B0 第一批（B0-1 / B0-3 / B0-6）已完成**，见下方进度。  
> 本文只覆盖剩余阶段 **B / C / D / E**，不改变 [`PRTS-SOURCE-CODE.md`](PRTS-SOURCE-CODE.md) 的已批准决策。
> 性质：本 fork 独有内容插件 + fork 引擎能力；默认关闭，不部署、不改线上。

---

## 0. 完成定义

B–E 全部完成后，应满足：

- [ ] 只安装内容插件、房间启用后，PRTS / 拟态 / 凯尔希 band 才进入该房间；
- [ ] 不启用插件时，原版 Boss 池、默认 golden、普通战斗完全不变；
- [ ] 普通 Boss 3 次重构、隐藏 Boss 5 次重构，血量/轮次/权重符合设计表；
- [ ] 清除协议、DP、限制写入、光球、悬浮、链式反应都通过数据字段驱动；
- [ ] 凯尔希 / M3 的全队授予、精锐门槛、击倒复活、休整期 +3 全部通过；
- [ ] 房间选择、策略卡、Boss HUD、清除协议预警可用；
- [ ] `npm test`、插件 `check`、i18n、默认 golden 全绿；
- [ ] 只有 owner 明确同意后才部署。

---

## 1. 开工前必须补的引擎缺口（B0）

下面几项不是 PRTS 数据问题，而是通用 content plugin 目前做不到的能力。建议先做 B0，再写插件数据。

| ID | 缺口 | 现状/证据 | 建议 |
|---|---|---|---|
| **B0-1** | content plugin 不能新增 `bosses` 表记录 | `shared/plugins/dataUtils.js` 的 `RECORD_MAPS` 没有 `bosses`；`patch add` 和 `records` 都按命名空间表处理 | 在 `RECORD_MAPS` 增加 `bosses: ['boss_x', 'bossId']`，补 `records`/`patch`/`validate` 测试。`validate.js` 已检查 `boss.enemyKey`，不需要新规则 |
| **B0-2** | 官方 `enemy_1564_mpprts` / `enemy_1565_mpprme` 不能作为新记录 id | `recordId()` 只接受 `enemy_x_...` 命名空间 | **默认方案**：用 `enemy_x_prts_source_code_prts` / `_mimic`，把 `handbookId`、`iconId` 指向官方 id，美术/图鉴照旧。若必须保留官方 key，需要 owner 明确放宽命名空间并接受碰撞检查 |
| **B0-3** | band 只能按模式类型过滤，不能按房间 Boss 过滤 | `GameData.bandAllowed()` 只读 `modeTypeList` | 给 band 增加可选 `bossIds: string[]`；草稿、默认 band、bot 选 band 都走同一个过滤函数 |
| **B0-4** | `bandGrants` 只有合约，没有运行时 | A1 的 `shared/plugins/bandGrants.js` 只做校验 | 在 band 安装处读取 `grants`，实现团队授予、精锐门槛、休整期 +3；见 C |
| **B0-5** | 凯尔希没有现成 chess 记录，M3 没有现成 token 记录 | `data/chess.json` 没有 `char_003_kalts` 的棋；`data/tokens.json` 没有 `kalts_mon3tr` | B 阶段新增插件 operator + token 记录；`grantUnit` 需要能按 `charId`/可选 `chessId` 找到插件棋 |
| **B0-6** | PRTS 房间隐藏轮不保证选到 PRTS 隐藏 Boss | `setupMatchWaves` 从 `hiddenBossWeights` 随机 | 给 boss 记录增加 `hiddenBossId`（或 `hiddenOf`）；PRTS 房间隐藏触发时强制配对到 `boss_prts_hidden` |
| **B0-7** | A2 的 `protocolWarning` 等事件还没有进入客户端快照 | A2 用 `battle.emit` 发事件，HUD 还没消费 | D 阶段增加通用 `protocolView`，把清除倒计时、重构次数、可选中状态、预警送入 `b.snap` / `m.public` |

### B0 验收

**2026-10-21 进度：**

- [x] `bosses` 记录可以由插件新增（`RECORD_MAPS` + schema + `records.test`）；
- [ ] 命名空间方案有最终 owner 决定（默认 namespaced id；本批仍按 namespaced id 实现）；
- [x] band 的 `bossIds` 过滤在草稿、默认选择、bot 三处一致（`gd.bandAllowed` / `bandDraft.allowedBands` / `defaultBand`）；
- [x] 隐藏 Boss 配对测试：普通 Boss 的 `hiddenBossId` 会强制配对，其他房间不受影响（`test/match/prts-engine.test.js`）；
- [x] 以上各有单元测试（`test/plugins/records.test.js`、`test/match/prts-engine.test.js`）；
- [x] B0-4：`grantUnit` 团队授予/去重/不可出售、战斗开始 `eliteGate`、休整期 `restEndBondLayers` 已接入并有测试；
- [x] B0-5：`plugins/prts-source-code` 骨架已建立；凯尔希从 `data/backups.json` 的官方记录生成，M3 token 生成 namespaced 记录；`plugin check --strict` 通过；
- [x] B1：PRTS / 拟态 enemy、普通/隐藏 boss、PRTS 专属波次（普通/隐藏/单双人）、modes bossWeights 与 rounds.bossTemplates 已加入；实际组合与 `buildBossWave` 已验证，普通/隐藏波次都生成 PRTS + 拟态；凯尔希改用真实 `char_003_kalts` kit；
- [x] C1：`band_x_prts_source_code_touch` 记录和 `grantUnit` / `eliteGate` / `restEndBondLayers` 已写入；M3 20 秒击倒复活、最多 2 次已实现并验证（第 3 次永久退场）；
- [x] 素材：从本机官方客户端提取 PRTS `enemy_1564_mpprts` / 拟态 `enemy_1565_mpprme` Spine（`public/assets/local/spine/enemy/`），已写 `data/assets.json` + `data/local-assets.committed.json` + `tools/assets/local-enemy-spines.json`；
- [x] 客户端特效：已提取 PRTS / 拟态 20 个官方 FX prefab 及其贴图/网格（`public/assets/local/fx/`），Boss BGM 已指向官方 PRTS 战场音乐；
- [x] 敌人图标：PRTS / 拟态 158×158 官方头像已补齐（`public/assets/enemy/icon/`），Boss 结算头像会通过 `handbookId` 回退；
- [x] B0-7：`b.snapshot().protocol` 已输出重构剩余次数、倒地倒计时、清除协议倒计时与预警；Boss 胶囊 HUD 已消费（`protocol-hud`）。
- [ ] B0-2 仍待做：命名空间方案的 owner 最终确认。

---

## 2. B：Boss / 拟态 / 插件骨架

### B1. 插件目录与 manifest

目标目录：

```text
plugins/prts-source-code/
  plugin.json
  README.md
  content/
    enemies.json          # { records: 1, entries: [...] }，enemies part 可省略 file
    bosses.json           # { records: 1, entries: [...] }，B0-1 后才能用
    waves.json            # { records: 1, entries: [...] }
    bands.json            # { records: 1, entries: [...] }
    tokens.json           # M3 token（如果独立于凯尔希 kit）
    modes.json            # { patch: 1, ops: [...] }，合并进官方 modes 的 boss 池
    operators/
      kalts.json          # 凯尔希 chess/operator
  i18n/
    zh.json
    en.json
```

`plugin.json` 基线：

```json
{
  "manifest": 2,
  "id": "prts-source-code",
  "name": { "zh": "PRTS：源代码", "en": "PRTS: Source Code" },
  "version": "0.1.0",
  "app": ">=0.4.0 <0.5.0",
  "api": 1,
  "class": "content",
  "scope": ["room"],
  "sourceLang": "zh",
  "license": "GPL-3.0-or-later",
  "permissions": ["data.patch", "data.add"],
  "data": ["content/bosses.json", "content/waves.json", "content/bands.json", "content/modes.json", "content/tokens.json"],
  "enemies": ["content/enemies.json"],
  "operators": ["content/operators/kalts.json"],
  "i18n": { "zh": "i18n/zh.json", "en": "i18n/en.json" }
}
```

说明：

- 不申请 `dsl`、`script`、`trusted`；
- 不使用 `offers`，策略卡走现有 band 草稿；如后续确实需要交互窗口，再把 `api` 升到 2 并加 `offers`；
- `content/enemies.json` 使用 enemies part 的 `{records:1, entries:[{id, value}]}` 形状，不写 `file`；
- `content/bosses.json` / `waves.json` / `bands.json` / `tokens.json` 使用通用 records 形状；
- `content/modes.json` 使用 patch 形状，不新建模式。

### B2. 敌人记录

建议新增 3 条敌人：

| 记录 id | 对应 | 用途 |
|---|---|---|
| `enemy_x_prts_source_code_prts` | 普通 PRTS | `boss_prts.enemyKey` |
| `enemy_x_prts_source_code_prts_hidden` | 隐藏 PRTS | `boss_prts_hidden.enemyKey` |
| `enemy_x_prts_source_code_mimic` | 拟态 | 两条 PRTS 的 `protocol.link.enemy` |

基础数值按设计：

- PRTS：HP 50,000 / ATK 1,000 / DEF 3,000 / RES 75；
- 拟态：HP 25,000 / ATK 600 / DEF 3,000 / RES 75 / BAT 4 s。

`protocol` 数据：

```json
{
  "link": { "enemy": "enemy_x_prts_source_code_mimic", "guard": true },
  "revive": {
    "count": 3,
    "atk": 100,
    "hpReset": true,
    "down": 8,
    "shortenOnHit": { "target": "boss", "seconds": 1, "min": 3 }
  },
  "clearProtocol": { "at": 90, "warning": 10, "lp": 10 },
  "dpRegen": { "multiplier": 3, "duration": 10 },
  "deployLock": { "count": 4, "duration": 10, "afterRevive": { "count": 6, "duration": 15 } },
  "projectile": { "cooldown": 12, "damage": [2.4, 1.0], "radius": [1.5, 0.45] },
  "fly": { "duration": 25, "targets": 2, "range": 3.5, "intervalDelta": -0.5, "hpLoss": 0.3, "knockDownDamage": 0.15 },
  "beam": { "interval": 30, "targets": 3, "damageScale": 0.5, "width": 1, "windup": 3, "interruptHp": 0.15 }
}
```

隐藏 PRTS 的差异：

- `revive.count: 5`；
- `revive.atk: 150`；
- `clearProtocol.hiddenAt: 75`、`clearProtocol.hiddenLp: 15`（或直接用 `at:75, lp:15`，二选一，最终数据只保留一种表达）；
- 拟态共用；攻击力提升由隐藏 PRTS 的 `revive.atk` 驱动；
- 链式反应 5 目标、0.6× 伤害：`beam.targets: 5`、`beam.damageScale: 0.6`；间隔 24 秒；`deployLock.count: 6`、`duration: 15`；
- 光球/悬浮按隐藏表强化：确认是否沿用普通值，若强化则在隐藏 PRTS 记录覆盖。

验收：

- [ ] 只启用插件时，两条 PRTS 的 `protocol` 被 `readBossProtocol` 完整接受；
- [ ] `normalizeEnemy` 保留 `protocol`；
- [ ] 普通/隐藏各自启动后 `protocolStart` 事件字段正确；
- [ ] 插件关闭时两条记录不存在。

### B3. Boss 记录与隐藏配对

新增：

- `boss_x_prts_source_code_prts`
- `boss_x_prts_source_code_prts_hidden`

字段至少包含：

```json
{
  "bossId": "boss_x_prts_source_code_prts",
  "enemyKey": "enemy_x_prts_source_code_prts",
  "handbookId": "enemy_1564_mpprts",
  "name": "PRTS，“源代码”",
  "sortId": 11,
  "weight": 6,
  "hidden": false,
  "bloodPoint": { "FUNNY": 260000, "NORMAL": 720000, "HARD": 1950000, "ABYSS": 3900000 },
  "lpr": 2,
  "templates": { "mode_single_funny": "wave_x_prts_source_code_prts_s", "...": "..." },
  "escortsByTemplate": { "wave_x_prts_source_code_prts": [ ... 2 组精英 ... ] },
  "hiddenBossId": "boss_x_prts_source_code_prts_hidden"
}
```

隐藏：

- `hidden: true`；
- `weight: 50`；
- `bloodPoint`: FUNNY 800000 / NORMAL 1100000 / HARD 4000000 / ABYSS 8000000；
- 3 组精英护卫；
- 普通 PRTS 记录上的 `hiddenBossId` 指向隐藏记录，B0-6 保证配对。

验收：

- [ ] `bosses` 记录通过 `validateData`；
- [ ] `bossPoolHp()` 按难度/人数算出设计表；
- [ ] 普通模式只出现普通 PRTS；隐藏触发只出现隐藏 PRTS；
- [ ] 其他 Boss 池不受影响。

### B4. 波次 / 模式 / 舞台

推荐复用现有 Boss 舞台和波次模板，减少新地图风险：

1. 从现有 `act2autochess_*` Boss 模板复制一条 `wave_x_prts_source_code_*`；
2. 保留路线、出生点、Boss 中央列、地形；
3. `spawns` 中放 PRTS + 拟态；
4. `escortsByTemplate` 加普通 2 组 / 隐藏 3 组精英；
5. 在 `content/modes.json` 用 `merge` 把 `boss_prts*` 加进官方模式的 `bossWeights` / `hiddenBossWeights`；
6. 不改官方 `config.json` 文件，只通过插件 patch。

验收：

- [ ] `buildBossWave` 能生成普通和隐藏两套 spawns；
- [ ] `bossCentreWarnings` 不报告可部署中央列；
- [ ] 普通/隐藏轮次分别为 14/15（FUNNY 普通 9）；
- [ ] 插件关闭时模式数据无 PRTS key。

### B5. 素材 / i18n / README

- `handbookId` / `iconId` / `avatar` 优先指向官方 PRTS / 拟态资源；
- 本机没有官方 Spine 时，Boss 模型回退到现有 Boss 模型，README 标注；
- `i18n/zh.json`、`i18n/en.json` 覆盖名称、图鉴、技能描述、策略卡；
- README 写：官方美术版权、非商业、移除请求、插件依赖、回退模型。

### B6. B 阶段验收

```powershell
node tools/plugin.mjs check plugins/prts-source-code --strict
node tools/build-data.mjs --offline
node --test test/plugins
```

- [ ] 插件只在房间启用时加载；
- [ ] 默认 golden 不变；
- [ ] 普通 PRTS / 隐藏 PRTS 都能进入 Boss 轮；
- [ ] 数据字段与 A2 合约一致。

---

## 3. C：凯尔希 Touch 式 band

### C1. Band 记录与房间过滤

新增：

- `band_x_prts_source_code_touch`
- `effect_x_prts_source_code_touch`（如 records 要求 `effectRef`）

字段：

```json
{
  "bandId": "band_x_prts_source_code_touch",
  "name": "PRTS：源代码",
  "sortId": 41,
  "modeTypeList": ["SINGLE", "MULTI"],
  "totalHp": 10,
  "effectRef": "effect_x_prts_source_code_touch",
  "desc": "全队获得凯尔希与 M3……",
  "bossIds": ["boss_x_prts_source_code_prts", "boss_x_prts_source_code_prts_hidden"],
  "grants": {
    "team": true,
    "grantUnit": {
      "charId": "char_003_kalts",
      "tier": 3,
      "elite": false,
      "skill": 2,
      "skillLocked": true,
      "bonds": ["deputShip", "steadShip", "preciShip"],
      "token": "token_x_prts_source_code_mon3tr",
      "tokenOnDeath": "downed",
      "reviveMs": 20000,
      "maxRevives": 2
    },
    "eliteGate": { "others": 2, "at": "battleStart" },
    "restEndBondLayers": { "scope": "self", "layers": 3, "activeOnly": true, "cap": "maxCount" }
  }
}
```

`totalHp` 暂定 10，B 阶段平衡时确认；如沿用 Touch 的 28，则改这里即可。

`bossIds` 过滤（B0-3）：

- 草稿 `gd.bandIds()` 只返回当前房间 Boss 匹配的 band；
- 默认 band、超时 band、bot 选 band 使用同一过滤；
- 未选 band 时不授予凯尔希。

### C2. 全队授予凯尔希 / M3

数据：

- `content/operators/kalts.json`：`charId: char_003_kalts`，`tier 3`，normal / elite 两形态；
- 固定 S3：`skill: 2`、`skillLocked: true`；
- 默认盟约：`deputShip` / `steadShip` / `preciShip`；
- token：`token_x_prts_source_code_mon3tr`，normal / elite 变体；
- 凯尔希不可出售，可在备战移动，击倒后下一备战期满血回归。

运行时应做：

1. 任意玩家选中 `band_prts_touch` 后，对所有存活玩家执行一次 `grantUnit`；
2. 已有该特殊单位时不重复授予；
3. 授予时写 `piece.meta.special = 'band:prts_touch'`、`unsellable`、`returnNextPrep`；
4. `PlayerState.sell` 拒绝不可出售；`move` 正常；
5. 备战结束前玩家可把它放在空闲格；
6. 被击倒后下一备战期回到场上（沿用现有 `isDown` / 返还逻辑或新增专用字段）。

验收：

- [ ] 4 人房间任一玩家选 band，四人都得到；
- [ ] 未选 band 的房间不生成；
- [ ] 不可出售；可移动；
- [ ] 重复选择/重连不重复授予；
- [ ] 凯尔希被击倒后下一备战回归。

### C3. 精锐门槛

规则再确认：

- 凯尔希 / M3 默认非精锐；
- **只在战斗开始时检查一次**；
- 统计该玩家场上**已部署**的、除凯尔希 / M3 外的精锐干员；
- `>= 2` ⇒ 本场凯尔希 + M3 切精锐；`< 2` ⇒ 保持非精锐；
- 战斗中后来凑齐不再触发。

实现建议：

- 在组装 `battleInput` / `onBattleStart` 时统计 board 上的 `isElite`；
- 用精英 chess 记录替换凯尔希的 normal 记录，M3 用 elite token variant；
- 不直接改已生成 `Unit` 的 stats（避免 kit/攻速/token 不一致）；
- 排除凯尔希、M3 自身。

验收：

- [ ] 0 / 1 名其他精锐：非精锐；
- [ ] 2 名：凯尔希 + M3 精锐；
- [ ] 凯尔希/M3 自己不算；
- [ ] 战斗中加入第 2 名精锐不改变本场；
- [ ] 普通与隐藏 Boss 都适用。

### C4. M3 击倒 / 复活

- `tokenOnDeath: "downed"`；
- 击倒后留在原格，不攻击、不阻挡、不可选中；
- `reviveMs: 20000` 后原地满血复活；
- 每场最多 `maxRevives: 2`；
- 复活次数用尽后正常移除；
- 凯尔希死亡/撤退时 M3 的处理要与现有召唤物一致。

实现位置：

- `server/sim/battle/summons.js` 或 `server/sim/content/bands/battle.js` 的 token 死亡钩子；
- 若现有 engine 没有 token down 状态，增加通用 `tokenOnDeath:'downed'` 字段和测试，不写死 PRTS。

验收：

- [ ] 第一次击倒 → 20 s 后满血复活；
- [ ] 第二次击倒 → 再复活；
- [ ] 第三次击倒 → 移除；
- [ ] 击倒期间不攻击/不阻挡/不可选中；
- [ ] 凯尔希撤退/死亡时行为确定；
- [ ] 普通/精锐 M3 都正确。

### C5. 休整期 +3

- 每个休整期回合结束时；
- 只作用凯尔希自身；
- 只对已激活盟约；
- 每个盟约 +3 层；
- 不超过 `maxCount`；
- 每回合一次；
- 凯尔希不在场/击倒时不触发。

实现建议：

- 在现有休整期边界挂 `onRestEnd`（`Match` / band meta）；
- 读取 `ps.bonds` 的 active 状态；
- 用 `ps.addLayers(bondId, 3, { requireActive: true })`，但 cap 要读 `bond.maxCount`，不能只用 `layerGainRoom` 的 999；
- 只给持有 `band:prts_touch` 的玩家，且找到凯尔希特殊单位。

验收：

- [ ] 每个休整期只加一次；
- [ ] 只加凯尔希，不加队友；
- [ ] 未激活盟约不加；
- [ ] 达到 `maxCount` 后不再加；
- [ ] 凯尔希不在场/击倒跳过。

### C6. C 阶段测试

- [ ] 全队授予 / 不重复；
- [ ] 不可出售 / 可移动；
- [ ] 精锐门槛 0/1/2；
- [ ] M3 20 s / 2 次；
- [ ] 休整期 +3 / cap / activeOnly / 每回合一次；
- [ ] 普通 + 隐藏 Boss 的完整 match。

---

## 4. D：UI / 图鉴 / 预警

### D1. 房间与策略卡

- Boss 池来自模式数据，插件启用后 PRTS 自动出现；
- 策略卡 `band_prts_touch` 使用现有 band 草稿 UI，不新增交互窗口；
- 如果 `bossIds` 过滤生效，非 PRTS 房间看不到该卡；
- 需要图标：`assets.json bands[band_x_prts_source_code_touch]`，没有官方图标时用现有 Touch / PRTS 图标占位。

### D2. Boss HUD

新增通用 protocol 视图（不写死 PRTS）：

- 清除协议剩余时间 / 是否预警；
- 拟态剩余重构次数；
- PRTS 当前是否可选中；
- 悬浮剩余时间（可选）；
- 链式反应蓄力/打断状态（可选）。

数据流：

- `bossProtocol` 的 `st` 暴露只读 `view()`；
- `Battle.snapshot()` 增加 `protocol` 字段；
- `m.public` / `b.pool` 透传；
- 客户端 HUD 只读字段，不改战斗逻辑。

### D3. 清除协议预警

- 最后 10 秒：屏幕边缘红色 + 顶部提示 + 音效；
- 使用现有 `matchPopups` / `PhasePopup`；
- `protocolWarning` 事件必须进入客户端可见事件或快照；
- 预警只出现一次，不重复。

### D4. 图鉴 / i18n

- 敌人图鉴读取 `handbookId` 官方条目；
- Boss / band / 凯尔希 / M3 描述进 `i18n/zh.json`、`i18n/en.json`；
- 没有官方美术时使用 fallback，并在图鉴/README 标注。

验收：

- [ ] 房间能看到 PRTS Boss；
- [ ] 策略卡只在 PRTS 房间出现；
- [ ] HUD 倒计时/重构次数/可选中状态正确；
- [ ] 预警 10 秒触发一次；
- [ ] 中英文完整。

---

## 5. E：测试 / 平衡 / 文档 / 插件打包

### E1. 测试矩阵

| 层 | 用例 |
|---|---|
| engine | B0 的 `bosses`/band 过滤/隐藏配对 |
| Boss | 普通 3 次、隐藏 5 次完整循环；最终击倒；清除 90/75；DP；锁 4/6；光球；悬浮；光束打断 |
| Band | 全队授予、精锐门槛、M3 20 s/2 次、休整 +3 |
| Plugin | `plugin check --strict`、manifest、数据引用、i18n |
| 回归 | 默认 golden 不变；`npm test` 全绿 |
| UI | 房间、策略卡、HUD、预警 |

### E2. 平衡

- 普通/隐藏血量、权重、轮次；
- 拟态 +100/+150 ATK；
- 清除 -10/-15 LP；
- 链式反应 3/5 目标、0.5/0.6×；
- 限制写入 4/6 名、10/15 秒；
- 只调插件数据，不改默认模式数值。

### E3. 文档

- 本文档更新完成状态；
- [`PRTS-SOURCE-CODE.md`](PRTS-SOURCE-CODE.md) 进度表更新；
- 插件 README：安装、启用、Boss/band 说明、美术版权；
- 如新增 B0 引擎字段，更新 `docs/PLUGINS.md` / `docs/DATA.md` / `docs/SIM.md`。

### E4. 打包与上线

```powershell
node tools/plugin.mjs check plugins/prts-source-code --strict
node tools/build-data.mjs --offline
node tools/i18n.mjs check en --strict
npm test
```

- [ ] 默认 golden 无 diff；
- [ ] 插件关闭时零影响；
- [ ] 插件包可安装；
- [ ] **不部署**，等 owner 明确同意。

---

## 6. 建议提交顺序

每个提交只做一件事，提交信息一行、无 trailer：

1. `feat(prts): B0 -- plugin bosses table, boss pairing and band boss filter`
2. `feat(prts): B1 -- plugin skeleton and manifest`
3. `feat(prts): B2 -- PRTS and mimic enemy/boss data`
4. `feat(prts): B3 -- boss wave, mode pool and hidden pairing`
5. `test(prts): B4 -- plugin data and boss pool validation`
6. `feat(prts): C1 -- Kal'tsit band record, boss gate and team grant`
7. `feat(prts): C2 -- Kal'tsit/M3 elite gate and downed revival`
8. `feat(prts): C3 -- rest-end bond layers`
9. `test(prts): C4 -- band rules and full boss match`
10. `feat(prts): D1 -- boss protocol HUD and clear warning`
11. `test(prts): D2 -- UI snapshot and i18n`
12. `docs(prts): E1 -- plugin README and balance notes`
13. `test(prts): E2 -- full regression and golden check`

---

## 7. 待 owner 确认的开放项

| # | 问题 | 默认 |
|---|---|---|
| 1 | 敌人 key 用官方 `enemy_1564_mpprts` 还是命名空间 `enemy_x_prts_source_code_*` | 命名空间 + `handbookId` 官方 |
| 2 | 清除协议 LP 是“团队池 -10”还是“每名玩家 -10”（A2 已按每名玩家折算） | 每名玩家 |
| 3 | 凯尔希 band 的初始 LP | 暂定 10，平衡时定 |
| 4 | 第一次复活后的限制写入是否只作用于下一次备战 | 是（战斗中无手牌操作） |
| 5 | 悬浮的触发对象/时机：A2 目前是第一次复活后 Boss 自身 | 保持，B 数据阶段再校准 |
| 6 | 官方 PRTS / 拟态美术本机缺失时的 fallback | 现有 Boss 模型 + README 标注 |

---

## 8. 变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-21 | 创建 B–E 开发计划；A2 已完成并提交 `c31aa81a4` |
