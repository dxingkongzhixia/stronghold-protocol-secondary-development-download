// public/js/render/vfx/regulation-fx.js — 规程 (act3autochess) official-effect table, fork-only.
//
// The mainline has no act3 roster, so nothing here can be copied from it. The table has three parts:
//
//   REGULATION_FX_ROSTER    the act3 leaders / special enemies and the official prefab keys their index plans use. The
//                           plan is generated from `units[<key>]` (render/vfx/skills.js), so these keys already play on
//                           the sim's normal attacks and skill casts; the table documents the mapping and
//                           test/render/vfx-regulation.test.js pins it against the committed fx index.
//   REGULATION_FX_BINDINGS  kit 'fx' tuples the generated plans do NOT place (a timer/talent moment, a summon), merged
//                           into ENEMY_FX_BINDINGS / FX_BINDINGS in render/vfx/skills.js.
//   REGULATION_FX_COVER     kit 'fx' kinds an operator skill's official plan already draws, merged into FX_COVER (the
//                           procedural cue is skipped while the official effects play).
//
// Keys are the lower-case prefab names of public/assets/local/fx/index.json (the merged official index, 5564 prefabs).

/** The act3 leaders and special enemies this table covers → the official prefab keys their plans use. */
export const REGULATION_FX_ROSTER = Object.freeze({
  // 假想敌：械 (BOSS) — attacks, 量变之械 squad (SommonSquad) and the Armor talent (WithArmor mode)
  enemy_9029_acfnc: Object.freeze([
    'enemy_acfnc_attack_hit_01', 'enemy_acfnc_attack_start_01', 'enemy_acfnc_attack_start_02',
    'enemy_acfnc_die_01', 'enemy_acfnc_skill_01_locked_01', 'enemy_acfnc_skill_01_start_01',
    'enemy_acfnc_skill_01_start_02', 'enemy_acfnc_skill_01_start_03', 'enemy_acfnc_skill_02_start_02',
    'enemy_acfnc_skill_02_start_03',
  ]),
  enemy_9029_acfnc_2: Object.freeze([
    'enemy_acfnc_attack_hit_01', 'enemy_acfnc_attack_start_01', 'enemy_acfnc_attack_start_02',
    'enemy_acfnc_die_01', 'enemy_acfnc_skill_01_locked_01', 'enemy_acfnc_skill_01_start_01',
    'enemy_acfnc_skill_01_start_02', 'enemy_acfnc_skill_01_start_03', 'enemy_acfnc_skill_02_start_01',
    'enemy_acfnc_skill_02_start_02', 'enemy_acfnc_skill_02_start_03', 'enemy_acfnc_skill_02_start_04',
  ]),
  // 冲击之械 (ELITE) — launch (MoveMode loop), falldown, birth / die
  enemy_9027_acfnca: Object.freeze([
    'enemy_acfnca_birth_01', 'enemy_acfnca_die_01', 'enemy_acfnca_move_01', 'enemy_acfnca_skill_02_start_01',
  ]),
  // 后兽 (BOSS) — blink, 责罚, 兼爱 / 归尘, mode M2 and the switch clip
  enemy_2123_dyjsww: Object.freeze([
    'enemy_dyjsww_c1_skill_01_hit_01', 'enemy_dyjsww_c1_skill_01_locked_01', 'enemy_dyjsww_c1_skill_01_start_01',
    'enemy_dyjsww_c1_skill_01_start_02', 'enemy_dyjsww_c1_skill_02_die_01', 'enemy_dyjsww_c1_skill_02_range_01',
    'enemy_dyjsww_c1_skill_02_start_01', 'enemy_dyjsww_c1_talent_01_screen_01',
    'enemy_dyjsww_c1_talent_01_screen_02', 'enemy_dyjsww_c1_talent_02_buff_01',
    'enemy_dyjsww_c1_talent_02_range_01', 'enemy_dyjsww_c1_talent_03_range_01', 'enemy_dyjsww_die_01',
    'enemy_dyjsww_move_begin_01', 'enemy_dyjsww_move_end_01', 'tile_066_grey',
  ]),
  // 假想敌：茧 (BOSS) — attack, 缚网 (Net), 酸雨 (AcidRain), the Evade mask
  enemy_9035_acspider: Object.freeze([
    'enemy_acspider_attack_hit_01', 'enemy_acspider_attack_start_01_l', 'enemy_acspider_attack_start_01_l_2',
    'enemy_acspider_attack_start_01_r', 'enemy_acspider_attack_start_01_r_2', 'enemy_acspider_buff_mask_01',
    'enemy_acspider_skill_01_start_01_l', 'enemy_acspider_skill_01_start_01_l_2',
    'enemy_acspider_skill_01_start_01_r', 'enemy_acspider_skill_01_start_01_r_2',
  ]),
  enemy_9035_acspider_2: Object.freeze([
    'enemy_acspider_attack_hit_02', 'enemy_acspider_attack_start_02_l', 'enemy_acspider_attack_start_02_l_2',
    'enemy_acspider_attack_start_02_r', 'enemy_acspider_attack_start_02_r_2', 'enemy_acspider_buff_mask_01',
    'enemy_acspider_debuff_start_01', 'enemy_acspider_skill_01_start_01_l',
    'enemy_acspider_skill_01_start_01_l_2', 'enemy_acspider_skill_01_start_01_r',
    'enemy_acspider_skill_01_start_01_r_2',
  ]),
  // 假想敌：鳍 (BOSS) — attack, 放电 (Discharge), 强攻 (PowerAtk), 护盾 (ShieldGen), 天气 (Weather)
  enemy_9037_aceel: Object.freeze([
    'enemy_aceel_attack_01_hit', 'enemy_aceel_attack_01_start', 'enemy_aceel_attack_02_hit',
    'enemy_aceel_attack_02_start', 'enemy_aceel_skill_01_shield_buff', 'enemy_aceel_skill_01_shield_end',
    'enemy_aceel_skill_01_shield_start_loop', 'enemy_aceel_skill_02_1_hit', 'enemy_aceel_skill_02_start_01',
    'enemy_aceel_skill_02_start_02_1',
  ]),
  enemy_9037_aceel_2: Object.freeze([
    'enemy_aceel_attack_01_hit', 'enemy_aceel_attack_01_start', 'enemy_aceel_attack_02_hit',
    'enemy_aceel_attack_02_start', 'enemy_aceel_skill_01_shield_buff', 'enemy_aceel_skill_01_shield_end',
    'enemy_aceel_skill_01_shield_start_loop', 'enemy_aceel_skill_02_2_hit', 'enemy_aceel_skill_02_start_02',
    'enemy_aceel_skill_02_start_02_1', 'screen_act3autochess_aceel_weather',
  ]),
  // 萨卡兹子裔链术师 / 组长 — the chain attack's cast and the chain line (projectile_enemy_dkmage)
  enemy_1225_dkmage: Object.freeze([
    'enemy_dkmage_attack_hit_01', 'enemy_dkmage_attack_start_01', 'enemy_dkmage_attack_start_02',
  ]),
  enemy_1225_dkmage_2: Object.freeze([
    'enemy_dkmage_attack_hit_01', 'enemy_dkmage_attack_start_01', 'enemy_dkmage_attack_start_02',
  ]),
  // 萨卡兹子裔轰击者 — the delayed shell (projectile_enemy_dthrow), its blast and die
  enemy_1361_dthrow: Object.freeze([
    'enemy_dthrow_attack_fire_ground', 'enemy_dthrow_attack_hit', 'enemy_dthrow_die',
  ]),
  // 狂暴凶豕兽 — the crash aura (Crash talent loop) and its attack
  enemy_1309_mhboar_2: Object.freeze([
    'enemy_mhboar_attack', 'enemy_mhboar_hit_01', 'enemy_mhboar_hit_02',
  ]),
  // 恶尘源石虫 — the death cloud / explosion (projectile_lrboom's toTargetOnStart) and its attack
  enemy_1424_lrboom: Object.freeze([
    'enemy_lrboom_attack_hit_01', 'enemy_lrboom_attack_start_01', 'enemy_lrboom_die',
  ]),
});

