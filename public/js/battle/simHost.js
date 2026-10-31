// C4 simulation hosts (DESIGN §32.11). The clock belongs to runner.js. Only the vanilla host has a Battle on the page.
import { loadBrowserSim, checkOperatorTraitRuntime } from './simLoader.js';
import { unitStatsEntry } from '../../../shared/protocol.js';

/** [ASSUMED] 2 s per RPC, including construction and forceEnd (both can execute plugin hooks). */
export const WORKER_TIMEOUT_MS = 2000;
/** [ASSUMED] Trusted engine/module/data cold load can take longer; plugin code runs in a separate 2 s install RPC. */
export const WORKER_LOAD_TIMEOUT_MS = 15000;
const failure = (code, message) => Object.assign(new Error(message), { code });

export class InPageSimHost {
  constructor({ loadSim = loadBrowserSim } = {}) { this.loadSim = loadSim; this.remote = false; this.battle = null; this.extensions = null; }
  async load(cs = null, content = null) {
    this.sim = await this.loadSim(content ? { ...content, cs } : undefined);
    this.extensions = this.sim?.extensions ?? null;
    return this;
  }
  start(spec, opts = {}) {
    this.spec = spec;
    this.battle = this.sim.spec.createBattleFromSpec(spec, this.sim.ds, { ...(this.extensions ? { extensions: this.extensions } : {}), ...opts });
    try { this.sim.keel?.attach?.(this.battle); } catch (err) { console.warn('[simHost] native Keel attach failed', err); this.keelError = String(err?.message || err); }
    this.keelInfo = { hasAttach: typeof this.sim?.keel?.attach === 'function', plugins: this.sim?.keel?.plugins?.length ?? null };
    this.meter = this.sim.spec.attachLpMeter(this.battle);
    return this;
  }
  step(n, { slice = 0 } = {}) {
    const b = this.battle;
    const slices = [];
    let ticks = 0;
    for (; ticks < n && !b.finished; ticks++) {
      b.step();
      if (slice && (ticks + 1) % slice === 0 && ticks + 1 < n) {
        const ev = b.drainEvents() || [];
        if (ev.length) slices.push({ gt: Number(b.time) || 0, ev });
      }
    }
    // Lazy reads keep the vanilla runner's snapshot/event timing unchanged.
    return { get snap() { return b.snapshot(); }, get ev() { return b.drainEvents() || []; }, state: b, ticks, slices };
  }
  progress() { return this.sim.spec.battleProgress(this.battle); }
  uniteLeft() { return this.sim.spec.uniteLeft(this.battle); }
  compactResult(options) {
    const s = this.sim.spec;
    const r = s.compactResult(this.battle.result());
    return typeof s.fitResult === 'function' ? s.fitResult(r, options) : r;
  }
  unitStats(id) {
    const u = this.battle?.unitById?.(id);
    return u ? unitStatsEntry(u, u._s || null) : null;
  }
  ownerOps(pid) {
    return (this.battle?.allyUnits || []).filter(u => u?.kind === 'op' && u.ownerId === pid && typeof u.defId === 'string').map(u => ({
      kind: 'op', ownerId: pid, defId: u.defId,
      ...(u.items?.length ? { items: [...u.items] } : {}),
      ...(u.def?.standInFor ? { standInFor: u.def.standInFor } : {}),
      ...(u.def?.diyFor && u.def.loadout?.diy ? { diy: { ...u.def.loadout.diy } } : {}),
    }));
  }
  syncPool(hp, acked) { this.battle?.sharedBoss?.sync?.(hp, acked); }
  forceEnd(reason) { this.battle?.forceEnd(reason); }
  stop() { this.battle = null; }
}

