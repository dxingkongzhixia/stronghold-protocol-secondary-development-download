// Plain-data helpers for P1b (DESIGN §32.5). No evaluation and no prototype paths.
export const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const own = (v, k) => v != null && Object.hasOwn(v, k);
export const forbidden = k => ['__proto__', 'prototype', 'constructor'].includes(String(k));
export const problem = (code, path, message) => ({ code, path, message });
export const clone = v => Array.isArray(v) ? v.map(clone) : object(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
/**
 * True when two plain JSON values are equal regardless of object key order — the comparison `canonicalJson(a) ===
 * canonicalJson(b)` makes, without building the two strings. Shared subtree references short-circuit, so after a
 * copy-on-write patch the cost follows what changed, not the size of the data set.
 */
export function sameJson(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) return false;
  if (arr) {
    const x = /** @type {any[]} */ (a), y = /** @type {any[]} */ (b);
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!sameJson(x[i], y[i])) return false;
    return true;
  }
  const x = /** @type {Record<string, any>} */ (a), y = /** @type {Record<string, any>} */ (b), kx = Object.keys(x);
  if (kx.length !== Object.keys(y).length) return false;
  for (const k of kx) if (!Object.hasOwn(y, k) || !sameJson(x[k], y[k])) return false;
  return true;
}
/**
 * Copy-on-write primitive for the record expanders: `copy(v)` returns a shallow copy of `v` (an array copy for arrays)
 * at most once, and a copy again returns itself. A build that touches three records therefore copies the tables it
 * writes plus the path to them, and every untouched table keeps the identity of the frozen vanilla one — which is what
 * lets the composer skip re-serialising and re-hashing the whole data set (contentSet.js).
 * @returns {(v: any) => any}
 */
export function copier() {
  const done = new Map();
  return (v) => {
    if (done.has(v)) return done.get(v);
    const c = Array.isArray(v) ? v.slice() : { ...v };
    done.set(v, c);
    done.set(c, c);
    return c;
  };
}
export const namespace = id => String(id).replace(/-/g, '_');
export const recordId = (id, pluginId, prefix) => typeof id === 'string' && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id)
  && (pluginId ? id.startsWith(`${prefix}_${namespace(pluginId)}_`) : new RegExp(`^${prefix}_[a-z0-9_]+_[A-Za-z0-9_-]+$`).test(id));

/** True when two plugin ids claim the same record namespace after `-` becomes `_` (`ab` owns `ab-cd`; `ab` does not own `abc`). */
export function namespaceCollides(a, b) {
  const na = namespace(a), nb = namespace(b);
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return long.startsWith(`${short}_`);
}

/** Pairwise collisions among a selected plugin list. A plugin alone is valid; the clash is only at composition. */
export function namespaceCollisions(ids) {
  const list = [...ids];
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (namespaceCollides(list[i], list[j])) out.push(problem('PLUGIN_RECORD_ID', String(list[j]), `plugin id namespace collides with ${list[i]}`));
  }
  return out;
}

/** Check before cloning: functions, prototype keys, excessive nesting and non-finite numbers are never data. */
export function jsonProblems(value, path = '', { bounded = true } = {}) {
  const out = [], stack = [[value, path, 0]], seen = new Set();
  while (stack.length && out.length < 32) {
    const [v, p, depth, leave] = stack.pop();
    if (leave) { seen.delete(v); continue; }
    if (depth > 64) { out.push(problem('PLUGIN_DATA_LIMIT', p, 'JSON nesting exceeds 64')); continue; }
    if (typeof v === 'number' && (!Number.isFinite(v) || (bounded && Math.abs(v) > 1e9))) out.push(problem('PLUGIN_DATA_NUMBER', p, 'number must be finite and within ±1e9'));
    else if (v !== null && typeof v === 'object') {
      if (seen.has(v)) { out.push(problem('PLUGIN_DATA_TYPE', p, 'cyclic or shared object; JSON required')); continue; }
      seen.add(v);
      stack.push([v, p, depth, true]);
      if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) out.push(problem('PLUGIN_DATA_TYPE', p, 'plain JSON object required'));
      for (const k of Object.keys(v)) {
        if (forbidden(k)) out.push(problem('PLUGIN_DATA_PATH', `${p}.${k}`, 'prototype keys are forbidden'));
        else stack.push([v[k], `${p}.${k}`, depth + 1]);
      }
    } else if (!['string', 'number', 'boolean'].includes(typeof v) && v !== null) out.push(problem('PLUGIN_DATA_TYPE', p, 'JSON value required'));
  }
  return out;
}

/** Recursive object merge; arrays and scalars replace whole values. Inputs must already be checked. */
export function mergeData(base, changes) {
  const out = { ...base };
  for (const [k, v] of Object.entries(changes)) out[k] = object(v) && object(base?.[k]) ? mergeData(base[k], v) : clone(v);
  return out;
}

// [ASSUMED] Additional table prefixes extend the design's chess/char/enemy/mode/skill namespaces (DESIGN §32.5).
export const RECORD_MAPS = Object.freeze({
  chess: ['chess_x', 'chessId'], enemies: ['enemy_x', 'key'], items: ['item_x', 'id'],
  bands: ['band_x', 'bandId'], garrisons: ['garrison_x', 'garrisonId'], effects: ['effect_x', 'effectId'],
  waves: ['wave_x', 'id'], stages: ['stage_x', 'id'], tokens: ['token_x', 'tokenId'],
  bosses: ['boss_x', 'bossId'],
});
