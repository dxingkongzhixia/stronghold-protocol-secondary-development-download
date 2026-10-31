// server/match/match/clientCombat.js — Match methods: client-side combat bookkeeping (DESIGN §14) — field records (the
// JSON BattleSpec + the authority / result state), spec battles on the server, the field clock, the authority (the
// lowest connected seat), b.start per recipient, result deadlines and releases, server runs (headless slices,
// takeovers), field completion → the phase end, and the timers of it all.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE } from '../../../shared/constants.js';
import { requiresTraitLayerAuthority } from '../operatorTraits.js';
import { DeadBattle, syntheticResult, RESULT_GRACE_MS, HARD_CAP_SECONDS, HeadlessJob, FIELD_SILENCE_MS } from '../fields.js';
import { buildBattleSpec, createBattleFromSpec } from '../../sim/spec.js';
import { testSlice } from '../testTrace.js';

/** How often the field-silence watchdog looks at the live client fields. */
const FIELD_WATCH_MS = 4_000;
/** The most fields one browser may simulate at once (its own field + delegated bot/takeover fields). */
export const MAX_FIELDS_PER_EXECUTOR = 8;

export class MatchClientCombat {
  /** Stop every client-combat timer and the headless pacer (phase end, finish, dispose). */
  _stopClientCombat() {
    if (this._progressTimer) { this.cancel(this._progressTimer); this._progressTimer = null; }
    if (this._bossClock) { this.cancel(this._bossClock); this._bossClock = null; }
    this._bossClockOn = false;
    // a pending throttled boss refresh: the merged team LP is written back now (m.result / settlement read it)
    if (this._bossPubTimer) { this.cancel(this._bossPubTimer); this._bossPubTimer = null; this._syncTeamLp(); this.markPublic(); }
    this._clearPause();
    if (this._poolTimer) { this.cancel(this._poolTimer); this._poolTimer = null; }
    if (this.pacer) { try { this.pacer.stop(); } catch { /* ignore */ } this.pacer = null; }
    if (this._fieldWatch) { this.cancel(this._fieldWatch); this._fieldWatch = null; }
    for (const f of this.fields) this._clearFieldTimers(f);
  }

  _clearFieldTimers(f) {
    if (!f || !f.cc) return;
    for (const k of ['deadlineTimer', 'doneTimer', 'waitTimer', 'sliceTimer', 'verifyTimer']) if (f[k]) { this.cancel(f[k]); f[k] = null; }
    f.job = null;
    f.verifyJob = null;
  }

  /**
   * A client-combat field record: the JSON BattleSpec of its Battle options plus the authority / result state. The spec
   * names the room's content set (`cs`, opts.cs — DESIGN §32) when the match was given one.
   */
  _ccField({ fieldId, kind, players, opts, boss = null }) {
    const seq = `${this.battlePrefix}.${this.round}.${++this._battleSeq}`;
    // protocol ids are ≤ 64 chars (shared/protocol.js isId): the field id is informational, the sequence is unique
    const battleId = seq.length + 1 + String(fieldId).length <= 64 ? `${seq}.${fieldId}` : seq;
    const spec = buildBattleSpec({ ...opts, battleId, fieldId, kind, content: this.battleContent, boss, cs: this.cs, vs: this.vs });
    let total = 0;
    for (const x of spec.spawns) if (x && x.tag !== 'boss' && x.tag !== 'part' && x.countInTotal !== false) total += Math.max(1, Math.floor(Number(x.count) || 1));
    return {
      cc: true, fieldId, kind, players: players.slice(), battleId, spec, battle: null, live: true, done: false,
      mode: null, authority: null, startAt: this.sched.now(), result: null, resultSource: null, timeline: null, endGt: null,
      // progress: the field's own numbers as far as they are known before its first b.progress / result (`total` = the
      // spec's scheduled enemies — the capsule's denominator). `resolved` starts at **null**: it is only adopted from a
      // real report, so `resolved ?? killed` fallbacks (an unreported field, a synthetic result) keep working — a 0 here
      // would read as "nothing resolved yet" and could never be told apart from a reported 0.
      progress: { gt: 0, killed: 0, total, leaks: 0, resolved: null, done: false }, lastProgressAt: this.sched.now(),
      bossAcked: 0, bossBy: {}, lpAcked: 0, lpCum: 0, deadlineTimer: null, doneTimer: null, waitTimer: null,
      // boss fields: the latest client reports (re-credited as the plausibility budget grows), the server run's
      // CreditPool, humans demoted for an implausible result (never the authority of this field again), a 'cleared'
      // b.result waiting for the budget to credit the pool it emptied (`heldResult`, _onResult); `leaksBy`: the authority's
      // per-player split of the LP its enemy leaks cost (b.progress, the highest value seen; null until one carried it),
      // which a result must not contradict before a perfect-payout bounty pays (_bossLeaksAgree)
      bossReported: null, lpReported: 0, credit: null, demoted: new Set(), heldResult: null, leaksBy: null,
    };
  }

