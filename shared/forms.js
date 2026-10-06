// shared/forms.js — enemy/operator model forms (another clip set of the same skeleton), shared by the client
// renderer (public/js/render/units.js re-exports FORMS for its callers) and the build/sim. tools/build-data.mjs reads
// it to emit `enemies[id].formAttackAnim` ({ [form]: { clip, dur, hit } }), so server/sim/ai.js attackStand can stand
// an enemy for ITS OWN form’s attack clip while `e.form` is set (instead of its base clip).
//
// The catalogue’s own documentation follows.
/**
 * Enemy modes drawn with another clip set of the same skeleton (the `form` of a sim fx — shared/protocol.js fxForm —
 * → UnitView.setForm), per Spine id; the mode's roles override the manifest's (data/assets.json anims), `change` plays
 * once first:
 * - 掠海漂移体 (PRTS: 受晕眩/沉睡/冻结影响后进入爬行模式 — for good) crawls on its *_02 clips after 'Change';
 * - 暴鸰 flies on its bomb-less *_2 clips once its one bomb left (the official prefab's mode S1: Move→Move_2, Idle→Idle_2,
 *   Die→Die_2; user feedback after 0.1.0, D4: the bomb used to stay under the drone — no change clip, the drop is its
 *   Attack clip);
 * - 转译基底·α (user report after 0.1.0, #5): its 2 s change clip A_Die_B / _C / _D, then 寻仇者 B_*, 幽灵 C_* (no attack
 *   clip: it never attacks) or 特战术师 D_* — its manifest roles are the original form's A_Idle / A_Move;
 * - 深池逐火战士 / 精锐战士 / 护卫 (#8): knocked out → 'Die' (the 1 s 重生), the 余烬 on Idle_2 / Move_2 and its death on
 *   Die_2 (also while 'Revive' plays: the ember can still be beaten); standing up again → 'Revive', then the warrior's
 *   manifest clips;
 * - 假想敌：再生: knocked out → A_Die, the 傀儡 on B_Idle / B_Move / B_Die; back → B_Revive, then the A_* manifest clips;
 *   (both: the stand-up clip (`end`) is timed from the 'ember' fx's `dur` to end as the husk stands up — the 'revive'
 *   fx then only lands in the manifest clips);
 * - the leaders' 重生 (sim reborn(): forms 'reborn' → 'form2'): 锏 Revive1, Revive2 held, Revive3, then B_*; 扎罗 A_revive_1 /
 *   _2 / _3, then B_* (its double-hit attack); “复仇者” Revive_Begin / _Loop / _End; 杰斯顿 C1_Die (its 4 s 重生), then
 *   C2_* — their manifests mix the forms (锏 / 扎罗 died on B_Die from the A model, the look of report #5). The closing
 *   clip (`end`) is timed from the 重生's `dur` (the 'telegraph' fx) to end with it, so the second form walks and
 *   attacks on its own clips at once (a view that missed the timing — built mid-重生 — skips the closing clip);
 * - 守墓石像 (forms 'stone' → 'fly'): the statue on Sleep [ASSUMED by name], then the flyer's *_2 clips.
 * - the 傀儡师 operators' <替身> (sim professions.js installDollkeeper: form 'doll' from the start of the switch to it
 *   until the switch back starts, GitHub issue #44): the skeletons draw it on their *_B clips (their own slots — the
 *   本体's are hidden). 归溟幽灵鲨: Start_B fades it in (the 1 s switch), Idle_B (it never attacks), Die_B breaks it
 *   apart over its last second (`end`, timed from the 'substitute' fx's `dur`), the 本体 comes back on Start_2 (`leave`:
 *   played when the form ends); knocked out as the 替身 it collapses on Die_B_2 and stays down so. 风丸: Start_B, then
 *   Idle_B / Attack_B (her 替身 attacks), Die_B; the 本体 comes back on Start. Facing UP: 归溟幽灵鲨's Back skeleton has
 *   only Idle_B and Start_2, 风丸's Start_B, Idle_B and Attack_B — the clips a Back skeleton lacks are skipped; neither has
 *   the 替身's death clip, so a 替身 knocked out lies on the Front model like every knocked-out operator facing UP
 *   (_wantsBack). The sim resets the form right after the 'die' event; the form it died in (`_dieForm`) gives the model
 *   built for the knock-out — and one rebuilt while it is down — the 替身's death clip; it stands up as the 本体.
 * A kind without a clip set of this skeleton (barriers, charges, …) changes nothing. 吉兆飞鳞's 晕眩模式 is its Stun clip.
 */
