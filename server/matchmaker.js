// server/matchmaker.js — the 野排 (搜寻队友) shared pool (docs/MATCHMAKING.md).
//
// Players queue by difficulty; the pool is async (entries arrive from many sockets). Every `seats` (4) gathered in a
// bucket start immediately; a bucket whose OLDEST entry has waited `windowMs` (MM_WINDOW_MS, up to 5 min) starts with
// whatever it holds, the rest of the alliance filled by AI. `onMatch(sessions, { difficulty, ai })` is the Lobby's createMatchedRoom.
//
// Single-threaded: `join`/`cancel` are called from the WS handler, `tick` from one interval; a matched entry is removed
// from the bucket BEFORE onMatch runs, so no double assignment. `onState` (throttled to ~1 Hz) pushes mm.state.

import { MM_WINDOW_MS, MM_SEATS } from '../shared/constants.js';

const OK = Object.freeze({ ok: true });
const fail = (code) => ({ error: code });

/** One queueing player. */
function entry({ key, session, difficulty, now }) {
  return { key, session, difficulty, joinedAt: now, lastStateAt: -Infinity };
}

export class Matchmaker {
  /**
   * @param {{ now?:()=>number, windowMs?:number, seats?:number, tickMs?:number,
   *           setInterval?:Function, clearInterval?:Function,
   *           onMatch?:(sessions:any[], info:{difficulty:string, ai:number})=>void,
   *           onState?:(session:any, state:object)=>void, log?:any }} [opts]
   */
  constructor(opts = {}) {
    this.now = opts.now || Date.now;
    this.windowMs = opts.windowMs ?? MM_WINDOW_MS;
    this.seats = opts.seats ?? MM_SEATS;
    this.tickMs = opts.tickMs ?? 250;
    this._setInterval = opts.setInterval || setInterval;
    this._clearInterval = opts.clearInterval || clearInterval;
    this.onMatch = opts.onMatch || (() => {});
    this.onState = opts.onState || null;
    this.log = opts.log || { warn() {}, error() {} };
    /** @type {Map<string, {list: any[]}>} difficulty → bucket */
    this.buckets = new Map();
    /** @type {Map<string, any>} session key (playerId) → entry */
    this.byKey = new Map();
    this.timer = null;
  }

  get queued() { return this.byKey.size; }

  /**
   * Enter the pool. One entry per session key.
   * @returns {{ok:true}|{error:string}}
   */
  join({ key, session, difficulty }) {
    if (!key || !session) return fail('INTERNAL');
    if (this.byKey.has(key)) return fail('IN_QUEUE');
    const e = entry({ key, session, difficulty, now: this.now() });
    this.byKey.set(key, e);
    let b = this.buckets.get(difficulty);
    if (!b) { b = { list: [] }; this.buckets.set(difficulty, b); }
    b.list.push(e);
    this._startTimer();
    this._tryMatch(difficulty); // fast path: a 4th player starts the alliance at once
    return OK;
  }

  /** Leave the pool (cancel button). */
  cancel(key) {
    const e = this.byKey.get(key);
    if (!e) return fail('NOT_QUEUED');
    this._remove(e);
    this._stopIfIdle();
    return OK;
  }

  /** A queued session disconnected / left: silently drop it. */
  leave(key) { if (this.byKey.has(key)) this.cancel(key); }

  forSession(key) { return this.byKey.get(key) || null; }

  /** The mm.state payload for a queued session (null when not queued). */
  state(key) {
    const e = this.byKey.get(key);
    if (!e) return null;
    const b = this.buckets.get(e.difficulty);
    return {
      queued: true, difficulty: e.difficulty, waiting: b ? b.list.length : 1, need: this.seats,
      elapsedMs: this.now() - e.joinedAt, deadlineMs: e.joinedAt + this.windowMs,
    };
  }

  stats() { return { queued: this.byKey.size, buckets: this.buckets.size }; }

  /** The pool interval: match full buckets, flush expired windows, push throttled state. */
  tick() {
    const now = this.now();
    for (const difficulty of [...this.buckets.keys()]) {
      this._tryMatch(difficulty);
      const b = this.buckets.get(difficulty);
      if (!b || !b.list.length) continue;
      const oldest = b.list.reduce((m, e) => Math.min(m, e.joinedAt), Infinity);
      if (now - oldest >= this.windowMs) {
        const group = b.list.splice(0);
        for (const e of group) this.byKey.delete(e.key);
        this.buckets.delete(difficulty);
        this._start(group, this.seats - group.length);
      }
    }
    if (this.onState) {
      for (const e of this.byKey.values()) {
        if (now - e.lastStateAt < 1000) continue;
        e.lastStateAt = now;
        try { this.onState(e.session, this.state(e.key)); } catch { /* a dead socket must not stop the tick */ }
      }
    }
    this._stopIfIdle();
  }

  dispose() { if (this.timer != null) { this._clearInterval(this.timer); this.timer = null; } this.buckets.clear(); this.byKey.clear(); }

  // ---------------------------------------------------------------------------------------------------
  _startTimer() {
    if (this.timer == null) this.timer = this._setInterval(() => this.tick(), this.tickMs);
  }
  _stopIfIdle() {
    if (this.byKey.size === 0 && this.timer != null) { this._clearInterval(this.timer); this.timer = null; }
  }
  _remove(e) {
    this.byKey.delete(e.key);
    const b = this.buckets.get(e.difficulty);
    if (!b) return;
    const i = b.list.indexOf(e);
    if (i >= 0) b.list.splice(i, 1);
    if (!b.list.length) this.buckets.delete(e.difficulty);
  }
  /** Full groups (≥ seats) start at once; only the oldest wait for their window. */
  _tryMatch(difficulty) {
    let b = this.buckets.get(difficulty);
    while (b && b.list.length >= this.seats) {
      const group = b.list.splice(0, this.seats);
      for (const e of group) this.byKey.delete(e.key);
      this._start(group, 0);
      if (!b.list.length) this.buckets.delete(difficulty);
      b = this.buckets.get(difficulty);
    }
  }
  _start(group, ai) {
    if (!group.length) return;
    const difficulty = group[0].difficulty;
    try { this.onMatch(group.map((e) => e.session), { difficulty, ai }); }
    catch (e) { this.log.error?.('[mm] onMatch failed', e); }
  }
}
