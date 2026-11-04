// server/sim/content/kits/ops/op-dminon.js — 国度 (char_4246_dminon), 6★ 潜伏者 (stalker), event 6★ (SPCE) of the
// 2026-11-01 client. Data: character_table / skill_table 26-11-01, no module. The 潜伏者 branch (all enemies in range,
// 50 % physical/Arts dodge, low taunt) is professions.js.
//
//   The field “国度” — every 国度 spreads it over the tiles of his current attack range (实质坍缩: y-1, S2's y-3, S3's
//      y-10 and its spread tiles) while he is on the field. All 国度 on the field share one tile set (PRTS: "所有“国度”在
//      不同国度(干员)之间通用，但可以分别弥漫"), and his own part goes the moment he leaves. Engine: battle/domains.js
//      (battle.setDomain / domainHas / domainTiles).
//   T1 实质坍缩 — ground enemies on “国度” lose `attack_speed` ASPD and take `atk_scale` × ATK Arts per second.
//   T2 此身为界 — when he leaves the field, every ground enemy on “国度” takes `atk_scale` × ATK Arts and is stunned for
//      `stun` s; the country is cleared. The ATK and the field are CACHED as he leaves (PRTS: "依靠弹道存储…缓存攻击力…与场上
//      的国度状态"; a knock-out after 0.7 s, a retreat / forced exit at once): kits/shared/leave.js.
//   S1 — attack_speed; the first time an enemy steps on “国度” it is slowed for `sluggish` s.
//   S2 — range grows (`customRangeGrid` from data), ATK +atk; every physical / arts damage instance an enemy ON “国度” takes
//      cannot be dodged (PRTS: "令影响对象受到的所有物理/法术伤害无法因闪避取消"; the damage pipeline's `hit` stage runs before
//      its dodge roll, so the mask is set there). [ASSUMED] the second and later casts keep the skill endless and
//      +attack_speed; this port does not model that.
//   S3 — range grows, ATK +atk, ASPD +attack_speed, every enemy on “国度” is attacked; a ground enemy hit on the
//      country spreads it to the four tiles around its attacker and takes `attack@aoe_atk_scale` × ATK physical (once
//      per `attack@cd` s); the spread resets when the skill ends.
// Kit contract: ../README.md.
import { num, talentBb, skillRec, up } from '../shared/tier1.js';
import { COLS } from '../../../constants.js';
import { tileKeyOf } from '../../../battle/domains.js';
import { onLeave } from '../shared/leave.js';

const S1 = 'skchr_dminon_1', S2 = 'skchr_dminon_2', S3 = 'skchr_dminon_3';
const bbOf = (raw, id) => skillRec(raw, id)?.bb ?? {};
const tileKey = (r, c) => r * COLS + c;
const X5 = Object.freeze([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]);

