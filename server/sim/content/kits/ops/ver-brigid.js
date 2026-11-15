// server/sim/content/kits/ops/ver-brigid.js — 水灯心 (char_4177_brigid), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 1.1×, two hits (the boomerang's bounce is not modelled [ASSUMED]);
// S2 ATK +20 % and every attack is an extra slash that slows (停顿) for 1 s. Talent: after 20 damage instances she gains
// 38 % physical dodge.
import { num, onHitBy, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_brigid_2';

function brigid(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const need = Math.max(1, Math.floor(num(t0.trigger_damage_count, 20))), dodge = num(t0.prob, 0.38);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) }, attack: { hits: 2 },
      onAttack({ battle, unit, targets }) {
        const dur = num(sbb['attack@sluggish'], 1);
        if (!(dur > 0)) return;
        for (const t of targets || []) if (t?.alive && t.side === 'enemy') battle.applyStatus(t, 'sluggish', { duration: dur, source: unit });
      },
    };
    return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.1), hits: Math.max(1, Math.floor(num(sbb.times, 2))) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(need > 0) || !(dodge > 0)) return;
      onHitBy(battle, unit, ({ dmg }) => {
        if (!dmg || dmg.cancel || !up(unit) || unit.mem.brigidDodge) return;
        const n = (unit.mem.brigidHits ?? 0) + 1;
        unit.mem.brigidHits = n;
        if (n >= need) {
          unit.mem.brigidDodge = true;
          battle.addBuff(unit, { key: 'talent:brigid_dodge', mods: { dodgePhys: dodge }, visible: true });
        }
      });
    },
  };
}

export default { char_4177_brigid: brigid };
