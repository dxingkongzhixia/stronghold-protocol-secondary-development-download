# 规程 band 实现计划（act3autochess）

<!-- doc: role=plan status=plan -->

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
- 协议、i18n、客户端 UI（`m.private.bandSkill` 视图 + `ui/bandSkill.js` 技能按钮/目标选择）已接入；HUD 布局待 P3 后续。

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

### B4 主动技能（地块 / 商店格）

| band | buff key | 状态 |
|---|---|---|
| band_transfer | `skill_transform_char_same_tier` | 调度中心一格换成同阶随机干员（每回合 2 次） |
| band_dance | `skill_mark_pos_grow_use_cnt` | 标记地块：战斗开始后首个经过的敌人恐惧 3 秒（官方 `eff_band19` 的 `fear`，`fear_tile` 标记）；R4/8/12 解锁 2/3/4 次 |
| band_treasure | `skill_add_pos_effect_enemy` | 地块上部署“模拟宝藏”（`enemy_9038_achest`）；被敌人触碰即消失，战斗结束仍在则 +1 资金；冷却 3 回合 |
| band_pudd | `skill_mark_shop_equip_tag` | 销毁选中的装备，下场战斗开始时给场上所有有空栏的干员临时装备（`lend_equip`；`consume_on_equip` 不可选） |

玩家级标记（B4 新增）：`ctx.addBandGlobal(mark)` → `PlayerState.bandGlobal`（每回合清空）→
`battleInput().bandMarks` → sim `ps.input.bandMarks`；`marks.js` 处理 `fear_tile` / `treasure` / `lend_equip`。
宝藏用 `mem.noLeak + mem.noFinish` 做成不计、不漏、不拖住结束的中立敌人；`_anyEnemyAlive` 跳过 `noFinish`。

### B5 无 key 技能 / 准备期被动（其余）

| band | buff key | 状态 |
|---|---|---|
| band_jenga | `skill_act_bond_grow_garr_cnt` | 目标已激活的每个盟约 +9 层；冷却 3 回合；R4 解锁 |
| band_mess | `skill_transform_char_up_tier` | 目标变为高一阶随机干员（≤6；`ctx.transform`）；R4 解锁 |
| band_protect | `skill_drop_hp_to_low_gain_coin` | 自己 LP 降到全场最低，损失（≤10）折资金；本回合休整期结束给该玩家回复等量 LP（`ctx.setLp` / `maxLp`） |
| band_rich | `skill_take_shop_char` | 免费拿调度中心 1 名（消耗 60）/ 2 名（消耗 120）干员 |
| band_bonus | `promote_char_extra_award` | 每回合首次精锐合并多给 1 次晋升奖励（`ctx.promotionReward`） |
| band_equipment | `promote_equip_extra_award` | 每回合首次装备合并给 3 件装备三选一（可能高一阶） |
| band_sargon | `gain_bond_cnt_shop_up_discount` | 每获得 3 名萨尔贡，当前商店等级升级 -3（每级 1 次；`PlayerState.shopUpDiscount` + `levelUp`） |
| band_pepe | `shop_up_bond_refresh_once` | 复用 act2 同名行为：升到 2/4/6 级后下次手动刷新优先生成萨尔贡 |
| band_mlynar | `buy_bond_char_gain_coin` | 复用 act2 同名行为：每买 1 名卡西米尔，下回合 +1（每回合 ≤3） |

### B6 6 名替换（复用 + 两段 band-gated 代码）

| band | 官方替换 | 状态 |
|---|---|---|
| band_yan2 / band_kjerag2 / band_siracusa / band_kazimier / band_sargon | 炎佑 / 寒风 / 隐匿真伤 / 真伤晕眩 / 技能加攻 | **复用**本树 `bonds/core.js` 既有 6 名实现（与官方替换文本一致），不改默认盟约 |
| band_victoria | 开技能后周围八格共享装备 | 新增 band-gated：`installVictoria` 读 `bondeffect_victoria_2` 的 `share_equip_*`，复用 `lendAround`/`lendItemEffects`（30 + 0.1·L 秒，≤200） |
| band_egir | 前 3 名首次被击倒召唤整备区最右阿戈尔 | 新增 band-gated：`battleInput` 在“band + 6 名不同阿戈尔”时下发 `egir_bench` 标记（`switch_cnt_max` 取 `bondeffect_egir_2`），`marks.js` 复用 `spawnOperator` + `findSummonTile` |

隔离：替换效果只在持有对应 band 的房间生效（`bandReplacementEffect` 在默认数据返回 null），默认盟约与 golden 不变。
测试：`test/content/bands_replace.test.js`（维多利亚借装备、阿戈尔 3 次召唤/同一干员不重复）、`test/versions-band-egir.test.js`
（版本对局里 6 名才下发标记）。

## 待实现

> **版本隔离（基本规则，owner 2026-11-15）**：默认盟约与规程互不影响；规程行为只能由版本数据 / 该版本才有的
> band id 触发，默认数据、默认 golden、默认盟约的盟约 6 名效果与经济数值都不因规程工作而改。共享代码只复用
> 工具/实现函数，不做无条件分支。详见 `docs/UPSTREAM-REGULATION.md` §0.1。

### A. 剩余
- `band_random` `gain_band_skill_from_pool_in_prep`：**已完成（B7）**。每次进入休整期从 2 个随机指令中二选一替换当前指令（`g.bandSkillChoose`，只替换指令、策略/被动不变；`m.private.bandChoice`）；测试 `test/versions-band-instructions.test.js`。
- 规程盟约自身的 6 名效果（act3 `bondeffect_*_2`，与默认盟约的 6 名行为不同）单列，按版本数据做隔离层。

## 批次

1. ~~**B1**~~（完成，`415dde1f7`）：smith / kjerag / siracusa / victoria / substitute。
2. ~~**B2**~~（完成）：`g.bandSkill` intent + 玩家技能状态 + 无目标经济类（price / fund / support / high / yan /
   equipment / closeout / kazimier / lethania / ursus）；测试 `test/versions-bands-skills.test.js`。`DEFAULT`（可再次使用）
   不限每回合次数（2026-11-15 修正）；`m.private.bandSkill` 视图与 `ui/bandSkill.js` 技能按钮/目标选择已接（P3）。
3. ~~**B3a**~~（完成）：选干员类 7 个（upgrade / copy / gain / prepfin / sell / yan2 / limit）+ 标记管线
   （`bandMarks` → `units[].marks` → `layer_cap`）。
4. ~~**B3b**~~（完成）：`skill_mark_char_inst_tag` 的 4 个战斗标记（survive / evolve / shield / breakaway，含第 7
   回合升级）、官方解锁链（`skill.stages`）与 `band_iberia`；测试 `test/content/bands_marks.test.js`、
   `test/match/band-marks.test.js`。
5. ~~**B4**~~（完成）：地块与商店格（dance / treasure / transfer / pudd）+ 玩家级标记
   （`bandGlobal` → `battleInput().bandMarks`）；测试 `test/content/bands_marks.test.js`。
6. ~~**B5**~~（完成）：无 key 技能（jenga / mess / protect / rich）与准备期被动（bonus / equipment / sargon /
   pepe / mlynar）。
7. ~~**B6**~~（完成）：7 个 `auto_chess_effect_replace`（5 个复用现有盟约 6 名实现 + 维多利亚借装备 + 阿戈尔整备区召唤）。
8. ~~**B7**~~（完成）：`band_random` 的技能选择（每次休整期 2 个随机指令二选一，`g.bandSkillChoose`；界面在 `ui/bandSkill.js`）。