  /** A battle built from a spec on the server (headless / takeover / verification); never throws. */
  _specBattle(spec, { sharedBoss = null } = {}) {
    try {
      return createBattleFromSpec(spec, this.ds, { BattleClass: this.BattleClass, sharedBoss, logger: this.log, recordEvents: false });
    } catch (e) {
      this.reportError(`battle ${spec && spec.fieldId} construct`, e);
      return new DeadBattle({ fieldId: spec && spec.fieldId, kind: spec && spec.kind, players: (spec && spec.players) || [], rect: spec && spec.rect, stageId: spec && spec.stageId }, 'forced');
    }
  }

  /** Game seconds a field has run (its clock; a finished field: its final time). */
  _fieldElapsed(f) {
    if (f.done && f.result && Number.isFinite(f.result.time)) return f.result.time;
    const gt = Math.max(0, ((this._clockNow() - f.startAt) / 1000) * this.gameSpeed);
    if (f.endGt != null) return Math.min(gt, f.endGt);
    const lim = f.spec && f.spec.timeLimit > 0 ? f.spec.timeLimit : HARD_CAP_SECONDS;
    return Math.min(gt, lim);
  }

  /** The connected human who simulates a field: lowest seat among its players (normal: the owner). */
  _authorityFor(f, exclude = null) {
    // [ASSUMED] Layer traits require an authoritative run, even with SP_VERIFY=off.
    if (requiresTraitLayerAuthority(f.spec, this.gd)) return null;
    let best = null;
    for (const pid of f.players) {
      if (pid === exclude || (f.demoted && f.demoted.has(pid))) continue;
      const ps = this.players.get(pid);
      if (!ps || ps.isBot || ps.left || !ps.connected) continue;
      if (!best || ps.seat < best.seat) best = ps;
    }
    return best ? best.playerId : null;
  }

  /** b.start of a field for one recipient (`watch`: not a player of the field; `background`: the executor's replay). */
  _startMsg(f, pid, { watch = false, background = false } = {}) {
    return {
      t: 'b.start', battleId: f.battleId, fieldId: f.fieldId, kind: f.kind,
      spec: this.spectators.has(pid) ? this._spectatorSpec(f) : f.spec,
      authoritative: !!(!f.done && !f.verifyJob && f.mode === 'client' && f.authority === pid && !watch),
      startAt: f.startAt, serverNow: this.sched.now(), elapsed: Math.round(this._fieldElapsed(f) * 1000) / 1000,
      speed: this.gameSpeed, watch: !!watch, background: !!background, done: !!f.done,
    };
  }

  _sendStart(pid, f, opts = {}) {
    const ps = this.players.get(pid) || this.spectators.get(pid);
    if (!ps || ps.isBot || ps.left || !ps.connected) return false;
    return this.sendTo(pid, this._startMsg(f, pid, opts));
  }

