// server/sim/content/bonds/regulation.js — the regulation season's new bonds (act3autochess), battle side. The bond
// framework (members, active bonds, layers, tiers) is support/index.js; each installer here is one bond's behaviour.
//
//   乌萨斯 ursusShip       (P2, not yet installed here)
//   伊比利亚 iberiaShip    every damage instance a member (or its alchemy unit) deals applies a 10 s arts DoT of
//                          (dot_atk_scale_base + per_stack·L) × ATK, up to 10 stacks; 6 members double it, slow the target
//                          (−4 % a stack, at most −80 %) and give each instance a 20 % chance to bounce 300 % ATK arts to
//                          the enemies around it.
//   莱塔尼亚 lethaniaShip  (P2, not yet installed here)
//   聚合 docShip           every second, allies in a member's attack range recover (heal_base + per_stack·L) × ATK HP and
//                          (ep_heal_base + per_stack·L) × ATK element damage; 3 members add
//                          (damage_res_base + per_stack·L) damage reduction.
import * as S from '../support/index.js';
import { reached } from './core.js';

const num = S.num;

/** The bond record's own blackboard (the flattened per-bond `bb`). @param {string} id */
function bbOf(id) {
  return S.bondRecord(id)?.bb ?? {};
}

/** True when `u` is one of the bond's members (an alchemy unit/token uses its owner). */
function memberOf(u, id) {
  if (!u) return false;
  if (S.unitBonds(u).includes(id)) return true;
  return !!(u.ownerUnit && S.unitBonds(u.ownerUnit).includes(id));
}


/** Member of the bond, or a token/summon whose owner is one. */
function ownMember(u, id) {
  if (!u) return false;
  if (S.unitBonds(u).includes(id)) return true;
  return !!(u.ownerUnit && S.unitBonds(u.ownerUnit).includes(id));
}

/** Direct ATK / HP percentages of a standing bond buff, refreshed on every layer gain. */
function standing(battle, pid, id, apply) {
  apply();
  battle.on('layerGain', (c) => { if (c.playerId === pid && c.bondId === id) apply(); });
  battle.on('deploy', () => apply());
  battle.on('battleStart', () => apply(), { once: true });
}

function installDoc(battle, pid, bb) {
  const L = () => S.bondLayers(battle, pid, 'docShip');
  const heal = () => num(bb.heal_base) + num(bb.heal_per_stack) * L();
  const ep = () => num(bb.ep_heal_base) + num(bb.ep_heal_per_stack) * L();
  const res = () => num(bb.damage_res_base) + num(bb.damage_res_per_stack) * L();
  const shield = () => reached(battle, pid, 'docShip', num(bb.power_bond_char_cnt, 3));
  battle.every(1, () => {
    const hr = heal(), er = ep();
    for (const m of S.bondMembers(battle, pid, 'docShip')) {
      if (!S.onField(m)) continue;
      const atk = num(m.s.atk);
      for (const a of battle.allyUnits) {
        if (!a.alive || a.side !== 'ally' || !S.inRange(m, a)) continue;
        if (hr > 0) battle.heal(m, a, atk * hr, { tags: ['bond:doc'] });
        if (er > 0) battle.reduceElement(a, atk * er);
        if (shield() && res() > 0) {
          battle.addBuff(a, {
            key: `bond:doc:res:${m.id}`, duration: 1.2, refresh: 'replace', source: m, visible: true,
            mods: { dmgTakenMul: Math.max(0, 1 - res()) },
          });
        }
      }
    }
  });
}


