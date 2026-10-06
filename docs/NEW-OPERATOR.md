# 新增干员流程（自造干员）

> 本季的干员名册来自官方数据：`tools/build-data.mjs` 读 Kengxxiao 官方表生成 `data/*.json`。
> **不在官方赛季名册里的干员**（例如阿斯卡纶）走**自造干员**通道 —— 下面这套流程就是给「加一名干员」用的。
> 参考实现：阿斯卡纶（`docs/MATCHMAKING.md` §23），每一步都能照抄。

## 0. 先判断

1. `grep <charId> data/chess.json` —— 已经有了就收工。
2. 查官方表（`.cache/gamedata/excel/`）：
   - `activity_table.json → activity.AUTOCHESS_SEASON.act2autochess.charChessDataDict` = 本赛季名册；
   - `character_table.json` = 数值/技能/天赋/分支（`subProfessionId`）；
   - `uniequip_table.json` + `battle_equip_table.json` = 模组。
3. 在名册里但没生成 ⇒ 跑一次 `node tools/build-data.mjs`。
4. **不在名册里 ⇒ 走 §2 的自造通道。**

## 1. 准备官方数据（一次性）

官方表缓存在 `.cache/gamedata/`，构建时自动下载。国内直连被墙时用镜像（与资源同一个 gh-proxy）：

```powershell
$env:SP_GAMEDATA_BASE = 'https://gh-proxy.com/https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/'
node tools/build-data.mjs
```

## 2. 在 `tools/build-data.mjs` 的 `CUSTOM_CHESS` 表里加一条

`applyCustomChess()` 会在构建**之前**把这些记录并进官方赛季表，于是 `data/chess.json` / `bonds.json` /
`garrisons.json` 都自然生成（`data/` 仍是构建产物，`test/data.test.js` 的离线重建逐字节复现照常通过）。

```js
{
  charId: 'char_4132_ascln',                        // character_table 的 id
  baseId: 'chess_char_4132_ascln_a',                // 自定义 chessId（普通）
  goldenId: 'chess_char_4132_ascln_b',              // 自定义 chessId（精锐）
  tier: 3,                                          // 商店阶 1–6
  identifier: 900, shopLevelSortId: 99,             // 排序（取不冲突的大数即可）
  defaultSkillIndex: 2,                             // 默认技能位（3★ 起多为最高位）
  defaultUniEquipId: 'uniequip_002_ascln',          // 精锐默认模组；没有就写 null
  bonds: ['skillfulShip', 'deputShip'],             // 盟约 bondId（见 data/bonds.json）
  normal: { evolvePhase: 'PHASE_2', charLevel: 1,  skillLevel: 4, equipLevel: 0 },
  golden: { evolvePhase: 'PHASE_2', charLevel: 60, skillLevel: 7, equipLevel: 1 },
  garrison: {                                       // 特质（见 §3.1 / §3.2）
    desc: '【助力】【灵巧】每叠加3层，本干员防御力+1%',
    blackboard: [
      { key: 'key', valueStr: 'act1autochess_gar_eff_attrByBond' },
      { key: 'divide_num', value: 3 },
      { key: 'bond_id', valueStr: 'deputShip,skillfulShip' },
      { key: 'def', value: 0.01 },
    ],
  },
}
```

- `normal`/`golden` 的 `charLevel`/`skillLevel`：照**同阶现有干员**取（普通多为 E2L1 / 技能 4；精锐 E2L60 / 技能 7 / 模组 Lv1）；`evolvePhase` = `PHASE_0/1/2`。
- 改完**重建**：`node tools/build-data.mjs`。
- 名册数量变了要同步**两处**：`tools/build-data.mjs` 里 `validateAll` 的 `expected N visible …`，
  以及测试里写死的计数（见 §5）。

## 3. 战斗行为

- **分支档案**（`server/sim/professions.js`）：行为由 `subProfessionId` 决定。
  伏击客 `stalker` = 范围群攻 + 50% 物理/法术闪避 + 嘲讽 -1；散射手、炮手、无畏者、领主… 都已实现。
  **先查有没有 —— 有就白送，不用写码**。
