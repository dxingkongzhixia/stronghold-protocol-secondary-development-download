// server/sim/content/kits/shared/triggerEffect.js — the kit-side view of the engine's 触发型效果 (server/sim/battle/
// triggers.js). One mark per (caster, kind); the skill decides what fires it. Kept as a thin wrapper so the 支援型 kits
// read naturally (`placeTrigger` / `triggerOf` / `consumeTrigger` / `transferTrigger`).
export { TRIGGER_EFFECT_KEY as TRIGGER_MARK } from '../../../battle/triggers.js';

/** Place a mark on `target`, unless this caster already holds one of `data.kind`. */
export function placeTrigger(battle, source, target, data = {}, duration = 999) {
  return battle.applyTrigger(source, target, data, duration);
}

/** The mark on `target` of `source` and `kind` (undefined: any mark of that source). */
export function triggerOf(target, source, kind = undefined) {
  if (!target?.buffs) return null;
  for (const b of target.buffs) {
    if (b.key !== 'trigger:effect' || b.source !== source) continue;
    if (kind === undefined || (b.data ? b.data.kind ?? null : null) === (kind ?? null)) return b;
  }
  return null;
}

/** Consume (trigger) the mark on `target`; returns its data, or null. */
export function consumeTrigger(battle, target, kind = undefined, source = undefined) {
  return battle.consumeTrigger(target, kind, source);
}

/** Move `source`'s mark of `kind` from `from` to `to` (official 转移). */
export function transferTrigger(battle, from, to, source, kind = undefined) {
  return battle.transferTrigger(from, to, source, kind);
}
