// server/sim/content/kits/ops/op-oxi.js — 塔露拉 (char_4247_oxi), 6★ 本源近卫 (primguard), the 2026-11-01 limited
// banner 「将雪投火」. Data: character_table / skill_table 26-11-01 (E2 Lv1 rank 4 / E2 Lv60 rank 7, no module).
//
// Implemented from the official blackboards:
//   T1 绝不妥协 — EVERY damage instance she deals carries `ep_damage_ratio` of 灼燃损伤 (PRTS 备注: "于每次成功造成伤害时
//      产生灼燃损伤"): normal attacks, the S2 retaliation, the S3 簇火 waves, the T2 footprints. After
//      `arcane_idle_delay` s without an attack her Arts/element damage ramps by `arcane_step` every
//      `arcane_step_interval` up to `arcane_max`, reset by a normal attack.
//   T2 我即火焰 — a burn burst on the enemy side leaves a 4 s footprint (max 25) on its tile; every 0.3 s it deals
//      `field_atk_scale` × ATK Arts to ground enemies on it.
//   S1 — one attack on the target's tile (ground enemies) for ×atk_scale, fear for `fear` s.
//   S2 — a counter stance: 90 % shelter for `shelter_hold_duration` then decaying over `skill_duration`; the attacker
//      takes `retaliate_atk_scale` × ATK Arts (radius `ability_range_radius`), 5 % of it heals her; 5 s of
//      ATK/DEF +`atk`/`def` per stack (max 5) while she hits every blocked enemy. The first hit that casts it is reduced
//      by `damage_remaining_scale` at the injury stage, before the dodge / shelter stages (the new 庇护 cannot take part
//      in it: PRTS 备注), and `dmg.guarded` keeps a second guard from touching the same instance.
//      [ASSUMED] the stance's every-blocked attack is one extra hit every 0.5 s in this port (the skill record has no
//      attack override outside its cast).
//   S3 — +atk ATK, stops attacking to channel for 36 s; every `normal_interval` s a wave of 5 lanes (`normal_half_width`)
//      runs `wave_exit_distance` tiles forward and detonates for `heatwave_atk_scale` × ATK Arts (burn-burst targets take
//      element damage instead); overload (any target in burn burst) uses `overload_interval` / `overload_half_width`;
//      further hits of one wave on one enemy deal `same_wave_repeat_damage_scale`. Collision is a swept segment with the
//      perpendicular reach (`projectile_range`) — no tile-centre box. The 簇火's own official effects are
//      oxi_skill_03_trail_01 (flight) and oxi_skill_03_hit_01 (impact): the engine emits a 'wave' fx at each lane's
//      launch and a 'blast' at the contact point, which FX_BINDINGS skchr_oxi_3 draws (the prefabs come from the local
//      client's oxi.ab with `extract.py --only fx --fx-keys`).
// Kit contract: ../README.md.
import { num, talentBb, skillRec, up, onHitOn, isMainHit } from '../shared/tier1.js';
import { hasHp } from '../../../damage.js';
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
          kind: 'charges', charges: num(b2.max_stack_cnt, 5), trigger: 'TAKE_DAMAGE',
          onStart({ battle, unit }) {
            const hold = num(b2.shelter_hold_duration, 0.2);
            const dur = num(b2.skill_duration, 1.3);
            const resist = num(b2.damage_resistance, 0.9);
            let t = 0;
            battle.every(0.1, (b, sc) => {
              t += 0.1;
              const remain = num(b2.damage_remaining_scale, 0.1);
              const left = t <= hold ? 1 : Math.max(remain, 1 - (t - hold) / Math.max(dur - hold, 0.1));
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
          // Manual in the official table (skillType MANUAL) and a 36 s channel: in this auto-played port it must not wait
          // for an enemy in her own 1-tile range (the basic DEFAULT rule), or she would never start it while holding a
          // lane. GDGLOW_SKILL_2 = cast once any targetable enemy is on the field (SP_FULL would burn it during an empty prep).
          kind: 'duration', trigger: 'GDGLOW_SKILL_2', mods: { atkPct: num(b3.atk) }, attack: { noAttack: true },
          onStart({ battle, unit }) {
            const [dr, dc] = dirVec(unit.dir);
            const [r0, c0] = tileOf(unit);
            const normal = num(b3.normal_interval, 2.67), overload = num(b3.overload_interval, 2);
            const exit = Math.max(1, Math.floor(num(b3.wave_exit_distance, 5)));
            const atkScale = num(b3.heatwave_atk_scale, 1.75);
            const repeat = num(b3.same_wave_repeat_damage_scale, 0.15);
            // PRTS notes: a 簇火 is summoned at the tile centre 11 tiles BEHIND her (each row independently) and flies the
            // deployment direction until the map edge (it may run `wave_exit_distance` past it). A wave that starts at her own
            // tile and stops 5 tiles later only ever covers the row in front of her — the field-wide fire rain never showed.
            const behind = 11;
            const R = battle.rect ?? { r0: 0, r1: 0, c0: 0, c1: 0 };
            const far = Math.abs(dc) * (R.c1 - R.c0) + Math.abs(dr) * (R.r1 - R.r0) + behind + exit;
            let next = 0;
            battle.every(0.1, (b) => {
              if (!up(unit) || !(unit.skill?.id === S3 && unit.skill.active)) return;
              if (b.time + 1e-9 < next) return;
              // 过载: any enemy on the field is in a burn burst → faster, wider wave.
              const burning = b.enemies.some((e) => e.alive && e.side === 'enemy' && e.findBuff('burnBurst'));
              const half = Math.floor(num(burning ? b3.overload_half_width : b3.normal_half_width, 2));
              const interval = burning ? overload : normal;
              next = b.time + interval;
              const speed = Math.max(0.1, num(b3.wave_speed, 2.3));
              const reach = num(b3.projectile_range, 0.5);
              const radius = num(b3.range_radius, 1.5);
              const waveId = `${unit.id}:${next}`;
              for (let k = -half; k <= half; k++) {
                const sx = c0 + dr * k - dc * behind;
                const sy = r0 - dc * k - dr * behind;
                const tag = `${unit.id}:${next}:${k}`;
                // the client's cue for this lane's 簇火: its launch point and path (the official prefab is
                // oxi_skill_03_trail_01, FX_BINDINGS skchr_oxi_3 'wave' — the client moves it, and stops it at the same
                // tag's 'blast'); the contact point follows as the engine's own 'blast'
                battle.fx('wave', { x: sx, y: sy, id: unit.id, dr, dc, speed, distance: far, wave: tag });
                battle.spawnWave({
                  owner: unit, x: sx, y: sy, dr, dc,
                  speed, distance: far, hitWidth: reach, blastRadius: radius,
                  damage: unit.s.atk * atkScale, type: 'arts',
                  elementFor: (e) => (burning && e.findBuff('burnBurst') ? 'burn' : null),
                  repeatScale: repeat, waveId, waveTag: tag, tags: ['skill', 'oxi:wave'],
                });
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
          });
          // 绝不妥协: EVERY damage instance she deals carries 灼燃损伤 = ATK × ep_damage_ratio — the official note is
          // "于每次成功造成伤害时产生灼燃损伤", so the S3 簇火 waves, the S2 retaliation and the T2 footprints carry it
          // too, not just her normal attack (the old hook was the normal attack only: her channel added no gauge at all,
          // so nothing ever burst, no 足迹 appeared and 过载 never switched on). The gauge, its 1000-point burst and its
          // 10 s lock are applyElement's own: an 'element' hit fills it. Skip element hits themselves (no gauge on gauge).
          battle.on('damaged', (ctx) => {
            const t = ctx.target;
            if (ctx.source !== unit || !t || t.side !== 'enemy' || !hasHp(t)) return;
            if (ctx.type === 'element' || ctx.type === 'elemental' || !(ctx.amount > 0)) return;
            burn(t);
          }, { owner: unit });
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
          // S2's guard: the first damage instance she takes while S2 is ready is reduced by the skill's own
          // `damage_remaining_scale` at the INJURY stage, before the dodge / 庇护 stages (PRTS 备注: the shield the cast
          // grants "还不能参与本次伤害的处理"). The engine's TAKE_DAMAGE cast then opens the skill in `damaged`, so the
          // shelter it grants covers later instances only. `dmg.guarded` keeps a second guard from reducing it again.
          battle.on('hit', (c) => {
            const d = c.dmg;
            if (!d || c.target !== unit || d.cancel || d.guarded) return;
            const sk = unit.skill;
            if (!sk || sk.id !== S2 || sk.active || !sk.ready || !unit.canAct || unit.s.flags.silence) return;
            if (!c.source?.alive || c.source.side !== 'enemy') return;   // 有来源, the other side
            if (d.type !== 'phys' && d.type !== 'arts') return;           // 令该次物理/法术伤害降低
            if ((d.tags || []).includes('terrain')) return;               // 环境伤害 is no attack
            d.guarded = true;
            d.mul *= num(b2.damage_remaining_scale, 0.1);
          }, { owner: unit, priority: 1000 });
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
          // Stance: a normal attack also hits every other enemy she blocks, with the same damage (official 攻击所有阻挡).
          onHitOn(battle, unit, ({ target, dmg }) => {
            if (!isMainHit(dmg) || !unit.findBuff(STANCE) || !target?.alive) return;
            for (const e of battle.blockedTargets(unit, unit.profile)) {
              if (!e.alive || e === target) continue;
              battle.dealDamage(unit, e, { amount: dmg.amount, type: dmg.type, isSkill: false, tags: ['skill', 'oxi:stance'] });
              battle.fx('stance', { x: e.x, y: e.y, id: unit.id, target: e.id });
            }
          });
        },
      }],
    };
  },
};
