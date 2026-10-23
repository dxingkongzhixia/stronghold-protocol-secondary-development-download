// server/match/player/special.js — one descriptor for a special unit a strategy grants.
//
// A band grant used to be spread over `piece.meta.special` (a `band:<id>` string), `piece.unsellable` and
// `piece.returnNextPrep`, with each rule reading a different one. New grants also carry `meta.specialUnit`;
// `specialUnitOf` still reads the legacy string so matches saved before the descriptor keep working.
//
// This module is pure: the grant, the deploy slot, the shop and the match views all read the same predicates.

/** @typedef {'band'} SpecialKind */

/**
 * @param {string} bandId
 * @param {{ placement?: string|null }} [opts]
 * @returns {{ kind: SpecialKind, id: string, outsideDeployCap: true, unsellable: true, returnNextPrep: true, suppressMapChar: boolean, placement: string|null }}
 */
export function bandSpecial(bandId, { placement = null } = {}) {
  return Object.freeze({
    kind: /** @type {SpecialKind} */ ('band'),
    id: bandId,
    outsideDeployCap: true,
    unsellable: true,
    returnNextPrep: true,
    // A Touch-style grant replaces the stage's reserve medic; the replacement stays hidden even after moving.
    suppressMapChar: placement === 'amedicSlot',
    placement: placement ?? null,
  });
}

/**
 * The descriptor of a special grant, or null for an ordinary piece. A legacy `meta.special = "band:<id>"`
 * (and its sibling booleans) maps onto the same shape.
 * @param {{ meta?: any, unsellable?: boolean, returnNextPrep?: boolean } | null | undefined} piece
 * @returns {{ kind: SpecialKind, id: string, outsideDeployCap: boolean, unsellable: boolean, returnNextPrep: boolean, suppressMapChar: boolean, placement: string|null } | null}
 */
export function specialUnitOf(piece) {
  const s = piece?.meta?.specialUnit;
  if (s && typeof s === 'object' && typeof s.id === 'string' && s.kind === 'band') {
    return {
      kind: 'band', id: s.id,
      outsideDeployCap: s.outsideDeployCap !== false,
      unsellable: s.unsellable !== false || piece?.unsellable === true,
      returnNextPrep: s.returnNextPrep !== false || piece?.returnNextPrep === true,
      suppressMapChar: s.suppressMapChar === true,
      placement: typeof s.placement === 'string' ? s.placement : null,
    };
  }
  const legacy = piece?.meta?.special;
  if (typeof legacy === 'string' && legacy.startsWith('band:')) {
    return {
      kind: 'band', id: legacy.slice('band:'.length),
      outsideDeployCap: true,
      unsellable: true,
      returnNextPrep: true,
      suppressMapChar: false,
      placement: null,
    };
  }
  return null;
}

/** A band-granted special chess. */
export const isBandGrant = (piece) => specialUnitOf(piece)?.kind === 'band';
/** The band id of a band-granted piece, else null. */
export const bandIdOf = (piece) => specialUnitOf(piece)?.id ?? null;
/** Whether the piece stands outside the normal deployment cap. */
export const outsideDeployCap = (piece) => specialUnitOf(piece)?.outsideDeployCap === true;
/** Whether the piece may not be sold. */
export const isUnsellable = (piece) => piece?.unsellable === true || specialUnitOf(piece)?.unsellable === true;
/** Whether a Touch-style grant suppresses the stage's reserve medic for the whole match. */
export const suppressesMapChar = (piece) => specialUnitOf(piece)?.suppressMapChar === true;

/** Whether any of the player's owned pieces (board, hand or temp) suppresses the reserve medic. */
export const suppressesMapCharFor = (ps) => [...(ps?.board?.values?.() ?? []), ...(ps?.hand ?? []), ...(ps?.temp ?? [])]
  .some((p) => suppressesMapChar(p));
