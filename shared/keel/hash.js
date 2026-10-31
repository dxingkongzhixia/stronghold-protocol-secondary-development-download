// shared/keel/hash.js — canonical JSON and a small deterministic hash (no Node crypto, browser-safe).
//
// The runtime hashes its snapshot so two runs and two hosts can compare state without shipping a crypto dependency.
// This is not a security hash: it is a determinism check.

/** Sort object keys recursively; preserve array order; reject values JSON cannot represent. */
export function canonicalJson(value, path = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v, i) => canonicalJson(v, `${path}[${i}]`)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k], `${path}.${k}`)}`).join(',')}}`;
  }
  throw new TypeError(`${path} is not JSON (${typeof value})`);
}

/** FNV-1a 32-bit over a string, as eight hex digits. */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A stable hash of any JSON value. */
export function hashJson(value) {
  return fnv1a(canonicalJson(value));
}