  /** Fields this browser would simulate: its own / participated field plus delegated background fields. */
  _loadFor(pid, fields = this.fields) {
    let n = 0;
    for (const f of fields ?? []) {
      if (!f) continue;
      if (Array.isArray(f.players) && f.players.includes(pid)) { n++; continue; }
      if (f.background && f.authority === pid) n++;
    }
    return n;
  }

  /**
   * Connected humans who can replay a field they are not a player of: the room host first, then by seat.
   * Trait-layer fields stay server-run (their authority rule needs the server's own run).
   */
  _executorCandidates(f, exclude = null, fields = this.fields) {
    // Only a room with native sim code needs a browser executor: its battle cannot be replayed by the server (D10).
    // Vanilla / content-only / meta-only rooms keep the existing server fallback unchanged.
    if (!this.simCode) return [];
    if (requiresTraitLayerAuthority(f.spec, this.gd)) return [];
    const skip = new Set(f.players ?? []);
    if (exclude) skip.add(exclude);
    const out = [];
    for (const ps of this.players.values()) {
      if (!ps || ps.isBot || ps.left || !ps.connected || skip.has(ps.playerId)) continue;
      if (this._loadFor(ps.playerId, fields) >= MAX_FIELDS_PER_EXECUTOR) continue;
      out.push(ps);
    }
    out.sort((a, b) => (a.playerId === this.hostId ? -1 : b.playerId === this.hostId ? 1 : (a.seat ?? 99) - (b.seat ?? 99)));
    return out;
  }

  /** Pick an executor (host first; a human not used for another field first; reusing the host when nobody else is free). */
  _executorFor(f, exclude = null, fields = this.fields) {
    this._delegated ??= new Set();
    const candidates = this._executorCandidates(f, exclude, fields);
    const free = candidates.filter((ps) => !this._delegated.has(ps.playerId));
    const pick = free[0] ?? candidates[0] ?? null;
    if (pick) this._delegated.add(pick.playerId);
    return pick ? pick.playerId : null;
  }

  /** Send the delegated fields their background b.start (after the viewers' starts, so it never steals the view). */
  _sendExecutors(fields) {
    for (const f of fields) {
      if (!f.background || !f.authority) continue;
      if (!this._sendStart(f.authority, f, { background: true })) this._runOnServer(f, 'executor-lost');
    }
  }

  /** Hand a field to another browser (host first) instead of running it on the server; returns false after a fallback. */
  _delegateField(f, reason) {
    const prev = f.mode === 'client' ? f.authority : null;
    const next = this._executorFor(f, prev);
    if (!next) { this._runOnServer(f, reason); return false; }
    this._assignClient(f, next, { background: true });
    if (prev) this.sendTo(prev, { t: 'b.end', battleId: f.battleId, fieldId: f.fieldId, reason: 'takeover' });
    if (!this._sendStart(next, f, { background: true })) { this._runOnServer(f, 'executor-lost'); return false; }
    this.log.info?.(`[match ${this.roomCode}] ${f.fieldId} R${this.round}: delegated to ${next} (${reason})`);
    return true;
  }

  /** Give every field its authority (a connected human) or an executor browser; only then the server. */
  _launch(fields) {
    const now = this.sched.now();
    this._armFieldWatch();
    this._delegated = new Set();
    this.fields = fields;
    for (const f of fields) { f.startAt = now; f.lastProgressAt = now; }
    for (const f of fields) {
      const auth = this._authorityFor(f);
      if (auth) this._assignClient(f, auth);
      else {
        const executor = this._executorFor(f);
        if (executor) this._assignClient(f, executor, { background: true });
        else this._runOnServer(f, 'no-human');
      }
    }
  }

