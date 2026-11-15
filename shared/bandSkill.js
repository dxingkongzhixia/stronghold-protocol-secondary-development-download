// shared/bandSkill.js — an official band skill's unlock chain (`bands.json` `skill.stages`, written by
// tools/build-data.mjs from the official skillInfoDataDict / unlockEffectId chain): which stage is in force now.
//
// A stage = { effectId, unlockType, unlockParam, skill }: the skill record that takes over once the condition the
// stage names holds. The official records chain base → upgrade(s): a record's `unlockType` / `unlockParam` is the
// condition to move ON to its `unlockEffectId` (e.g. 药枚实验 1级 upgrades at round 7; 重点监护 upgrades at shop level
// 3 and 5; 出航时刻 has a NONE base record and unlocks at 4 【伊比利亚】 members). The last stage's condition is
// `band_skill_load` and has no successor. Conditions are monotone (round, shop level, coins spent, bond member count),
// so walking forward while the current stage's condition holds finds the stage in force.
// `state` = { round, shopLevel, gold, bonds } — from PlayerState or from a meta handler's context.

/** The stages of a band's skill (the base one first; just that one when it has no `skill`). */
export function bandSkillStages(band) {
  const base = {
    effectId: band?.effectId ?? null,
    unlockType: band?.skill?.unlockType ?? 'band_skill_load',
    unlockParam: band?.skill?.unlockParam ?? [],
    skill: band?.skill ?? null,
  };
  const stages = [base];
  for (const st of band?.skill?.stages ?? []) if (st && typeof st === 'object') stages.push(st);
  return stages;
}

/** Does `state` meet the condition this stage names for the next one? */
export function stageUnlocked(state, stage) {
  const param = Array.isArray(stage?.unlockParam) ? stage.unlockParam : [];
  const n = (i) => Number(param[i]);
  switch (stage?.unlockType) {
    case null:
    case undefined:
    case 'band_skill_load':
      return true;
    case 'band_skill_load_by_round':
      return Number.isFinite(n(0)) && (state?.round ?? 0) >= n(0);
    case 'band_skill_load_by_shop_lv':
      return Number.isFinite(n(0)) && (state?.shopLevel ?? 0) >= n(0);
    case 'band_skill_load_by_coin_cost':
      return Number.isFinite(n(0)) && (state?.gold ?? 0) >= n(0);
    case 'band_skill_load_by_bond_act_count': {
      const bond = state?.bonds?.[param[0]];
      return Number.isFinite(n(1)) && !!bond && (bond.count ?? 0) >= n(1);
    }
    default:
      return false;
  }
}

/** Index into `stages` of the stage in force now: the furthest one the chain reaches (0 when it stops at the base). */
export function activeBandSkillIndex(state, stages) {
  let i = 0;
  while (i + 1 < stages.length && stageUnlocked(state, stages[i])) i++;
  return i;
}

/** The stage in force now. */
export function activeBandSkillStage(state, stages) {
  return stages[activeBandSkillIndex(state, stages)] ?? null;
}
