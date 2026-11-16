// tools/versions/adapters.mjs — reshape an older official table into the shape the current builder reads. The pinned
// tables of this fork (6f63c14e) already have that shape, so no adapter applies; a profile lists adapter names in
// `adapters` and they run in that order on the loaded activity_table (and the other tables a later adapter declares).
//
// An adapter is `(tables) => void` mutating the parsed tables in place; it must be deterministic and documented with the
// official revision it covers.
export const ADAPTERS = Object.freeze({});

/**
 * Apply the named adapters to the loaded tables.
 * @param {Record<string, any>} tables the parsed gamedata files (`activity`, `character`, …)
 * @param {string[]} [names] adapter names, in order
 */
export function applyAdapters(tables, names = []) {
  for (const name of names) {
    const fn = ADAPTERS[name];
    if (typeof fn !== 'function') throw new Error(`unknown build adapter ${JSON.stringify(name)}`);
    fn(tables);
  }
}
