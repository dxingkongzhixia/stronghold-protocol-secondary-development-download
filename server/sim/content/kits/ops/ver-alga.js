// server/sim/content/kits/ops/ver-alga.js — 奥尔加 (char_4245_alga), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.25×, two hits. S2 ATK +40 % for 15 s and every attack adds taunt
// and sluggish for attack@debuff_duration s. Talent: allies on the 8 surrounding tiles get ATK +5 %, +7 % more while an
// elite or boss enemy stands in her attack range.
import { bodyInRange } from '../../../body.js';
import { cheb, num, up } from '../shared/tier1.js';
import { isElite } from '../shared/tier6.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_alga_1';
const S2 = 'skchr_alga_2';

function alga(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const baseAtk = num(t0['alga[atk_up].atk'], 0.05), eliteAtk = num(t0['alga[check_enemy].atk'], 0.07);
  // 只为我的答案 "天赋效果提升至1.4倍" (the skill's own blackboard `talent_scale`)
  const talentScale = num(chess?.skills?.find((s) => s.skillId === S2)?.bb?.talent_scale, 1);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.25), hits: 2 } };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) },
      // "攻击距离延长": the skill's own range (the data grid), not her normal one
      ...(Array.isArray(rec?.rangeGrid) && rec.rangeGrid.length ? { targeting: { rangeGrid: rec.rangeGrid.map((p) => [p[0], p[1]]) } } : {}),
      onAttack({ battle, unit, targets }) {
        const dur = num(sbb['attack@debuff_duration'], 2), taunt = num(sbb['attack@taunt_level'], 1);
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          battle.applyStatus(t, 'sluggish', { duration: dur, source: unit });
          if (taunt > 0) battle.addBuff(t, { key: `alga:taunt:${unit.id}`, duration: dur, refresh: 'replace', source: unit, visible: true, mods: { taunt } });
        }
      },
    };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(baseAtk > 0)) return;
      // 先声夺人: "自身攻击范围内存在精英及领袖敌人时 … 自身优先攻击攻击力最高的精英及领袖敌人". The blocked enemy
      // keeps the first slot (PRTS 索敌 阻挡 → 特殊优先级); otherwise the highest-ATK elite / boss in range takes it.
      battle.on('beforeAttack', (c) => {
        if (c.attacker !== unit) return;
        const cur = (c.targets || []).filter((e) => e && e.alive);
        if (!cur.length || cur.some((e) => e.blockedBy === unit)) return;
        let best = null;
        for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, c.profile)) {
          if (!isElite(e)) continue;
          if (!best || e.s.atk > best.s.atk) best = e;
        }
        if (!best || cur[0] === best) return;
        // keep the attack's target count: the best elite replaces the lowest-priority pick
        const rest = cur.filter((e) => e !== best);
        c.targets = [best, ...rest].slice(0, cur.length);
      }, { owner: unit });
      battle.every(0.5, () => {
        if (!up(unit)) return;
        const elite = eliteAtk > 0 && battle.enemies.some((e) => e.alive && e.side === 'enemy' && bodyInRange(e, unit.rangeKeys) && isElite(e));
        const scale = unit.skill?.active && unit.skill.id === S2 ? talentScale : 1;
        const atkPct = (baseAtk + (elite ? eliteAtk : 0)) * scale;
        for (const a of battle.allyUnits) {
          if (!a.alive || a.side !== 'ally' || cheb(unit, a) > 1) continue;
          battle.addBuff(a, { key: `alga:aura:${unit.id}`, duration: 0.6, refresh: 'replace', source: unit, visible: true, mods: { atkPct } });
        }
      }, { owner: unit });
    },
  };
}

export default { char_4245_alga: alga };
