// server/sim/content/kits/ops/chess_char_1027_greyy2-greyy2.js — 承曦格雷伊 (char_1027_greyy2) kit, tier 5 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). 5★ 投掷手: the bombarder branch's two-hit aftershock lives
// in professions.js; this kit adds
//   窃光链缚 — a main hit has a 40 % chance to slow the target for 2 s;
//   迅捷打击·γ型 S1 — +27 % ATK, +25 ASPD for 35 s;
//   晨曦信标 S2 — throw a lightning orb at the target's tile: every 1.5 s for 8 s it deals 0.95 × ATK Arts damage
//     to enemies within 1.1 tiles, 40 % chance of a 1.4 s slow. The mode's auto-cast spends one cast at a time
//     (the official 2 charges are not modelled by the chess record).
// Kit contract: ../README.md.
import { num, talentBb, skillBbOf, onHitOn, isMainHit, RING1 } from '../shared/tier1.js';

const S1 = 'skcom_quickattack[3]';
const S2 = 'skchr_greyy2_2';

export default {
  chess_char_1027_greyy2_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const s1 = skillBbOf(chess, S1);
    const s2 = skillBbOf(chess, S2);
    return {
      skill: { kind: 'duration', mods: { atkPct: num(s1.atk), aspd: num(s1.attack_speed) } },
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(s1.atk), aspd: num(s1.attack_speed) } },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const target = battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })[0] ?? unit;
            const x = target.x, y = target.y;
            const scale = num(s2.atk_scale, 0.95);
            const prob = num(s2.prob, 0.4);
            const slow = num(s2.sluggish, 1.4);
            // The official 承曦格雷伊 prefab (skill_02_start / trail / range / hit) is the only visual: the pulse below
            // deals the damage and applies the slow, but emits no `zone` field of its own (no doubled ground layer).
            const duration = num(s2.projectile_delay_time, 8);
            const interval = num(s2.interval, 1.5);
            const total = Math.max(1, Math.round(duration / interval));
            let n = 0;
            battle.every(interval, (b, sc) => {
              for (const e of b.enemies) {
                if (!e.alive) continue;
                const dx = e.x - x, dy = e.y - y;
                if (dx * dx + dy * dy > RING1 * RING1) continue;
                b.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'greyy2:orb'] });
                if (b.rng.chance(prob)) b.applyStatus(e, 'sluggish', { duration: slow, source: unit });
              }
              if (++n >= total) sc.cancel();
            }, { immediate: true, owner: unit });
          },
        },
      },
      talents: [{
        install(battle, unit) {
          const prob = num(t['attack@prob'], 0.4);
          const slow = num(t['attack@sluggish'], 2);
          onHitOn(battle, unit, ({ target, dmg }) => {
            if (!isMainHit(dmg) || !target?.alive || !battle.rng.chance(prob)) return;
            battle.applyStatus(target, 'sluggish', { duration: slow, source: unit });
          });
        },
      }],
    };
  },
};
