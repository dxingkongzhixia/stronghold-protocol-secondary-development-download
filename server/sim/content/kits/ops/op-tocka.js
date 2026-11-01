// server/sim/content/kits/ops/op-tocka.js — 冻河 (char_4244_tocka), 6★ 支援射手 (supportiveranger), the other 6★ of
// the 2026-11-01 banner 「将雪投火」. Data: character_table / skill_table 26-11-01, no module.
//
// The 支援射手 trait grants 触发型效果 support. This kit owns the trigger marks:
//   T1 夜的哑然 — whenever one of her marks triggers: +sp SP and heal one ally in range for heal_scale × ATK.
//   T2 雪的印痕 — after applying a mark her next normal attack is an area hit and leaves the target with
//      `attack@t2_atk` ATK for `attack@t2_buff_duration` s and `attack@t2_magic_atk_scale` × ATK Arts per second.
//   S1 标记射击 — mark up to max_target allies: when a marked ally is hit it gains a shield (shield_atk_scale × ATK,
//      decaying over shield_time) and the attacker is stunned for `stun` s.
//   S2 交替撤离 — mark one ally; while the mark is held it gains attack_speed for buff_duration s.
//   S3 剑走偏锋 — attack_speed, 4-target attacks ×atk_scale with a 0.5 s stun; the mark moves to the ally with the
//      highest SP ratio; the caster and that ally gain a decaying `bonus_init_atk` ATK for `bonus_duration` s and the
//      marked ally gains `bonus_sp` SP per second while the skill runs.
// [ASSUMED] S2's "技能可开启时" is read as "when the mark is applied" in this port; the client's trigger-effect prefab
// is the visual (kit emits no procedural field).
// Kit contract: ../README.md.
import { num, talentBb, skillRec, giveSp, onHitOn, isMainHit } from '../shared/tier1.js';

const S1 = 'skchr_tocka_1', S2 = 'skchr_tocka_2', S3 = 'skchr_tocka_3';
const MARK = 'tocka:mark';
const bbOf = (raw, id) => skillRec(raw, id)?.bb ?? {};

