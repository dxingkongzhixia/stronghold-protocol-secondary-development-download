// server/sim/content/enemies/procedural.js — programmatic behaviour for an enemy key with no hand-written kit: reuse a kit
// by talent signature, else compose the generic handlers below from its talent blackboard. Hand-written official kits
// stay in enemies.js / bosses.js; this module only covers talent groups whose meaning is the same for every carrier.
//
// Used by enemies.js onSpawn when PLUGIN_KITS / KITS have no entry for the key (another official version's new enemies).
// `e.mem.procedural` records { via, key, groups } for diagnostics and tests.
//
// Handled groups: dmg_res/DmgResist, DamageUp/DmgUp/atkup/atkboostCore/enhance, Evade, Bleeding/Poison,
// Boom/deathrattle, Trample, Huge, Passive (attack scale / neural), CriticalHit, FirstAttack/FirstAtkDouble, shotbuff,
// atkSpeedDown, buff_to_blocker, Summon (the record's own summons), Overload/OutOfControll, MoveSpeed/Rush,
// aura/Aura/AuraAttributeUp, vampire/unbalanced_bleed. Everything else is left to an official kit later.
import { hypot } from '../../detmath.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const dist = (a, e) => hypot(a.x - e.x, a.y - e.y);

/** Top-level talent groups of an enemy record (the part before the first dot). */
export function groupsOf(rec) {
  return [...new Set(Object.keys(rec?.talents?.bb ?? {}).map((k) => k.split('.')[0]))].sort();
}

