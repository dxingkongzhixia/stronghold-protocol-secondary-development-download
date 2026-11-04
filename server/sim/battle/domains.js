// server/sim/battle/domains.js — 场 (a domain): a set of absolute tile keys a unit spreads over the battlefield, shared by
// every caster of that kind (国度: "所有“国度”在不同国度(干员)之间通用，但可以分别弥漫" — the union of every caster's field).
// The engine keeps the bookkeeping; kits read `domainTiles` / `domainHas` / `unitOnDomain` and lay their own effects
// (attack-speed cuts, per-second damage, damage masks, range expansion). A field belongs to its source: it goes the
// moment that source leaves the field (国度: "自身弥漫的“国度”于离场后清除（无需解锁第二天赋）"), and a dead source's
// leftovers are pruned lazily.
import { COLS } from '../constants.js';

/** Absolute tile key of a unit: its own tile (allies) or the tile its position rounds to (enemies). */
export const tileKeyOf = (u) => {
  if (!u) return -1;
  if (u.tileR != null && u.tileC != null) return u.tileR * COLS + u.tileC;
  return Math.round(u.y) * COLS + Math.round(u.x);
};

export class BattleDomains {
  /**
   * Replace the field `source` spreads. `keys` = a Set / iterable of absolute tile keys; empty or null clears it.
   * Returns the stored Set, or null.
   */
  setDomain(source, keys) {
    if (!source) return null;
    const set = new Set(keys || []);
    if (!set.size) {
      this._domains.delete(source);
      return null;
    }
    this._domains.set(source, set);
    return set;
  }

  /** The field of one source (its own tiles), or null. */
  ownDomain(source) {
    return this._domains.get(source) || null;
  }

  clearDomain(source) {
    this._domains.delete(source);
  }

  /** The sources whose field is up (a dead source's leftover is dropped here). */
  domainSources() {
    const out = [];
    for (const [u, set] of this._domains) {
      if (!u || !u.alive) {
        this._domains.delete(u);
        continue;
      }
      if (set.size) out.push(u);
    }
    return out;
  }

  /** Every tile of the union of all fields (a fresh Set: callers may keep it). */
  domainTiles() {
    const all = new Set();
    for (const u of this.domainSources()) for (const k of this._domains.get(u)) all.add(k);
    return all;
  }

  /** Is `key` (an absolute tile key) on any field? */
  domainHas(key) {
    for (const u of this.domainSources()) if (this._domains.get(u).has(key)) return true;
    return false;
  }

  /** Is the unit's own tile on any field? */
  unitOnDomain(u) {
    return u ? this.domainHas(tileKeyOf(u)) : false;
  }
}
