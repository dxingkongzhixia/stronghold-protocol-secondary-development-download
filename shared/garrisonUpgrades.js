// Shared upgrade identity and per-trigger payout; pure calculations without state mutation (规程 §37.201, ported from
// the mainline). `showTags.js` reads these to show the number behind the official `{showtag_value_N}` texts.

const finite = (n, fallback = 0) => typeof n === 'number' && Number.isFinite(n) ? n
  : typeof n === 'string' && n.trim() !== '' && Number.isFinite(+n) ? +n : fallback;

/** Persistent player counter, shared by normal / elite copies of the original trait owner. */
export function garrisonUpgradeKey(g, baseId) {
  return ['SERVER_ADD_BOND_UPGRADE_LAYER', 'SERVER_GAIN_FREE_REFRESH_UPGRADE_COUNT'].includes(g?.effectKey)
    ? `garrison:upgrade:${baseId}:${g.effectKey}` : null;
}

/** The next trigger's payout: max_count caps the increase, not lifetime rewards. */
export function nextGarrisonUpgrade(bb, state = null) {
  const fired = Math.max(0, Math.floor(finite(state?.fired)));
  const base = finite(bb?.count), delta = finite(bb?.delta_count);
  const cap = base + (bb && Object.hasOwn(bb, 'max_count') ? finite(bb.max_count) : Infinity);
  const interval = Math.max(1, Math.floor(finite(bb?.n, 1)));
  return Math.max(0, Math.min(base + Math.floor(fired / interval) * delta, cap));
}
