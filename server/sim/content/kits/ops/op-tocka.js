// server/sim/content/kits/ops/op-tocka.js — 冻河 (char_4244_tocka), 6★ 支援射手 (supportiveranger), the other 6★ of
// the 2026-11-01 banner 「将雪投火」. Data: character_table / skill_table 26-11-01, no module.
//
// The 支援射手 trait grants 触发型效果 support. This kit owns the trigger marks:
//   T1 夜的哑然 — whenever one of her marks triggers: +sp SP and heal one ally in range for heal_scale × ATK.
//   T2 雪的印痕 — after applying a mark her next normal attack is an area hit and leaves the target with
//      `attack@t2_atk` ATK for `attack@t2_buff_duration` s and `attack@t2_magic_atk_scale` × ATK Arts per second.
//   S1 标记射击 — mark up to max_target allies: when a marked ally is hit it gains a shield (shield_atk_scale × ATK,
//      decaying over shield_time) and the attacker is stunned for `stun` s. The official buff template's
//      FilterDamageModifer(damageMask ELEMENT) + IfNot skips element gauge fills / elemental bursts (no attack).
//   S2 交替撤离 — mark one ally; when that ally's skill can open (SP ready, able to act, and for a rule that asks no
//      target of its own an enemy in reach) the mark fires: attack_speed for buff_duration s and a cast window that makes
//      its MANUAL skill behave like an AUTO one (no operation cooldown). Marks of different kinds coexist on one holder.
//   S3 剑走偏锋 — attack_speed, 4-target attacks ×atk_scale with a 0.5 s stun; the mark moves to the ally with the
//      highest SP ratio; the caster and that ally gain a decaying `bonus_init_atk` ATK for `bonus_duration` s and the
//      marked ally gains `bonus_sp` SP per second while the skill runs.
// Kit contract: ../README.md.
import { num, talentBb, skillRec, giveSp, isMainHit, enemyInRange } from '../shared/tier1.js';
import { placeTrigger, triggerOf } from '../shared/triggerEffect.js';
import { openCastWindow } from '../shared/castWindow.js';
import { queueShot, takeShot } from '../shared/shotRecord.js';

