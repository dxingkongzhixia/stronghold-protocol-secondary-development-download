// server/sim/battle/triggers.js — the first-class 触发型效果 (trigger-effect) state. A mark is one buff on a target,
// owned by the caster; a skill decides when it fires and what it does. The engine keeps the bookkeeping (ownership by
// source, one mark per (source, kind), transfer, consume) so kits and future operators share one implementation.
//
// `data.kind` is the mark's kind (usually the skill id): one caster may hold several marks of *different* kinds on the
// same target at once (冻河's S1 shield and S2 attack-speed effect), but never two of one kind — the official
// 触发型效果 is "one per kind and caster" [ASSUMED for S1 / S3; S2 per PRTS "不同冻河间…互相独立"].
export const TRIGGER_EFFECT_KEY = 'trigger:effect';
/** Marks of one target share the buff key: `refresh: 'independent'` lets several coexist; this bounds a pathological stack. */
const MAX_MARKS = 32;

const kindOf = (mark) => (mark && mark.data ? mark.data.kind ?? null : null);
const sameKind = (a, b) => (a ?? null) === (b ?? null);

export class BattleTriggers {
  /**
   * Place a mark; returns false when this caster already holds a mark of that kind on the target
   * (只选择未持有该效果的目标).
   */
  applyTrigger(source, target, data = {}, duration = 999) {
    if (!source || !target?.alive) return false;
    const kind = data.kind ?? null;
    if (this.ownerTrigger(target, source, kind)) return false;
    // A mark may name the status clients draw for it (`data.status`): the official buff template's aura loops follow
    // that status while the mark lasts (render/vfx/wiring.js status, skills.js EXTRA_STATUS_LOOPS).
    const buff = { key: TRIGGER_EFFECT_KEY, duration, source, data, refresh: 'independent', maxStacks: MAX_MARKS };
    if (data.status) buff.status = data.status;
    this.addBuff(target, buff);
    return true;
  }

  /**
   * The mark on `target` when it belongs to `source`, else null. `kind` undefined: any mark of that source (the first);
   * null: the kindless mark only.
   */
  ownerTrigger(target, source, kind = undefined) {
    if (!target?.buffs) return null;
    for (const b of target.buffs) {
      if (b.key !== TRIGGER_EFFECT_KEY || b.source !== source) continue;
      if (kind === undefined || sameKind(kindOf(b), kind)) return b;
    }
    return null;
  }

  /**
   * Consume (trigger) a mark; returns its data, or null when absent. `kind` undefined: the first mark of `source` (any
   * caster when `source` is omitted — the older callers' meaning).
   */
  consumeTrigger(target, kind = undefined, source = undefined) {
    const mark = source !== undefined ? this.ownerTrigger(target, source, kind)
      : (target?.buffs || []).find((b) => b.key === TRIGGER_EFFECT_KEY && (kind === undefined || sameKind(kindOf(b), kind)));
    if (!mark) return null;
    this.removeBuff(target, mark);
    return mark.data ?? {};
  }

  /**
   * Move a mark from one target to another (official 「转移」), returning whether it moved. `kind` undefined: the first
   * mark of `source`. A target already holding that kind of mark from the same caster refuses the move.
   */
  transferTrigger(from, to, source, kind = undefined) {
    const mark = this.ownerTrigger(from, source, kind);
    if (!mark || !to?.alive) return false;
    const data = mark.data ?? {};
    if (this.ownerTrigger(to, source, data.kind ?? null)) return false;
    this.removeBuff(from, mark);
    return this.applyTrigger(source, to, data);
  }
}
