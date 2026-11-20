// server/sim/content/kits/ops/ver-amiya3.js — 阿米娅（医疗） (char_1037_amiya3), 规程·序列Ⅰ.
// The official chess_char_5_26 names char_002_amiya as its row but templated it with char_1037_amiya3
// (backup.tmplId; tools/build-data.mjs applies the template), so the act3 operator is this 咒愈师 body, not the 术师 one.
// S1 哀恸共情: attack speed +45 and every attack also heals the allies on the skill's own grid. S2 慈悲愿景: an opening
// attack on every enemy in range at 1.55× with a slow, ATK +20 % per enemy hit (5 stacks at most), true damage and two
// targets afterwards, once per battle. Talent 诚挚期许: +8 % max HP to every ally and, while a skill is active, a
// 2.5 % max-HP regen each second. The incantation trait (heal the lowest-HP ally for a share of the damage) is the
// profession (server/sim/professions.js installIncantation), not this kit.
import { textCount } from '../../../../../shared/plugins/textNumber.js';
import { installAura, num, skillBbOf, talentBb } from '../shared/tier1.js';
import { descOf, kitSkills, posDur } from '../shared/version.js';

const S1 = 'skchr_amiya3_1';
const S2 = 'skchr_amiya3_2';

function amiya3(_bb, chess, def) {
  const t0 = talentBb(chess, 0);
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return {
      kind: 'duration', duration: posDur(rec),
      mods: { aspd: num(sbb.attack_speed) },
      // PRTS 哀恸共情 备注: "作用范围为周围十二格（碰撞判定）" — the 12 tiles around her (3×3 without the corners plus
      // the four tiles two steps orthogonally), not her attack range and not the skill's range grid. The profession
      // trait heal still happens on its own.
      attack: {
        onHit({ battle, unit }) {
          const scale = num(sbb.heal_scale);
          if (!(scale > 0)) return;
          const amount = unit.s.atk * scale;
          for (const a of battle.alliesInRadius(unit.x, unit.y, 2)) battle.heal(unit, a, amount, { tags: ['amiya3:s1'] });
        },
      },
    };
    if (id === S2) {
      const n = textCount(descOf(rec), /同时攻击(\d+)名/, 2, 'amiya3-s2');
      // 立刻…进行一次攻击力为 155 % 的攻击, then the skill's own attacks are 真实 damage on two targets. The opening
      // volley is dealt below; `noAttack` keeps the pending normal attack from also firing as true damage, and the
      // scheduled release restores it on the next step, after that volley.
      const attack = { noAttack: true, dmgType: 'true', maxTargets: n };
      return {
        kind: 'duration', duration: posDur(rec),
        attack,
        targeting: { maxTargets: n },
        onStart({ battle, unit }) {
          const scale = num(sbb.atk_scale, 1);
          let hit = 0;
          for (const e of battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true })) {
            if (!e.alive) continue;
            const dealt = battle.dealDamage(unit, e, {
              amount: unit.s.atk * scale, type: 'arts', isAttack: true, isSkill: true, tags: ['amiya3:open'],
            });
            const deb = num(sbb['amiya3_s_2[debuff].duration']);
            if (e.alive && deb > 0) {
              battle.addBuff(e, {
                key: 'amiya3:s2', duration: deb, refresh: 'replace', source: unit, tags: ['skill'],
                mods: { aspd: num(sbb['amiya3_s_2[debuff].attack_speed']) },
              });
              const slow = Math.abs(num(sbb['amiya3_s_2[debuff].move_speed']));
              if (slow > 0) battle.applyStatus(e, 'slow', { duration: deb, value: slow, source: unit });
            }
            if (dealt > 0) hit++;
          }
          const stacks = Math.min(Math.max(0, Math.floor(num(sbb.max_stack_cnt))), hit);
          if (stacks > 0 && num(sbb.atk)) {
            battle.addBuff(unit, { key: 'amiya3:s2atk', mods: { atkPct: num(sbb.atk) * stacks }, refresh: 'replace', tags: ['skill'] });
          }
          battle.after(0, () => {
            if (unit.skill?.active && unit.skill.id === S2) attack.noAttack = false;
          }, { owner: unit });
        },
        onEnd({ battle, unit }) {
          attack.noAttack = true;
          battle.removeBuff(unit, 'amiya3:s2atk');
        },
      };
    }
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      const hp = num(t0.max_hp);
      const regen = num(t0.hp_recovery_per_sec_by_max_hp_ratio);
      if (hp || regen) {
        installAura(battle, unit, {
          key: 'amiya3:hope', select: () => true, interval: 0.25, value: hp,
          mods: () => {
            const m = {};
            if (hp) m.hpPct = hp;
            if (regen && unit.skill?.active) m.hpRegenRatio = regen;
            return m;
          },
        });
      }
      if (sid !== S2) return;
      // 整场战斗中该技能只能释放一次: activations survive redeploy, so the lock installs only when S2 is selected.
      const uses = Math.max(1, Math.floor(num(skillBbOf(chess, S2).skill_max_trigger_time, 1)));
      battle.on('spGain', (c) => {
        if (c.unit === unit && unit.skill && !unit.skill.active && unit.skill.activations >= uses) c.amount = 0;
      }, { owner: unit });
    },
  };
}

export default { char_1037_amiya3: amiya3 };
