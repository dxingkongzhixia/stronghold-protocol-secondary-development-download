# 规程 band 实现计划（act3autochess）

来源：官方 `activity_table.json`（pin `6f63c14e`）的
`activity.AUTOCHESS.act3autochess.V3_1`：

- `bandDataListDict` → 名称 / 描述 / `effectId` / 总生命
- `skillInfoDataDict` → 技能类型、目标类型、可用类型/次数、cost、unlock
- `effectInfoDataDict` → `effectType`、HUD、持续回合
- `effectBuffInfoDataDict` → buff key + 官方黑板书

`tools/build-data.mjs` 已把 `skill` / `effect` 写进版本 `bands.json`（默认数据不变）。
44 个新 band：**ACTIVE 25 / PASSIVE 13 / NONE 6**；目标
**COMMON_CHESS 11 / NO_TARGET 10 / SHOP_SLOT 2 / MAP_TILE 2 / 无目标 19**。

## 引擎前置

主动 band 技能需要一个新 intent（暂名 `g.bandSkill`）：

```text
{ t: 'g.bandSkill', target?: { kind: 'chess'|'slot'|'tile', uid?/idx?/row?/col? } }
```

- 校验 `skill.targetType` / `targetFilterType` 与 `availType`；
- 玩家状态：`uses`（ROUND_RESET 按回合重置，ALL_LIMIT 保留）、`cooldownUntilRound`（COOLDOWN）；
- 成功后按 buff key 调用 `bands/meta.js` / `bands/battle.js` 的 handler，再扣次数/设冷却；
- 协议、i18n、房间 UI 在 P3 接入（技能按钮、目标选择、剩余次数）。

## 已完成（本树）

| band | buff key | 状态 |
|---|---|---|
| band_smith | `prep_start_random_equip_in_round` | 已实现：第 3/6/9/12/14 回合随机装备 |
| band_kjerag | `round_buy_bond_char_price` | 已实现：每回合首次谢拉格干员 1 费 |
| band_siracusa | `n_round_refresh_cnt_gain_coin` | 已实现：每回合首次刷新 +1 资金 |
| band_victoria | `buy_bond_char_cnt_gain_equip` | 已实现：每 3 名维多利亚干员 1 件随机装备 |
| band_substitute | `sell_char_swap_shop_char` | 已实现：每回合首次出售普通干员改为随机换人（不出资金） |
| band_takecare | `prep_finish_char_bond_add_layer` | 已有（act2） |
| band_mech | `preparation_start_gain_chess_from_round` | 已有 |
| band_bond | `refresh_shop_count_gain_coin_bond_char_chess` | 已有 |
| band_weakness | `env_gbuff_new_with_verify` | battle 侧已有 |

## 待实现

### A. PASSIVE 准备期
- `band_random` `gain_band_skill_from_pool_in_prep`：每次进入休整期从 2 个随机指令二选一替换。
- `band_bonus` `promote_char_extra_award`：每回合首次晋升额外一次晋升奖励（需 `ctx.promote`）。
- `band_sargon` `gain_bond_cnt_shop_up_discount`：3 名萨尔贡后升级 -3，每等级一次（需升级价折扣字段）。
- `band_egir` / `band_kjerag2` / 其余 `auto_chess_effect_replace`：按 6/9 名盟约替换效果。
- `band_iberia`、`band_rich`、`band_protect`、`band_mess`、`band_jenga`：无 buff key，需要按 bandId 的主动/解锁逻辑。

### B. ACTIVE 无目标 / 经济
- `band_price` `skill_next_equip_buy_discount`：下一件装备 -1。
- `band_fund` `skill_gain_gold_cd_by_gold`：随机 1–6 资金，冷却等于金额。
- `band_support` `skill_refresh_shop_high_tier`：刷新必出高一阶。
- `band_high` `skill_refresh_shop_board_char`：特殊刷新优先场上干员。
- `band_equipment` `skill_change_shop_equip` + `promote_equip_extra_award`。
- `band_yan` `skill_refresh_shop_bond_char`；`band_closeout` `skill_cost_round_grow_reset_on_use`+`skill_gain_all_shop_char`；
- `band_kazimier` `skill_gain_bond_char`+`skill_cost_round_grow_reset_on_use`；`band_lethania` `skill_cost_grow_per_use`；`band_ursus` `skill_cost_reduce_on_buy_bond`。

### C. ACTIVE 选干员
- `band_survive` / `band_evolve` / `band_shield` / `band_breakaway`：`skill_mark_char_inst_tag`（按 `eff_band12` 等 tag 区分）。
- `band_upgrade` `skill_upgrade_char`；`band_copy` `skill_copy_char_with_equip`；
- `band_gain` `skill_trigger_garr_event`；`band_prepfin` `skill_garr_event_extra_exec`；
- `band_limit` `skill_layer_limit_grow_round`；`band_sell` `skill_sell_char_bond_layer`；
- `band_yan2` `skill_remove_gain_bond_char`；`band_iberia` 选调度中心干员替换。

### D. ACTIVE 地块 / 商店格
- `band_dance` `skill_mark_pos_grow_use_cnt`（地块恐惧）。
- `band_treasure` `skill_add_pos_effect_enemy`（模拟宝藏）。
- `band_transfer` `skill_transform_char_same_tier`（商店格变同阶随机）。
- `band_pudd` `skill_mark_shop_equip_tag`（装备临时给全场）。

## 批次

1. **B1（本次）**：smith / kjerag / siracusa / victoria / substitute。
2. **B2**：`g.bandSkill` intent + 玩家技能状态 + 无目标经济类（price/fund/support/high/yan/closeout）。
3. **B3**：选干员类（mark tag / upgrade / copy / gain / prepfin / limit / sell / yan2）。
4. **B4**：地块与商店格（dance / treasure / transfer / pudd）。
5. **B5**：`auto_chess_effect_replace` 的 6/9 名替换与无 key band（iberia/rich/protect/mess/jenga）。