export default {
  char_4246_dminon: (bb, raw, def) => {
    const t1 = talentBb(raw, 0), t2 = talentBb(raw, 1);
    const b1 = bbOf(raw, S1), b2 = bbOf(raw, S2), b3 = bbOf(raw, S3);
    const extra = new Set(); // S3-spread country tiles
    /** Publish his field (own range + S3 spread) to the battle's shared 国度 tile set. */
    const refresh = (battle, unit) => {
      const keys = new Set(unit.rangeKeySet ?? []);
      for (const k of extra) keys.add(k);
      if (battle?.setDomain) battle.setDomain(unit, keys);
    };
    /** On any 国度 (the union of every caster's field), by tile. */
    const onCountry = (battle, e) => !!battle?.domainHas && battle.domainHas(tileKeyOf(e));
    return {
      skills: {
        [S1]: {
          kind: 'duration', mods: { aspd: num(b1.attack_speed) },
          onStart({ battle, unit }) {
            refresh(battle, unit);
            const seen = new Set();
            battle.every(0.2, (b) => {
              if (!up(unit)) return;
              for (const e of b.enemies) {
                if (!e.alive || e.isFlying || seen.has(e.id) || !onCountry(b, e)) continue;
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
          onStart({ battle, unit }) { refresh(battle, unit); },
        },
        [S3]: {
          kind: 'duration',
          targeting: { rangeGrid: def?.skill?.rangeGrid ?? null, maxTargets: 99 },
          mods: { atkPct: num(b3.atk), aspd: num(b3.attack_speed) },
          onStart({ battle, unit }) {
            refresh(battle, unit);
            let last = -1e9;
            battle.on('damaged', (ctx) => {
              const e = ctx.target, src = ctx.source;
              if (!e?.alive || e.side !== 'enemy' || !src?.alive || src.side !== 'enemy' || src.isFlying) return;
              if (unit.skill?.id !== S3 || unit.skill.active !== true) return;
              if (!onCountry(battle, e) || battle.time - last < num(b3['attack@cd'], 0.5)) return;
              last = battle.time;
              const [r, c] = [Math.round(src.y), Math.round(src.x)];
              for (const [dr, dc] of X5) {
                if (battle.grid.inRect(r + dr, c + dc)) extra.add(tileKey(r + dr, c + dc));
              }
              refresh(battle, unit); // the spread joins his attack range
              battle.dealDamage(unit, src, { amount: unit.s.atk * num(b3['attack@aoe_atk_scale'], 0.6), type: 'phys', isSkill: true, tags: ['skill', 'dminon:spread'] });
            }, { owner: unit });
          },
          onEnd({ battle, unit }) { extra.clear(); refresh(battle, unit); },
        },
      },
      talents: [{
        install(battle, unit) {
          const slow = num(t1.attack_speed, -15), tickScale = num(t1.atk_scale, 0.13);
          refresh(battle, unit);
          // the range changes with S2 / S3 (and a module), so the published field follows it
          battle.every(0.25, (b) => { if (up(unit)) refresh(b, unit); }, { owner: unit, immediate: true });
          // T1: ASPD cut + arts damage per second, on the union of every 国度
          battle.every(1, (b) => {
            if (!up(unit)) return;
            for (const e of b.enemies) {
              if (!e.alive || e.isFlying || !onCountry(b, e)) continue;
              b.addBuff(e, { key: 'dminon:slow', duration: 1.1, mods: { aspd: slow }, source: unit, visible: true });
              b.dealDamage(unit, e, { amount: unit.s.atk * tickScale, type: 'arts', isSkill: true, tags: ['talent', 'dminon:country'] });
            }
          }, { owner: unit, immediate: true });
          // S2: no dodge on the country (the `hit` stage is before the dodge roll, and the mask is mutable there)
          battle.on('hit', (c) => {
            const e = c.target;
            if (!e?.alive || e.side !== 'enemy' || unit.skill?.id !== S2 || !unit.skill.active) return;
            if (c.dmg.type !== 'phys' && c.dmg.type !== 'arts') return;
            if (!onCountry(battle, e)) return;
            c.dmg.canDodge = false; // PRTS: 令影响对象受到的所有物理/法术伤害无法因闪避取消
          }, { owner: unit, priority: 400 });
          // T2: leave with the cached ATK and field (killed → 0.7 s later; retreat → at once)
          onLeave(battle, unit, (snap) => {
            if (!snap) return;
            for (const e of battle.enemies) {
              if (!e.alive || e.isFlying || !snap.tiles.has(tileKeyOf(e))) continue;
              battle.dealDamage(unit, e, { amount: snap.atk * num(t2.atk_scale, 6), type: 'arts', isSkill: true, tags: ['talent', 'dminon:leave'] });
              battle.applyStatus(e, 'stun', { duration: num(t2.stun, 5), source: unit });
            }
            extra.clear();
            battle.clearDomain(unit);
          }, {
            capture: () => {
              // his own field is known even after _remove set him dead (a retreat has no kill hook to capture first)
              const tiles = new Set(unit.rangeKeySet ?? []);
              for (const k of extra) tiles.add(k);
              for (const k of battle.domainTiles()) tiles.add(k);
              return { atk: unit.s.atk, tiles };
            },
          });
        },
      }],
    };
  },
};
