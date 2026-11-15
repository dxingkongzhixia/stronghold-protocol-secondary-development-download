// server/sim/content/kits/ops/ver-kichi.js — 吉星 (char_4203_kichi), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 attack interval +0.5 s and ATK +15 % per attack, up to 4 stacks. S2 attack
// interval +0.7 s, ATK +45 %, and each attack applies the next of sluggish → bind → stun for 1 s (the shop text's
// 停顿 / 束缚 / 晕眩 order [ASSUMED]).
import { batMod, num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_kichi_1';
const S2 = 'skchr_kichi_2';
const CYCLE = ['sluggish', 'bind', 'stun'];

function kichi(_bb, chess, def) {
  const b1 = chess?.skills?.find((s) => s.skillId === S1)?.bb ?? {};
  const stackAtk = num(b1.atk, 0.15), maxStacks = Math.max(1, Math.floor(num(b1.max_stack_cnt, 4)));
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const cycleDur = Math.max(num(b2['attack@sluggish'], 1), num(b2['attack@unmoveable'], 1), num(b2['attack@stun'], 1));
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return {
      kind: 'duration', duration: rec?.duration,
      mods: { batPct: batMod(num(sbb.base_attack_time), chess) },
      onAttack({ battle, unit }) {
        if (!unit.skill?.active) return;
        const st = Math.min(maxStacks, (unit.mem.kichiStacks ?? 0) + 1);
        if (st === (unit.mem.kichiStacks ?? 0)) return;
        unit.mem.kichiStacks = st;
        battle.addBuff(unit, { key: 'skill:kichi_atk', mods: { atkPct: st * stackAtk }, refresh: 'replace', visible: true });
      },
    };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), batPct: batMod(num(sbb.base_attack_time), chess) },
      onAttack({ battle, unit, targets }) {
        if (!(cycleDur > 0)) return;
        const i = unit.mem.kichiCycle ?? 0;
        unit.mem.kichiCycle = (i + 1) % CYCLE.length;
        const status = CYCLE[i];
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          if (status === 'sluggish') battle.applyStatus(t, 'sluggish', { duration: cycleDur, source: unit });
          else battle.applyStatus(t, status, { duration: cycleDur, source: unit });
        }
      },
    };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_4203_kichi: kichi };
