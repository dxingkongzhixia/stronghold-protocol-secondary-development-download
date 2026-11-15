// server/sim/content/kits/ops/ver-astesi.js — 星极 (char_274_astesi), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +30 % / DEF +45 %; S2 the same plus block +1 and every attack hits all
// enemies she blocks. Talent: attack speed +3 every 20 s on the field, up to 5 stacks.
import { num, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_astesi_2';

function astesi(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const interval = num(t0.interval, 20), maxStacks = Math.max(1, Math.floor(num(t0.max_stack_cnt, 5))), per = num(t0.attack_speed, 3);
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), defPct: num(sbb.def), blockCnt: num(sbb.block_cnt) },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk), defPct: num(sbb.def) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (sid === S2) {
        battle.on('beforeAttack', (ctx) => {
          if (ctx.attacker !== unit || !unit.skill?.active || unit.skill.id !== S2) return;
          const list = (unit.blocking || []).filter((e) => e?.alive);
          if (list.length) ctx.targets = list;
        }, { owner: unit });
      }
      if (interval > 0 && per > 0) {
        battle.every(interval, (b) => {
          if (!up(unit)) return;
          const st = Math.min(maxStacks, (unit.mem.astesiStacks ?? 0) + 1);
          if (st === (unit.mem.astesiStacks ?? 0)) return;
          unit.mem.astesiStacks = st;
          b.addBuff(unit, { key: 'talent:astesi', mods: { aspd: st * per }, refresh: 'replace', visible: true });
        }, { owner: unit });
      }
    },
  };
}

export default { char_274_astesi: astesi };
