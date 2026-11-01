// server/sim/content/kits/ops/op-dminon.js — 国度 (char_4246_dminon), 6★ 潜伏者 (stalker), event 6★ (SPCE) of the
// 2026-11-01 client. Data: character_table / skill_table 26-11-01, no module. The 潜伏者 branch (all enemies in range,
// 50 % physical/Arts dodge, low taunt) is professions.js.
//
//   T1 实质坍缩 — “国度” is her attack range: ground enemies on it lose `attack_speed` ASPD and take `atk_scale` × ATK
//      Arts per second.
//   T2 此身为界 — when she leaves the field, every ground enemy on “国度” takes `atk_scale` × ATK Arts and is stunned
//      for `stun` s; the country is cleared.
//   S1 — attack_speed; the first time an enemy steps on “国度” it is slowed for `sluggish` s.
//   S2 — range grows (`customRangeGrid` from data), ATK +atk; [ASSUMED] “no dodge on the country” is not modelled (the
//      engine has no per-tile dodge switch); the second and later casts would keep the skill endless and +attack_speed,
//      which this port does not model either.
//   S3 — range grows, ATK +atk, ASPD +attack_speed, every enemy on “国度” is attacked; a ground enemy hit on the
//      country spreads it to the four tiles around its attacker and takes `attack@aoe_atk_scale` × ATK physical (once
//      per `attack@cd` s); the spread resets when the skill ends.
// Kit contract: ../README.md.
import { num, talentBb, skillRec, up } from '../shared/tier1.js';
import { COLS } from '../../../constants.js';

const S1 = 'skchr_dminon_1', S2 = 'skchr_dminon_2', S3 = 'skchr_dminon_3';
const bbOf = (raw, id) => skillRec(raw, id)?.bb ?? {};
const tileKey = (r, c) => r * COLS + c;

export default {
  char_4246_dminon: (bb, raw, def) => {
    const t1 = talentBb(raw, 0), t2 = talentBb(raw, 1);
    const b1 = bbOf(raw, S1), b2 = bbOf(raw, S2), b3 = bbOf(raw, S3);
    const extra = new Set(); // S3-spread country tiles
    const country = (unit) => {
      const keys = new Set(unit.rangeKeySet ?? []);
      for (const k of extra) keys.add(k);
      return keys;
    };
    const onCountry = (unit, e) => country(unit).has(tileKey(Math.round(e.y), Math.round(e.x)));
    return {
      skills: {
        [S1]: {
          kind: 'duration', mods: { aspd: num(b1.attack_speed) },
          onStart({ battle, unit }) {
            const seen = new Set();
            battle.every(0.2, (b) => {
              for (const e of b.enemies) {
                if (!e.alive || e.isFlying || seen.has(e.id) || !onCountry(unit, e)) continue;
                seen.add(e.id);
                b.applyStatus(e, 'sluggish', { duration: num(b1.sluggish, 4), source: unit });
              }
            }, { owner: unit });
          },
        },
        [S2]: {
          kind: 'duration',
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null },
          mods: { atkPct: num(b2.atk) },
        },
        [S3]: {
          kind: 'duration',
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null, maxTargets: 99 },
          mods: { atkPct: num(b3.atk), aspd: num(b3.attack_speed) },
          onStart({ battle, unit }) {
            let last = -1e9;
            battle.on('damaged', (ctx) => {
              const e = ctx.target, src = ctx.source;
              if (!e?.alive || e.side !== 'enemy' || !src?.alive || src.side !== 'enemy' || src.isFlying) return;
              if (unit.skill?.id !== S3 || !unit.skill.active) return;
              if (!onCountry(unit, e) || battle.time - last < num(b3['attack@cd'], 0.5)) return;
              last = battle.time;
              const [r, c] = [Math.round(src.y), Math.round(src.x)];
              for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (battle.grid.inRect(r + dr, c + dc)) extra.add(tileKey(r + dr, c + dc));
              }
              battle.dealDamage(unit, src, { amount: unit.s.atk * num(b3['attack@aoe_atk_scale'], 0.6), type: 'phys', isSkill: true, tags: ['skill', 'dminon:spread'] });
            }, { owner: unit });
          },
          onEnd() { extra.clear(); },
        },
      },
      talents: [{
        install(battle, unit) {
          const slow = num(t1.attack_speed, -15), tickScale = num(t1.atk_scale, 0.13);
          battle.every(1, (b) => {
            if (!up(unit)) return;
            for (const e of b.enemies) {
              if (!e.alive || e.isFlying || !onCountry(unit, e)) continue;
              b.addBuff(e, { key: 'dminon:slow', duration: 1.1, mods: { aspd: slow }, source: unit, visible: true });
              b.dealDamage(unit, e, { amount: unit.s.atk * tickScale, type: 'arts', isSkill: true, tags: ['talent', 'dminon:country'] });
            }
          }, { owner: unit, immediate: true });
          battle.on('death', (ctx) => {
            if (ctx.unit !== unit) return;
            for (const e of battle.enemies) {
              if (!e.alive || e.isFlying || !onCountry(unit, e)) continue;
              battle.dealDamage(unit, e, { amount: unit.s.atk * num(t2.atk_scale, 6), type: 'arts', isSkill: true, tags: ['talent', 'dminon:leave'] });
              battle.applyStatus(e, 'stun', { duration: num(t2.stun, 5), source: unit });
            }
            extra.clear();
          }, { owner: unit });
        },
      }],
    };
  },
};
