# 规程 band 实现计划（act3autochess）

来源：官方 `activity_table.json`（pin `6f63c14e`）的
`activity.AUTOCHESS.act3autochess.V3_1`：

- `bandDataListDict` → 名称 / 描述 / `effectId` / 总生命
- `skillInfoDataDict` → 技能类型、目标类型、可用类型/次数、cost、unlock
- `effectInfoDataDict` → `effectType`、HUD、持续回合
- `effectBuffInfoDataDict` → buff key + 官方黑板书

`tools/build-data.mjs` 已把 `skill` / `effect` 写进版本 `bands.json`（默认数据不变）。
技能的官方升级链（`unlockEffectId`）也写进 `skill.stages`：每个 stage 带自己的
`effectId` / `unlockType` / `unlockParam` / `skill`；`shared/bandSkill.js` 按 round / 商店等级 /
累计消耗 / 盟约人数选“当前生效”的一级，只有这一级的 handler 运行。
44 个新 band：**ACTIVE 25 / PASSIVE 13 / NONE 6**；目标
**COMMON_CHESS 11 / NO_TARGET 10 / SHOP_SLOT 2 / MAP_TILE 2 / 无目标 19**。

## 引擎前置（已实现）

主动 band 技能用一个新 intent：

```text
{ t: 'g.bandSkill', target?: { kind: 'chess'|'shop'|'tile', uid?/slot?/row?/col? } }
```

- `targetType` 决定目标（`NO_TARGET` 不带，`COMMON_CHESS` 为自己场上干员 uid，`SHOP_SLOT` 为调度中心格号，
  `MAP_TILE` 为行列）；`availType` 决定次数：`ROUND_RESET` 每回合重置 `uses`，`ALL_LIMIT` 用整场 `total`，
  `COOLDOWN` 用 `cooldownUntil`，`DEFAULT` 不限次；
- 玩家状态 `PlayerState.bandSkill = { uses, total, round, cooldownUntil }`；
- 价格钩子 `onBandSkillPrice` 先跑（只改 `ev.cost`，无副作用），再检查资金；`onBandSkill` 执行并必须设
  `ev.done`（没做成 → 不扣费、不消耗次数），成功后扣费、记次数、按 `ev.cooldown` 设冷却，最后跑
  `onBandSkillUsed`（只做“成功使用之后”的记账，例如指令费用成长/重置）；
- `ctx.refreshShop()` = 免费的 `PlayerState.refresh({ free: true })`（band 技能自己的刷新）；
- 协议、i18n、房间 UI 在 P3 接入（技能按钮、目标选择、剩余次数）。

## 已完成（本树）

### B1 被动 / 触发

| band | buff key | 状态 |
|---|---|---|
| band_smith | `prep_start_random_equip_in_round` | 第 3/6/9/12/14 回合随机装备 |
| band_kjerag | `round_buy_bond_char_price` | 每回合首次谢拉格干员 1 费 |
| band_siracusa | `n_round_refresh_cnt_gain_coin` | 每回合首次刷新 +1 资金 |
| band_victoria | `buy_bond_char_cnt_gain_equip` | 每 3 名维多利亚干员 1 件随机装备 |
| band_substitute | `sell_char_swap_shop_char` | 每回合首次出售普通干员改为随机换人（不出资金） |

### B2 主动技能（无目标 / 经济）

| band | buff key | 状态 |
|---|---|---|
| band_price | `skill_next_equip_buy_discount` | 下一 `times` 件装备 -`count`（最低 0），按购买消耗 |
| band_fund | `skill_gain_gold_cd_by_gold` | 随机 1–6 资金，冷却 = 获得金额 |
| band_support | `skill_refresh_shop_high_tier` | 免费刷新，`count` 格为商店等级 +`lv_up` 阶（≤6） |
| band_high | `skill_refresh_shop_board_char` | 免费刷新，一格为自己场上干员的复制（整场 1 次） |
| band_yan | `skill_refresh_shop_bond_char` | 免费刷新，`count` 格为【炎】干员 |
| band_equipment | `skill_change_shop_equip` | 一件新装备替换随机装备格（`promote_equip_extra_award` 仍待做） |
| band_closeout | `skill_gain_all_shop_char` + `skill_cost_round_grow_reset_on_use` | 拿走商店全部干员并清格；每次休整期结束费用 -1，用后重置 |
| band_kazimier | `skill_gain_bond_char` + `skill_cost_round_grow_reset_on_use` | 1 名卡西米尔干员；费用每休整期 -2，用后重置 |
| band_lethania | `skill_gain_bond_char` + `skill_cost_grow_per_use` | 1 名莱塔尼亚干员；每次使用后费用永久 +1 |
| band_ursus | `skill_gain_bond_char` + `skill_cost_reduce_on_buy_bond` | 1 名乌萨斯干员；每买 1 名乌萨斯 -1，用后重置 |

### B3a 主动技能（选干员）

| band | buff key | 状态 |
|---|---|---|
| band_upgrade | `skill_upgrade_char` | 立即晋升目标（整场 1 次） |
| band_copy | `skill_copy_char_with_equip` | 复制目标（精锐状态 + 携带装备；整场 1 次） |
| band_gain | `skill_trigger_garr_event` | 立即触发目标的 `<获得时>` 特质（`event`） |
| band_prepfin | `skill_garr_event_extra_exec` | 目标本回合休整期结束特质额外触发 `count` 次 |
| band_sell | `skill_sell_char_bond_layer` | 出售目标，所有已激活盟约按目标等阶加层 |
| band_yan2 | `skill_remove_gain_bond_char` | 移除目标，获得 1 名不高于其等阶的【炎】干员（先抽再移除） |
| band_limit | `skill_layer_limit_grow_round` | 给目标 `layer_cap` 标记：下场战斗卫戍能力叠层上限 +当前回合数 |

