// Attack-clip pacing for a unit view (render/units.js, #729): the actor's attack clip is stretched over the unit's attack
// interval, so a wrong interval is visible as a slow-motion (or rushed) swing. The view used to start from a base-record
// guess (`bat × 100 / aspd`, no buffs) and crawl toward the truth over several attacks — a skill that changed the interval
// mid-battle (惊蛰 was the reported case) played in slow motion until it got there.
//
// The sim now hands over the unit's own interval: `UnitInfo.atkInterval` at spawn and a `['rate', id, seconds]` event on
// every change. That value is AUTHORITATIVE: when the view has it, a measured gap between two attacks is not used at all
// (a long gap is a pause — a stop, a stun, a redeploy, a hidden tab — not a slower rhythm). Only a view that never learnt
// the sim's value (an old server, an old recorded battle) falls back to measuring.
//
// DISPLAY POLICY, not a rule of the game: the clamp below only bounds what this renderer shows, so a broken value (0,
// NaN, a clock jump) cannot freeze or explode a clip. It never changes what happens in the battle.
export const ATK_MIN_S = 0.2;  // [ASSUMED] display lower bound (5 attacks / s)
export const ATK_MAX_S = 10;   // [ASSUMED] display upper bound (1 attack / 10 s) — slow bosses keep their real clip
export const ATK_DEFAULT_S = 1.2; // [ASSUMED] nothing known at all
export const ATK_SANE_S = [0.05, 10]; // [ASSUMED] a measured gap outside this is a stall (hidden tab, reconnect), not a rhythm
/** A measured change bigger than this share of the current interval is taken at once (a skill, an attack-speed buff). */
export const ATK_JUMP_TOLERANCE = 0.08; // [ASSUMED] one 30 Hz tick of a 1 s rhythm (3.3 %) plus wind-up jitter
/** How much of a sub-threshold wobble a measuring (non-authoritative) view applies per attack. [ASSUMED] */
export const ATK_DRIFT_SHARE = 0.25;

/** Clamp an attack interval into what the renderer can show. A non-number or a non-positive value → ATK_DEFAULT_S. */
export function clampAtkInterval(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return ATK_DEFAULT_S;
  return Math.min(ATK_MAX_S, Math.max(ATK_MIN_S, n));
}

/**
 * The interval a view starts from: the spawn UnitInfo's own value (authoritative), else the base-record guess, else
 * ATK_DEFAULT_S. `null` / `undefined` / `0` fall through.
 * @param {number|null|undefined} simValue `UnitInfo.atkInterval`
 * @param {number|null|undefined} guess the `bat × 100 / aspd` of the operator's record
 */
export function startAtkInterval(simValue, guess) {
  const s = Number(simValue);
  if (Number.isFinite(s) && s > 0) return clampAtkInterval(s);
  const g = Number(guess);
  if (Number.isFinite(g) && g > 0) return clampAtkInterval(g);
  return ATK_DEFAULT_S;
}

/**
 * The interval to use after `measured` seconds between two attacks of one unit.
 *
 *   * authoritative (the sim's value is known): the measurement is ignored — the sim owns the rhythm, and a gap that
 *     differs is the time the unit was NOT attacking (a stop, a stun, a control, a redeploy);
 *   * otherwise: the first usable gap replaces the estimate outright (no slow ramp-in), a later change past
 *     `ATK_JUMP_TOLERANCE` is taken at once, and only a smaller wobble is smoothed by `ATK_DRIFT_SHARE`;
 *   * a gap outside `ATK_SANE_S` is never a rhythm (a hidden tab, a reconnect) and keeps the current value.
 * @param {number} prev current interval
 * @param {number} measured seconds between the last two attacks
 * @param {boolean} hasMeasured whether an earlier sane gap was already applied
 * @param {{ authoritative?: boolean }} [opts]
 * @returns {{ interval: number, measured: boolean }} measured = true when this gap was usable
 */
export function nextAtkInterval(prev, measured, hasMeasured, opts = {}) {
  const base = clampAtkInterval(prev);
  if (opts.authoritative) return { interval: base, measured: false };
  const d = Number(measured);
  const [lo, hi] = ATK_SANE_S;
  if (!Number.isFinite(d) || d <= lo || d >= hi) return { interval: base, measured: false };
  const target = clampAtkInterval(d);
  const jump = !hasMeasured || Math.abs(target - base) > base * ATK_JUMP_TOLERANCE;
  return { interval: jump ? target : clampAtkInterval(base + (target - base) * ATK_DRIFT_SHARE), measured: true };
}
