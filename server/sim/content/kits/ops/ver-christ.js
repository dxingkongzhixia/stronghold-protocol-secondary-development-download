// server/sim/content/kits/ops/ver-christ.js — Miss.Christine (char_4198_christ), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +15 %, two targets, attacks apply 15 % of ATK as 神经损伤 (neural gauge).
// S2 stops attacking and a spirit at the target's position hits every enemy around it for 75 % of ATK a second, +60 %
// elemental on neural-burst targets. Talent: an enemy in range whose palsy triggers takes 90 % of ATK as elemental.
import { hypot } from '../../../detmath.js';
import { num, onHitBy, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';
import { elementHit } from '../shared/tier5.js';

const S1 = 'skchr_christ_1';
const S2 = 'skchr_christ_2';
const SPIRIT_RADIUS = 1.5;

function inRadius(e, x, y, r) { return hypot(e.x - x, e.y - y) <= r + 1e-6; }

function christ(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const palsyScale = num(t0.atk_scale, 0.9);
  const b1 = chess?.skills?.find((s) => s.skillId === S1)?.bb ?? {};
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const ep1 = num(b1['attack@ep_damage_ratio'], 0.15);
  const pulse = num(b2.atk_scale, 0.75), epExtra = num(b2.atk_scale_ep, 0.6);
  const interval = Math.max(0.2, num(b2.interval, 1)), radius = num(b2.projectile_range, SPIRIT_RADIUS);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      attack: { noAttack: true },
      onStart({ battle, unit }) {
        const target = battle.enemies.filter((e) => e.alive && e.side === 'enemy').sort((a, b) => b.hp - a.hp)[0];
        if (!target) return;
        const x = target.x, y = target.y;
        unit.mem.christX = x; unit.mem.christY = y;
        battle.fx('spirit', { x, y, id: unit.id });
        battle.every(interval, (b) => {
          if (!up(unit) || !unit.skill?.active || unit.skill.id !== S2) return;
          for (const e of b.enemies) {
            if (!e.alive || e.side !== 'enemy' || !inRadius(e, x, y, radius)) continue;
            b.dealDamage(unit, e, { amount: unit.s.atk * pulse, type: 'arts', isSkill: true, tags: ['skill'] });
            if (epExtra > 0 && e.findBuff('neuralBurst')) elementHit(b, unit, e, unit.s.atk * epExtra, 'christ', 'neural');
          }
        }, { owner: unit });
      },
    };
    return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) },
      attack: { maxTargets: Math.max(1, Math.floor(num(sbb['attack@max_target'], 2))) },
    };
  });
  return {
    skills, skill,
    install(battle, unit) {
      onHitBy(battle, unit, ({ target, dmg }) => {
        if (!dmg?.isAttack || !target?.alive || !up(unit) || !unit.skill?.active || unit.skill.id !== S1 || !(ep1 > 0)) return;
        battle.dealDamage(unit, target, { amount: unit.s.atk * ep1, type: 'element', element: 'neural', tags: ['skill', 'neural'] });
      });
      if (palsyScale > 0) battle.on('palsyTrigger', (ctx) => {
        const e = ctx.enemy;
        if (!e?.alive || e.side !== 'enemy' || !up(unit) || !unit.rangeKeySet?.has?.(Math.round(e.y) * 12 + Math.round(e.x))) return;
        elementHit(battle, unit, e, unit.s.atk * palsyScale, 'christ', 'neural');
      }, { owner: unit });
    },
  };
}

export default { char_4198_christ: christ };