export default {
  char_4244_tocka: (bb, raw) => {
    const t1 = talentBb(raw, 0), t2 = talentBb(raw, 1);
    const b1 = bbOf(raw, S1), b2 = bbOf(raw, S2), b3 = bbOf(raw, S3);
    return {
      skills: {
        [S1]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const allies = battle.alliesInGrid(unit).filter((a) => a !== unit && !a.findBuff(MARK)).slice(0, num(b1.max_target, 2));
            for (const a of allies) battle.addBuff(a, { key: MARK, duration: 999, source: unit, data: { kind: S1 } });
          },
        },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const allies = battle.alliesFor(unit).filter((a) => a !== unit && !a.findBuff(MARK)).slice(0, num(b2.max_target, 1));
            for (const a of allies) {
              battle.addBuff(a, { key: MARK, duration: 999, source: unit, data: { kind: S2 } });
            }
          },
        },
        [S3]: {
          kind: 'duration',
          mods: { aspd: num(b3.attack_speed) },
          attack: {
            atkScale: num(b3['attack@atk_scale'], 1.9), maxTargets: num(b3['attack@max_target'], 4),
            onEachHit({ battle, unit, target }) {
              if (target?.alive) battle.applyStatus(target, 'stun', { duration: num(b3['attack@stun'], 0.5), source: unit });
            },
          },
          onStart({ battle, unit }) {
            const ratio = (a) => (a.skill?.spTotal ? (a.skill.sp ?? 0) / a.skill.spTotal : 0);
            const allies = battle.alliesFor(unit).filter((a) => a !== unit).sort((a, b) => ratio(b) - ratio(a));
            const target = allies[0];
            if (target) {
              battle.removeBuff(target, MARK);
              battle.addBuff(target, { key: MARK, duration: 999, source: unit, data: { kind: S3 } });
            }
            const init = num(b3.bonus_init_atk, 0.9), dec = num(b3.bonus_atk_dec_per_sec, 0.06);
            const dur = num(b3.bonus_duration, 15);
            const holders = [unit, target].filter(Boolean);
            let left = dur;
            battle.every(1, (b, sc) => {
              const k = Math.max(0, init - dec * (dur - left));
              for (const a of holders) {
                if (!a.alive) continue;
                b.removeBuff(a, 'tocka:bonus');
                if (k > 0) b.addBuff(a, { key: 'tocka:bonus', duration: 1.05, mods: { atkPct: k } });
              }
              if (target?.alive && unit.skill?.id === S3 && unit.skill.active) giveSp(target, num(b3.bonus_sp, 1), 'talent');
              if (--left <= 0) sc.cancel();
            }, { owner: unit, immediate: true });
          },
        },
      },
      talents: [{
        install(battle, unit) {
          // T2: the next normal attack after a mark is area damage + weakness.
          const t2dur = num(t2['attack@t2_buff_duration'], 8);
          const t2scale = num(t2['attack@t2_magic_atk_scale'], 0.8);
          const t2atk = num(t2['attack@t2_atk'], -0.2);
          onHitOn(battle, unit, ({ target, dmg }) => {
            if (!isMainHit(dmg) || !unit.mem.tockaEmpower || !target?.alive) return;
            unit.mem.tockaEmpower = false;
            for (const e of battle.foesInRadius ? battle.foesInRadius(target.x, target.y, num(t2['attack@projectile_range'], 1.5)) : [target]) {
              if (!e.alive || e.side !== 'enemy') continue;
              battle.addBuff(e, { key: 'tocka:weak', duration: t2dur, mods: { atkPct: t2atk }, source: unit });
              let left = Math.max(1, Math.round(t2dur));
              battle.every(1, (b, sc) => {
                if (e.alive) b.dealDamage(unit, e, { amount: unit.s.atk * t2scale, type: 'arts', isSkill: true, tags: ['talent', 'tocka:t2'] });
                if (--left <= 0) sc.cancel();
              }, { owner: unit });
            }
          });
          // S2: the mark triggers when the marked ally's skill becomes ready (official 技能可开启时), then grants
          // attack_speed for buff_duration and counts as a trigger effect (T1/T2).
          battle.every(0.2, () => {
            for (const a of battle.alliesFor(unit)) {
              if (!a.alive) continue;
              const mark = a.findBuff(MARK);
              if (!mark || mark.source !== unit || mark.data?.kind !== S2) continue;
              if (!a.skill?.ready) continue;
              battle.removeBuff(a, MARK);
              battle.addBuff(a, { key: 'tocka:s2aspd', duration: num(b2.buff_duration, 15), mods: { aspd: num(b2.attack_speed, 35) } });
              giveSp(unit, num(t1.sp, 2), 'talent');
              const hurt = battle.alliesInGrid(unit).filter((x) => x.alive && x.hpRatio < 1).sort((x, y) => x.hpRatio - y.hpRatio)[0];
              if (hurt) battle.heal(unit, hurt, unit.s.atk * num(t1.heal_scale, 1), { tags: ['talent'] });
              unit.mem.tockaEmpower = true;
            }
          }, { owner: unit });
          // T1 + the marks' on-hit effects.
          battle.on('damaged', (ctx) => {
            const ally = ctx.target;
            if (!ally?.alive || ally.side !== 'ally') return;
            const mark = ally.findBuff(MARK);
            if (!mark || mark.source !== unit) return;
            if (mark.data?.kind === S2) return; // S2 triggers on the skill becoming ready, not on damage
            battle.removeBuff(ally, MARK);
            const kind = mark.data?.kind;
            if (kind === S1) {
              const shield = unit.s.atk * num(b1.shield_atk_scale, 1.9);
              battle.addBuff(ally, { key: 'tocka:shield', shield, duration: num(b1.shield_time, 10), visible: true, tags: ['skill'] });
              if (ctx.source?.alive && ctx.source.side === 'enemy') battle.applyStatus(ctx.source, 'stun', { duration: num(b1.stun, 3), source: unit });
            }
            giveSp(unit, num(t1.sp, 2), 'talent');
            const hurt = battle.alliesInGrid(unit).filter((a) => a.alive && a.hpRatio < 1).sort((a, b) => a.hpRatio - b.hpRatio)[0];
            if (hurt) battle.heal(unit, hurt, unit.s.atk * num(t1.heal_scale, 1), { tags: ['talent'] });
            unit.mem.tockaEmpower = true;
          }, { owner: unit });
        },
      }],
    };
  },
};
