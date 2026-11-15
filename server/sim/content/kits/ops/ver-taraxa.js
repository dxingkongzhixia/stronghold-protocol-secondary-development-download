// server/sim/content/kits/ops/ver-taraxa.js — 风絮 (char_4222_taraxa), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 takes off and heals much faster (a shorter interval), 45 % ATK a heal. S2 takes
// off with ATK +80 %, heals two targets (the extra flying-ally target and the 2-unit splash are approximated by the
// second target [ASSUMED]). Talent: flying allies in her range take 12 % less damage and block +1.
import { batMod, num } from '../shared/tier1.js';
import { descOf, kitSkills } from '../shared/version.js';
import { bodyInRange } from '../../../body.js';

const S2 = 'skchr_taraxa_2';
const LIFTOFF_FLAGS = Object.freeze({ blockFly: true, liftoff: true });

function takeOff({ battle, unit }) {
  battle.releaseBlocked(unit);
  battle.fx('takeoff', { x: unit.x, y: unit.y, id: unit.id });
}
function land({ battle, unit }) {
  battle.releaseBlocked(unit);
}

function taraxa(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const shield = num(t0.damage_resistance, 0.12), block = num(t0.block_cnt, 1);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, heal: true,
      mods: { atkPct: num(sbb['attack@atk']) },
      attack: { healScale: num(sbb['attack@heal_scale'], 1), maxTargets: 2 },
      flags: LIFTOFF_FLAGS, onStart: takeOff, onEnd: land,
    };
    return {
      kind: 'duration', duration: rec?.duration, heal: true,
      mods: { batPct: batMod(num(sbb['attack@base_attack_time']), chess, descOf(rec)) },
      attack: { healScale: num(sbb['attack@heal_scale'], 0.45) },
      flags: LIFTOFF_FLAGS, onStart: takeOff, onEnd: land,
    };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(shield > 0) && !(block > 0)) return;
      battle.every(0.5, (b) => {
        if (!unit.alive) return;
        for (const a of b.allyUnits) {
          if (!a.alive || a === unit || !a.isFlying || !bodyInRange(a, unit.rangeKeys)) continue;
          b.addBuff(a, {
            key: `taraxa:aura:${unit.id}`, duration: 0.6, refresh: 'replace', source: unit, visible: true,
            mods: { dmgTakenMul: Math.max(0, 1 - shield), ...(block > 0 ? { blockCnt: block } : {}) },
          });
        }
      }, { owner: unit });
    },
  };
}

export default { char_4222_taraxa: taraxa };