/** Wire state only: no engine import or engine object, including in the dev introspection hooks. */
export class WorkerSimHost {
  constructor({ workerFactory = () => new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' }),
    timeoutMs = WORKER_TIMEOUT_MS, loadTimeoutMs = WORKER_LOAD_TIMEOUT_MS, onFailure = () => {}, contentFor = null,
    heartbeatMs = 5000, pingTimeoutMs = 2000 } = {}) {
    this.contentFor = contentFor;
    this.remote = true;
    this.timeoutMs = timeoutMs;
    this.loadTimeoutMs = loadTimeoutMs;
    this.pingTimeoutMs = pingTimeoutMs;
    this.heartbeatMs = heartbeatMs;
    this.onFailure = onFailure;
    this.worker = workerFactory();
    this.pending = new Map();
    this.seq = 0;
    this.stopped = false;
    this.heartbeatTimer = null;
    this.events = [];
    this.statsCache = new Map();
    this.statsPending = new Set();
    const host = this;
    this.battle = {
      snapshot: () => host.packet?.snap,
      drainEvents: () => host.events.splice(0),
      fieldMeta: () => host.packet?.meta || { units: [] },
      getPlayer: pid => host.packet?.players?.[pid],
      get allyUnits() { return host.packet?.state?.allyUnits || []; },
      get sharedBoss() {
        const s = host.packet?.state?.sharedBoss;
        return s ? { cum: s.cum, byPlayer: s.byPlayer, sync: (hp, acked) => { host.syncPool(hp, acked); } } : null;
      },
      get keelAll() { return host.packet?.keel || []; },
      get keel() { const all = host.packet?.keel || []; return all[all.length - 1] || null; },
      get keelError() { return host.packet?.keelError || null; },
      get keelInfo() { return host.packet?.keelInfo || null; },
      forceEnd: (reason) => { host.forceEnd(reason).catch(() => {}); },
    };
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data?.id);
      if (!p) return;
      this.pending.delete(data.id);
      clearTimeout(p.timer);
      if (data.error) { const err = failure(data.error.code || 'PLUGIN_WORKER_FAILED', data.error.message); p.reject(err); this.fail(err); }
      else p.resolve(data.value);
    };
    this.worker.onerror = () => this.fail(failure('PLUGIN_WORKER_FAILED', 'simulation worker failed'));
    this.worker.onmessageerror = () => this.fail(failure('PLUGIN_WORKER_FAILED', 'simulation worker message failed'));
  }
  rpc(method, args = [], timeoutMs = this.timeoutMs) {
    if (this.stopped) return Promise.reject(failure('PLUGIN_WORKER_STOPPED', 'simulation worker stopped'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(failure('PLUGIN_WORKER_TIMEOUT', `simulation worker ${method} exceeded ${timeoutMs} ms`)), timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, method, args }); } catch (err) { this.fail(err); }
    });
  }
  fail(err) { if (this.stopped) return; this.stop(err); this.onFailure(err); }
  /** Liveness: a ping only when no RPC is in flight (a long catch-up step is not silence). */
  heartbeat() {
    if (this.stopped || this.pending.size) return;
    this.rpc('ping', [], this.pingTimeoutMs).catch(() => {});
  }
  startHeartbeat() {
    if (this.heartbeatTimer || !(this.heartbeatMs > 0)) return;
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }
  async load(cs, content = null) {
    content ||= await this.contentFor?.(cs);
    if (!content || content.cs !== cs || !content.data) throw failure('PLUGIN_WORKER_FAILED', 'no checked content set');
    this.cs = cs;
    const traitRuntimeVerified = await checkOperatorTraitRuntime(content.data);
    const ready = await this.rpc('load', [{ ...content, cs, traitRuntimeVerified }], this.loadTimeoutMs);
    if (ready.install) await this.rpc('install');
    this.startHeartbeat();
    return this;
  }
  accept(packet) {
    this.packet = packet;
    this.events.push(...packet.ev);
    // allyUnits / sharedBoss / keel are live getters on the facade (they need methods or packet-only fields)
    const { allyUnits, sharedBoss, ...state } = packet.state || {};
    Object.assign(this.battle, state);
    this.meter = packet.meter;
    return packet;
  }
  combatMetrics() { return this.packet?.metrics || null; }
  async start(spec) { this.spec = spec; this.accept(await this.rpc('start', [spec])); return this; }
  async step(n, opts) {
    // a catch-up slice may legitimately run hundreds of ticks: scale the RPC budget, not the plugin budget
    const budget = this.timeoutMs * Math.max(1, Math.ceil((Number(n) || 0) / 120));
    return this.accept(await this.rpc('step', [n, opts], budget));
  }
  progress() { return this.packet.progress; }
  uniteLeft() { return this.packet.left; }
  compactResult() { return this.packet.result; }
  unitStats(id) {
    if (!this.stopped && !this.statsPending.has(id)) {
      this.statsPending.add(id);
      this.rpc('unitStats', [id]).then(v => this.statsCache.set(id, v), () => {}).finally(() => this.statsPending.delete(id));
    }
    return this.statsCache.get(id) || null;
  }
  ownerOps(pid) { return this.packet?.ops?.[pid] || []; }
  syncPool(hp, acked) { return this.rpc('syncPool', [hp, acked]).catch(() => {}); }
  async forceEnd(reason) { this.accept(await this.rpc('forceEnd', [reason])); }
  stop(err = failure('PLUGIN_WORKER_STOPPED', 'simulation worker stopped')) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.worker.terminate();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }
}
