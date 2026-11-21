// server/sim/content/kits/ops/ver-nothin.js — 乌有 (char_455_nothin), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 stops attacking, blocks nothing, lowers its taunt and regenerates 9 % max HP a
// second for 5 s (the "below 20 % HP" trigger is the AUTO skill's charge [ASSUMED]); carrying it gives block +1. S2 is
// a toggle: ATK +30 %, plus one of three effects chosen at random (attack-speed down on hit / AS +20 / 35 % dodge with
// block +1). Talent: an attack after 4 s without one deals 155 % and stuns for 4 s.
import { num, onHitBy, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_nothin_2';

function nothin(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const idle = num(t0.delay, 4), heavyScale = num(t0.atk_scale, 1.55), heavyStun = num(t0.stun, 4);
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const asDown = num(b2['nothin_s_2[a][attack_speed_down].attack_speed'], -25);
  const asDownDur = num(b2['nothin_s_2[a][attack_speed_down].duration'], 5);
  const asUp = num(b2.attack_speed, 20), dodge = num(b2.prob, 0.35);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'toggle',
      mods: { atkPct: num(sbb.atk) },
      onStart({ battle, unit }) {
        const mode = battle.rng.pick(['asDown', 'asUp', 'dodge']);
        unit.mem.nothinMode = mode;
        if (mode === 'asUp' && asUp > 0) battle.addBuff(unit, { key: 'skill:nothin_as', mods: { aspd: asUp }, visible: true });
        if (mode === 'dodge' && dodge > 0) battle.addBuff(unit, { key: 'skill:nothin_dodge', mods: { dodgePhys: dodge, blockCnt: 1 }, visible: true });
      },
      onAttack({ battle, unit, targets }) {
        if (unit.mem.nothinMode !== 'asDown' || !(asDown < 0)) return;
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          battle.addBuff(t, { key: `nothin:asdown:${unit.id}`, duration: asDownDur, refresh: 'replace', source: unit, visible: true, mods: { aspd: asDown } });
        }
      },
    };
    return {
      kind: 'duration', duration: rec?.duration,
      mods: { blockCnt: -99, taunt: num(sbb.taunt_level, -1), hpRegenRatio: num(sbb.hp_recovery_per_sec_by_max_hp_ratio) },
      attack: { noAttack: true },
    };
  });
  return {
    skills, skill,
    install(battle, unit) {
      // the passive half of S1: block +1 while the skill is carried
      battle.addBuff(unit, { key: 'skill:nothin_block', mods: { blockCnt: 1 } });
      if (!(idle > 0) || !(heavyScale > 1)) return;
      battle.on('attack', (ctx) => { if (ctx.attacker === unit) unit.mem.nothinLastAttack = battle.time; }, { owner: unit });
      onHitBy(battle, unit, ({ target, dmg }) => {
        if (!dmg?.isAttack || !target?.alive || !up(unit)) return;
        const last = unit.mem.nothinLastAttack ?? -Infinity;
        if (battle.time - last + 1e-9 < idle) return;
        dmg.amount *= heavyScale; // 攻击力提升至 atk_scale, before DEF
        if (heavyStun > 0) battle.applyStatus(target, 'stun', { duration: heavyStun, source: unit });
      });
    },
  };
}

export default { char_455_nothin: nothin };
