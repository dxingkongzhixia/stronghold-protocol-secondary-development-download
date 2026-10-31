// shared/keel/host.js — the host interface a Keel runtime talks to, plus a deterministic fake host for tests and
// `keel run`. A real backend (StrongholdSim / AUE) implements the same handful of methods.

import { createRng } from './rng.js';

/** The methods a sim host must provide. Documented in docs/keel/RUNTIME.md. */
export const SIM_HOST_METHODS = Object.freeze(['units', 'damage', 'heal', 'buffs', 'spawn', 'rng', 'fx', 'frame']);

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * A small deterministic host: units on a 2D board, damage/heal, buffs as a flat map, spawn and fx events.
 * @param {{ seed?: number|string, units?: any[] }} [opts]
 */
export function createFakeHost(opts = {}) {
  const seed = opts.seed ?? 0;
  /** @type {Map<string, any>} */
  const units = new Map();
  /** @type {Map<string, any>} */
  const buffs = new Map();
  const events = [];
  let frame = 0;
  let nextId = 1;

  const add = (spec) => {
    const id = String(spec.id ?? `u${nextId++}`);
    const hp = Number(spec.hp ?? spec.maxHp ?? 1);
    const unit = {
      id,
      side: spec.side === 'ally' ? 'ally' : 'enemy',
      x: Number(spec.x ?? 0),
      y: Number(spec.y ?? 0),
      hp: Math.max(0, Math.min(hp, Number(spec.maxHp ?? hp))),
      maxHp: Number(spec.maxHp ?? hp),
      atk: Number(spec.atk ?? 0),
      def: Number(spec.def ?? 0),
      res: Number(spec.res ?? 0),
      alive: hp > 0,
      tags: Array.isArray(spec.tags) ? [...spec.tags] : spec.tag ? [String(spec.tag)] : [],
      ...(spec.data !== undefined ? { data: clone(spec.data) } : {}),
    };
    units.set(id, unit);
    events.push({ frame, type: 'spawn', id, side: unit.side });
    return id;
  };
  for (const u of opts.units ?? []) add(u);

  const get = (id) => (id && typeof id === 'object' ? units.get(String(id.id)) : units.get(String(id))) ?? null;

  const host = {
    get frame() { return frame; },
    get seed() { return seed; },
    get events() { return clone(events); },
    add,
    get,
    /** Copies, sorted by id, so iteration is deterministic. */
    units(query = {}) {
      let out = [...units.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (query.side) out = out.filter((u) => u.side === query.side);
      if (query.alive !== undefined) out = out.filter((u) => u.alive === !!query.alive);
      if (query.tag) out = out.filter((u) => u.tags.includes(query.tag));
      if (query.id) out = out.filter((u) => u.id === query.id);
      if (Number.isInteger(query.limit) && query.limit >= 0) out = out.slice(0, query.limit);
      return out.map((u) => clone(u));
    },
    damage(spec = {}) {
      const target = get(spec.target);
      if (!target) return { ok: false, reason: 'no-target' };
      const amount = Math.max(0, Number(spec.amount ?? 0));
      const before = target.hp;
      target.hp = Math.max(0, target.hp - amount);
      const killed = before > 0 && target.hp === 0;
      if (killed) target.alive = false;
      events.push({ frame, type: 'damage', target: target.id, amount, hp: target.hp, killed });
      return { ok: true, amount: before - target.hp, hp: target.hp, killed };
    },
    heal(spec = {}) {
      const target = get(spec.target);
      if (!target) return { ok: false, reason: 'no-target' };
      const amount = Math.max(0, Number(spec.amount ?? 0));
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      if (target.hp > 0) target.alive = true;
      events.push({ frame, type: 'heal', target: target.id, amount, hp: target.hp });
      return { ok: true, amount: target.hp - before, hp: target.hp };
    },
    buffs: {
      has(target, buff) { return buffs.has(`${get(target)?.id ?? target}:${buff}`); },
      apply(spec = {}) {
        const target = get(spec.target);
        if (!target) return { ok: false, reason: 'no-target' };
        const key = `${target.id}:${spec.buff}`;
        const value = { target: target.id, buff: String(spec.buff), duration: Number(spec.duration ?? 0), value: clone(spec.value ?? null), frame };
        buffs.set(key, value);
        events.push({ frame, type: 'buff', target: target.id, buff: value.buff });
        return { ok: true, ...clone(value) };
      },
      remove(target, buff) { return buffs.delete(`${get(target)?.id ?? target}:${buff}`); },
      list(target) {
        const id = get(target)?.id ?? String(target);
        return [...buffs.values()].filter((b) => b.target === id).map((b) => clone(b));
      },
    },
    spawn(spec = {}) { const id = add(spec); return { ok: true, id }; },
    rng(stream = 'default') { return createRng(seed, stream); },
    fx(kind, at = null, data = null) {
      events.push({ frame, type: 'fx', kind: String(kind), at: at ? clone(at) : null, data: data === null ? null : clone(data) });
      return true;
    },
    /** Advance one frame; the runtime calls this before the sim.tick hooks. */
    tick(dt = 1 / 30) {
      frame += 1;
      events.push({ frame, type: 'tick', dt });
      return frame;
    },
    snapshot() {
      return { frame, seed, units: [...units.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((u) => clone(u)), buffs: [...buffs.values()].map((b) => clone(b)) };
    },
    restore(snapshot) {
      if (!isPlain(snapshot)) throw new TypeError('host.restore() needs a snapshot');
      frame = Number(snapshot.frame) || 0;
      units.clear();
      for (const u of snapshot.units ?? []) units.set(u.id, clone(u));
      buffs.clear();
      for (const b of snapshot.buffs ?? []) buffs.set(`${b.target}:${b.buff}`, clone(b));
      return host.snapshot();
    },
  };
  return host;
}