/** The 15 act3-only operators (their index unit keys are the charIds). */
export const REGULATION_FX_OPERATORS = Object.freeze([
  'char_4163_rosesa', 'char_195_glassb', 'char_333_sidero', 'char_135_halo', 'char_218_cuttle',
  'char_4162_cathy', 'char_616_pithst', 'char_4016_kazema', 'char_4054_malist', 'char_4245_alga',
  'char_488_buildr', 'char_341_sntlla', 'char_420_flamtl', 'char_4244_tocka', 'char_1037_amiya3',
]);

/**
 * Enemy kit 'fx' the generated plans do not place, merged into ENEMY_FX_BINDINGS (render/vfx/skills.js).
 *   enemy_2123_dyjsww phase[form2]  the kit's timer switches it to mode M2 (enterForm2) without a castSlot, so the
 *                                   `dyjswwswitch` plan never fires; the official switch clip is enemy_dyjsww_die_01.
 */
export const REGULATION_FX_BINDINGS = Object.freeze({
  enemy_2123_dyjsww: Object.freeze({
    phase: Object.freeze({ xkind: 'form2', owner: 'id', keys: Object.freeze(['enemy_dyjsww_die_01']), once: true }),
  }),
  // 恶尘源石虫's 1 s death fuse: the kit's telegraph is the client's looping enemy_lrboom_die (projectile_lrboom's
  // toTargetOnStart / _effectsToTargetWhenStart), held for the telegraph's own time.
  enemy_1424_lrboom: Object.freeze({
    telegraph: Object.freeze({ xkind: 'lrboom', owner: 'id', keys: Object.freeze(['enemy_lrboom_die']), hold: 'fx' }),
  }),
});

