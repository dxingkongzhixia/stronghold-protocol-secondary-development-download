// shared/keel/budget.js — per-hook, per-frame and per-match budgets. The runtime charges a module after every hook;
// the first overrun disables that module for the rest of the match instead of letting it slow the engine down.

export class KeelBudgetError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'KeelBudgetError';
    this.code = code;
  }
}

/**
 * @param {{ perHook?: number, perFrame?: number, perMatch?: number }} [limits] milliseconds
 */
export function createBudget(limits = {}) {
  const perHook = Number.isFinite(limits.perHook) ? Number(limits.perHook) : 0.2;
  const perFrame = Number.isFinite(limits.perFrame) ? Number(limits.perFrame) : 0.05;
  const perMatch = Number.isFinite(limits.perMatch) ? Number(limits.perMatch) : 100;
  let hook = 0;
  let frame = 0;
  let match = 0;

  return {
    limits: Object.freeze({ perHook, perFrame, perMatch }),
    /** Start a new frame. */
    nextFrame() { frame = 0; },
    /** Reset everything (a new match). */
    reset() { hook = 0; frame = 0; match = 0; },
    /**
     * Charge one hook call.
     * @param {string} name
     * @param {number} [ms]
     * @returns {{ ok: boolean, reason?: 'hook' | 'frame' | 'match', name: string, ms: number, used: { hook: number, frame: number, match: number } }}
     */
    charge(name, ms = 0.1) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
        throw new KeelBudgetError('KEEL_BUDGET_COST', `the cost of "${name}" is not a finite number ≥ 0`);
      }
      hook = ms;
      frame += ms;
      match += ms;
      const used = { hook, frame, match };
      if (hook > perHook) return { ok: false, reason: 'hook', name, ms, used };
      if (frame > perFrame) return { ok: false, reason: 'frame', name, ms, used };
      if (match > perMatch) return { ok: false, reason: 'match', name, ms, used };
      return { ok: true, name, ms, used };
    },
    /** A copy of the counters. */
    snapshot() { return { hook, frame, match, limits: { perHook, perFrame, perMatch } }; },
    /** Restore counters (a replay). */
    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') throw new KeelBudgetError('KEEL_BUDGET_SNAPSHOT', 'restore() needs a snapshot');
      hook = Number(snapshot.hook) || 0;
      frame = Number(snapshot.frame) || 0;
      match = Number(snapshot.match) || 0;
      return this.snapshot();
    },
  };
}
