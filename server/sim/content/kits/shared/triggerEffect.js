// server/sim/content/kits/shared/triggerEffect.js — the shared 触发型效果 (trigger-effect) state used by the 支援射手
// family (冻河, 佩德洛) and any future operator that applies one. One mark per target, owned by the caster; a skill
// decides what the mark does when it triggers (on damage, on a skill becoming ready, …) and consumes it.
//
// This is deliberately a kit-level registry for now: the engine has no first-class trigger-effect action, and the
// operators that carry one are all owned-6★ kits. Moving it into server/sim/ is the next step once a second family
// needs it.

/** The buff key of the mark. `data` is the caster's payload (which skill/effect it is). */
export const TRIGGER_MARK = 'trigger:effect';

/** Place a mark on `target`, unless it already holds one (the official “只选择未持有该效果的目标”). */
export function placeTrigger(battle, source, target, data = {}, duration = 999) {
  if (!battle || !source || !target?.alive || target.side !== 'ally') return false;
  if (target.findBuff?.(TRIGGER_MARK)) return false;
  battle.addBuff(target, { key: TRIGGER_MARK, duration, source, data });
  return true;
}

/** The mark on `target` when it belongs to `source`, else null. */
export function triggerOf(target, source) {
  const mark = target?.findBuff?.(TRIGGER_MARK);
  return mark && mark.source === source ? mark : null;
}

/** Consume (trigger) the mark on `target`. Returns the mark's data, or null. */
export function consumeTrigger(battle, target) {
  const mark = target?.findBuff?.(TRIGGER_MARK);
  if (!mark) return null;
  battle.removeBuff(target, TRIGGER_MARK);
  return mark.data ?? {};
}
