// server/match/botPrior.js — the trained prior over bot layout candidates (`server/match/botPrior.json`).
//
// WHAT IT IS. `tools/train-bot.mjs --auto` fits a small table from the recorded rehearsals:
//
//   { version, trainedAt, samples, byKey: { "<stage>|<round>": { "<family>": { n, mean } } } }
//
// `family` is a coarse signature of a layout (which cells of a 3×5 band grid the pieces occupy), so a layout the
// rehearsal has never seen still lands in a family that has been seen. `mean` is the rehearsal's own score
// (leaks·−1000 + kills) averaged over the samples.
//
// HOW IT IS USED. `bot.js` orders the candidate plans by `rankPlans` before taking its `botRehearsal` slice: the prior
// decides WHICH candidates are simulated, the simulation still decides which one wins. It never touches server/sim and
// is a pure function of (stage, round, plan) over a static file, so a seeded match stays reproducible.
//
// SAFETY. Missing / unreadable / stale (`schemaVersion` mismatch) / disabled (`SP_BOT_PRIOR=off`) → the heuristic order
// stands. The file is machine-local and git-ignored; the repo has no prior until the box trains one.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

/** Bumped when `planFamily` changes: a table fitted with another signature is ignored (not mis-read). */
export const PRIOR_SCHEMA = 1;

/** Bands per axis of the family signature (rows × cols). */
const BANDS_R = 3;
const BANDS_C = 5;

let state = {
  enabled: false,
  file: null,
  mtimeMs: 0,
  prior: null,
  counters: { reloads: 0, applied: 0, fallbacks: 0, rankCalls: 0 },
  lastError: null,
  log: console,
};

/**
 * Point the module at a prior file (or disable it). Called once by `server/index.js`; tests call it directly.
 * @param {{ file?: string|null, enabled?: boolean, log?: any }} [opts]
 */
export function configurePrior({ file = null, enabled = true, log = console } = {}) {
  state = { enabled: !!enabled && !!file, file: file || null, mtimeMs: 0, prior: null, counters: state.counters, lastError: null, log };
  reloadPrior(true);
}

/** The currently loaded prior (`{version, trainedAt, samples, byKey}`) or null. */
export function currentPrior() {
  return state.prior;
}

/** Telemetry for /healthz: enabled, whether a valid table is loaded, and the usage counters. */
export function priorStatus() {
  return {
    enabled: state.enabled,
    loaded: !!state.prior,
    version: state.prior?.version ?? null,
    trainedAt: state.prior?.trainedAt ?? null,
    samples: state.prior?.samples ?? null,
    ...state.counters,
    lastError: state.lastError ? String(state.lastError.message || state.lastError) : null,
  };
}

/** Reset the counters (tests). */
export function resetPriorCounters() {
  state.counters = { reloads: state.counters.reloads, applied: 0, fallbacks: 0, rankCalls: 0 };
}

/**
 * Re-read the prior when the file changed (the trainer replaces it atomically). Cheap: one `statSync` per call, called
 * once per bot prep. A changed but invalid file keeps the previous table.
 * @param {boolean} [force]
 * @returns {boolean} whether a new table was loaded
 */
export function reloadPrior(force = false) {
  if (!state.enabled) return false;
  try {
    const st = fs.statSync(state.file);
    if (!force && st.mtimeMs === state.mtimeMs) return false;
    state.mtimeMs = st.mtimeMs;
    const doc = JSON.parse(fs.readFileSync(state.file, 'utf8'));
    if (!doc || doc.schemaVersion !== PRIOR_SCHEMA || typeof doc.byKey !== 'object' || !doc.byKey) {
      throw new Error(`prior schema mismatch (want ${PRIOR_SCHEMA})`);
    }
    state.prior = doc;
    state.counters.reloads++;
    state.lastError = null;
    state.log.info?.(`[botPrior] loaded v${doc.version} (${doc.samples} samples, trained ${doc.trainedAt})`);
    return true;
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      // no prior yet: the heuristic order stands, silently
      state.prior = null;
      return false;
    }
    state.lastError = e;
    state.log.warn?.(`[botPrior] keeping the previous prior: ${e?.message || e}`);
    return false;
  }
}

/**
 * Coarse layout signature: which of a 3×5 grid of bands the plan's tile keys fall in, as counts. Independent of the
 * pieces' ids, so two arrangements that occupy the same region share a family.
 * @param {Map<number, string> | Iterable<[number, string]>} plan tile keys are `'r,c'`
 */
export function planFamily(plan) {
  const counts = new Array(BANDS_R * BANDS_C).fill(0);
  const entries = plan instanceof Map ? plan.entries() : plan || [];
  for (const [, key] of entries) {
    const m = /^(\d+),(\d+)$/.exec(String(key));
    if (!m) continue;
    const r = Number(m[1]);
    const c = Number(m[2]);
    // the board is 13 rows × 21 cols (shared/constants.js GEO): band by fraction, clamped
    const br = Math.min(BANDS_R - 1, Math.max(0, Math.floor((r / 13) * BANDS_R)));
    const bc = Math.min(BANDS_C - 1, Math.max(0, Math.floor((c / 21) * BANDS_C)));
    counts[br * BANDS_C + bc]++;
  }
  return createHash('sha1').update(counts.join(',')).digest('hex').slice(0, 10);
}

/** The table entry for `(stage, round, plan)`: `{ n, mean }` or null. */
export function priorEntry(m, plan) {
  const p = state.prior;
  if (!p) return null;
  const key = `${m?.stageId ?? ''}|${m?.round ?? ''}`;
  const byFamily = p.byKey[key];
  if (!byFamily) return null;
  return byFamily[planFamily(plan)] || null;
}

/**
 * Order candidate plans as the prior suggests. Entries without data keep their heuristic position, behind the known
 * ones; the heuristic's first plan is always first (a prior this thin must never starve the caller's own pick).
 * @param {{ stageId?: string, round?: number }} m
 * @param {Array<Map<number, string>>} plans
 * @returns {Array<Map<number, string>>} a new array (the input is not modified)
 */
export function rankPlans(m, plans) {
  const list = Array.isArray(plans) ? plans.slice() : [];
  if (list.length < 2) return list;
  state.counters.rankCalls++;
  if (!state.prior) { state.counters.fallbacks++; return list; }
  const scored = list.map((plan, i) => ({ plan, i, e: priorEntry(m, plan) }));
  if (!scored.some((x) => x.e)) { state.counters.fallbacks++; return list; }
  scored.sort((a, b) => {
    if (a.i === 0) return -1;                 // the heuristic's pick stays first
    if (b.i === 0) return 1;
    const am = a.e ? a.e.mean : -Infinity;
    const bm = b.e ? b.e.mean : -Infinity;
    if (am !== bm) return bm - am;           // higher mean first (unseen last)
    return a.i - b.i;                        // stable on ties
  });
  state.counters.applied++;
  return scored.map((x) => x.plan);
}
