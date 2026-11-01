// server/sim/battle/triggers.js — the first-class 触发型效果 (trigger-effect) state. A mark is one buff on a target,
// owned by the caster; a skill decides when it fires and what it does. The engine keeps the bookkeeping (one mark per
// target, ownership by source, transfer, consume) so kits and future operators share one implementation.
export const TRIGGER_EFFECT_KEY = 'trigger:effect';

export class BattleTriggers {
  /** Place a mark; returns false when the target already holds one (只选择未持有该效果的目标). */
  applyTrigger(source, target, data = {}, duration = 999) {
    if (!source || !target?.alive) return false;
    if (target.findBuff?.(TRIGGER_EFFECT_KEY)) return false;
    // A mark may name the status clients draw for it (`data.status`): the official buff template's aura loops follow
    // that status while the mark lasts (render/vfx/wiring.js status, skills.js EXTRA_STATUS_LOOPS).
    const buff = { key: TRIGGER_EFFECT_KEY, duration, source, data };
    if (data.status) buff.status = data.status;
    this.addBuff(target, buff);
    return true;
  }

  /** The mark on `target` when it belongs to `source`, else null. */
  ownerTrigger(target, source) {
    const mark = target?.findBuff?.(TRIGGER_EFFECT_KEY);
    return mark && mark.source === source ? mark : null;
  }

  /** Consume (trigger) the mark; returns its data, or null when absent. */
  consumeTrigger(target) {
    const mark = target?.findBuff?.(TRIGGER_EFFECT_KEY);
    if (!mark) return null;
    this.removeBuff(target, TRIGGER_EFFECT_KEY);
    return mark.data ?? {};
  }

  /** Move a mark from one target to another (official “转移”), returning whether it moved. */
  transferTrigger(from, to, source) {
    const mark = this.ownerTrigger(from, source);
    if (!mark || !to?.alive) return false;
    this.removeBuff(from, TRIGGER_EFFECT_KEY);
    return this.applyTrigger(source, to, mark.data ?? {});
  }
}
