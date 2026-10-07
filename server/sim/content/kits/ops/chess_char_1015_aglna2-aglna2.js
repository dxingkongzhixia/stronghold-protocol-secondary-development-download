// server/sim/content/kits/ops/chess_char_1015_aglna2-aglna2.js — 予愿安洁莉娜 (char_1015_aglna2) kit, tier 3 (custom:
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

const alive = (u) => !!(u && u.alive && u.deployed);

const fx = (battle, kind, u, extra = {}) => battle.fx(kind, { x: u.x, y: u.y, id: u.id, ...extra });

const copyGrid = (g) => (Array.isArray(g) && g.length ? g.map((p) => [p[0], p[1]]) : null);

export default {
  // ---- 3_1015 予愿安洁莉娜 · 巡空者 (custom: tools/build-data.mjs CUSTOM_CHESS) — 起飞 (`liftoff`: blocks flying
  //      enemies only, ground ones walk on; professions.js `skywalker` grants blockFly, the LIFTOFF flags the state).
  //      飘浮大地之上: every attack deals extra arts damage (atk_scale_lo, atk_scale_hi against a light enemy) and, while
  //      airborne, the enemies in range are 失重 (the `weightless` status + massFlat −1, exactly like 安洁莉娜's own).
  //      天穹间的舞步: every AIRBORNE friendly operator gets +atk% ATK and, while blocking, a max-HP-ratio regen.
  //      极速送达 S1 is a passive takeoff; 重力自定义 S2 takes off, 浮空s (levitate) the ground enemies in range, 缚地s
  //      (the `grounded` status) the flying ones and turns arts over max_target; 酸橙的心事 S3 (default) takes off with
  //      AMMO, hits max_target enemies at atk_scale as physical plus one flying enemy, and slows the flying ones.
  chess_char_1015_aglna2_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0), t1 = talentBb(d, 1);
    const sid = selectedId(chess, d);
    const rGrid = copyGrid(d.skill?.rangeGrid);
    const LIFT = { blockFly: true, liftoff: true };
    const takeOff = ({ battle, unit }) => { battle.releaseBlocked(unit); fx(battle, 'takeoff', unit, {}); };
    const land = ({ battle, unit }) => { battle.releaseBlocked(unit); };
    const lo = num(t0.atk_scale_lo), hi = num(t0.atk_scale_hi, num(t0.atk_scale_lo)), lightMass = num(t0.mass_level, 3);
    const levitateDur = num(bb.buff_duration_levitate, 0), slowFly = num(bb.move_speed, 0);
    const maxT = Math.max(1, Math.floor(num(bb['attack@max_target'], 1)));
    const kit = {
      // S3 酸橙的心事 (default): ammo, physical over max_target + one flying, and a ground-fire shield
      skill: {
        kind: 'ammo', ammo: Math.max(1, Math.floor(num(bb['attack@trigger_time'], 1))),
        mods: { atkPct: num(bb.atk), dmgTakenMul: Math.max(0, 1 - num(bb.damage_resistance, 0)) },
        targeting: { rangeGrid: rGrid },
        flags: LIFT,
        attack: { atkScale: num(bb['attack@atk_scale'], 1), maxTargets: maxT, dmgType: 'phys' },
        onStart: takeOff, onEnd: land,
      },
      skills: altSkills(chess, d, bb, {
        // 极速送达 (S1): a passive takeoff for its own duration (ON_DEPLOY)
        skchr_aglna2_1: (s) => ({
          kind: 'duration', duration: num(s.duration, 60), activateOnDeploy: true,
          mods: { atkPct: num(s.bb.atk) }, targeting: { rangeGrid: copyGrid(s.rangeGrid) }, flags: LIFT,
          attack: { maxTargets: Math.max(1, Math.floor(num(s.bb['attack@max_target'], 1))) },
          onStart: takeOff, onEnd: land,
        }),
        // 重力自定义 (S2): take off, levitate the ground enemies in range, arts over max_target
        skchr_aglna2_2: (s) => ({
          kind: 'duration', duration: num(s.duration, 22),
          mods: { atkPct: num(s.bb.atk), batPct: batMod(num(s.bb.base_attack_time), chess) },
          targeting: { rangeGrid: copyGrid(s.rangeGrid) }, flags: LIFT,
          attack: { dmgType: 'arts', maxTargets: Math.max(1, Math.floor(num(s.bb['attack@max_target'], 1))) },
          onStart({ battle, unit }) {
            takeOff({ battle, unit });
            const durL = num(s.bb.buff_duration_levitate, 12), durG = num(s.bb.buff_duration_ground_bound, num(s.duration, 22)) || durL;
            for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
              // a FLYING enemy is 缚地 (the `grounded` status: Unit.isFlying turns false, ground rules apply); a ground
              // one is 浮空 (levitate). PRTS: "使掠过的攻击范围内的地面敌人浮空…、飞行敌人缚地…"
              if (e.isFlying) { if (durG > 0) battle.applyStatus(e, 'grounded', { duration: durG, source: unit }); }
              else if (durL > 0) battle.applyStatus(e, 'levitate', { duration: durL, source: unit });
            }
          },
          onEnd: land,
        }),
      }),
      // 飘浮大地之上: the extra arts on every attack (the light-enemy variant needs the target's current mass)
      trait: { afterHit: (battle, unit, target) => {
        if (!target || !target.alive || !(lo > 0 || hi > 0)) return;
        const light = (target.s?.massLevel ?? 0) <= lightMass;
        const scale = light ? hi : lo;
        if (scale > 0) battle.dealDamage(unit, target, { amount: unit.s.atk * scale, type: 'arts', tags: ['talent'] });
      } },
      talents: [
        // the airborne 失重 aura + the S3 flying-enemy slow (both while the takeoff skill runs)
        { install(battle, unit) {
          battle.every(0.5, () => {
            if (!alive(unit) || !unit.s.flags.liftoff) return;
            const left = Math.max(0.6, num(unit.skill?.timeLeft, 1));
            for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
              // 飘浮大地之上 (T1): while airborne every enemy in range is 失重 (`weightless` + massFlat −1, like 安洁莉娜)
              battle.addBuff(e, { key: 'aglna2:weightless', status: 'weightless', visible: true, duration: left, data: { src: unit }, mods: { massFlat: -1 } });
              // 酸橙的心事 (S3): the FLYING enemies in range are slowed on top of it (no `status`: a plain debuff)
              if (sid === 'skchr_aglna2_3' && e.isFlying && slowFly < 0) battle.addBuff(e, { key: 'aglna2:slow', duration: 0.6, refresh: 'replace', source: unit, mods: { moveMul: Math.max(0.05, 1 + slowFly) } });
            }
          }, { owner: unit });
        } },
        // 天穹间的舞步: every airborne friendly operator +atk% ATK, and a max-HP-ratio regen while it blocks
        { install(battle, unit) {
          const atk = num(t1.atk), regen = num(t1.hp_recovery_per_sec_by_max_hp_ratio);
          if (!(atk > 0) && !(regen > 0)) return;
          battle.every(0.5, () => {
            for (const a of battle.allyUnits) {
              if (a.kind !== 'op' || !a.alive || !a.deployed || !a.s?.flags.liftoff) continue;
              const mods = {};
              if (atk > 0) mods.atkPct = atk;
              if (regen > 0 && a.blocking?.length) mods.hpRegenRatio = regen;
              if (Object.keys(mods).length) battle.addBuff(a, { key: 'aglna2:sky', duration: 0.6, refresh: 'replace', source: unit, mods });
            }
          }, { owner: unit });
        } },
      ],
    };
    return kit;
  },
};
