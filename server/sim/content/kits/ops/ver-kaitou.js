// server/sim/content/kits/ops/ver-kaitou.js — 折光 (char_499_kaitou), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +60 %, attacks apply 10 % of ATK as 凋亡损伤 (apoptosis gauge) and a burst
// target takes 30 % of ATK extra elemental damage. S2 attack speed +55, two targets, 50 % extra elemental on burst
// targets. Talent: ATK +13 % while an enemy in range is in apoptosis burst.
import { num, onHitBy, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';
import { elementHit } from '../shared/tier5.js';

const S1 = 'skchr_kaitou_1';
const S2 = 'skchr_kaitou_2';

function kaitou(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const talentAtk = num(t0.atk, 0.13);
  const b1 = chess?.skills?.find((s) => s.skillId === S1)?.bb ?? {};
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const ep1 = num(b1['attack@ep_damage_ratio'], 0.1), ex1 = num(b1['attack@extra_ep_damage_scale'], 0.3);
  const ex2 = num(b2['attack@extra_ep_damage_scale'], 0.5);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { aspd: num(sbb.attack_speed) },
      attack: { maxTargets: 2 },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      onHitBy(battle, unit, ({ target, dmg }) => {
        if (!dmg?.isAttack || !target?.alive || !up(unit) || !unit.skill?.active) return;
        const id = unit.skill.id;
        if (id !== S1 && id !== S2) return;
        if (id === S1 && ep1 > 0) battle.dealDamage(unit, target, { amount: unit.s.atk * ep1, type: 'element', element: 'apoptosis', tags: ['skill', 'apoptosis'] });
        const extra = id === S1 ? ex1 : ex2;
        if (extra > 0 && target.findBuff('apoptosisBurst')) elementHit(battle, unit, target, unit.s.atk * extra, 'kaitou', 'apoptosis');
      });
      if (talentAtk > 0) {
        battle.every(0.5, (b) => {
          if (!up(unit)) return;
          const any = b.enemies.some((e) => e.alive && e.side === 'enemy' && e.findBuff('apoptosisBurst') && unit.rangeKeySet?.has?.(Math.round(e.y) * 12 + Math.round(e.x)));
          if (any) b.addBuff(unit, { key: 'talent:kaitou_atk', mods: { atkPct: talentAtk }, refresh: 'replace', visible: true });
          else b.removeBuff(unit, 'talent:kaitou_atk');
        }, { owner: unit });
      }
    },
  };
}

export default { char_499_kaitou: kaitou };