/** First finite value among `keys` in the flattened talent book. */
function T(ab, ...keys) { for (const k of keys) { const v = ab.t[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; } return undefined; }

/** Generic parts for the groups a record carries. */
function genericParts(ab, e, groups) {
  const parts = [];
  const has = (g) => groups.includes(g);
  const damageRes = T(ab, 'DmgResist.damage_resistance', 'dmg_res.damage_resistance', 'DmgResist.damage_res', 'dmg_res.def');
  const atkUp = T(ab, 'DamageUp.atk', 'DmgUp.atk', 'atkup.atk', 'atkboostCore.atk', 'enhance.atk', 'DamageUp.attack@atk');
  const aspdUp = T(ab, 'DamageUp.attack_speed', 'DmgUp.attack_speed', 'atkboostCore.attack_speed', 'enhance.attack_speed');
  const ev = T(ab, 'Evade.prob'), evDur = T(ab, 'Evade.duration');
  const bleedRatio = T(ab, 'Bleeding.hp_ratio', 'unbalanced_bleed.hp_ratio');
  const poisonDmg = T(ab, 'Poison.attack@damage');
  const poisonDur = T(ab, 'Poison.attack@duration');
  const boomScale = T(ab, 'Boom.atk_scale', 'deathrattle.atk_scale', 'boom.atk_scale');
  const boomR = T(ab, 'Boom.range_radius', 'deathrattle.range_radius', 'boom.range_radius');
  const boomFreeze = T(ab, 'boom.freeze', 'Boom.freeze');
  const trampleScale = T(ab, 'Trample.atk_scale'), trampleR = T(ab, 'Trample.range_radius'), trampleIv = T(ab, 'Trample.interval');
  const critProb = T(ab, 'CriticalHit.prob'), critScale = T(ab, 'CriticalHit.atk_scale');
  const firstScale = T(ab, 'FirstAttack.atk_scale', 'FirstAtkDouble.atk_scale');
  const shotAtk = T(ab, 'shotbuff.atk'), shotMax = T(ab, 'shotbuff.max_stack_cnt');
  const slow = T(ab, 'atkSpeedDown.attack_speed');
  const sunSummon = e.def?.raw?.summons;
  const passiveScale = T(ab, 'Passive.attack@atk_scale'), passiveEp = T(ab, 'Passive.attack@ep_damage_ratio');
  const moveMul = T(ab, 'MoveSpeed.move_speed', 'Rush.move_speed');
  const hpDrain = T(ab, 'vampire.hp_ratio', 'Bleeding.hp_ratio');
  const auraAspd = T(ab, 'Aura.base_attack_speed', 'AuraAttributeUp.attack_speed', 'aura.attack_speed');
  const overAtk = T(ab, 'Overload.atk', 'OutOfControll.atk');
  const hugeRes = T(ab, 'Huge.damage_resistance', 'Huge.enemy_dyjsfg_low_damage_resistance.damage_resistance');
  const hugeHigh = T(ab, 'Huge.enemy_dyjsfg_high_damage_resistance.damage_resistance');
  const webBind = has('Bundling') || has('BlockMcreep');

  const P = { first: true, shots: 0, res: null, over: false, last: 0, aura: -Infinity, trample: 0 };
  const mods = {};
  if (atkUp) mods.atkPct = atkUp;
  if (aspdUp) mods.aspd = aspdUp;
  if (damageRes) { mods.physTakenMul = Math.max(0, 1 - damageRes); mods.artsTakenMul = Math.max(0, 1 - damageRes); }
  if (moveMul) mods.moveMul = Math.max(0.05, 1 + moveMul);
  if (Object.keys(mods).length) parts.push({ spawn(b) { b.addBuff(e, { key: 'proc:mods', persist: true, visible: true, mods }); } });
  if (ev > 0) parts.push({ spawn(b) { b.addBuff(e, { key: 'proc:evade', duration: evDur ?? Infinity, visible: true, mods: { dodgePhys: ev, dodgeArts: ev } }); } });
  if (passiveScale || passiveEp) parts.push({ spawn(b) {
    b.on('hit', (c) => {
      if (c.source !== e || !c.target || c.target.side !== 'ally' || !c.dmg?.isAttack) return;
      if (passiveScale && passiveScale !== 1) c.dmg.mul *= passiveScale;
      if (passiveEp > 0) b.dealDamage(e, c.target, { amount: e.s.atk * passiveEp, type: 'element', element: 'neural', tags: ['enemyAbility'] });
    }, { owner: e });
  } });
  if (bleedRatio > 0 || poisonDmg > 0) parts.push({ spawn(b) {
    b.on('hit', (c) => {
      if (c.source !== e || !c.target || c.target.side !== 'ally' || !c.dmg?.isAttack) return;
      const dur = poisonDur ?? 3;
      if (poisonDmg > 0) b.addBuff(c.target, { key: 'proc:poison', duration: dur, interval: 1, visible: true, source: e,
        onTick({ battle, unit }) { battle.dealDamage(e, unit, { amount: poisonDmg, type: 'arts', tags: ['enemyAbility'] }); } });
      else b.addBuff(c.target, { key: 'proc:bleed', duration: 3, interval: 1, visible: true, source: e,
        onTick({ battle, unit }) { battle.loseHp(unit, unit.s.maxHp * bleedRatio / 3, { source: e }); } });
    }, { owner: e });
  } });
  if (critProb > 0) parts.push({ spawn(b) {
    b.on('hit', (c) => { if (c.source === e && c.dmg?.isAttack && c.target?.side === 'ally' && b.rng.chance(critProb)) c.dmg.mul *= critScale ?? 1.5; }, { owner: e });
  } });
  if (firstScale) parts.push({ spawn(b) {
    b.on('hit', (c) => { if (c.source !== e || !c.dmg?.isAttack || !P.first) return; P.first = false; c.dmg.mul *= firstScale; }, { owner: e });
  } });
  if (shotAtk || shotMax) parts.push({ spawn(b) {
    b.on('attack', (c) => {
      if (c.attacker !== e) return;
      P.shots = Math.min(shotMax ?? 5, P.shots + 1);
      b.addBuff(e, { key: 'proc:shotbuff', mods: { atkPct: (shotAtk ?? 0) * P.shots }, refresh: 'replace', visible: true });
    }, { owner: e });
  } });
  if (slow) parts.push({ spawn(b) {
    b.on('hit', (c) => { if (c.source === e && c.dmg?.isAttack && c.target?.side === 'ally') b.addBuff(c.target, { key: 'proc:slow', duration: 3, visible: true, source: e, mods: { aspd: slow } }); }, { owner: e });
  } });
  if (webBind) parts.push({ spawn(b) {
    b.on('damaged', (c) => {
      if (c.target !== e || !e.blocking?.length) return;
      for (const u of e.blocking) b.addBuff(u, { key: 'proc:bind', duration: 2, visible: true, source: e, flags: { noAttack: true, noBlock: true, silenceSkill: true } });
    }, { owner: e });
  } });
  if (Array.isArray(sunSummon) && sunSummon.length) parts.push({ spawn(b) {
    b.on('death', (c) => {
      if (c.unit !== e) return;
      for (const key of sunSummon.slice(0, 3)) b.spawnEnemy(key, { pos: [e.tileR, e.tileC] });
    }, { owner: e });
  } });
  if (boomScale > 0) parts.push({ spawn(b) {
    b.on('death', (c) => {
      if (c.unit !== e) return;
      // 冰爆源石虫·α (PRTS): 爆炸半径 0.65、100 % 物理并施加寒冷；其它 boom/deathrattle 仍是 1.5
      const r = boomR ?? (has('boom') ? 0.65 : 1.5);
      for (const a of b.allies()) if (a.alive && dist(a, e) <= r) {
        b.dealDamage(e, a, { amount: e.s.atk * boomScale, type: 'phys', tags: ['enemyAbility'] });
        if (boomFreeze > 0) b.applyStatus(a, 'cold', { duration: boomFreeze, source: e });
      }
      b.fx('explode', { x: e.x, y: e.y, id: e.id, r, kind: 'procDeath' });
    }, { owner: e });
  } });
  if (trampleScale > 0) parts.push({ tick(b, e2, _a, dt) {
    if (!(trampleIv > 0)) return;
    P.trample += dt;
    if (P.trample < trampleIv) return;
    P.trample = 0;
    for (const a of b.allies()) if (a.alive && dist(a, e2) <= (trampleR ?? 1.5)) b.dealDamage(e2, a, { amount: e2.s.atk * trampleScale, type: 'phys', isAttack: true, tags: ['enemyAbility'] });
  } });
  if (overAtk || has('Overload') || has('OutOfControll')) parts.push({ tick(b, e2) {
    if (P.over || !(e2.hpRatio < 0.4)) return;
    P.over = true;
    b.addBuff(e2, { key: 'proc:overload', persist: true, visible: true, mods: { atkPct: overAtk ?? 0, moveMul: 1 + num(T(ab, 'Overload.move_speed'), 1), blockCnt: num(T(ab, 'Overload.block_volume'), 1) } });
  } });
  if (hugeRes != null || hugeHigh != null) parts.push({ tick(b, e2) {
    const res = (e2.blocking?.length || e2.s.moveSpeed === 0) ? (hugeRes ?? 0.35) : (hugeHigh ?? hugeRes ?? 0.9);
    if (res === P.res) return;
    P.res = res;
    b.addBuff(e2, { key: 'proc:huge_res', persist: true, visible: true, mods: { physTakenMul: 1 - res, artsTakenMul: 1 - res } });
  } });
  if (auraAspd) parts.push({ tick(b, e2, _a, dt) {
    P.aura += dt;
    if (P.aura < 1) return;
    P.aura = 0;
    for (const x of b.enemies) if (x !== e2 && x.alive && dist(x, e2) <= 2) b.addBuff(x, { key: `proc:aura:${e2.id}`, duration: 1.2, visible: true, source: e2, mods: { aspd: auraAspd } });
  } });
  if (hpDrain > 0) parts.push({ spawn(b) {
    b.on('hit', (c) => { if (c.source === e && c.dmg?.isAttack && c.target?.side === 'ally' && c.dmg.dealt > 0) b.heal(e, e, c.dmg.dealt * hpDrain); }, { owner: e });
  } });
  return parts;
}

/**
 * A procedural kit for an enemy without one: the kit of a known enemy with the same talent signature (same data), else
 * the generic group handlers. `knownKit(key)` returns a kit function or null; `recordOf(key)` its record.
 * @returns {{ kit: Function|null, via: 'signature'|'generic'|null, key?: string, groups: string[] }}
 */
export function proceduralKit(battle, e, ab, { knownKit, recordOf }) {
  const rawRec = e.def?.raw ?? e.def;
  const groups = groupsOf(rawRec);
  const sig = groups.join('|');
  // The signature is the talent groups AND their blackboard keys: two enemies of one group (e.g. `boom`) may carry
  // different keys (冰爆源石虫·α: boom.atk_scale / boom.freeze), and its generic handler would miss them
  const keys = Object.keys((rawRec?.talents && rawRec.talents.bb) || ab?.t || {}).sort().join(',');
  const data = battle?.data;
  const raw = data?.raw?.enemies ?? data?.enemies ?? data?.rawEnemies ?? null;
  if (raw && knownKit && recordOf) {
    for (const [key, rec] of Object.entries(raw)) {
      if (key === e.defId) continue;
      const kit = knownKit(key);
      if (!kit) continue;
      if (groupsOf(rec).join('|') !== sig) continue;
      const recKeys = Object.keys((rec?.talents && rec.talents.bb) || {}).sort().join(',');
      if (recKeys === keys) return { kit, via: 'signature', key, groups };
    }
  }
  const parts = genericParts(ab, e, groups);
  return { kit: parts.length ? () => parts : null, via: parts.length ? 'generic' : null, groups };
}

export const GENERIC_GROUPS = Object.freeze(['dmg_res', 'DmgResist', 'DamageUp', 'DmgUp', 'atkup', 'atkboostCore', 'enhance', 'Evade', 'Bleeding', 'Poison', 'Boom', 'boom', 'deathrattle', 'Trample', 'Huge', 'Passive', 'CriticalHit', 'FirstAttack', 'FirstAtkDouble', 'shotbuff', 'atkSpeedDown', 'buff_to_blocker', 'Bundling', 'BlockMcreep', 'Summon', 'Overload', 'OutOfControll', 'MoveSpeed', 'Rush', 'aura', 'Aura', 'AuraAttributeUp', 'vampire', 'unbalanced_bleed']);
