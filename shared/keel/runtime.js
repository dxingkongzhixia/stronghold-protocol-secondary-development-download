// shared/keel/runtime.js — the M1 runtime: capability-scoped APIs, per-module state, command logs, budgets and
// hook dispatch. It is deliberately host-agnostic: `createFakeHost` is the test host, a Stronghold/AUE adapter can
// implement the same SIM_HOST_METHODS.
//
// M1 does NOT wire itself into a live match. `keel run` and the tests drive it; `KEEL=1` integration is M1.5.

import { createBudget } from './budget.js';
import { createCommandBus } from './commands.js';
import { hashJson } from './hash.js';
import { createState } from './state.js';

const CODE_KINDS = new Set(['sim', 'match', 'policy']);

export class KeelRuntimeError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'KeelRuntimeError';
    this.code = code;
  }
}

export class KeelDeniedError extends KeelRuntimeError {
  /** @param {string} message */
  constructor(message) { super('KEEL_DENIED', message); this.name = 'KeelDeniedError'; }
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const isFn = (v) => typeof v === 'function';

/**
 * @param {{
 *   manifest: any,
 *   modules?: { kind: string, entry?: string, permissions?: string[], state?: { version?: number }, code: any }[],
 *   host: any,
 *   seed?: number|string,
 *   budget?: { perHook?: number, perFrame?: number, perMatch?: number },
 *   applyCommand?: (command: any, moduleId: string) => any,
 * }} opts
 */
export function createKeelRuntime(opts) {
  if (!opts || !opts.manifest || !opts.host) throw new KeelRuntimeError('KEEL_RUNTIME', 'createKeelRuntime needs { manifest, host }');
  const manifest = opts.manifest;
  const host = opts.host;
  const seed = opts.seed ?? 0;
  const codeModules = (opts.modules ?? []).filter((m) => CODE_KINDS.has(m.kind) && m.code);

  /** @type {any[]} */
  const runtimes = [];
  /** @type {any[]} */
  const errors = [];
  /** @type {any[]} */
  const logs = [];
  /** @type {Record<string, any>} */
  const views = {};
  let finished = null;
  let started = false;

  for (const [index, mod] of codeModules.entries()) {
    if (!mod.code || typeof mod.code !== 'object') throw new KeelRuntimeError('KEEL_MODULE', `${mod.kind} module is not an object`);
    if (mod.code.setup !== undefined && !isFn(mod.code.setup)) throw new KeelRuntimeError('KEEL_MODULE', `${mod.kind} module setup is not a function`);
    if (mod.code.hooks !== undefined && (typeof mod.code.hooks !== 'object' || mod.code.hooks === null || Array.isArray(mod.code.hooks))) {
      throw new KeelRuntimeError('KEEL_MODULE', `${mod.kind} module hooks is not an object`);
    }
    const id = `${manifest.id}:${mod.kind}:${mod.entry ?? index}`;
    const permissions = new Set(mod.permissions ?? []);
    const state = createState({}, { version: mod.state?.version ?? manifest.state?.version ?? 1 });
    const budget = createBudget(opts.budget ?? {});
    const commands = createCommandBus({
      frame: () => host.frame,
      apply: opts.applyCommand ? (cmd) => opts.applyCommand(cmd, id) : null,
    });

    const require = (capability) => {
      if (!permissions.has(capability)) throw new KeelDeniedError(`${id} lacks the capability "${capability}"`);
    };

    const api = Object.freeze({
      get frame() { return host.frame; },
      get id() { return id; },
      get capabilities() { return Object.freeze([...permissions]); },
      units(query) { require('sim.read'); return host.units(query); },
      damage(spec) { require('sim.damage.write'); return host.damage(spec); },
      heal(spec) { require('sim.heal.write'); return host.heal(spec); },
      buffs: Object.freeze({
        has(target, buff) { require('sim.read'); return host.buffs.has(target, buff); },
        apply(spec) { require('sim.buff.write'); return host.buffs.apply(spec); },
        remove(target, buff) { require('sim.buff.write'); return host.buffs.remove(target, buff); },
        list(target) { require('sim.read'); return host.buffs.list(target); },
      }),
      bonds: Object.freeze({
        get(bondId) { require('sim.bond.read'); return host.bonds?.get?.(bondId) ?? null; },
        list() { require('sim.bond.read'); return host.bonds?.list?.() ?? []; },
        addLayers(bondId, n) { require('sim.bond.write'); return host.bonds?.addLayers?.(bondId, n) ?? { ok: false, added: 0, layers: 0 }; },
      }),
      spawn(spec) { require('sim.spawn'); return host.spawn(spec); },
      rng(stream = 'default') { require('sim.rng'); return host.rng(stream); },
      fx(kind, at = null, data = null) { require('sim.fx'); return host.fx(kind, at, data); },
      command(command) { require('match.economy.write'); return commands.dispatch(command); },
      state: Object.freeze({
        get: () => state.get(),
        set: (next) => state.set(next),
        patch: (partial) => state.patch(partial),
      }),
      /** Publish a read-only view (the UI/HUD and the demo harness read it). */
      setView(data = null) {
        views[id] = clone(data);
        return clone(data);
      },
      /** Finish the match; the host reads runtime.finished. */
      finish(result = {}) {
        finished = clone(result);
        return clone(finished);
      },
      log(level, message, data = null) {
        if (logs.length >= 1000) return;
        logs.push({ module: id, level: String(level), message: String(message), data: data === null ? null : clone(data) });
      },
    });

    runtimes.push({ id, kind: mod.kind, entry: mod.entry ?? null, code: mod.code, permissions, state, budget, commands, api, disabled: false, denied: null });
  }

  const disable = (rt, hook, err) => {
    if (!rt.disabled) rt.disabled = true;
    const code = err?.code ?? 'KEEL_ERROR';
    errors.push({ module: rt.id, hook, code, message: String(err?.message ?? err) });
    if (err instanceof KeelDeniedError) rt.denied = err.message;
  };

  const runtime = {
    manifest,
    host,
    seed,
    get frame() { return host.frame; },
    get modules() { return runtimes.map((r) => ({ id: r.id, kind: r.kind, entry: r.entry, disabled: r.disabled, capabilities: [...r.permissions] })); },
    get errors() { return clone(errors); },
    get logs() { return clone(logs); },
    get views() { return clone(views); },
    get finished() { return finished ? clone(finished) : null; },
    get started() { return started; },
    /**
     * Run one hook across every module that exports it. A denied capability or a thrown error disables that module.
     * @param {string} name
     * @param {any} [ctx]
     * @param {{ cost?: number }} [options]
     */
    runHook(name, ctx = {}, options = {}) {
      const cost = Number.isFinite(options.cost) ? Number(options.cost) : 0.01;
      const before = errors.length;
      // A battle's own hook bus drives sim.tick, not runtime.tick(): start a new frame here too. Match/policy hooks are
      // not frame-driven, so give each one its own frame budget instead of letting a whole match accumulate.
      if (name === 'sim.tick' || name.startsWith('match.') || name.startsWith('policy.')) {
        for (const rt of runtimes) rt.budget.nextFrame();
      }
      for (const rt of runtimes) {
        const fn = rt.code.hooks?.[name];
        if (!isFn(fn) || rt.disabled) continue;
        const charged = rt.budget.charge(name, cost);
        if (!charged.ok) {
          errors.push({ module: rt.id, hook: name, code: 'KEEL_BUDGET', message: `${charged.reason} budget exceeded (${charged.used.hook.toFixed(3)}ms hook, ${charged.used.match.toFixed(3)}ms match)` });
          rt.disabled = true;
          continue;
        }
        try {
          fn(ctx, rt.api);
        } catch (err) {
          disable(rt, name, err);
        }
      }
      return { ok: errors.length === before, errors: errors.slice(before) };
    },
    /** Call module setup() once, then sim.setup and (unless battleStart:false) sim.battleStart. */
    start(options = {}) {
      if (started) return runtime;
      started = true;
      for (const rt of runtimes) {
        if (!isFn(rt.code.setup)) continue;
        try {
          rt.code.setup({ api: rt.api, state: rt.state, manifest, host });
        } catch (err) {
          disable(rt, 'setup', err);
        }
      }
      runtime.runHook('sim.setup');
      if (options.battleStart !== false) runtime.runHook('sim.battleStart');
      return runtime;
    },
    /** Advance one frame: the host ticks, the frame budget resets, then sim.tick runs. */
    tick(dt = 1 / 30) {
      host.tick(dt);
      for (const rt of runtimes) rt.budget.nextFrame();
      return runtime.runHook('sim.tick', { dt });
    },
    /** Finish a battle. */
    end(result = {}) {
      return runtime.runHook('sim.battleEnd', { result });
    },
    /** A JSON snapshot of plugin state, command logs, budgets and disabled modules. */
    snapshot() {
      const state = {};
      const commands = {};
      const budgets = {};
      for (const rt of runtimes) {
        state[rt.id] = rt.state.snapshot();
        commands[rt.id] = rt.commands.snapshot();
        budgets[rt.id] = rt.budget.snapshot();
      }
      return { manifest: { id: manifest.id, version: manifest.version }, frame: host.frame, state, commands, budgets, views: clone(views), finished: finished ? clone(finished) : null, disabled: runtimes.filter((r) => r.disabled).map((r) => r.id) };
    },
    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') throw new KeelRuntimeError('KEEL_SNAPSHOT', 'restore() needs a snapshot');
      for (const rt of runtimes) {
        if (snapshot.state?.[rt.id]) rt.state.restore(snapshot.state[rt.id]);
        if (snapshot.commands?.[rt.id]) rt.commands.restore(snapshot.commands[rt.id]);
        if (snapshot.budgets?.[rt.id]) rt.budget.restore(snapshot.budgets[rt.id]);
        rt.disabled = (snapshot.disabled ?? []).includes(rt.id);
      }
      for (const key of Object.keys(views)) delete views[key];
      if (snapshot.views && typeof snapshot.views === 'object') for (const [k, v] of Object.entries(snapshot.views)) views[k] = clone(v);
      finished = snapshot.finished ? clone(snapshot.finished) : null;
      return runtime.snapshot();
    },
    /** State + commands + views + finished + disabled; errors are diagnostics, not state. */
    hash() {
      const snap = runtime.snapshot();
      return hashJson({ state: snap.state, commands: snap.commands, views: snap.views, finished: snap.finished, disabled: snap.disabled });
    },
    /** Run a whole deterministic scenario: start, N ticks, end. */
    run({ frames = 60, dt = 1 / 30, result = {} } = {}) {
      runtime.start();
      for (let i = 0; i < frames; i++) runtime.tick(dt);
      runtime.end(result);
      return runtime.snapshot();
    },
  };

  return runtime;
}
