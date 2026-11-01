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
    const noteScales = [b1.atk_scale, b1.atk_scale_2, b1.atk_scale_3, b1.atk_scale_4, b1.atk_scale_5, b1.atk_scale_6, b1.atk_scale_7, b1.atk_scale_8]
      .map((v) => num(v, 0)).filter((v) => v > 0);
    const noteAttack = {
      atkScale: num(b1.atk_scale, 0.8), hits: 8,
      onEachHit({ unit, dmg }) {
        const i = unit.mem.oblvnsNote ?? 0;
        unit.mem.oblvnsNote = i + 1;
        const scale = noteScales[Math.min(i, noteScales.length - 1)] ?? num(b1.atk_scale, 0.8);
        dmg.amount *= scale / num(b1.atk_scale, 0.8); // official 0.80 → 0.04 falloff, other multipliers kept
      },
    };
    const noteStart = ({ unit }) => { unit.mem.oblvnsNote = 0; };
    return {
      skill: { kind: 'instant', onStart: noteStart, attack: noteAttack },
      skills: {
        [S1]: { kind: 'instant', onStart: noteStart, attack: noteAttack },
        [S2]: {
          kind: 'toggle',
          onStart({ battle, unit }) {
            // 钢琴 (initial) ↔ 风琴: the two official tones. 钢琴 +75 % ATK; 风琴 +110 ASPD.
            const organ = !unit.mem.oblvnsOrgan;
            unit.mem.oblvnsOrgan = organ;
            battle.removeBuff(unit, 'oblvns:tone');
            battle.addBuff(unit, {
              key: 'oblvns:tone',
              mods: organ ? { aspd: num(b2['attack@attack_speed'], 110) } : { atkPct: num(b2['attack@atk'], 0.75) },
              tags: ['skill'],
            });
          },
          onEnd({ battle, unit }) { battle.removeBuff(unit, 'oblvns:tone'); },
        },
        [S3]: {
          kind: 'duration',
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null },
          attack: {
            atkScale: 1, hits: 1,
            onEachHit({ battle, unit, dmg }) {
              // 钢琴/风琴各 2 个音符：钢琴追踪法抗最高（物理），风琴追踪防御最高（法术），每个 180 %。
              dmg.amount = 0;
              const foes = battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true }).filter((e) => e.alive && e.side === 'enemy');
              const phys = [...foes].sort((a, b) => (b.s.res ?? 0) - (a.s.res ?? 0))[0];
              const arts = [...foes].sort((a, b) => (b.s.def ?? 0) - (a.s.def ?? 0))[0];
              for (let n = 0; n < 2; n++) {
                if (phys) battle.dealDamage(unit, phys, { amount: unit.s.atk * num(b3['attack@atk_scale'], 1.8), type: 'phys', isSkill: true, tags: ['skill', 'oblvns:piano'] });
                if (arts) battle.dealDamage(unit, arts, { amount: unit.s.atk * num(b3['attack@atk_scale'], 1.8), type: 'arts', isSkill: true, tags: ['skill', 'oblvns:organ'] });
              }
            },
          },
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
