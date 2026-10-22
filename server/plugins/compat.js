// server/plugins/compat.js — one predicate for the owner's `allowIncompatible` policy.
//
// The policy is either `true` (every reviewed plugin), `false` (none), or a list of plugin ids.
// Keep the three readers (content composition, room resolution and the admin console) on this one rule.

/**
 * @param {boolean|string[]|null|undefined} allow
 * @param {string} id
 * @returns {boolean}
 */
export function allowsIncompatible(allow, id) {
  return allow === true || (Array.isArray(allow) && allow.includes(id));
}
