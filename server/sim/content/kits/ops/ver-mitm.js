// server/sim/content/kits/ops/ver-mitm.js — 渡桥 (char_4147_mitm), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 +6 DP and 樱桃三号 self-destructs for 320 % of ATK around itself (the token is
// not spawned: the blast is centred on 渡桥 [ASSUMED]). S2 ATK +45 % and 12 DP over the duration, 1 each 1.25 s.
import { cheb, num, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_mitm_1';
const S2 = 'skchr_mitm_2';

function mitm(_bb, chess, def) {
  const b1 = chess?.skills?.find((s) => s.skillId === S1)?.bb ?? {};
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const blast = num(b1.aoe_damage_scale, 3.2);
  const dpTotal = num(b2['mitm_s_2[cost].display'], 12), dpEach = num(b2['mitm_s_2[cost].cost'], 1);
  const dpIv = Math.max(0.1, num(b2['mitm_s_2[cost].interval'], 1.25));
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return {
      kind: 'instant',
      onStart({ battle, unit }) {
        const cost = num(sbb.cost);
        if (cost > 0) battle.addDp(unit.ownerId, cost);
        if (!(blast > 0)) return;
        for (const e of battle.enemies) {
          if (!e.alive || e.side !== 'enemy' || cheb(unit, e) > 1) continue;
          battle.dealDamage(unit, e, { amount: unit.s.atk * blast, type: 'phys', isSkill: true, tags: ['skill'] });
        }
        battle.fx('aoe', { x: unit.x, y: unit.y, radius: 1.5, id: unit.id, skill: 'mitm' });
      },
    };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) },
      onStart({ battle, unit }) {
        if (!(dpTotal > 0) || !(dpEach > 0)) return;
        let left = dpTotal;
        battle.every(dpIv, (b) => {
          if (!up(unit) || !unit.skill?.active || unit.skill.id !== S2 || left <= 0) return;
          const n = Math.min(dpEach, left);
          left -= n;
          b.addDp(unit.ownerId, n);
        }, { owner: unit });
      },
    };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_4147_mitm: mitm };