const loop = (name, via = null) => Object.freeze(via ? { begin: null, loop: name, end: null, via } : { begin: null, loop: name, end: null });
const clipSet = (idle, move, die, attack = null) => Object.freeze({
  idle, deploy: idle, die, move: loop(move),
  attack: attack ? loop(attack, 'attackAny') : null,
  skill: attack ? Object.freeze({ begin: null, loop: attack, end: null, via: 'attack', index: 0, idle: null }) : null,
});
const EMBER = Object.freeze({
  husk: Object.freeze({ change: 'Die', end: 'Revive', next: 'revived', roles: clipSet('Idle_2', 'Move_2', 'Die_2') }),
  revived: Object.freeze({ change: null, roles: Object.freeze({}) }),
});
/** A 重生 held on `hold` (also while the sim reports the rebirth's stun) after `begin`, closing on `end` as the 重生 ends,
 *  then the second form. */
const rebirth = (begin, hold, end, form2 = Object.freeze({})) => Object.freeze({
  reborn: Object.freeze({ change: begin, end, next: 'form2', roles: Object.freeze({ idle: hold, deploy: hold, move: loop(hold), stun: loop(hold), attack: null, skill: null }) }),
  form2: Object.freeze({ change: null, roles: form2 }),
});
const STATUE = Object.freeze({
  stone: Object.freeze({ change: null, roles: Object.freeze({ idle: 'Sleep', deploy: 'Sleep', move: loop('Sleep'), stun: loop('Sleep'), attack: null, skill: null }) }),
  fly: Object.freeze({ change: null, roles: clipSet('Idle_2', 'Move_2', 'Die_2', 'Attack_2') }),
});
const JAKILL2 = clipSet('C2_Idle', 'C2_Move', 'C2_Die', 'C2_Attack');
/** A 傀儡师's 替身 roles: idle `idle`, death `die`, attack `attack` (null: none), no skill clip of its own. */
const dollRoles = (idle, die, attack = null) => Object.freeze({
  idle, deploy: idle, die,
  // `via: 'attackAny'` like clipSet's attacks: the clip is driven per attack (a swing every attack interval), not as a
  // skill-style loop — without it a 替身's attack clip restarts/fights the attack timer and looks jerky
  attack: attack ? Object.freeze({ begin: null, loop: attack, end: null, via: 'attackAny' }) : null,
  attackDown: null, skill: null,
});
export const FORMS = Object.freeze({
  char_1023_ghost2: Object.freeze({
    doll: Object.freeze({ change: 'Start_B', end: 'Die_B', leave: 'Start_2', roles: dollRoles('Idle_B', 'Die_B_2') }),
  }),
  char_4016_kazema: Object.freeze({
    doll: Object.freeze({ change: 'Start_B', leave: 'Start', roles: dollRoles('Idle_B', 'Die_B', 'Attack_B') }),
  }),
  // 结城理 (custom): his skeleton's 替身 clips are the per-skill Doll_Skill_* set (no *_B naming). His kit names the
  // form of the selected skill through `trait.dollForm` / `dollForm2` (S3's second <替身>, 俄耳甫斯) — professions.js
  // reads them per switch, so the view enters exactly the skill's doll.
  char_4217_makoto: Object.freeze({
    // 极速送达 S1: the complete base doll (idle / attack / die / switch)
    doll: Object.freeze({
      change: 'Doll_Skill_1_SwitchIn',
      end: 'Doll_Skill_1_Die',
      leave: 'Start',
      roles: dollRoles('Doll_Skill_1_Idle', 'Doll_Skill_1_Die', 'Doll_Skill_1_Attack'),
    }),
    // 重力自定义 S2: a looping doll that never attacks (the set has no Idle / Attack clip)
    doll2: Object.freeze({
      change: 'Doll_Skill_2_SwitchIn',
      end: 'Doll_Skill_2_Die',
      leave: 'Start',
      roles: dollRoles('Doll_Skill_2_Loop', 'Doll_Skill_2_Die'),
    }),
    // 酸橙的心事 S3, first <替身> (塔纳托斯): the complete P1 set — it has no death clip of its own, it TRANSFORMS
    // (P1toP2_ChangeEnd), which is what the sim does when it is knocked out (dollLives)
    doll3: Object.freeze({
      change: 'Doll_Skill_3_P1_SwitchIn',
      end: 'Doll_Skill_3_P1toP2_ChangeEnd',
      leave: 'Start',
      roles: dollRoles('Doll_Skill_3_P1_Idle', 'Doll_Skill_3_P1toP2_ChangeEnd', 'Doll_Skill_3_P1_Attack_A'),
    }),
    // S3's second <替身> (俄耳甫斯): transformed out of P1 (P1toP2_ChangeEnd lands in the P2 loop), never attacks
    doll3b: Object.freeze({
      change: 'Doll_Skill_3_P1toP2_ChangeEnd',
      end: 'Doll_Skill_3_P2_Die',
      leave: 'Start',
      roles: dollRoles('Doll_Skill_3_P2_Loop', 'Doll_Skill_3_P2_Die'),
    }),
  }),
  enemy_1040_bombd: Object.freeze({
    bombed: Object.freeze({
      roles: Object.freeze({
        idle: 'Idle_2', deploy: 'Idle_2', die: 'Die_2',
        move: Object.freeze({ begin: 'Move_Begin_2', loop: 'Move_Loop_2', end: 'Move_End_2' }),
      }),
    }),
  }),
  enemy_2025_syufo: Object.freeze({
    crawl: Object.freeze({ change: 'Change', roles: clipSet('Idle_02', 'Move_02', 'Die_02', 'Attack_02') }),
  }),
  enemy_10081_mpplai: Object.freeze({
    translator_fuchou: Object.freeze({ change: 'A_Die_B', roles: clipSet('B_Idle', 'B_Move', 'B_Die', 'B_Attack') }),
    translator_youling: Object.freeze({ change: 'A_Die_C', roles: clipSet('C_Idle', 'C_Move', 'C_Die') }),
    translator_shushi: Object.freeze({ change: 'A_Die_D', roles: clipSet('D_Idle', 'D_Move', 'D_Die', 'D_Attack') }),
  }),
  enemy_1288_duskls: EMBER,
  enemy_1288_duskls_2: EMBER,
  enemy_1292_duskld: EMBER,
  enemy_9010_acpupp: Object.freeze({
    husk: Object.freeze({ change: 'A_Die', end: 'B_Revive', next: 'revived', roles: clipSet('B_Idle', 'B_Move', 'B_Die') }),
    revived: Object.freeze({ change: null, roles: Object.freeze({}) }),
  }),
  enemy_1525_blkswb: rebirth('Revive1', 'Revive2', 'Revive3', clipSet('B_Idle', 'B_Move', 'B_Die', 'B_Attack')),
  enemy_1535_wlfmster: rebirth('A_revive_1', 'A_revive_2', 'A_revive_3', clipSet('B_Idle', 'B_Move', 'B_Die', 'B_Attack')),
  enemy_1539_reid: rebirth('Revive_Begin', 'Revive_Loop', 'Revive_End'),
  enemy_1516_jakill: Object.freeze({
    reborn: Object.freeze({ change: 'C1_Die', roles: JAKILL2 }),
    form2: Object.freeze({ change: null, roles: JAKILL2 }),
  }),
  enemy_1172_dugago: STATUE,
  enemy_1172_dugago_2: STATUE,
});
