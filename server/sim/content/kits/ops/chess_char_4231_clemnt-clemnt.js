// server/sim/content/kits/ops/chess_char_4231_clemnt-clemnt.js — 克莱门莎 (char_4231_clemnt) kit, tier 6 (custom:
// tools/build-data.mjs CUSTOM_CHESS). Released 2026-10-09; not in the season roster, so she is declared in CUSTOM_CHESS
// like 阿斯卡纶. 分支 本源近卫 (primguard) lives in server/sim/professions.js (block 2 from the data; can hit air;
// the blocked-first rule is the engine default). Kit contract and rules: ../README.md; conventions: ../shared/tier6.js.
//
// 生死定夺 (talent 1): 造成物理伤害时有 prob_normal 概率攻击力提升至 t1_atk_scale，目标防御力低于初始值时概率提升至
//   prob_special — one `hit` handler per physical damage instance (attacks and skills alike).
// 习得性防御 (talent 2): 受到来自自身前方单位造成的物理和法术伤害降低 damage_resistance_normal，若伤害来源为【海怪】
//   (the enemy's `seamonster` tag) 则降低 damage_resistance_seamonster.
// 冲蚀 S1 (attack-recovery AUTO): next attack ×atk_scale, then 侵蚀损伤 = ep_damage_ratio × the physical damage dealt.
// 风暴潮 S2 (16 s): range 4-1, ASPD +attack_speed, each attack hits the target + up to 4 more ground enemies for
//   attack@aoe_atk_scale × ATK; summons a 放逐舱 that carries up to 15 ground enemies (total weight ≤
//   attack@max_passenger_mass) 3 tiles forward (a text-only 3), then vanishes and leaves a 漩涡 (radius WHIRL_R, hits
//   air) that slows −attack@move_speed and deals attack@water_element 侵蚀损伤 + attack@physical_atk_scale × ATK per
//   second for WHIRL_LIFE s.
// 与海为敌 S3 (default; AMMO, trigger_time bullets): range 3-2, targets +attack@max_target; each attack deals
//   attack@atk_scale × ATK physical + attack@ep_damage_ratio × the damage dealt 侵蚀损伤; whenever ANY enemy's 侵蚀
//   损伤 bursts it spends 1 bullet to hit the bursting enemy's tile + its 4 neighbours 3 (audio_trigger_cnt) times for
//   s3_atk_scale × ATK physical and ep_damage_scale × ATK 元素伤害.

import { COLS } from '../../../constants.js';
import { hasHp } from '../../../damage.js';
import { bodyOnTile } from '../../../body.js';
import { normalizeChess, normalizeSkill } from '../../../simdata.js';

// helpers (kit-local, the ascln pattern)

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const defOf = (chess, def) => def ?? normalizeChess(chess);
const talentBb = (d, i) => d?.talents?.[i]?.bb ?? {};
const selectedId = (chess, d) => d?.skill?.id ?? chess?.skill?.skillId ?? null;
const alive = (u) => !!(u && u.alive && u.deployed);
const copyGrid = (g) => (Array.isArray(g) && g.length ? g.map((p) => [p[0], p[1]]) : null);

function skillData(chess, d, bb, id) {
  if (id != null && selectedId(chess, d) === id && d?.skill) return { ...d.skill, bb: bb ?? d.skill.bb ?? {} };
  const rec = (chess?.skills ?? []).find((s) => s && s.skillId === id);
  return (rec && normalizeSkill({ skill: rec })) || { id, bb: {}, rangeGrid: null, maxCharges: 1, duration: 0, description: '' };
}

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function textNum(text, re, fallback) {
  const m = String(text ?? '').match(re);
  if (!m) return fallback;
  return /^\d+(\.\d+)?$/.test(m[1]) ? +m[1] : (CN_NUM[m[1]] ?? fallback);
}

/** 元素损伤 (gauge): nothing on a target at 0 HP (a lethal hit's rider must not fill/burst a corpse). */
const elementDmg = (battle, src, tgt, el, amount, tags = ['skill']) =>
  (amount > 0 && hasHp(tgt) ? battle.dealDamage(src, tgt, { type: 'element', element: el, amount, tags }) : 0);

// engine tunables that exist in no table (documented in docs/MATCHMAKING.md §36)
const BANISH_RADIUS = 1.5;   // 放逐舱 "周围" (the enemies it reaches while carrying) [ASSUMED]
const WHIRL_R = 1.5;         // 漩涡 radius ("处于漩涡的所有敌人") [ASSUMED]
const WHIRL_LIFE = 5;        // 漩涡 lifetime s (same shape as S3's projectile_life_time) [ASSUMED]
const CABIN_STEP = 0.5;      // s per carried tile [ASSUMED]

