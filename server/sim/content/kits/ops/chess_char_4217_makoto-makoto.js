// server/sim/content/kits/ops/chess_char_4217_makoto-makoto.js — 结城理 (char_4217_makoto) kit, tier 3 (custom:
// tools/build-data.mjs CUSTOM_CHESS). Relocated from the pre-0.2.0 kits/tier3.js; kit contract and rules: ../README.md.

import { absoluteRangeKeys } from '../../../targeting.js';
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

const gridKeys = (grid, u, ext = 0) => absoluteRangeKeys(grid || [[0, 0]], u.tileR, u.tileC, u.dir, ext);

export default {
  // ---- 3_4217 结城理 · 傀儡师 (custom: tools/build-data.mjs CUSTOM_CHESS). The <替身> machinery is the dollkeeper
  //      profession's (professions.js installDollkeeper): a lethal hit switches to a persona for 20 s. 不羁之力: while
  //      the persona is out ATK +atk, maxHP +max_hp_t1 and the attack interval +base_attack_time seconds, and switching
  //      TO a persona 停顿s (sluggish) the enemies in its range for `sluggish` s. S.E.E.S.队长: when the persona ends a
  //      总攻击 deals atk_scale × ATK true damage to the enemies around every S.E.E.S. member. The skills pick the
  //      persona and switch at once (`dollSwitch`): 俄耳甫斯 S1 (max_target arts, or heals a ≤ 50 % ally instead),
  //      塔纳托斯 S2 (max_target arts, prob fear, and an execute below kill_atk_scale × ATK) and 塔纳托斯 S3 (default;
  //      attack_speed +talent@attack_speed, max_target arts weakness hits, and a SECOND persona — 俄耳甫斯, +block_cnt /
  //      heals — kept past the first one's knock-out: `dollLives`). The persona's attack rides the skill window, so the
  //      spec lasts the persona's duration (the official skill ends the same frame; a sim-side simplification).
  chess_char_4217_makoto_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0), t1 = talentBb(d, 1);
    const sid = selectedId(chess, d);
    const dollDur = 20;   // the dollkeeper trait's <替身> window (professions.js dollDuration default; her trait bb has none)
    const pRange = copyGrid(d.skill?.rangeGrid);
    const scale = num(bb['attack@atk_scale'], 1);
    const maxT = Math.max(1, Math.floor(num(bb['attack@max_target'], 1)));
    const fear = num(bb['attack@fear'], 0), prob = num(bb['attack@prob'], 0), killScale = num(bb['attack@kill_atk_scale'], 0);
    const healScale = num(bb['attack@heal_scale'], 0);
    const blockAdd = Math.floor(num(bb['attack@block_cnt'], 0));
    const healRatio = num(bb['attack@hp_ratio'], 0);
    // S1 俄耳甫斯: an attack heals instead when a ≤ 50 % friendly stands in range (its `onAttack` replaces the hit)
    const healInstead = (battle, unit, ctx) => {
      if (!(healScale > 0)) return false;
      // only an ally a heal can actually reach (Battle.healTargetable: no 禁疗 / 无法被友方治疗 one) — the shared rule
      const hurt = battle.alliesInRadius(unit.x, unit.y, 3, null).filter((a) => a !== unit && a.alive && a.hp < a.s.maxHp * 0.5 && battle.healTargetable(unit, a));
      if (!hurt.length) return false;
      hurt.sort((a, b) => a.hp / a.s.maxHp - b.hp / b.s.maxHp);
      if (ctx) ctx.noAmmo = true;
      battle.heal(unit, hurt[0], unit.s.atk * healScale, { tags: ['skill'] });
      return true;
    };
    // S2 塔纳托斯: an in-range FEARED enemy below kill_atk_scale × ATK is executed (an aura, 0.1 s poll — PRTS 备注)
    const execute = (battle, unit) => battle.every(0.1, () => {
      if (!alive(unit) || unit.trait?.dollNo !== 1) return;
      for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
        if (!e.alive || !e.findBuff('fear')) continue;
        if (e.hp <= unit.s.atk * killScale) battle.dealDamage(unit, e, { amount: 9999999, type: 'true', canDodge: false, sourceless: true, tags: ['execute'] });
      }
    }, { owner: unit });
    const kit = {
      skill: {
        kind: 'duration', duration: dollDur,
        mods: { atkPct: num(bb.atk), aspd: num(t0.attack_speed) },
        // the skill's own range (official `x-1` for all three): without it the unit fought on its BASE range, so the
        // reach changed as the skill / personas came and went (player report)
        targeting: { rangeGrid: pRange, canHitFly: true },
        attack: { dmgType: 'arts', atkScale: scale, maxTargets: maxT },
        onStart({ battle, unit }) { battle.after(0, () => { if (alive(unit) && !unit.trait.doll) battle.emit('dollSwitch', { unit }); }, { owner: unit }); },
      },
      skills: altSkills(chess, d, bb, {
        skchr_makoto_1: (s) => ({
          kind: 'duration', duration: dollDur,
          targeting: { rangeGrid: pRange, canHitFly: true },
          attack: { dmgType: 'arts', atkScale: num(s.bb['attack@atk_scale'], 1) },
          onStart({ battle, unit }) { battle.after(0, () => { if (alive(unit) && !unit.trait.doll) battle.emit('dollSwitch', { unit }); }, { owner: unit }); },
        }),
        skchr_makoto_2: (s) => ({
          kind: 'duration', duration: dollDur,
          targeting: { rangeGrid: pRange, canHitFly: true },
          attack: {
            dmgType: 'arts', atkScale: num(s.bb['attack@atk_scale'], 1), maxTargets: Math.max(1, Math.floor(num(s.bb['attack@max_target'], 1))),
            onEachHit({ battle, unit: u, target }) {
              const p = num(s.bb['attack@prob'], 0), f = num(s.bb['attack@fear'], 0);
              if (p > 0 && f > 0 && target?.alive && target.side === 'enemy' && battle.rng() < p) battle.applyStatus(target, 'fear', { duration: f, source: u });
            },
          },
          onStart({ battle, unit }) { battle.after(0, () => { if (alive(unit) && !unit.trait.doll) battle.emit('dollSwitch', { unit }); }, { owner: unit }); },
        }),
      }),
      talents: [
        // 不羁之力: the persona's stat line; the 停顿 lands on the switch TO it (not between personas)
        { install(battle, unit) {
          battle.on('dollSwap', (ctx) => {
            if (ctx.unit !== unit || ctx.form !== 'doll') return;
            const keys = pRange ? gridKeys(pRange, unit) : unit.rangeKeys;
            const sl = num(t0.sluggish, 0);
            if (!(sl > 0)) return;
            for (const e of battle.enemiesInKeys(keys, unit, { canHitFly: true })) battle.applyStatus(e, 'sluggish', { duration: sl, source: unit });
            fx(battle, 'aoe', unit, { radius: 2.5, skill: 'makoto_sluggish' });
          }, { owner: unit });
          let on = null;
          battle.every(0.25, () => {
            const want = !!(unit.trait && unit.trait.doll);
            if (want === on && (!want || unit.findBuff('makoto:doll'))) return;
            on = want;
            if (want) {
              battle.addBuff(unit, { key: 'makoto:doll', mods: { atkPct: num(t0.atk), hpPct: num(t0.max_hp_t1), batPct: batMod(num(t0.base_attack_time), chess) }, tags: ['trait'] });
            } else battle.removeBuff(unit, 'makoto:doll');
          }, { owner: unit });
        } },
        // S.E.E.S.队长: 替身状态结束 ⇒ 总攻击 around every S.E.E.S. member (her `atk_scale` × ATK true damage)
        { install(battle, unit) {
          battle.on('dollSwap', (ctx) => {
            if (ctx.unit !== unit || ctx.form !== null) return;
            const dmg = num(t1.atk_scale, 0);
            if (!(dmg > 0) || !alive(unit)) return;
            const members = battle.allyUnits.filter((a) => a.kind === 'op' && a.alive && a.deployed && /^(char_4217|char_4218|char_4219|char_4220)_/.test(a.def?.charId || ''));
            const seen = new Set();
            for (const m of (members.length ? members : [unit])) {
              for (const e of battle.foesInRadius(m.x, m.y, 3)) {
                if (!e.alive || seen.has(e)) continue;
                seen.add(e);
                battle.dealDamage(unit, e, { amount: unit.s.atk * dmg, type: 'true', canDodge: false, tags: ['talent', 'sees'] });
                fx(battle, 'strike', e, { src: unit.id, skill: 'sees_allout' });
              }
            }
          }, { owner: unit });
        } },
      ],
      // runs under EVERY selected skill: S1's heal-instead, S2's execute, S3's second persona (+block / heal)
      install(battle, unit) {
        if (sid === 'skchr_makoto_1') {
          battle.on('beforeAttack', (ctx) => { if (ctx.unit === unit) healInstead(battle, unit, ctx); }, { owner: unit });
        }
        if (sid === 'skchr_makoto_2' && killScale > 0) execute(battle, unit);
        // S3's SECOND persona 俄耳甫斯 is a SUPPORT form (PRTS 开辟明日的剑刃): while it is out (dollNo >= 2) 结城理
        // does not attack (`disarm` — the official persona heals instead of hitting), blocks +attack@block_cnt, gives
        // the friendly operators around it attack@prob physical AND arts dodge, and heals up to attack@max_target_heal
        // of them for atk × attack@heal_scale every second. Everything follows the persona window itself.
        if (blockAdd > 0 || prob > 0 || healScale > 0) {
          let healAcc = 0;   // the per-second heal tick (the aura itself refreshes every 0.5 s)
          battle.every(0.5, () => {
            const want = !!(unit.trait && unit.trait.dollNo >= 2);
            if (want && !unit.findBuff('makoto:orpheus')) {
              battle.addBuff(unit, { key: 'makoto:orpheus', mods: { blockCnt: blockAdd }, flags: { disarm: true }, tags: ['skill'] });
            } else if (!want && unit.findBuff('makoto:orpheus')) battle.removeBuff(unit, 'makoto:orpheus');
            if (!want) return;
            const around = battle.alliesInRadius(unit.x, unit.y, 3, null).filter((a) => a !== unit && a.alive);
            // the dodge is a buff, not a heal: every ally around gets it (禁疗 / 无法被友方治疗 included); only the heal
            // selection applies the shared heal rule (Battle.healTargetable)
            if (prob > 0) for (const a of around) battle.addBuff(a, { key: 'makoto:orpheusDodge', duration: 0.6, refresh: 'replace', mods: { dodgePhys: prob, dodgeArts: prob }, tags: ['skill'] });
            // "范围内友方干员" includes 结城理 himself while the persona is out (owner report, 2026-10-29): he is the one
            // blocking and taking the hits, and the official text does not say 其他友方 — without him the persona could
            // never recover. The shared heal rule still decides whether a heal can reach him.
            const hurt = [unit, ...around].filter((a) => a.alive && a.hp < a.s.maxHp && battle.healTargetable(unit, a))
              .sort((a, b) => a.hp / a.s.maxHp - b.hp / b.s.maxHp);
            healAcc += 0.5;
            if (healAcc >= 1 && healScale > 0 && hurt.length) {
              healAcc = 0;
              for (const a of hurt.slice(0, Math.max(1, Math.floor(num(bb['attack@max_target_heal'], 1))))) battle.heal(unit, a, unit.s.atk * healScale, { tags: ['skill'] });
            }
          }, { owner: unit });
        }
        // (the old after-attack `attack@hp_ratio` heal was removed: his data has no hp_ratio, and 俄耳甫斯 no longer
        //  attacks — the per-second aura heal above is the official behaviour)
      },
    };
    if (sid === 'skchr_makoto_3') kit.trait = { dollKeepSkill: true, dollForm: 'doll3', dollForm2: 'doll3b', dollLives: 1 };   // the SECOND persona (俄耳甫斯, its own clip set) past the first knock-out
    else if (sid === 'skchr_makoto_2') kit.trait = { dollKeepSkill: true, dollForm: 'doll2' };                                // S2's <替身> (a looping doll that never attacks)
    else kit.trait = { dollKeepSkill: true, dollForm: 'doll' };                                                               // S1's <替身>
    return kit;
  },
};
