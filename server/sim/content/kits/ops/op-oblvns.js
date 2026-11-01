// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns), 6★ 近卫·领主, Ave Mujica collab.
// Owner override 2026-11-01: collab operators are normally excluded from the 6★ 自选 pool (DIY_EXCLUDED_TEAMS); the
// owner asked for her there, with official prefab FX.
//
// Implemented from her official blackboards:
//   T1 颂乐音符 — each attack adds a note stack (max `max_cnt`), refreshing ~1 s: per stack she ignores
//      `def_penetrate_ratio` DEF / `magic_resist_penetrate_ratio` RES (Ave Mujica members share it in the official
//      text; this port applies it to herself).
//   T2 毋畏遗忘 — allies in range get `attack_speed` ASPD. (Fever bookkeeping is not modelled in this port.)
//   S1 — 8 notes for ×atk_scale... (the official 0.80 → 0.04 falloff is [ASSUMED] flattened to ×atk_scale × 8 hits).
//   S2 — a toggle skill: piano mode gives +`attack@atk` ATK (the organ mode's +`attack@attack_speed` ASPD is the other
//      toggle state in the official client; this port keeps the piano state).
//   S3 — range from data, two notes ×`attack@atk_scale` (physical + Arts; [ASSUMED] both hit the same target here).
// The official prefab art (notes/tones) is wired independently by the client's fx data.
// Kit contract: ../README.md.
import { num, talentBb, skillRec, statBuff, installAura } from '../shared/tier1.js';

const S1 = 'skchr_oblvns_1', S2 = 'skchr_oblvns_2', S3 = 'skchr_oblvns_3';
const bbOf = (raw, id) => skillRec(raw, id)?.bb ?? {};

export default {
  char_4182_oblvns: (bb, raw, def) => {
    const t1 = talentBb(raw, 0), t2 = talentBb(raw, 1);
    const b1 = bbOf(raw, S1), b2 = bbOf(raw, S2), b3 = bbOf(raw, S3);
    return {
      skill: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 0.8), hits: 8 } },
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 0.8), hits: 8 } },
        [S2]: { kind: 'toggle', mods: { atkPct: num(b2['attack@atk'], 0.75) } },
        [S3]: {
          kind: 'duration',
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null },
          attack: { atkScale: num(b3['attack@atk_scale'], 1.8), hits: 2 },
        },
      },
      talents: [{
        install(battle, unit) {
          const perDef = num(t1.def_penetrate_ratio, 0.03), perRes = num(t1.magic_resist_penetrate_ratio, 0.02);
          const max = num(t1.max_cnt, 10);
          let stacks = 0;
          const sync = () => {
            battle.removeBuff(unit, 'talent:oblvns');
            if (stacks > 0) statBuff(battle, unit, 'talent:oblvns', { defIgnorePct: perDef * stacks, resIgnorePct: perRes * stacks });
          };
          battle.on('damaged', (ctx) => {
            if (ctx.source !== unit || ctx.target?.side !== 'enemy') return;
            stacks = Math.min(max, stacks + 1);
            sync();
            battle.addBuff(unit, { key: 'oblvns:note', duration: 1.1, tags: ['talent'] });
          }, { owner: unit });
          battle.every(0.5, () => {
            if (!unit.findBuff('oblvns:note') && stacks) { stacks = 0; sync(); }
          }, { owner: unit });
          installAura(battle, unit, {
            key: 'talent:oblvns:aspd', select: (a) => a !== unit, mods: { aspd: num(t2.attack_speed, 16) }, value: 0,
          });
        },
      }],
    };
  },
};
