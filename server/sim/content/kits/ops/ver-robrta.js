// server/sim/content/kits/ops/ver-robrta.js — 罗比菈塔 (char_484_robrta), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK / DEF +22 %. S2 stops attacking, block +1, DEF +35 %, and when it ends she
// gives a melee ally the 造型仪: DEF +33 % and a shield for 25 s (the token_10018 device itself is not spawned [ASSUMED]).
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_robrta_1';
const S2 = 'skchr_robrta_2';

function robrta(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const deviceDef = 0.33, deviceDur = 25, devices = Math.max(0, Math.floor(num(t0.cnt, 3)));
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { blockCnt: num(sbb.block_cnt), defPct: num(sbb.def) },
      attack: { noAttack: true },
      onEnd({ battle, unit }) {
        if (!(devices > 0) || !unit.alive) return;
        const melee = battle.allyUnits
          .filter((a) => a !== unit && a.alive && a.ground && a.def?.profession !== 'MEDIC' && a.def?.profession !== 'CASTER')
          .sort((a, b) => b.s.def - a.s.def)[0];
        if (!melee) return;
        battle.addBuff(melee, { key: `robrta:device:${unit.id}`, duration: deviceDur, refresh: 'replace', source: unit, visible: true, mods: { defPct: deviceDef }, shield: melee.s.maxHp * 0.5 });
        battle.fx('shield', { x: melee.x, y: melee.y, id: melee.id });
      },
    };
    if (id === S1) return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk), defPct: num(sbb.def) } };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_484_robrta: robrta };