const S1 = 'skchr_tocka_1', S2 = 'skchr_tocka_2', S3 = 'skchr_tocka_3';
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
            const allies = battle.alliesInGrid(unit).filter((a) => a !== unit && !triggerOf(a, unit, S1)).slice(0, num(b1.max_target, 2));
            for (const a of allies) {
              placeTrigger(battle, unit, a, { kind: S1, status: 'tocka_s1_mark' });
              // The official mark on the ally: its ON_BUFF_START one-shot (tocka_skill_01_buff_02_start_01).
              battle.fx('mark', { x: a.x, y: a.y, id: unit.id, target: a.id });
            }
          },
        },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const allies = battle.alliesFor(unit)
              .filter((a) => a !== unit && !triggerOf(a, unit, S2) && a.skill && !a.skill.noSkill && a.skill.kind !== 'passive')
              .slice(0, num(b2.max_target, 1));
            for (const a of allies) {
              placeTrigger(battle, unit, a, { kind: S2, status: 'tocka_s2_mark' });
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
              // Official “已存在时改为将其触发”: fire the mark this target already holds (whatever kind), then place S3's.
              const prev = triggerOf(target, unit);
              if (prev) {
                battle.removeBuff(target, prev);
                const kind = prev.data?.kind;
                if (kind === S2) {
                  battle.addBuff(target, { key: 'tocka:s2aspd', duration: num(b2.buff_duration, 15), mods: { aspd: num(b2.attack_speed, 35) } });
                  openCastWindow(battle, target, num(b2.buff_duration, 15));
                } else giveSp(target, 1, 'talent');
                giveSp(unit, num(t1.sp, 2), 'talent');
                const hurt = battle.alliesInGrid(unit).filter((x) => x.alive && x.hpRatio < 1).sort((x, y) => x.hpRatio - y.hpRatio)[0];
                if (hurt) battle.heal(unit, hurt, unit.s.atk * num(t1.heal_scale, 1), { tags: ['talent'] });
                unit.mem.tockaEmpower = true;
              }
              placeTrigger(battle, unit, target, { kind: S3 });
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
          // T2: the next normal attack after a mark is area damage + weakness. What the shot does is decided at LAUNCH
          // (「施加触发型效果后的下次普通攻击」) and applied when that arrow lands: two arrows in flight each keep their own
          // decision (upstream bfd2a9209's shot records).
          const t2dur = num(t2['attack@t2_buff_duration'], 8);
          const t2scale = num(t2['attack@t2_magic_atk_scale'], 0.8);
          const t2atk = num(t2['attack@t2_atk'], -0.2);
          const burst = (target) => {
            for (const e of battle.foesInRadius ? battle.foesInRadius(target.x, target.y, num(t2['attack@projectile_range'], 1.5)) : [target]) {
              if (!e.alive || e.side !== 'enemy') continue;
              battle.addBuff(e, { key: 'tocka:weak', duration: t2dur, mods: { atkPct: t2atk }, source: unit });
              let left = Math.max(1, Math.round(t2dur));
              battle.every(1, (b, sc) => {
                if (e.alive) b.dealDamage(unit, e, { amount: unit.s.atk * t2scale, type: 'arts', isSkill: true, tags: ['talent', 'tocka:t2'] });
                if (--left <= 0) sc.cancel();
              }, { owner: unit });
            }
          };
          // at launch: an empowered attack spends the empowerment and records one shot per target
          battle.on('attack', (c) => {
            if (c.attacker !== unit || !unit.mem.tockaEmpower) return;
            unit.mem.tockaEmpower = false;
            for (const t of c.targets || []) if (t) queueShot(unit, c.attackId, t, { t2: true });
          }, { owner: unit });
          // on impact: the record that belongs to this arrow (damage DEALT by her — `onHitOn` is damage TO the unit)
          battle.on('damaged', (c) => {
            const target = c.target, dmg = c.dmg;
            if (c.source !== unit || !target?.alive || !isMainHit(dmg)) return;
            const shot = takeShot(unit, dmg.attackId, target);
            // a melee attack has no flight: the launch event fires after its damage, so fall back to the flag
            if (!shot && !unit.mem.tockaEmpower) return;
            if (!shot) unit.mem.tockaEmpower = false;
            burst(target);
          }, { owner: unit });
          // S2: the mark triggers when the marked ally's skill can open (official 技能可开启时): SP ready, able to act, not
          // silenced, and a legal target of its own kind — an injured ally for a heal skill, else an enemy in its attack
          // or skill range (or one it blocks; the owner's test of 2026-11-03: 「没敌人不会放」). Then ASPD + buff_duration
          // and a cast window: the MANUAL skill behaves like an AUTO one meanwhile (「期间技能变为自动开启」).
          const canOpen = (b, a) => {
            const sk = a.skill;
            if (!sk || sk.noSkill || sk.kind === 'passive' || sk.active) return false;
            if (!sk.ready || !a.canAct || a.s.flags.silence) return false;
            if (sk.healSkill) return b.injuredAlliesInKeys(a.rangeKeys, a).length > 0;
            return !!a.blockedBy || enemyInRange(b, a);
          };
          battle.every(0.2, (b) => {
            for (const a of battle.alliesFor(unit)) {
              if (!a.alive) continue;
              const mark = triggerOf(a, unit, S2);
              if (!mark) continue;
              if (!canOpen(b, a)) continue;
              battle.removeBuff(a, mark);
              battle.addBuff(a, { key: 'tocka:s2aspd', duration: num(b2.buff_duration, 15), mods: { aspd: num(b2.attack_speed, 35) } });
              openCastWindow(b, a, num(b2.buff_duration, 15));
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
            // Official tocka_s1[trigger]: FilterDamageModifer(`_damageMask: ELEMENT`) + IfNot — element gauge fills and
            // elemental burst damage are no attack on the ally and do not fire the shield.
            if (ctx.type === 'element' || ctx.type === 'elemental') return;
            const mark = triggerOf(ally, unit);
            if (!mark) return;
            if (mark.data?.kind === S2) return; // S2 triggers on the skill becoming able to open, not on damage
            battle.removeBuff(ally, mark);
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
