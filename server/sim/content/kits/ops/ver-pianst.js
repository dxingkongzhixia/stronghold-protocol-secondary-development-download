// server/sim/content/kits/ops/ver-pianst.js — 车尔尼 (char_4047_pianst), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +35 %, RES ×(1+magic_resistance). S2 +50 % max HP, taunt, and every attack
// received adds ATK +20 % (10 stacks); on end, every enemy around him takes 170 % of his ATK as arts. Talent: RES +10,
// and an arts attack against him is answered with an 85 % arts counter.
import { cheb, num, onDamagedOn, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_pianst_1';
const S2 = 'skchr_pianst_2';

function pianst(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const resFlat = num(t0.magic_resistance), counterScale = num(t0.atk_scale, 0.85);
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const maxStacks = Math.max(1, Math.floor(num(b2.max_stack_cnt, 10)));
  const perStack = num(b2.atk, 0.2), finisher = num(b2.atk_scale, 1.7);
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { hpPct: num(sbb.max_hp), taunt: num(sbb.taunt_level) },
      onEnd({ battle, unit }) {
        if (!up(unit) || !(finisher > 0)) return;
        for (const e of battle.enemies) {
          if (!e.alive || e.side !== 'enemy' || cheb(unit, e) > 1) continue;
          battle.dealDamage(unit, e, { amount: unit.s.atk * finisher, type: 'arts', isSkill: true, tags: ['skill'] });
        }
        battle.fx('aoe', { x: unit.x, y: unit.y, radius: 1.5, id: unit.id, skill: 'pianst' });
      },
    };
    if (id === S1) return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk), resMul: 1 + num(sbb.magic_resistance) } };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (resFlat) battle.addBuff(unit, { key: 'talent:pianst_res', mods: { resFlat: resFlat } });
      if (counterScale > 0) onDamagedOn(battle, unit, (ctx) => {
        if (!ctx.dmg || ctx.dmg.type !== 'arts' || !up(unit)) return;
        const src = ctx.source;
        if (src?.alive) battle.dealDamage(unit, src, { amount: unit.s.atk * counterScale, type: 'arts', isSkill: true, canDodge: false, tags: ['counter'] });
      });
      if (sid !== S2 || !(perStack > 0)) return;
      onDamagedOn(battle, unit, (ctx) => {
        if (!ctx.dmg?.isAttack || !up(unit) || !unit.skill?.active || unit.skill.id !== S2) return;
        const st = Math.min(maxStacks, (unit.mem.pianstStacks ?? 0) + 1);
        if (st === (unit.mem.pianstStacks ?? 0)) return;
        unit.mem.pianstStacks = st;
        battle.addBuff(unit, { key: 'skill:pianst_atk', mods: { atkPct: st * perStack }, refresh: 'replace', visible: true });
      });
    },
  };
}

export default { char_4047_pianst: pianst };