export default {
  // ---- 6_4231 克莱门莎 · 本源近卫 (custom: tools/build-data.mjs CUSTOM_CHESS)
  chess_char_4231_clemnt_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0), t1 = talentBb(d, 1);
    const sid = selectedId(chess, d);
    const s3bb = sid === 'skchr_clemnt_3' ? (bb ?? {}) : (skillData(chess, d, bb, 'skchr_clemnt_3').bb ?? {});

    // 与海为敌 S3: the default skill spec of the record. `bb` is the SELECTED skill's blackboard (S3 when default).
    const s3 = (b) => ({
      kind: 'ammo',
      ammo: Math.max(1, num(b.trigger_time, 10)),
      targeting: { rangeGrid: copyGrid(d.skill?.rangeGrid), maxTargets: num(b['attack@max_target'], 3) },
      attack: {
        atkScale: num(b['attack@atk_scale'], 1),
        onEachHit({ battle, unit, target, dealt }) {
          if (!target || target.side !== 'enemy') return;
          elementDmg(battle, unit, target, 'erosion', dealt * num(b['attack@ep_damage_ratio'], 0.2));
        },
      },
    });

    // 风暴潮 S2: range, ASPD, AoE (target + up to 4 ground neighbours), the 放逐舱 and its 漩涡.
    const s2 = (s) => ({
      kind: 'duration',
      duration: Math.max(0.1, num(s.duration, 16)),
      mods: { aspd: num(s.bb.attack_speed, 100) },
      targeting: { rangeGrid: copyGrid(s.rangeGrid) },
      attack: {
        atkScale: num(s.bb['attack@aoe_atk_scale'], 1),
        onEachHit({ battle, unit, target, kind, isSkill }) {
          if (kind !== 'main' || !target || target.side !== 'enemy') return;   // the target itself already took the scaled hit
          let n = 0;
          for (const e of battle.foesInRadius(target.x, target.y, WHIRL_R, true)) {
            if (e === target || !e.alive || e.isFlying) continue;
            if (n >= Math.max(0, num(s.bb['attack@max_target'], 5) - 1)) break;
            battle.dealDamage(unit, e, { amount: unit.s.atk * num(s.bb['attack@aoe_atk_scale'], 1), type: 'phys', isAttack: true, isSplash: true, isSkill, tags: ['skill'] });
            n++;
          }
        },
      },
      onStart({ battle, unit }) {
        // 放逐舱: starts on the tile in front (else on the caster's tile), carries up to 15 ground enemies 3 tiles forward.
        const [fr, fc] = unit.fwd;
        let cr = unit.tileR + fr, cc = unit.tileC + fc;
        if (!battle.grid.inRect(cr, cc) || !battle.grid.groundPassable(cr, cc)) { cr = unit.tileR; cc = unit.tileC; }
        const steps = Math.max(1, textNum(s.description, /移动(\d+)格/, 3));
        const maxWeight = num(s.bb['attack@max_passenger_mass'], 8);
        const maxCount = num(s.bb['attack@max_passenger_cnt'], 15);
        const banishDur = CABIN_STEP * 1.6;
        const carry = () => {
          battle.banishGroup(battle.enemiesInRadius(cc, cr, BANISH_RADIUS), cr, cc, {
            maxWeight, maxCount, duration: banishDur, source: unit,
          });
        };
        battle.fx('zone', { x: cc, y: cr, r: BANISH_RADIUS, dur: CABIN_STEP * steps, kind: 'banishCabin' });
        carry();
        let taken = 0;
        const h = battle.every(CABIN_STEP, () => {
          if (!alive(unit)) return;
          if (++taken >= steps) { h.cancel(); stop(); return; }
          const nr = cr + fr, nc = cc + fc;
          if (!battle.grid.inRect(nr, nc) || !battle.grid.groundPassable(nr, nc)) { h.cancel(); stop(); return; }   // path-reachability abort
          cr = nr; cc = nc;
          battle.fx('zone', { x: cc, y: cr, r: BANISH_RADIUS, dur: CABIN_STEP, kind: 'banishCabin' });
          carry();
        }, { owner: unit });
        function stop() {
          // 漩涡 at the cabin's last tile: slows −attack@move_speed and ticks water_element 侵蚀 + physical_atk_scale × ATK/s
          const slowVal = Math.abs(num(s.bb['attack@move_speed'], -0.7));
          const elAmount = num(s.bb['attack@water_element'], 200);
          const physScale = num(s.bb['attack@physical_atk_scale'], 2.5);
          battle.fx('zone', { x: cc, y: cr, r: WHIRL_R, dur: WHIRL_LIFE, kind: 'whirlpool' });
          let left = WHIRL_LIFE;
          const wh = battle.every(1, () => {
            const foes = battle.enemiesInRadius(cc, cr, WHIRL_R);
            for (const e of foes) {
              if (!e.alive) continue;
              battle.applyStatus(e, 'slow', { duration: 1.2, value: slowVal, source: unit });
              elementDmg(battle, unit, e, 'erosion', elAmount, ['skill', 'whirlpool']);
              battle.dealDamage(unit, e, { amount: unit.s.atk * physScale, type: 'phys', canDodge: false, tags: ['skill', 'whirlpool'] });
            }
            left -= 1;
            if (left <= 1e-6) wh.cancel();
          }, { owner: unit });
        }
      },
    });

    return {
      // S3 与海为敌 is the default skill (defaultSkillIndex 2): built from the SELECTED blackboard (= S3 when default).
      skill: s3(bb ?? {}),
      skills: {
        skchr_clemnt_1: (() => {
          const s = skillData(chess, d, bb, 'skchr_clemnt_1');
          return {
            kind: (s.maxCharges ?? 1) > 1 ? 'charges' : 'instant',
            attack: {
              atkScale: num(s.bb.atk_scale, 1),
              onEachHit({ battle, unit, target, dealt }) {
                if (!target || target.side !== 'enemy') return;
                elementDmg(battle, unit, target, 'erosion', dealt * num(s.bb.ep_damage_ratio), ['skill']);
              },
            },
          };
        })(),
        skchr_clemnt_2: (() => s2(skillData(chess, d, bb, 'skchr_clemnt_2')))(),
      },
      // 生死定夺 / 习得性防御 — installed once, run under every selected skill.
      talents: [
        { install(battle, unit) {
          const scale = num(t0.t1_atk_scale, 1.2);
          const pNormal = num(t0.prob_normal, 0.25), pSpecial = num(t0.prob_special, 0.5);
          battle.on('hit', (c) => {
            const t = c.target;
            if (c.source !== unit || !c.dmg || c.dmg.type !== 'phys' || !t || t.side !== 'enemy') return;
            // 防御力低于初始值 (its current DEF below its base DEF) ⇒ the higher proc chance
            const belowBase = t.s.def < (t.base?.def ?? t.s.def) - 1e-9;
            const p = belowBase ? pSpecial : pNormal;
            if (p > 0 && battle.rng() < p) c.dmg.amount *= scale;
          }, { owner: unit });
        } },
        { install(battle, unit) {
          const rNormal = num(t1.damage_resistance_normal, 0.3);
          const rSea = num(t1.damage_resistance_seamonster, 0.5);
          battle.on('hit', (c) => {
            const src = c.source;
            if (c.target !== unit || !c.dmg || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
            if (!src || src.side !== 'enemy') return;
            const [fr, fc] = unit.fwd;
            if (!bodyOnTile(src, unit.tileR + fr, unit.tileC + fc)) return;   // 来自自身前方单位
            const sea = !!(src.def && Array.isArray(src.def.tags) && src.def.tags.includes('seamonster'));
            c.dmg.mul *= 1 - (sea ? rSea : rNormal);
          }, { owner: unit });
        } },
      ],
      // 与海为敌 S3: while it runs, ANY 侵蚀 burst on the field spends one of its bullets on the bursting enemy's tile + its
      // 4 neighbours (3 hits each of s3_atk_scale × ATK phys + ep_damage_scale × ATK 元素伤害).
      install(battle, unit) {
        if (sid !== 'skchr_clemnt_3') return;
        const hits = Math.max(1, Math.round(num(s3bb.audio_trigger_cnt, 3)));
        const physScale = num(s3bb.s3_atk_scale, 3);
        const elemScale = num(s3bb.ep_damage_scale, 2.5);
        battle.on('elementBurst', (c) => {
          if (c.element !== 'erosion') return;
          const sk = unit.skill;
          if (!alive(unit) || !sk || sk.kind !== 'ammo' || !sk.active || sk.ammoLeft <= 0) return;
          const t = c.target;
          if (!t || t.side !== 'enemy') return;
          sk.ammoLeft -= 1;
          if (battle.hasHook('ammoUsed')) battle.emit('ammoUsed', { unit, left: sk.ammoLeft, skill: sk });
          const r = Math.round(t.y), cc = Math.round(t.x);
          const keys = [r * COLS + cc, (r + 1) * COLS + cc, (r - 1) * COLS + cc, r * COLS + cc + 1, r * COLS + cc - 1];
          const foes = battle.enemiesInKeys(keys, unit, { canHitFly: false, groundOnly: true });
          battle.fx('explode', { x: cc, y: r, r: 1.2, kind: 'clemntBurst' });
          for (const e of foes) {
            if (!e.alive) continue;
            for (let i = 0; i < hits; i++) {
              battle.dealDamage(unit, e, { amount: unit.s.atk * physScale, type: 'phys', isSkill: true, canDodge: false, tags: ['skill', 'clemntBurst'] });
              battle.dealDamage(unit, e, { amount: unit.s.atk * elemScale, type: 'elemental', element: 'erosion', canDodge: false, tags: ['skill', 'clemntBurst'] });
            }
          }
          if (sk.ammoLeft <= 0) sk.end('ammo');
        }, { owner: unit });
      },
    };
  },
};