标记管线（B3a 新增）：`ctx.addBandMark(uid, mark)` → `PlayerState.bandMarks`（每回合开始时清空）→
`battleInput()` 的 `units[].marks` → sim 单位 `u.marks`；`layer_cap` 由
`garrisons/battle.js layerCapBonus()` 加进 `max_add_count_per_battle`。

其它已有：`band_takecare` `prep_finish_char_bond_add_layer`、`band_mech`
`preparation_start_gain_chess_from_round`、`band_bond`
`refresh_shop_count_gain_coin_bond_char_chess`、`band_weakness` `env_gbuff_new_with_verify`（battle 侧）。

## 待实现

### A. PASSIVE 准备期
- `band_random` `gain_band_skill_from_pool_in_prep`：每次进入休整期从 2 个随机指令二选一替换。
- `band_bonus` `promote_char_extra_award`：每回合首次晋升额外一次晋升奖励（需 `ctx.promote`）。
- `band_sargon` `gain_bond_cnt_shop_up_discount`：3 名萨尔贡后升级 -3，每等级一次（需升级价折扣字段）。
- `band_equipment` `promote_equip_extra_award`：每回合首次装备合并进阶时给出 3 件装备三选一。
- `band_egir` / `band_kjerag2` / 其余 `auto_chess_effect_replace`：按 6/9 名盟约替换效果。
- `band_iberia`、`band_rich`、`band_protect`、`band_mess`、`band_jenga`：无 buff key，需要按 bandId 的主动/解锁逻辑。

### B3b 主动技能（战斗标记 + 解锁链）

| band | 官方 tag | 状态 |
|---|---|---|
| band_survive | `eff_band12` | 战斗开始击倒并立即复活，之后 `max_respawn_cnt`(2) 次击倒复活（`marks.js`） |
| band_evolve | `eff_band14` | 该场战斗以精锐形态上场（`battleInput` 换 golden id，不改变持有干员） |
| band_shield | `eff_band17` → `eff_band18` | 每次攻击 `prob` 得 1 层护盾（上限 1）；第 7 回合升级 20 %→35 % |
| band_breakaway | `eff_band22` | 首次受伤被击倒，并在相邻格部署整备区最右干员（`spawnOperator`） |
| band_iberia | — | 4 名【伊比利亚】解锁；消耗 1、每回合 2 次，把调度中心一格替换为不高于原等阶的【伊比利亚】干员 |

`skill_mark_char_inst_tag` 从官方 `effects.json` 的 tag 记录取战斗键与数值（`prob` / `max_respawn_cnt` /
`start_dead`），标记经 `bandMarks` 进入战斗；`marks.js` 在 `battleStart` 安装。官方升级链（药枚实验 R7、
重点监护商店 3/5 级、出航时刻 4 人）由 `shared/bandSkill.js` 逐级判定，只有当前一级的 handler 运行。

其它已有：`band_takecare` `prep_finish_char_bond_add_layer`、`band_mech`
`preparation_start_gain_chess_from_round`、`band_bond`
`refresh_shop_count_gain_coin_bond_char_chess`、`band_weakness` `env_gbuff_new_with_verify`（battle 侧）。

## 待实现

### A. PASSIVE 准备期
- `band_random` `gain_band_skill_from_pool_in_prep`：每次进入休整期从 2 个随机指令二选一替换。
- `band_bonus` `promote_char_extra_award`：每回合首次晋升额外一次晋升奖励（需 `ctx.promote`）。
- `band_sargon` `gain_bond_cnt_shop_up_discount`：3 名萨尔贡后升级 -3，每等级一次（需升级价折扣字段）。
- `band_equipment` `promote_equip_extra_award`：每回合首次装备合并进阶时给出 3 件装备三选一。
- `band_egir` / `band_kjerag2` / 其余 `auto_chess_effect_replace`：按 6/9 名盟约替换效果（升级链已能选级）。
- `band_rich`、`band_protect`、`band_mess`、`band_jenga`：无 buff key / 纯解锁链，需要按 bandId 的主动逻辑。

### B. ACTIVE 地块 / 商店格
- `band_dance` `skill_mark_pos_grow_use_cnt`（地块恐惧）。
- `band_treasure` `skill_add_pos_effect_enemy`（模拟宝藏）。
- `band_transfer` `skill_transform_char_same_tier`（商店格变同阶随机）。
- `band_pudd` `skill_mark_shop_equip_tag`（装备临时给全场）。

## 批次

1. ~~**B1**~~（完成，`415dde1f7`）：smith / kjerag / siracusa / victoria / substitute。
2. ~~**B2**~~（完成）：`g.bandSkill` intent + 玩家技能状态 + 无目标经济类（price / fund / support / high / yan /
   equipment / closeout / kazimier / lethania / ursus）；测试 `test/versions-bands-skills.test.js`。
3. ~~**B3a**~~（完成）：选干员类 7 个（upgrade / copy / gain / prepfin / sell / yan2 / limit）+ 标记管线
   （`bandMarks` → `units[].marks` → `layer_cap`）。
4. ~~**B3b**~~（完成）：`skill_mark_char_inst_tag` 的 4 个战斗标记（survive / evolve / shield / breakaway，含第 7
   回合升级）、官方解锁链（`skill.stages`）与 `band_iberia`；测试 `test/content/bands_marks.test.js`、
   `test/match/band-marks.test.js`。
5. **B4（下一步）**：地块与商店格（dance / treasure / transfer / pudd）。
6. **B5**：`auto_chess_effect_replace` 的 6/9 名替换与无 key band（rich/protect/mess/jenga）。
