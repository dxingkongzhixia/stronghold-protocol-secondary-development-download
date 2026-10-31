// shared/keel/rng.js — named random streams. No Math.random, no Date: the seed and the stream name decide the sequence.
//
// splitmix32 is small, deterministic across engines and good enough for battle decisions. A plugin must use
// `api.rng("name")`; the runtime hands out a fresh stream per name.

/** FNV-1a 32-bit of a string, as an unsigned integer. */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One deterministic stream.
 * @param {string|number} seed
 * @param {string} [stream]
 */
export function createRng(seed, stream = 'default') {
  let state = (hashSeed(String(seed)) ^ hashSeed(String(stream))) >>> 0;
  const next = () => {
    state = (state + 0x9e3779b9) >>> 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return (t >>> 0) / 4294967296;
  };
  return {
    /** A float in [0, 1). */
    next,
    /** An integer in [0, n). */
    int(n) {
      if (!Number.isInteger(n) || n <= 0) throw new RangeError('rng.int(n) needs a positive integer');
      return Math.floor(next() * n);
    },
    /** One element of a non-empty array. */
    pick(list) {
      if (!Array.isArray(list) || !list.length) throw new RangeError('rng.pick(list) needs a non-empty array');
      return list[Math.floor(next() * list.length)];
    },
    /** A named child stream; the same name always gives the same sequence. */
    fork(name) {
      return createRng(seed, `${stream}/${name}`);
    },
    /** The stream name, for diagnostics. */
    get name() { return String(stream); },
  };
}
