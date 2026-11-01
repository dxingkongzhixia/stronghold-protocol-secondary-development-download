// server/sim/content/kits/ops/op-oxi.js — 塔露拉 (char_4247_oxi), 6★ 本源近卫 (primguard), the 2026-11-01 limited
// banner 「将雪投火」. Data: character_table / skill_table 26-11-01 (E2 Lv1 rank 4 / E2 Lv60 rank 7, no module).
//
// Implemented from the official blackboards:
//   T1 绝不妥协 — Arts attacks carry `ep_damage_ratio` burn gauge; after `arcane_idle_delay` s without an attack her
//      Arts/element damage ramps by `arcane_step` every `arcane_step_interval` up to `arcane_max`, reset by an attack.
//   T2 我即火焰 — a burn burst on the enemy side leaves a 4 s footprint (max 25) on its tile; every 0.3 s it deals
//      `field_atk_scale` × ATK Arts to ground enemies on it.
//   S1 — one attack on the target's tile (ground enemies) for ×atk_scale, fear for `fear` s.
//   S2 — a counter stance: 90 % shelter for `shelter_hold_duration` then decaying over `skill_duration`; the attacker
//      takes `retaliate_atk_scale` × ATK Arts (radius `ability_range_radius`), 5 % of it heals her; 5 s of
//      ATK/DEF +`atk`/`def` per stack (max 5) while she hits every blocked enemy. [ASSUMED] the stance's every-blocked
//      attack is one extra hit every 0.5 s in this port (the skill record has no attack override outside its cast).
//   S3 — +atk ATK, stops attacking to channel for 36 s; every `normal_interval` s a wave of 5 lanes (`normal_half_width`)
//      runs `wave_exit_distance` tiles forward and detonates for `heatwave_atk_scale` × ATK Arts (burn-burst targets take
//      element damage instead); overload (any target in burn burst) uses `overload_interval` / `overload_half_width`;
//      further hits of one wave on one enemy deal `same_wave_repeat_damage_scale`. [ASSUMED] lane collision is tested on
//      tile centres; the official projectile flight art is drawn by the client's prefab.
// Kit contract: ../README.md.
import { num, talentBb, skillRec, up, onHitOn, isMainHit } from '../shared/tier1.js';
import { dirVec } from '../../../dir.js';

const S1 = 'skchr_oxi_1', S2 = 'skchr_oxi_2', S3 = 'skchr_oxi_3';
const bbOf = (raw, id) => skillRec(raw, id)?.bb ?? {};
const tileOf = (u) => [Math.round(u.y), Math.round(u.x)];
const inRect = (battle, r, c) => battle.grid.inRect(r, c);

