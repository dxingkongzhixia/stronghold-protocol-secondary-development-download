// server/sim/content/kits/ops/chess_char_4132_ascln-ascln.js — 阿斯卡纶 (char_4132_ascln) kit, tier 3 (custom:
// tools/build-data.mjs CUSTOM_CHESS). Relocated from the pre-0.2.0 kits/tier3.js; kit contract and rules: ../README.md.

import { normalizeChess, normalizeSkill } from '../../../simdata.js';
import { batMod } from '../shared/tier1.js';

// helpers (kit-local: not exported by ../shared/tierN.js)

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const defOf = (chess, def) => def ?? normalizeChess(chess);

const talentBb = (d, i) => d?.talents?.[i]?.bb ?? {};

const selectedId = (chess, d) => d?.skill?.id ?? chess?.skill?.skillId ?? null;

function skillData(chess, d, bb, id) {
  if (id != null && selectedId(chess, d) === id && d?.skill) return { ...d.skill, bb: bb ?? d.skill.bb ?? {} };
  const rec = (chess?.skills ?? []).find((s) => s && s.skillId === id);
  return (rec && normalizeSkill({ skill: rec })) || { id, bb: {}, rangeGrid: null, maxCharges: 1, duration: 0, description: '' };
}

function altSkills(chess, d, bb, builders) {
  const out = {};
  for (const [id, build] of Object.entries(builders)) out[id] = build(skillData(chess, d, bb, id));
  return out;
}

const instantKindOf = (s) => ((s?.maxCharges ?? 1) > 1 ? 'charges' : 'instant');

const alive = (u) => !!(u && u.alive && u.deployed);

const copyGrid = (g) => (Array.isArray(g) && g.length ? g.map((p) => [p[0], p[1]]) : null);

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function textNum(text, re, fallback) {
  const m = String(text ?? '').match(re);
  if (!m) return fallback;
  return /^\d+(\.\d+)?$/.test(m[1]) ? +m[1] : (CN_NUM[m[1]] ?? fallback);
}

