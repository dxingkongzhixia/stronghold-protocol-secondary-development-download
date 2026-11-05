// tools/agent/player.mjs — the example agent's decision loop (pure, no network).
//
// It plays a normal player seat through the same `g.*` messages a human sends: ready for the briefing, pick a free band,
// buy a chess, deploy it into the own field, take a reward/choice, then ready. Deliberately small: this is a protocol
// example and an end-to-end fixture, not a competitive bot.
//
// docs/AGENT-SEATS.md (P3); used by tools/agent/agent.mjs and test/e2e/agent-seat.e2e.mjs.

import { GEO, PHASE, EMOTES } from '../../shared/constants.js';

/** Fallback band ids (data/bands.json holds the full list; the CLI reads it when present). */
export const FALLBACK_BANDS = Object.freeze(['band_bldsk', 'band_amiya', 'band_duyaoy', 'band_sarkazb', 'band_orchid', 'band_justin']);
export const EMOTE = EMOTES[0];

/** Every cell of the own deploy field, row-major (GEO.FIELD: the normal-field deploy region). */
export function deployCells() {
  const out = [];
  for (let row = GEO.FIELD.r0; row <= GEO.FIELD.r1; row++) {
    for (let col = GEO.FIELD.c0; col <= GEO.FIELD.c1; col++) out.push([row, col]);
  }
  return out;
}

/**
 * One action for the current views, or null when there is nothing to do.
 * @param {{ pub: any, priv: any, myId: string, bands?: readonly string[], attempt?: number }} state
 *   attempt: the next deploy candidate (caller keeps the returned `attempt`; reset it each prep)
 * @returns {{ msg: object, attempt?: number, note: string } | null}
 */
export function nextAction({ pub, priv, myId, bands = FALLBACK_BANDS, attempt = 0 }) {
  if (!pub || !priv || pub.phase == null) return null;
  if (pub.phase === PHASE.INFO_CHECK) {
    const me = (pub.players || []).find((p) => p && p.playerId === myId);
    if (me && !me.ready) return { msg: { t: 'g.infoReady' }, note: 'infoReady' };
    return null;
  }
  if (pub.phase === PHASE.BAND_DRAFT) {
    const d = pub.draft;
    if (!d || d.turn !== myId || (d.picks && d.picks[myId])) return null;
    const taken = new Set(Object.values(d.picks || {}).filter(Boolean));
    const bandId = bands.find((b) => !taken.has(b)) || bands[0];
    return bandId ? { msg: { t: 'g.band', bandId }, note: `band ${bandId}` } : null;
  }
  if (pub.phase !== PHASE.PREP) return null;

  // a 机变 / bounty choice blocks Ready
  if (priv.personalChoice) return { msg: { t: 'g.choice', idx: 0 }, note: 'personal choice' };
  const reward = priv.shop?.rewardOffer;
  if (reward) {
    const idx = (reward.slots || []).findIndex((s) => s && !s.sold);
    if (idx >= 0) return { msg: { t: 'g.reward', idx }, note: `reward ${idx}` };
  }

  const hand = priv.hand || [];
  const slots = priv.shop?.slots || [];
  const freeHand = hand.some((x) => !x);
  const affordable = slots
    .map((s, i) => (s && s.kind === 'chess' && !s.sold && (s.price || 0) <= (priv.funds || 0) ? i : -1))
    .filter((i) => i >= 0);
  if (freeHand && affordable.length) {
    let best = affordable[0];
    for (const i of affordable) if ((slots[i].price || 0) > (slots[best].price || 0)) best = i;
    return { msg: { t: 'g.buy', slot: best }, note: `buy slot ${best}` };
  }

  const piece = hand.find(Boolean);
  if (piece && (priv.deployCount || 0) < (priv.deployCap || 0)) {
    const occupied = new Set((priv.board || []).map((p) => `${p.row},${p.col}`));
    const free = deployCells().filter(([row, col]) => !occupied.has(`${row},${col}`));
    if (free.length) {
      const [row, col] = free[attempt % free.length];
      // A rejected tile (not deployable for this chess) costs one attempt: the next call tries the next cell.
      return { msg: { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }, attempt: attempt + 1, note: `deploy ${piece.id} at ${row},${col}` };
    }
  }

  if (priv.canReady) return { msg: { t: 'g.ready', ready: true }, note: 'ready' };
  return null;
}

/** A cosmetic emote for the example's periodic hello (the agent may emote like a human). */
export function emote() {
  return { t: 'g.emote', id: EMOTE };
}