export default {
  char_4247_oxi: (bb, raw) => {
    const t1 = talentBb(raw, 0), t2 = talentBb(raw, 1);
    const b1 = bbOf(raw, S1), b2 = bbOf(raw, S2), b3 = bbOf(raw, S3);
    const STANCE = 'oxi:stance', SHELTER = 'oxi:shelter', COUNTER = 'oxi:counter';
    return {
      skills: {
        [S1]: {
          kind: 'instant',
          attack: {
            atkScale: num(b1.atk_scale, 4.9), splashRadius: 0.5, groundOnly: true,
            onEachHit({ battle, unit, target }) {
              if (!target?.alive) return;
              battle.applyStatus(target, 'fear', { duration: num(b1.fear, 2.5), source: unit });
            },
          },
        },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const hold = num(b2.shelter_hold_duration, 0.2);
            const dur = num(b2.skill_duration, 1.3);
            const resist = num(b2.damage_resistance, 0.9);
            let t = 0;
            battle.every(0.1, (b, sc) => {
              t += 0.1;
              const left = t <= hold ? 1 : Math.max(0, 1 - (t - hold) / Math.max(dur - hold, 0.1));
              const res = resist * left;
              if (res > 0) b.addBuff(unit, { key: SHELTER, duration: 0.15, mods: { physTakenMul: 1 - res, artsTakenMul: 1 - res } });
              if (t >= dur) sc.cancel();
            }, { owner: unit });
            battle.addBuff(unit, { key: COUNTER, duration: dur + 0.05, tags: ['skill'] });
            const stacks = Math.min(num(b2.max_stack_cnt, 5), (unit.mem.oxiStacks ?? 0) + 1);
            unit.mem.oxiStacks = stacks;
            battle.removeBuff(unit, STANCE);
            battle.addBuff(unit, {
              key: STANCE, duration: num(b2.stack_duration, 5),
              mods: { atkPct: num(b2.atk) * stacks, defPct: num(b2.def) * stacks },
            });
          },
        },
        [S3]: {
          kind: 'duration', mods: { atkPct: num(b3.atk) }, attack: { noAttack: true },
          onStart({ battle, unit }) {
            const [dr, dc] = dirVec(unit.dir);
            const [r0, c0] = tileOf(unit);
            const normal = num(b3.normal_interval, 2.67), overload = num(b3.overload_interval, 2);
            const exit = Math.max(1, Math.floor(num(b3.wave_exit_distance, 5)));
            const atkScale = num(b3.heatwave_atk_scale, 1.75);
            const repeat = num(b3.same_wave_repeat_damage_scale, 0.15);
            let next = 0;
            battle.every(0.1, (b) => {
              if (!up(unit) || !(unit.skill?.id === S3 && unit.skill.active)) return;
              if (b.time + 1e-9 < next) return;
              // 过载: any enemy on the field is in a burn burst → faster, wider wave.
              const burning = b.enemies.some((e) => e.alive && e.side === 'enemy' && e.findBuff('burnBurst'));
              const half = Math.floor(num(burning ? b3.overload_half_width : b3.normal_half_width, 2));
              const interval = burning ? overload : normal;
              next = b.time + interval;
              const hit = new Set();
              for (let k = -half; k <= half; k++) {
                for (let d = 1; d <= exit; d++) {
                  const rr = r0 + dr * d - dc * k, cc = c0 + dc * d + dr * k;
                  if (!inRect(b, rr, cc)) break;
                  const foes = b.enemies.filter((e) => e.alive && e.side === 'enemy' && !e.isFlying
                    && Math.round(e.y) === rr && Math.round(e.x) === cc);
                  if (!foes.length) continue;
                  for (const e of foes) {
                    const mul = hit.has(e.id) ? repeat : 1;
                    hit.add(e.id);
                    const element = burning && e.findBuff('burnBurst');
                    b.dealDamage(unit, e, {
                      amount: unit.s.atk * atkScale * mul, type: element ? 'element' : 'arts',
                      ...(element ? { element: 'burn' } : {}), isSkill: true, tags: ['skill', 'oxi:wave'],
                    });
                  }
                  break; // the first enemy row stops this lane's wave
                }
              }
            }, { owner: unit });
          },
        },
      },
      talents: [{
        install(battle, unit) {
          const ratio = num(t1.ep_damage_ratio, 0.13);
          const burn = (target) => {
            if (!target?.alive || target.side !== 'enemy') return;
            battle.dealDamage(unit, target, { amount: unit.s.atk * ratio, type: 'element', element: 'burn', tags: ['talent', 'oxi:burn'] });
          };
          const delay = num(t1.arcane_idle_delay, 3), step = num(t1.arcane_step_interval, 0.5);
          const inc = num(t1.arcane_step, 0.03), max = num(t1.arcane_max, 0.18);
          let ramp = 0, lastAtk = -1e9;
          const sync = () => {
            battle.removeBuff(unit, 'oxi:ramp');
            if (ramp > 0) battle.addBuff(unit, { key: 'oxi:ramp', mods: { atkPct: ramp }, persist: true, allowDead: true, tags: ['talent'] });
          };
          battle.every(step, () => {
            if (!up(unit)) return;
            if (battle.time - lastAtk + 1e-9 < delay) return;
            if (ramp >= max) return;
            ramp = Math.min(max, ramp + inc);
            sync();
          }, { owner: unit });
          onHitOn(battle, unit, ({ target, dmg }) => {
            if (!isMainHit(dmg) || !target) return;
            lastAtk = battle.time;
            if (ramp) { ramp = 0; sync(); }
            burn(target);
          });
          // T2 footprints: a burn burst on an enemy leaves its tile burning for field_duration s.
          const scale = num(t2.field_atk_scale, 0.15), tick = num(t2.field_interval, 0.3);
          const life = num(t2.field_duration, 4), maxCount = num(t2.max_count, 25);
          const fields = [];
          battle.on('elementBurst', ({ target, element }) => {
            if (element !== 'burn' || !target?.alive || target.side !== 'enemy') return;
            const [r, c] = tileOf(target);
            if (!inRect(battle, r, c) || !battle.grid.groundPassable(r, c)) return;
            if (fields.length >= maxCount) fields.shift()?.cancel();
            let left = Math.max(1, Math.round(life / tick));
            const sc = battle.every(tick, (b, s) => {
              for (const e of b.enemies) {
                if (!e.alive || e.isFlying) continue;
                if (Math.abs(e.x - c) <= 0.5 + 1e-9 && Math.abs(e.y - r) <= 0.5 + 1e-9) {
                  b.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['talent', 'oxi:foot'] });
                }
              }
              if (--left <= 0) s.cancel();
            }, { owner: unit });
            fields.push(sc);
          }, { owner: unit });
          // S2 retaliation.
          battle.on('damaged', (ctx) => {
            if (ctx.target !== unit || !unit.findBuff(COUNTER)) return;
            const src = ctx.source;
            if (!src?.alive || src.side !== 'enemy') return;
            const radius = num(b2.ability_range_radius, 1);
            const foes = battle.foesInRadius ? battle.foesInRadius(src.x, src.y, radius).filter((e) => e.alive && e.side === 'enemy') : [src];
            let dealt = 0;
            for (const e of foes) {
              const before = e.hp;
              battle.dealDamage(unit, e, { amount: unit.s.atk * num(b2.retaliate_atk_scale, 2.3), type: 'arts', isSkill: true, tags: ['skill', 'oxi:counter'] });
              dealt += Math.max(0, before - e.hp);
            }
            if (dealt > 0) battle.heal(unit, unit, dealt * num(b2.heal_ratio, 0.05), { self: true, tags: ['skill'] });
          }, { owner: unit });
          // [ASSUMED] stance: one extra hit on every blocked enemy every 0.5 s.
          battle.every(0.5, () => {
            if (!up(unit) || !unit.findBuff(STANCE)) return;
            for (const e of battle.blockedTargets(unit, unit.profile)) {
              if (e.alive) battle.dealDamage(unit, e, { amount: unit.s.atk * 0.5, type: 'arts', tags: ['skill', 'oxi:stance'] });
            }
          }, { owner: unit });
        },
      }],
    };
  },
};