- **技能/天赋 kit**（`server/sim/content/kits/tierN.js`，按 `tier` 放）：每个干员的技能是**手写**的，
  key = `baseId`，返回 `Kit`（规范见 `docs/SIM.md` §7.2 / §7.3；blackboard→spec 的通用映射见 §7.4）。
  没写会退化成 `content/generic.js` 的「照 blackboard 自动」版本，但 `node tools/kit-coverage.mjs --missing`
  会报未覆盖 —— **必须手写**。
  - 数字取 blackboard；只在文本里的值（「连续攻击两次」「至多3个」）用 `textNum(s.description, /…(.)…/, 默认)` 抓。
  - 引擎**没有**的机制就补引擎（§3.2），别硬凑。

### 3.1 复用现成的「每 N 层」特质（最省事）

`server/sim/content/garrisons/battle.js` 的 `READERS` 里有 4 个「读盟约层数」的处理器，最常用
**`act1autochess_gar_eff_attrByBond`**：
`floor(Σ(bbStr.bond_id 列的盟约层数) / bb.divide_num) × bb.{atk,max_hp,def,attack_speed,hp_recovery_per_sec,sp_recovery_per_sec}`。
garrison 里给 `bbStr.bond_id`（逗号分隔多个）即可，**不用写码**。

### 3.2 补引擎（示例：阿斯卡纶的两处）

- **命中率降低**（`-N% 物理/法术命中率`）：
  - `server/sim/units.js` 聚合 `hitRatePhys` / `hitRateArts`（`clamp(a(...),0,1)`）；
  - `server/sim/damage.js` 在闪避之后加一次**独立的**未命中判定（PRTS「闪避与命中率降低相互独立」），
    并触发同样的 `dodge` fx / 事件；
  - `server/sim/buffs.js` 的 `ADD_KEYS` 记一下（文档用）；
  - kit 里对范围内地面敌人周期性挂 `mods: { hitRatePhys, hitRateArts }`。
- **高台条件**（`周围四格有高台时…`）：`battle.grid.isLow(r, c)`（`tile.height === 'LOW'`）判高台
  （`!isLow` = 高台，与 `unit.ground` 同一套）。kit 用 `battle.every(0.5, …)` 每 0.5s 重算并挂/摘 buff
  （部署、换位、装置升降都会变）。
- **强制变地面**（`缚地`，把飞行敌人打下来）：`buffs.js` 的 `FLAG_KEYS` + 状态表加 `grounded`
  （`grounded: { flags: { grounded: true } }`），并让 `units.js` 的 `get isFlying()` **优先**判断它
  （`if (this.s.flags.grounded) return false;`）——目标立刻按地面单位参与选择/阻挡。kit 用 `applyStatus(e, 'grounded', …)`。
- **一个干员多条特质**：`CUSTOM_CHESS` 的 `garrisons: [{ id, desc, blackboard }, …]`（每条一个 effectKey）；
  只有一条时仍可写单数的 `garrison: {…}`。
- **被动的范围扩张**：若自造干员的某个**被动**技能文本含「攻击范围扩大」，`shared/loadoutRecord.js` 的
  `attackRangeGrid` 需要认它（否则卡面/落点轮盘与实际部署范围不一致）。现规则：`/被动效果：攻击范围扩大/`
  或 `skillType === 'PASSIVE' && /攻击范围扩大/`。

## 4. 美术与语音

1. `docs/research/07-assets.json` 的 `operators` 加条目：
   `name/rarity/profession/subProfessionId/nationId/chess[]` + `avatar{e0e1,e2}` / `portrait{e0e1,e2}` /
   `fullArt{e0e1,e2}` / `skills[{index,skillId,iconId,icon}]` / `battleSpine{front,back}` / `subProfessionIcon`。
   URL 与 `bytes` 来源（见 `docs/research/07-assets.md`）：头像立绘 `yuanyan3060/ArknightsGameResource`；
   战斗脊柱 `fexli/ArknightsResource`（`spine/<id>/<id>/Front|Back/<id>.skel|atlas|png`）；
   子职业图标 `ArknightsAssets/ArknightsAssets2`。**该文件是 1 空格缩进的 JSON、无尾换行**（解析→改→`JSON.stringify(o,null,1)` 写回即可逐字节一致）。
