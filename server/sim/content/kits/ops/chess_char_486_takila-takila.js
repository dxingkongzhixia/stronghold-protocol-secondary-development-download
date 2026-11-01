// server/sim/content/kits/ops/chess_char_486_takila-takila.js — 龙舌兰 (char_486_takila) kit, tier 4 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). 5★ 解放者: professions.js installLibrator owns the branch's
// "no attack / block 0, ATK ramps while the skill is off, reset on end". This kit adds
//   伺机而动 — while no skill runs, every attack he takes is answered by 0.23 × ATK Arts damage;
//   当机立断 S1 — +29 ASPD, attacks ×1.35 (20 s);
//   剑走偏锋 S2 — attacks ×1.7 on up to 3 targets (the charged/蓄力 range, [ASSUMED] the 30 s charged form; the
//     mode's auto-cast never spends a second charge, so the single-cast 2-target 15 s form is not modelled).
// Kit contract: ../README.md.
import { num, talentBb, skillBbOf, onDamagedOn } from '../shared/tier1.js';

const S1 = 'skchr_takila_1';
const S2 = 'skchr_takila_2';

export default {
  chess_char_486_takila_a: (bb, chess, def) => {
    const t = talentBb(chess, 0);
    const s1 = skillBbOf(chess, S1);
    const s2 = skillBbOf(chess, S2);
    return {
      skill: { kind: 'duration', mods: { aspd: num(s1.attack_speed) }, attack: { atkScale: num(s1['attack@atk_scale'], 1.35) } },
      skills: {
        [S1]: { kind: 'duration', mods: { aspd: num(s1.attack_speed) }, attack: { atkScale: num(s1['attack@atk_scale'], 1.35) } },
        [S2]: {
          kind: 'duration',
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null, maxTargets: 2 },
          attack: { atkScale: num(s2['attack@atk_scale'], 1.7) },
          // 蓄力：first cast 15 s / 2 targets, the charged cast 30 s / 3 targets (auto mode alternates the two).
          onStart({ unit, skill }) {
            const charged = unit.mem.takilaCharged === true;
            unit.mem.takilaCharged = !charged;
            if (skill?.spec?.targeting) skill.spec.targeting.maxTargets = charged ? 3 : 2;
            if (charged && skill) skill.timeLeft = num(s2.enhance_duration, 30);
          },
          onEnd({ skill }) { if (skill?.spec?.targeting) skill.spec.targeting.maxTargets = 2; },
        },
      },
      talents: [{
        install(battle, unit) {
          const scale = num(t.atk_scale, 0.23);
          onDamagedOn(battle, unit, (ctx) => {
            if (unit.skill?.active || !ctx.dmg?.isAttack || !ctx.source?.alive) return;
            battle.fx('counter', { x: unit.x, y: unit.y, id: unit.id });
            battle.dealDamage(unit, ctx.source, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['talent', 'takila:counter'] });
          });
        },
      }],
    };
  },
};