function installUrsus(battle, pid, bb) {
  const id = 'ursusShip';
  const L = () => S.bondLayers(battle, pid, id);
  const atk = () => num(bb.atk_base) + num(bb.atk_per_stack) * L();
  const hp = () => num(bb.hp_base) + num(bb.hp_per_stack) * L();
  standing(battle, pid, id, () => {
    for (const u of S.bondMembers(battle, pid, id)) {
      S.passiveBuff(battle, u, 'bond:ursus', S.directMods({ atk: atk(), hp: hp() }));
    }
  });
  // a member's kill adds temporary layers (2, or 4 with 6 members)
  battle.on('kill', (c) => {
    if (!ownMember(c.killer, id)) return;
    const n = reached(battle, pid, id, num(bb.power_bond_char_cnt, 6)) ? num(bb['temp_bond_stack_cnt[power]'], 4) : num(bb.temp_bond_stack_cnt, 2);
    if (n > 0) battle.addLayers(pid, id, n, 'bond:ursus');
  });
  if (!reached(battle, pid, id, num(bb.power_bond_char_cnt, 6))) return;
  const bleedRatio = () => num(bb.damage_one_minus_base) + num(bb.damage_one_minus_per_stack) * L();
  const bleedDur = num(bb.bleed_duration, 10);
  const hitScale = () => num(bb.atk_scale_base) + num(bb.atk_scale_per_stack) * L();
  battle.on('damaged', (c) => {
    const u = c.target;
    if (!u || !ownMember(u, id) || !S.onField(u) || !c.dmg) return;
    const amount = num(c.amount);
    if (!(amount > 0) || !(bleedRatio() > 0) || !(bleedDur > 0)) return;
    battle.addBuff(u, {
      key: `bond:ursus:bleed:${u.id}`, duration: bleedDur, interval: 1, refresh: 'replace', source: c.source ?? null, visible: true,
      onTick({ battle: b, unit: t, buff }) {
        const src = buff.source;
        if (src && !src.alive) { b.removeBuff(t, buff.key); return; }
        b.loseHp(t, amount * bleedRatio() / bleedDur, { source: src ?? null, tags: ['bond:ursus'] });
      },
    });
  });
  // while blocking, the enemies a member holds take arts damage each second
  battle.every(1, () => {
    const scale = hitScale();
    for (const u of S.bondMembers(battle, pid, id)) {
      if (!S.onField(u) || !(u.blocking && u.blocking.length)) continue;
      for (const e of u.blocking) if (e?.alive) battle.dealDamage(u, e, { amount: u.s.atk * scale, type: 'arts', isSkill: true, tags: ['bond:ursus'] });
    }
  });
}


function installLethania(battle, pid, bb) {
  const id = 'lethaniaShip';
  const L = () => S.bondLayers(battle, pid, id);
  const atk = () => num(bb.atk_base) + num(bb.atk_per_stack) * L();
  const six = () => reached(battle, pid, id, num(bb.power_bond_char_cnt, 6));
  const cap = () => Math.max(1, Math.floor(six() ? num(bb.summon_cnt_max_2, 20) : num(bb.summon_cnt_max_1, 10)));
  const members = () => {
    const out = [];
    for (const u of battle.allyUnits) if (u.alive && ownMember(u, id)) out.push(u);
    return out;
  };
  standing(battle, pid, id, () => {
    for (const u of members()) S.passiveBuff(battle, u, 'bond:lethania', S.directMods({ atk: atk() }));
  });
  const countSummons = () => battle.enemies.filter((e) => e.alive && (e.defId === 'enemy_9025_aclts' || e.defId === 'enemy_9026_acltm')).length;
  const summon = (x, y) => {
    if (!six()) return;
    if (countSummons() >= cap()) return;
    const big = battle.rng.chance(Math.min(1, num(bb.big_prob_base) + num(bb.big_prob_per_stack) * L()));
    const key = big ? 'enemy_9026_acltm' : 'enemy_9025_aclts';
    battle.spawnEnemy(key, { pos: [y, x], sourcePlayerId: pid });
  };
  battle.on('death', (c) => {
    const u = c.unit;
    if (!u) return;
    if (u.side === 'enemy' && c.reason === 'killed') summon(u.x, u.y);
    else if (u.side === 'ally' && six() && S.unitBonds(u).includes(id)) summon(u.x, u.y);
  });
  // a 乐部 (enemy_9026) on the field gives the members attack speed +20
  battle.every(0.5, () => {
    const big = battle.enemies.some((e) => e.alive && e.defId === 'enemy_9026_acltm');
    for (const u of members()) {
      if (big) battle.addBuff(u, { key: 'bond:lethania:big', duration: 0.7, refresh: 'replace', visible: true, mods: { aspd: 20 } });
      else battle.removeBuff(u, 'bond:lethania:big');
    }
  });
}