  /**
   * Field-silence watchdog (normal / 联防 fields): a browser that stops reporting (frozen tab, a stuck battle that never
   * finishes, a lost b.result) used to leave the phase waiting for the wave deadline. Every FIELD_WATCH_MS this hands
   * such a field to the server (_runOnServer 'silent'), which then settles it like any other takeover.
   */
  _armFieldWatch() {
    if (this._fieldWatch) return;
    const tick = () => {
      this._fieldWatch = null;
      if (this.ended || this.disposed || this.paused) return;
      if (this.phase !== PHASE.COMBAT && this.phase !== PHASE.UNITE) return;
      this._checkFieldSilence();
      if (this.phase === PHASE.COMBAT || this.phase === PHASE.UNITE) this._fieldWatch = this.later(FIELD_WATCH_MS, tick);
    };
    this._fieldWatch = this.later(FIELD_WATCH_MS, tick);
  }

  /**
   * Take over every client field (normal / 联防) that has said nothing for FIELD_SILENCE_MS. Returns how many.
   * @param {number} [now]
   */
  _checkFieldSilence(now = this.sched.now()) {
    let n = 0;
    for (const f of this.fields) {
      if (!f || !f.cc || f.done || f.mode !== 'client') continue;
      if (f.kind === 'boss' || f.kind === 'hidden') continue; // their own silence watchdog (BOSS_SILENCE_MS)
      // a result already in hand (verification pending, or waiting for its release) needs no takeover — the phase ends itself
      if (f.verifyJob || f.heldResult || f.result != null) continue;
      const last = Number.isFinite(f.lastProgressAt) ? f.lastProgressAt : f.startAt;
      if (now - last <= FIELD_SILENCE_MS) continue;
      this.log.warn?.(`[match ${this.roomCode}] ${f.fieldId} R${this.round}: silent client for ${Math.round((now - last) / 1000)} s — delegating/takeover`);
      this._delegateField(f, 'silent');
      n++;
    }
    return n;
  }

  _assignClient(f, pid, { background = false } = {}) {
    f.mode = 'client';
    f.authority = pid;
    f.background = !!background;
    f.executor = background ? pid : null;
    f.lastProgressAt = this.sched.now();
    if (f.deadlineTimer) { this.cancel(f.deadlineTimer); f.deadlineTimer = null; }
    if (f.kind === 'boss' || f.kind === 'hidden') return; // the pool / team LP / silence watchdog end those
    if (this.paused) { f.rearmDeadline = true; return; }
    this._armDeadline(f);
  }

  /** A client field's result deadline: its time limit on the field clock + RESULT_GRACE_MS (then the server takes over). */
  _armDeadline(f) {
    if (f.deadlineTimer) { this.cancel(f.deadlineTimer); f.deadlineTimer = null; }
    if (f.verifyJob) return;
    const lim = f.spec.timeLimit > 0 ? f.spec.timeLimit : 60;
    const at = f.startAt + Math.round((lim / this.gameSpeed) * 1000) + RESULT_GRACE_MS;
    f.deadlineTimer = this.later(Math.max(0, at - this.sched.now()), () => {
      f.deadlineTimer = null;
      if (f.done || f.mode !== 'client') return;
      this._delegateField(f, 'timeout');
    });
  }

  /** A server-run normal / 联防 field's result is released at the battle's natural end on the field clock. */
  _armRelease(f) {
    if (f.doneTimer) { this.cancel(f.doneTimer); f.doneTimer = null; }
    if (f.done || f.result == null) return;
    if (this.paused) { f.rearmRelease = true; return; }
    const doneAt = f.startAt + Math.round(((f.endGt || 0) / this.gameSpeed) * 1000);
    const wait = this.sched.instant ? 0 : Math.max(0, doneAt - this.sched.now());
    f.doneTimer = this.later(wait, () => { f.doneTimer = null; this._fieldDone(f); });
  }

