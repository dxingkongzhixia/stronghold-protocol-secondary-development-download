// server/sim/content/kits/ops/ver-buildr.js — 青枳 (char_488_buildr), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 +12 DP. S2 +10 DP, ATK +10 % / DEF +40 % for 15 s; from its second use the
// duration does not end and it grants 1 DP every 4.5 s (buildr_s_2[b]). Talent: after 30 s on the field, +18 % max HP.
import { num, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skcom_charge_cost[3]';
const S2 = 'skchr_buildr_2';

function buildr(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const hpPct = num(t0.max_hp, 0.18), talentAt = num(t0.interval, 30);
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const tickDp = num(b2['buildr_s_2[b].cost'], 1), tickIv = num(b2['buildr_s_2[b].interval'], 4.5);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return {
      kind: 'instant',
      onStart({ battle, unit }) { const n = num(sbb.cost); if (n > 0) battle.addDp(unit.ownerId, n); },
    };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), defPct: num(sbb.def) },
      onStart({ battle, unit, skill: sk }) {
        const first = num(sbb.cost);
        if (first > 0) battle.addDp(unit.ownerId, first);
        const uses = (unit.mem.buildrUses ?? 0) + 1;
        unit.mem.buildrUses = uses;
        if (uses < 2 || !(tickDp > 0) || !(tickIv > 0)) return;
        // second and later: infinite duration, one DP every interval while it runs
        sk.timeLeft = Infinity;
        battle.every(tickIv, (b) => {
          if (!up(unit) || !unit.skill?.active || unit.skill.id !== S2) return;
          b.addDp(unit.ownerId, tickDp);
        }, { owner: unit });
      },
    };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(hpPct > 0) || !(talentAt > 0)) return;
      battle.after(talentAt, (b) => {
        if (!up(unit)) return;
        b.addBuff(unit, { key: 'talent:buildr_hp', mods: { hpPct }, refresh: 'replace', visible: true });
      }, { owner: unit });
    },
  };
}

export default { char_488_buildr: buildr };