export default {
  // ---- 3_4132 阿斯卡纶 · 伏击客 (custom: tools/build-data.mjs CUSTOM_CHESS) — every attack hits all enemies in range
  //      and the 50 % phys / arts dodge with taunt −1 come from the 'stalker' profession profile (professions.js
  //      installStalker). 死亡拘审: each attack stacks 减速 + an arts DoT (atk_ratio × the operator's current ATK each
  //      interval, ≤ max_stack_cnt); 噬光残影: ASPD +attack_speed, +attack_speed_add while a 高台 is orthogonally
  //      adjacent. 追袭 S1 (charges): next attack ×atk_scale, twice; 恩赐 S2: ATK +atk, ground enemies hit are slowed
  //      and one dying spreads a 死亡拘审 stack; 降临 S3 (default): its own wider range, ATK +atk, shorter attack
  //      interval, taunt +taunt_level, −N% 物理/法术命中率 on the ground enemies in range, and a dodge / miss heals
  //      attack@hp_ratio of max HP.
  chess_char_4132_ascln_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0), t1 = talentBb(d, 1);
    const t0dur = num(t0.debuff_duration, 25), t0iv = Math.max(0.1, num(t0.interval, 1));
    const maxStack = Math.max(1, Math.floor(num(t0.max_stack_cnt, 3)));
    const t0slow = num(t0.move_speed, -0.18), t0dot = num(t0.atk_ratio, 0.1);
    const DECREE = (u) => `ascln:decree:${u.id}`;
    const GIFT = (u) => `ascln:gift:${u.id}`;
    const SHADOW_HIGH = 'talent:ascln_shadow_high';
    /** One 死亡拘审 stack (≤ maxStack) on `target`: 减速 + an arts DoT of t0dot × the operator's CURRENT ATK. */
    const decree = (battle, unit, target) => {
      if (!target || !target.alive || target.side !== 'enemy') return;
      const n = Math.min(maxStack, num(target.findBuff(DECREE(unit))?.data?.stack) + 1);
      battle.addBuff(target, {
        key: DECREE(unit), duration: t0dur, interval: t0iv, refresh: 'replace', source: unit, data: { stack: n },
        mods: { speedMul: Math.max(0.05, 1 + t0slow * n) },
        onTick: ({ battle: b, unit: e }) => b.dealDamage(unit, e, { amount: unit.s.atk * t0dot * n, type: 'arts', canDodge: false, tags: ['dot', 'decree'] }),
      });
    };
    const kit = {
      // 降临 (S3, default): its own range, ATK +atk, attack interval shortened (base_attack_time is a FLAT seconds
      // change — batMod turns it into the engine's batPct of her 3.5 s base), taunt +taunt_level
      skill: {
        kind: 'duration',
        mods: { atkPct: num(bb.atk), batPct: batMod(bb.base_attack_time, chess, d.skill?.description ?? chess?.skill?.desc), taunt: num(bb.taunt_level) },
        targeting: { rangeGrid: copyGrid(d.skill?.rangeGrid) },
        onStart({ unit }) { unit.mem.asclnLevi = true; },
        onEnd({ unit }) { unit.mem.asclnLevi = false; },
      },
      skills: altSkills(chess, d, bb, {
        // 追袭 (S1): instant, or charges when the record stores several
        skchr_ascln_1: (s) => ({
          kind: instantKindOf(s),
          attack: { atkScale: num(s.bb.atk_scale, 1), hits: Math.max(1, textNum(s.description, /连续攻击(.)次/, 2)) },
        }),
        // 恩赐 (S2): ATK +atk; every ground enemy hit is slowed for the skill's window
        skchr_ascln_2: (s) => ({
          kind: 'duration',
          mods: { atkPct: num(s.bb.atk) },
          attack: { onEachHit({ battle, unit, target }) {
            if (target && target.alive && target.side === 'enemy' && !target.isFlying) {
              battle.addBuff(target, { key: GIFT(unit), duration: 0.8, refresh: 'replace', source: unit, mods: { speedMul: Math.max(0.05, 1 + num(s.bb.move_speed, -0.3)) } });
            }
          } },
        }),
      }),
      talents: [
        // 死亡拘审 (talent 1): every attack adds a stack to the enemy it hits
        { install(battle, unit) {
          battle.on('damaged', (ctx) => {
            if (ctx.source !== unit || !ctx.dmg?.isAttack || ctx.target?.side !== 'enemy' || !ctx.target.alive) return;
            decree(battle, unit, ctx.target);
          }, { owner: unit });
        } },
        // 噬光残影 (talent 2): ASPD +attack_speed; +attack_speed_add while a 高台 (a HIGH tile, `grid.isLow` false)
        // stands among the 4 orthogonally adjacent tiles — re-checked as she deploys and as the board changes
        { install(battle, unit) {
          if (num(t1.attack_speed) > 0) battle.addBuff(unit, { key: 'talent:ascln_shadow', mods: { aspd: num(t1.attack_speed) }, persist: true, allowDead: true });
          const add = num(t1.attack_speed_add);
          if (!(add > 0)) return;
          let on = null;
          battle.every(0.5, () => {
            if (!alive(unit)) return;
            const want = [[unit.tileR + 1, unit.tileC], [unit.tileR - 1, unit.tileC], [unit.tileR, unit.tileC + 1], [unit.tileR, unit.tileC - 1]]
              .some(([r, c]) => !battle.grid.isLow(r, c));
            if (want === on && (!want || unit.findBuff(SHADOW_HIGH))) return;
            on = want;
            if (want) battle.addBuff(unit, { key: SHADOW_HIGH, mods: { aspd: add }, persist: true, allowDead: true });
            else battle.removeBuff(unit, SHADOW_HIGH);
          }, { owner: unit });
        } },
      ],
      // runs under EVERY selected skill: the S3 accuracy aura + dodge / miss heal and the S2 on-kill spread
      install(battle, unit) {
        const hpRatio = num(bb['attack@hp_ratio']);      // the SELECTED skill's bb: only S3 has it
        const hitPhys = Math.abs(num(bb['attack@damage_hitrate_physical']));
        const hitArts = Math.abs(num(bb['attack@damage_hitrate_magical'], -hitPhys));
        if (hpRatio > 0) {
          battle.on('dodge', (c) => {
            if (c.target === unit && unit.alive && unit.mem?.asclnLevi) battle.heal(unit, unit, unit.s.maxHp * hpRatio, { self: true, tags: ['skill'] });
          }, { owner: unit });
        }
        // 降临 S3: ground enemies inside her range get -N% 物理/法术命中率 while the skill runs (an independent miss
        // roll on the enemy, damage.js) — refreshed at the tick, so it lapses when the skill ends or she falls
        if (hitPhys > 0 || hitArts > 0) {
          battle.every(0.5, () => {
            if (!alive(unit) || !unit.mem?.asclnLevi) return;
            for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
              if (e.isFlying) continue;
              battle.addBuff(e, { key: `ascln:levi:${unit.id}`, duration: 0.6, refresh: 'replace', source: unit, mods: { hitRatePhys: hitPhys, hitRateArts: hitArts } });
            }
          }, { owner: unit });
        }
        const r = num(bb.range_radius);                  // only S2 has it
        if (r > 0) {
          battle.on('death', (c) => {
            const v = c.unit;
            if (!alive(unit) || !v || v.side !== 'enemy' || v.isFlying || !v.findBuff(GIFT(unit))) return;
            for (const e of battle.foesInRadius(v.x, v.y, r).filter((e2) => e2.alive && !e2.isFlying)) decree(battle, unit, e);
          }, { owner: unit });
        }
      },
    };
    return kit;
  },
};