  /**
   * The server simulates a field: normal / 联防 headlessly at once (the result is released at the battle's natural end
   * on the field's clock, so the teammates' progress UI and the round pacing stay as if it ran live); boss fields in
   * real time on the pacer (they share the pool), fast-forwarded to the field's clock on a takeover.
   */
  _runOnServer(f, reason) {
    const prev = f.mode === 'client' ? f.authority : null;
    if (prev) {
      this.verifyStats.takeovers++;
      this.log.info?.(`[match ${this.roomCode}] ${f.fieldId} R${this.round}: server takeover from ${prev} (${reason})`);
    }
    f.mode = 'server';
    f.authority = null;
    f.background = false;
    f.executor = null;
    if (f.deadlineTimer) { this.cancel(f.deadlineTimer); f.deadlineTimer = null; }
    // the former authority (still online after a timeout / an invalid result) stops reporting and keeps its view
    if (prev) this.sendTo(prev, { t: 'b.end', battleId: f.battleId, fieldId: f.fieldId, reason: 'takeover' });
    if (f.kind === 'boss' || f.kind === 'hidden') { this._bossServerRun(f); return; }
    const job = new HeadlessJob(this._specBattle(f.spec), { onError: (e) => this.reportError(`field ${f.fieldId} step`, e), players: f.players });
    f.job = job;
    f.battle = job.battle;
    f.timeline = job.timeline; // grows while the job runs (the teammates' progress UI reads it on the field clock)
    if (f.sliceTimer) { this.cancel(f.sliceTimer); f.sliceTimer = null; }
    const complete = () => {
      if (f.job !== job || f.done) return;
      f.job = null;
      const run = job.output();
      f.battle = run.battle;
      f.result = run.result;
      f.resultSource = 'server';
      f.timeline = run.timeline;
      f.endGt = Number(run.battle.time) || 0;
      this._armRelease(f);
    };
    const sliceCtl = testSlice(this);
    if (!Number.isFinite(this.headlessSliceMs)) {
      job.run(Infinity, undefined, sliceCtl);
      complete();
    } else {
      // a real host: wall-clock-bounded slices in callbacks of their own (3 bot fields at combat start would otherwise
      // block the event loop for ~0.2–0.5 s here, seconds on a low-power mini PC)
      const slice = () => {
        f.sliceTimer = null;
        if (f.job !== job || f.done) return;
        if (job.run(this.headlessSliceMs, undefined, sliceCtl)) complete();
        else f.sliceTimer = this.later(0, slice);
      };
      f.sliceTimer = this.later(0, slice);
    }
    this._armProgressTicker();
  }

  /** m.public ~1 Hz while server-run fields progress along their timelines. */
  _armProgressTicker() {
    if (this._progressTimer || this.sched.instant) return;
    const tick = () => {
      this._progressTimer = null;
      if (!this.fields.some((f) => f.cc && f.mode === 'server' && !f.done && f.timeline)) return;
      this.markPublic();
      this._progressTimer = this.later(1000, tick);
    };
    this._progressTimer = this.later(1000, tick);
  }

  /** A field has its final result. */
  _fieldDone(f) {
    if (!f || f.done) return;
    f.done = true;
    f.live = false;
    this._clearFieldTimers(f);
    if (!f.result) f.result = syntheticResult(f.players, { bossBy: f.bossBy });
    f.progress.done = true;
    this.markPublic();
    this._maybeFieldsDone();
  }

  _maybeFieldsDone() {
    if (!this.fields.length || this.fields.some((f) => f.cc && !f.done)) return;
    if (!this.fields.every((f) => f.cc)) return;
    if (this.phase === PHASE.COMBAT) this._finishCombat((f) => f.result);
    else if (this.phase === PHASE.UNITE) this._finishUniteClient();
    else if (this.phase === PHASE.FINAL_ASSAULT || this.phase === PHASE.HIDDEN_CORE) this._finishFinal(this.phase === PHASE.HIDDEN_CORE, (f) => f.result);
  }

  /** An authoritative human disconnected / left: normal & 联防 fields → server takeover; boss → the partner or the server. */
  _authorityLost(ps, why) {
    for (const f of this.fields) {
      if (!f.cc || f.done || f.verifyJob || f.mode !== 'client' || f.authority !== ps.playerId) continue;
      if (f.kind === 'boss' || f.kind === 'hidden') this._bossHandover(f, why);
      else this._delegateField(f, why);
    }
  }
}
