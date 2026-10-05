// bootgate.js — serialises the boot-time art preload across players (docs/MATCHMAKING.md).
//
// Why: a first-time visitor pulls ~140 MB (the art preload + the boot video). The VPS uplink is 20 Mbps, so as soon as
// two or three new players open the page at once the link saturates and *everyone's* ping spikes (player report: "only
// 33 people and it stutters"). The page is a gate anyway ("everything must load before the title"), so we let at most
// `maxConcurrent` players download the payload at a time and make the rest wait their turn — the aggregate transfer
// time is unchanged, but the link is driven by one client at a time instead of five, which keeps the latency flat.
//
// The client asks for a slot (boot.claim) and is pushed boot.state { granted, position }; a returning visitor whose
// images are already in the HTTP cache never claims at all (see preloadArt), so only cold loads queue.
//
// A slot is held until the player releases it (preload finished) or `holdMs` elapses without one (a crashed/closed tab
// never blocks the queue), and a disconnect releases immediately (server/lobby.js onDisconnect/onExpire).

/**
 * FIFO gate with `maxConcurrent` slots.
 * @param {{ maxConcurrent?: number, holdMs?: number, now?: () => number }} [opts]
 */
export class BootGate {
  constructor({ maxConcurrent = 1, holdMs = 180_000, now = Date.now } = {}) {
    this.max = Math.max(1, Math.floor(maxConcurrent) || 1);
    this.holdMs = holdMs;
    this.now = now;
    /** @type {Map<string, number>} playerId → grantedAt */
    this.holders = new Map();
    /** @type {string[]} playerId, in claim order */
    this.queue = [];
  }

  /** Claim a slot. @param {string} playerId @returns {{ granted: boolean, position: number }} position = players ahead */
  claim(playerId) {
    this.sweep();
    if (this.holders.has(playerId)) return { granted: true, position: 0 };
    if (this.holders.size < this.max) {
      this.holders.set(playerId, this.now());
      this._drop(playerId);
      return { granted: true, position: 0 };
    }
    if (!this.queue.includes(playerId)) this.queue.push(playerId);
    return { granted: false, position: this.holders.size + this.queue.indexOf(playerId) };
  }

  /** Drop the slot and the queue place (idempotent). @param {string} playerId */
  release(playerId) {
    const held = this.holders.delete(playerId);
    const queued = this._drop(playerId);
    return held || queued;
  }

  /** Hand free slots to the next waiters. @returns {string[]} playerIds newly granted (push them boot.state) */
  drain() {
    const granted = [];
    while (this.holders.size < this.max && this.queue.length) {
      const id = this.queue.shift();
      if (this.holders.has(id)) continue;
      this.holders.set(id, this.now());
      granted.push(id);
    }
    return granted;
  }

  /** Free slots held too long (a tab that never released). @returns {string[]} playerIds dropped */
  sweep() {
    const t = this.now();
    const dropped = [];
    for (const [id, at] of this.holders) if (t - at > this.holdMs) { this.holders.delete(id); dropped.push(id); }
    return dropped;
  }

  /** @param {string} playerId @returns {boolean} removed from the queue */
  _drop(playerId) {
    const i = this.queue.indexOf(playerId);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    return true;
  }

  stats() {
    return { active: this.holders.size, max: this.max, waiting: this.queue.length };
  }
}