2. 下载：`$env:SP_ASSET_SOURCE='mirror'; node tools/fetch-assets.mjs`（写 `public/assets/**` + `data/assets.json`）。
3. 语音（**只补日语**）：`extract-voice.py --only <charId> --ffmpeg <ffmpeg.exe>`
   （从本地日服客户端抽，覆盖 fetch-assets 下到的 CN 版；`--ffmpeg` 必给 —— ffmpeg 不在 PATH 上）。
4. **CN 语音（联动干员 / 本地客户端没有时）**：社区语音包（`ArknightsAssets2@voice`、`isHarryh/Ark-Voice`）常常还没收录新干员，
   但 **PRTS 有**：
   ```
   https://torappu.prts.wiki/assets/audio/voice/<charId>/cn_<NNN>.mp3      # 文件名必须小写
   ```
   （`torappu.prts.wiki` = PRTS 的「Arknights Asset Storage」；`/assets/audio/voice/<charId>/` 下的才是真文件，
   大写 `CN_019.mp3` 会 404，其它路径会返回 SPA 的假 200。`<NNN>` 与槽位的对应见干员页
   `https://prts.wiki/w/<干员>/语音记录`——`data-voice-filename` + `data-place-type`；战斗槽固定是 019–032：
   行动出发 / 行动开始 / 选中×2 / 部署×2 / 作战中1–4 / 完成高难 / 3星 / 非3星 / 失败。）
   下到 `public/assets/audio/voice/cn/<charId>/cn_<NNN>.mp3` 后**重跑 `node tools/fetch-assets.mjs`**：
   清单按「本地文件存在」收录（不必能从上流下到）。注意译名页里「日文」字段为空 ⇒ 该干员没有日语语音。
5. 校验：`node tools/doctor.mjs`；测试见 `test/assets.test.js`、`test/ui/assetUrls.test.js`、`test/render/assets.test.js`。

## 5. 跑测试 + 修计数

```powershell
node --test
```

新干员会让「名册数量」类断言变化，逐个更新（都是写死的期望值）：

| 文件 | 改什么 |
|---|---|
| `tools/build-data.mjs` | `validateAll` 的 `expected N visible non-DIY chess` |
| `test/data.test.js` | `chess: N records, M visible …`、`Object.keys(chess).length`、`visible.length`、`perTier` |
| `test/ui/loadout.test.js` | 两处 `112`（`Object.keys(s).length` / `roster.length`）+ 用例标题 |
| `test/match/loadout.test.js` | `visible.length` |
| `test/match/pool.test.js` | `pool.entries.size`、`pool.entries.size + banned.length`、`p2.entries.size` |
| `test/sim/loadout.test.js` | `rep.summary.chess`、`rep.chess.length` |
| `test/content/kits_alt_tN.test.js` | `rep.summary.chess`（该阶） |

**跑绿之前不要部署。**

## 6. 上线

1. 部署改动的源码/数据（`data/*.json`、`server/**`、`tools/**`、`docs/**`）+ 新资源。
   - ⚠️ **静态资源要按「整类目录」上传，不要只挑几个文件**：`public/assets/skill/`（**技能图标**）、
     `public/assets/char/avatar|portrait/`、`public/assets/spine/op/<charId>/`、`public/assets/prof/sub/`、
     `public/assets/audio/sfx/player/`、`public/assets/audio/voice/`。漏传的典型症状：详情页技能行只剩
     `S1/S2/S3` 文字（缺技能图标）、立绘空白、音效静音。
   - 一次到位的做法：`tar -czf` 时直接带上 `data server public/js public/assets/...` 需要的目录，或整树同步（`fullsync`）。
2. **重启服务**：`server/**` 改了必须重启；只改 `public/**`（前端）不用。
3. 校验：`curl -s /data/chess.json | grep <baseId>`、新资源各一条 HTTP 200。
4. 提交到 `_merge-scratch` 的 `ours` 分支（工作项目无 `.git`；用 `sync-scratch.ps1` / `apply-sync.ps1` 同步），
   并在 `docs/MATCHMAKING.md` 记一节。
5. 客户端 **Ctrl+Shift+R**（SPA 会缓存旧的 JS/CSS）。

## 7. 参考实现

**阿斯卡纶**（`docs/MATCHMAKING.md` §23）= `CUSTOM_CHESS` 一条 + `tier3.js` 一个 kit + `07-assets.json` 一条
+ 日语语音抽取 + 计数更新 + 两处引擎补充（命中率降低 / 高台条件）。照抄改字段即可。
