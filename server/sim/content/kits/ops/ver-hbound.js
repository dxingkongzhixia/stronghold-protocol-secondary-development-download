// server/sim/content/kits/ops/ver-hbound.js — 旅骨 (char_4232_hbound), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 an alchemy unit for 8 s: ground enemies around it move 30 % slower and take
// 40 % of ATK as arts a second. S2 for 31 s: 14 % a second, heavy enemies (massLevel ≥ 3) 60 % slower and an extra
// 120 %; the talent lowers ground enemies' physical/arts hit rate there by 10 % (15 % heavy).
import { hypot } from '../../../detmath.js';
import { num, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_hbound_1';
const S2 = 'skchr_hbound_2';
const RADIUS = 1.5;

function placeCloud(battle, unit, x, y, { dur, scale, heavyScale, slow, heavySlow, hitDown, heavyHitDown, heavyMass }) {
  const until = battle.time + dur;
  battle.every(1, (b) => {
    if (!up(unit) || b.time > until + 1e-9) return;
    for (const e of b.enemies) {
      if (!e.alive || e.side !== 'enemy' || !e.ground) continue;
      if (hypot(e.x - x, e.y - y) > RADIUS) continue;
      const heavy = (e.s.massLevel ?? 0) >= heavyMass;
      const dmgScale = heavy ? heavyScale : scale;
      if (dmgScale > 0) b.dealDamage(unit, e, { amount: unit.s.atk * dmgScale, type: 'arts', isSkill: true, tags: ['skill', 'alchemy'] });
      const slowV = heavy ? heavySlow : slow;
      const hitV = heavy ? heavyHitDown : hitDown;
      b.addBuff(e, {
        key: `hbound:cloud:${unit.id}`, duration: 1.2, refresh: 'replace', source: unit, visible: true,
        mods: { ...(slowV < 0 ? { moveMul: Math.max(0.05, 1 + slowV) } : {}), ...(hitV > 0 ? { hitRatePhys: -hitV, hitRateArts: -hitV } : {}) },
      });
    }
  }, { owner: unit });
}

function hbound(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const hitDown = num(t0.hitrate, 0.1), heavyHitDown = num(t0.heavy_hitrate, 0.15), heavyMass = num(t0.value, 3);
  const b1 = chess?.skills?.find((s) => s.skillId === S1)?.bb ?? {};
  const cast = (battle, unit, sbb) => {
    const target = battle.enemies.filter((e) => e.alive && e.side === 'enemy').sort((a, b) => b.hp - a.hp)[0];
    if (!target) return;
    placeCloud(battle, unit, target.x, target.y, {
      dur: num(sbb.projectile_delay_time, 8),
      scale: num(sbb.atk_scale, 0.4), heavyScale: num(sbb.heavy_atk_scale, 0),
      slow: num(sbb.move_speed, -0.3), heavySlow: num(sbb.move_speed, -0.3),
      hitDown, heavyHitDown, heavyMass,
    });
    battle.fx('alchemy', { x: target.x, y: target.y, id: unit.id });
  };
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return { kind: 'instant', onStart: ({ battle, unit }) => {
      const target = battle.enemies.filter((e) => e.alive && e.side === 'enemy').sort((a, b) => b.hp - a.hp)[0];
      if (!target) return;
      placeCloud(battle, unit, target.x, target.y, {
        dur: num(sbb.projectile_delay_time, 31),
        scale: num(sbb.atk_scale, 0.14), heavyScale: num(sbb.heavy_atk_scale, 1.2),
        slow: num(sbb.move_speed, -0.6), heavySlow: num(sbb.move_speed, -0.6),
        hitDown, heavyHitDown, heavyMass,
      });
      battle.fx('alchemy', { x: target.x, y: target.y, id: unit.id });
    } };
    return { kind: 'instant', onStart: ({ battle, unit }) => cast(battle, unit, b1) };
  });
  return { skills, skill };
}

export default { char_4232_hbound: hbound };
