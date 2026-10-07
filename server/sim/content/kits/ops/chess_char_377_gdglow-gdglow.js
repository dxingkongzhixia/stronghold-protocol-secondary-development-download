// server/sim/content/kits/ops/chess_char_377_gdglow-gdglow.js — 澄闪 (char_377_gdglow) kit, tier 3 (custom:
// tools/build-data.mjs CUSTOM_CHESS). Relocated from the pre-0.2.0 kits/tier3.js; kit contract and rules: ../README.md.

import { COLS, ROWS } from '../../../constants.js';
import { normalizeChess, normalizeSkill } from '../../../simdata.js';

// helpers (kit-local: not exported by ../shared/tierN.js)

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const defOf = (chess, def) => def ?? normalizeChess(chess);

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

const copyGrid = (g) => (Array.isArray(g) && g.length ? g.map((p) => [p[0], p[1]]) : null);

export default {
  // ---- 3_377 澄闪 · 驭械术师 funnel (custom: tools/build-data.mjs CUSTOM_CHESS). 浮游单元: the profession's
  //      installFunnel + this file's funnelMap ramp each lock; its DRONE COUNT is the number of simultaneous targets
  //      ("耶拉的 2 个浮游单元各自锁一个目标；1 个 = 职业默认"), so `浮游单元+N` = attack.maxTargets +N. S1 火花四溅 adds
  //      ASPD, S2 电流翻涌 widens the range (持续无限), S3 澄净闪耀 stops her own attack, fires at the whole field and
  //      its drones 停顿 what they hit.
  chess_char_377_gdglow_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    // 澄净闪耀 (S3): 「攻击范围扩大至整个战场」 — the official record carries NO range for it (rangeGrid/rangeId null),
    // so the kit draws the whole 19×21 field itself, the same WHOLE_FIELD shape 予愿安洁莉娜 S3 uses.
    const wholeField = (() => {
      const g = [];
      for (let dr = -(ROWS - 1); dr <= ROWS - 1; dr++) for (let dc = -(COLS - 1); dc <= COLS - 1; dc++) g.push([dr, dc]);
      return g;
    })();
    // `bb` is the SELECTED skill's blackboard (content/index.js `selectSkillSpec` calls the kit with `def.skill.bb`).
    // The default `skill:` below is only ever used for the default skill (S3 澄净闪耀), so it must read `bb` — its own
    // record's `attack@cnt` (+2 drones ⇒ 3 with the profession's base 1) and `attack@sluggish` (停顿 on hit).
    const drones = (b2) => 1 + Math.floor(num(b2 && b2['attack@cnt'], 0));
    const stunOnHit = (b2) => {
      const sl = num(b2 && b2['attack@sluggish'], 0);
      return sl > 0 ? { onEachHit({ battle, unit: u, target }) { if (target?.alive) battle.applyStatus(target, 'sluggish', { duration: sl, source: u }); } } : null;
    };
    return {
      // S3 澄净闪耀 (default): whole-field range, her own attack stops (the drones carry it), +2 drones, sluggish on hit
      skill: {
        kind: 'duration', duration: num(d.skill && d.skill.duration, 30),   // 澄净闪耀: the official 30s
        mods: { atkPct: num(bb.atk) },
        targeting: { rangeGrid: wholeField, canHitFly: true },   // 整个战场
        attack: { maxTargets: drones(bb), ...(stunOnHit(bb) || null) },
      },
      skills: altSkills(chess, d, bb, {
        skchr_gdglow_1: (s) => ({
          kind: 'duration', duration: num(s.duration, -1),
          mods: { atkPct: num(s.bb.atk), aspd: num(s.bb.attack_speed) },
          // its OWN record's range (the alt-spec audit builds this spec with either skill selected, so it must not read
          // the currently selected skill's grid)
          targeting: { rangeGrid: copyGrid(s.rangeGrid) },
          attack: { maxTargets: drones(s.bb), ...(stunOnHit(s.bb) || null) },
        }),
        skchr_gdglow_2: (s) => ({
          // 电流翻涌 持续无限: the sim's `duration` kind ends a skill whose duration is <= 0 on the next tick; `toggle`
          // is how the repo expresses "runs until switched off" (timeLeft stays Infinity) — see skills.js:453
          kind: 'toggle',
          mods: { atkPct: num(s.bb.atk) },
          targeting: { rangeGrid: copyGrid(s.rangeGrid) },
          attack: { maxTargets: drones(s.bb), ...(stunOnHit(s.bb) || null) },
        }),
      }),
    };
  },
};
