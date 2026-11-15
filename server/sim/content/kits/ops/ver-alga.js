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
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.25), hits: 2 } };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) },
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
      battle.every(0.5, () => {
        if (!up(unit)) return;
        const elite = eliteAtk > 0 && battle.enemies.some((e) => e.alive && e.side === 'enemy' && bodyInRange(e, unit.rangeKeys) && isElite(e));
        const atkPct = baseAtk + (elite ? eliteAtk : 0);
        for (const a of battle.allyUnits) {
          if (!a.alive || a.side !== 'ally' || cheb(unit, a) > 1) continue;
          battle.addBuff(a, { key: `alga:aura:${unit.id}`, duration: 0.6, refresh: 'replace', source: unit, visible: true, mods: { atkPct } });
        }
      }, { owner: unit });
    },
  };
}

export default { char_4245_alga: alga };
