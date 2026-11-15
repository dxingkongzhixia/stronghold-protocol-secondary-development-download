// server/sim/content/kits/ops/ver-varkis.js — 摆渡人 (char_4166_varkis), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.1×, three hits. S2 every attack at 1.55× heals 6 % max HP; healing
// beyond full HP becomes a barrier (up to max_hp_ratio × max HP) that drains at dynamic_dec_per_sec after the skill.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_varkis_1';
const S2 = 'skchr_varkis_2';
const BARRIER = 'varkis:barrier';

function varkis(_bb, chess, def) {
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const healRatio = num(b2['attack@hp_ratio']);
  const capRatio = num(b2.max_hp_ratio, 1);
  const dec = num(b2.dynamic_dec_per_sec, 100);
  /** Add `over` to the barrier, capped at capRatio × max HP. */
  const addShield = (battle, unit, over) => {
    const cap = unit.s.maxHp * capRatio;
    const cur = unit.findBuff(BARRIER)?.shield ?? 0;
    const val = Math.min(cap, cur + over);
    if (val > cur + 1e-6) battle.addBuff(unit, { key: BARRIER, shield: val, visible: true, tags: ['skill'] });
  };
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.1), hits: 3 } };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, attack: { atkScale: num(sbb['attack@s2_atk_scale'], 1.55) },
      onAttack({ battle, unit }) {
        if (healRatio > 0) battle.heal(unit, unit, unit.s.maxHp * healRatio, { self: true, tags: ['skill'] });
      },
      onEnd({ battle, unit }) {
        const bar = unit.findBuff(BARRIER);
        if (!bar || !(bar.shield > 0) || !(dec > 0)) return;
        battle.addBuff(unit, {
          key: 'varkis:barrier_decay', interval: 1, duration: Math.ceil(bar.shield / dec), visible: false,
          onTick({ battle: bb, unit: uu }) {
            const cur = uu.findBuff(BARRIER);
            if (!cur) return;
            cur.shield = Math.max(0, (cur.shield || 0) - dec);
            if (!(cur.shield > 0)) bb.removeBuff(uu, BARRIER);
          },
        });
      },
    };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (sid !== S2) return;
      battle.on('heal', (ctx) => {
        if (ctx.target !== unit || !(ctx.amount > 0) || !unit.skill?.active || unit.skill.id !== S2) return;
        const over = ctx.amount - (unit.s.maxHp - unit.hp);
        if (over > 0) addShield(battle, unit, over);
      }, { owner: unit });
    },
  };
}

export default { char_4166_varkis: varkis };