function installIberia(battle, pid, bb) {
  const id = 'iberiaShip';
  const L = () => S.bondLayers(battle, pid, id);
  const six = () => reached(battle, pid, id, num(bb.power_bond_char_cnt, 6));
  const scale = () => (num(bb.dot_atk_scale_base) + num(bb.dot_atk_scale_per_stack) * L()) * (six() ? 2 : 1);
  const dotDur = num(bb.dot_duration, 10);
  const slowPer = Math.abs(num(bb['act3autochess_bond_eff_iberia[enemy][speed].move_speed'], 0.04));
  const slowMax = num(bb['act3autochess_bond_eff_iberia[enemy][speed].max_stack_cnt'], 20);
  const slowDur = num(bb['act3autochess_bond_eff_iberia[enemy][speed].speed_duration'], 10);
  const radius = num(bb.range_radius, 1.7), bounceScale = num(bb.atk_scale, 3);
  const prob = () => Math.min(1, num(bb.prob_base) + num(bb.prob_per_stack) * L());
  battle.on('damaged', (c) => {
    const src = c.source;
    const t = c.target;
    if (!src || !memberOf(src, id) || !t || t.side !== 'enemy' || !t.alive || !c.dmg) return;
    if (!(num(c.dmg.amount) > 0) || c.type === 'element' || c.type === 'elemental') return;
    const atk = num(src.s.atk);
    const key = `bond:iberia:dot:${src.id}`;
    battle.addBuff(t, {
      key, duration: dotDur, interval: 1, maxStacks: 10, refresh: 'independent', source: src, visible: true,
      onTick({ battle: b, unit: e }) { if (e.alive) b.dealDamage(src, e, { amount: atk * scale(), type: 'arts', isSkill: true, tags: ['bond:iberia'] }); },
    });
    if (six()) {
      const stacks = t.buffs.filter((b) => b.key === key).length;
      battle.addBuff(t, {
        key: 'bond:iberia:slow', duration: slowDur, refresh: 'replace', source: src, visible: true,
        mods: { moveMul: Math.max(0.2, 1 - slowPer * Math.min(slowMax, stacks)) },
      });
    }
    if (prob() > 0 && battle.rng.chance(prob())) {
      for (const e of battle.enemies) {
        if (!e.alive || e.side !== 'enemy' || e === t) continue;
        if (Math.abs(e.x - t.x) > radius || Math.abs(e.y - t.y) > radius) continue;
        battle.dealDamage(src, e, { amount: atk * bounceScale, type: 'arts', isSkill: true, tags: ['bond:iberia'] });
      }
    }
  });
}

const INSTALLERS = Object.freeze({ docShip: installDoc, iberiaShip: installIberia, ursusShip: installUrsus, lethaniaShip: installLethania });

export function install(battle) {
  if (!battle || !Array.isArray(battle.players)) return;
  for (const p of battle.players) {
    const pid = p.playerId;
    if (!p.bonds || typeof p.bonds !== 'object') continue;
    for (const [bondId, fn] of Object.entries(INSTALLERS)) {
      if (!S.bondActive(battle, pid, bondId)) continue;
      const bb = bbOf(bondId);
      if (!bb || !Object.keys(bb).length) continue;
      fn(battle, pid, bb);
    }
  }
}

export { bbOf, memberOf };
