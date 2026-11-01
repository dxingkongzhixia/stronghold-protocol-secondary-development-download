// server/sim/content/kits/shared/triggerEffect.js — the kit-side view of the engine's 触发型效果 (server/sim/battle/
// triggers.js). One mark per target, owned by the caster; the skill decides what fires it. Kept as a thin wrapper so the
// 支援射手 kits read naturally (`placeTrigger` / `triggerOf` / `consumeTrigger`).
export { TRIGGER_EFFECT_KEY as TRIGGER_MARK } from '../../../battle/triggers.js';

/** Place a mark on `target`, unless it already holds one. */
export function placeTrigger(battle, source, target, data = {}, duration = 999) {
  return battle.applyTrigger(source, target, data, duration);
}

/** The mark on `target` when it belongs to `source`, else null. */
export function triggerOf(target, source) {
  const mark = target?.findBuff?.('trigger:effect');
  return mark && mark.source === source ? mark : null;
}

/** Consume (trigger) the mark on `target`; returns its data, or null. */
export function consumeTrigger(battle, target) {
  return battle.consumeTrigger(target);
}
