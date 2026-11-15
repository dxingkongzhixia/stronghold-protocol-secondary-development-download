// server/sim/content/kits/ops/ver-turdus.js — 乌啾 (char_4224_turdus), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 attack speed +40 and one extra chain jump. S2 loses 15 % of current HP, heals at
// once, and for 10 s every ally it heals gets a 20 %-ATK regen a second and camouflage for 10 s.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_turdus_2';

function turdus(_bb, chess, def) {
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const regenScale = num(b2['turdus_s2[continues_heal].heal_scale'], 0.2);
  const buffDur = num(b2.bonus_duration, 10);
  const selfLoss = num(b2['turdus_s2[self_damage].hp_ratio'], 0.15);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'instant', heal: true,
      onStart({ battle, unit }) {
        if (selfLoss > 0 && unit.alive) battle.loseHp(unit, unit.hp * selfLoss, { source: unit, tags: ['skill'] });
        unit.mem.turdusUntil = battle.time + buffDur;
      },
    };
    return {
      kind: 'duration', duration: rec?.duration,
      mods: { aspd: num(sbb.attack_speed) },
      onStart({ unit }) {
        const h = unit.profile?.heal;
        if (!h) return;
        unit.mem.turdusHeal = h;
        unit.profile.heal = { ...h, count: Math.max(1, h.count || 3) + Math.max(0, Math.floor(num(sbb['attack@chain.extra_value'], 1))) };
      },
      onEnd({ unit }) {
        if (unit.mem.turdusHeal) { unit.profile.heal = unit.mem.turdusHeal; unit.mem.turdusHeal = null; }
      },
    };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(regenScale > 0) || !(buffDur > 0)) return;
      battle.on('heal', (ctx) => {
        if (ctx.source !== unit || !(ctx.amount > 0) || battle.time > (unit.mem.turdusUntil ?? -1)) return;
        const t = ctx.target;
        if (!t?.alive) return;
        battle.addBuff(t, {
          key: `turdus:regen:${unit.id}`, duration: buffDur, interval: 1, refresh: 'replace', source: unit, visible: true,
          onTick({ battle: b, unit: u }) { if (u.alive) b.heal(unit, u, unit.s.atk * regenScale); },
        });
        battle.applyStatus(t, 'camou', { duration: buffDur, source: unit });
      }, { owner: unit });
    },
  };
}

export default { char_4224_turdus: turdus };
