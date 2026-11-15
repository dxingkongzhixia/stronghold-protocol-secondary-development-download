// server/sim/content/kits/ops/ver-aosta.js — 奥斯汀 (char_346_aosta), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +27 % / AS +25; S2 a longer attack interval, ATK +35 %, every attack binds
// its target 1 s, and the talent's bleed doubles (talent_scale 2). Talent: attacks bleed enemies that are not blocked,
// 14 % of ATK a second for 3 s.
import { batMod, num, onHitBy, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_aosta_2';

function aosta(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const bleedScale = num(t0.atk_scale, 0.14), bleedDur = num(t0.duration, 3);
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const talentScale = num(b2.talent_scale, 2);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), batPct: batMod(num(sbb.base_attack_time), chess) },
      onAttack({ battle, unit, targets }) {
        const dur = num(sbb['attack@frozen_duration'], 1);
        if (!(dur > 0)) return;
        for (const t of targets || []) if (t?.alive && t.side === 'enemy') battle.applyStatus(t, 'bind', { duration: dur, source: unit });
      },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk), aspd: num(sbb.attack_speed) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(bleedScale > 0) || !(bleedDur > 0)) return;
      onHitBy(battle, unit, ({ target, dmg }) => {
        if (!dmg?.isAttack || !target?.alive || target.blockedBy) return;
        const scale = bleedScale * (unit.skill?.active && unit.skill.id === S2 ? talentScale : 1);
        battle.addBuff(target, {
          key: `aosta:bleed:${unit.id}`, duration: bleedDur, interval: 1, refresh: 'replace', source: unit, visible: true,
          onTick({ battle: b, unit: tgt }) { if (up(unit)) b.dealDamage(unit, tgt, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['bleed'] }); },
        });
      });
    },
  };
}

export default { char_346_aosta: aosta };