/**
 * Operator kit 'fx' the generated plans do not place, merged into FX_BINDINGS (render/vfx/skills.js).
 *   skchr_kazema_2 summon  风丸's S2 summons the <替身>; the token has no startEffect and the skill plan has no start
 *                          row, so the doll's appearance is kazema_skill_02_start (owner 'skill': the fx names the doll,
 *                          not the caster).
 */
export const REGULATION_SKILL_BINDINGS = Object.freeze({
  skchr_kazema_2: Object.freeze({
    summon: Object.freeze({ owner: 'skill', keys: Object.freeze(['kazema_skill_02_start']), at: 'point', holdS: 1 }),
  }),
});

/**
 * Operator kit fx the skill's official plan already draws, merged into FX_COVER. Each entry names the official loop /
 * start the plan plays at the same moment:
 *   skchr_rosesa_2   saltWard   roresa_skill_02_buff_01 (the skill's loop)
 *   skchr_cathy_2    overclock  cathy_skill_02_buff (the skill's loop)
 *   skchr_flamtl_1   dp         common_charge_cost_start_01 (the S1 start)
 *   skchr_flamtl_2   aoe / dp   flamtl_skill_02_start_01 / _02, _hit_01, common_charge_cost_start_01
 *   skchr_flamtl_3   flame      flamtl_skill_03_buff_01 / _02 (the skill's loops)
 */
export const REGULATION_FX_COVER = Object.freeze({
  skchr_rosesa_2: Object.freeze(['saltWard']),
  skchr_cathy_2: Object.freeze(['overclock']),
  skchr_flamtl_1: Object.freeze(['dp']),
  skchr_flamtl_2: Object.freeze(['aoe', 'dp']),
  skchr_flamtl_3: Object.freeze(['flame']),
});

/** Every roster prefab key (the test pins them against the committed index). */
export const regulationRosterKeys = () => {
  const out = new Set();
  for (const keys of Object.values(REGULATION_FX_ROSTER)) for (const k of keys) out.add(k);
  return out;
};
