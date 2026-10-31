// server/keel/stronghold-host.js — a Keel host over a real Stronghold `Battle`.
//
// It maps the small SIM_HOST_METHODS surface onto the engine's public methods: units, dealDamage/heal, addBuff/removeBuff,
// spawnEnemy, a derived RNG stream and fx. It never mutates a Unit directly (except through the engine's own methods), and
// it never touches `_hooks` or private fields.
//
// `drive: true` lets `runtime.tick()` advance the battle (`battle.step()`); `attach.js` uses `drive: false` because the
// battle's own hook bus drives the runtime instead.

import { createRng as simRng, deriveSeed } from '../sim/rng.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const findUnit = (battle, ref) => {
  if (!ref) return null;
  const id = ref && typeof ref === 'object' ? ref.id : ref;
  return (battle.units ?? []).find((u) => u && u.id === id) ?? null;
};

/** A plain, read-only view of a Unit. No live Unit crosses into a plugin. */
export function unitView(u) {
  if (!u) return null;
  return {
    id: u.id,
    side: u.side,
    kind: u.kind ?? null,
    x: u.x,
    y: u.y,
    hp: u.hp,
    maxHp: u.maxHp,
    atk: u.s?.atk ?? u.base?.atk ?? 0,
    def: u.s?.def ?? u.base?.def ?? 0,
    res: u.s?.res ?? u.base?.res ?? 0,
    alive: !!u.alive,
    deployed: !!u.deployed,
    tags: u.tag ? [u.tag] : [],
    buffs: (u.buffs ?? []).map((b) => b.key),
  };
}

/**
 * @param {any} battle a `Battle` (or a test double with the same public methods)
 * @param {{ drive?: boolean }} [opts]
 */
export function createStrongholdHost(battle, opts = {}) {
  if (!battle) throw new TypeError('createStrongholdHost needs a battle');
  const drive = opts.drive !== false;

  const host = {
    get battle() { return battle; },
    get frame() { return Math.round((Number(battle.time) || 0) * 30); },
    get seed() { return battle.seed ?? 0; },
    units(query = {}) {
      let out = (battle.units ?? []).map(unitView).filter(Boolean);
      if (query.side) out = out.filter((u) => u.side === query.side);
      if (query.alive !== undefined) out = out.filter((u) => u.alive === !!query.alive);
      if (query.tag) out = out.filter((u) => u.tags.includes(query.tag));
      if (query.id !== undefined) out = out.filter((u) => u.id === query.id);
      if (Number.isInteger(query.limit) && query.limit >= 0) out = out.slice(0, query.limit);
      return out;
    },
    damage(spec = {}) {
      const target = findUnit(battle, spec.target);
      if (!target) return { ok: false, reason: 'no-target' };
      const source = findUnit(battle, spec.source);
      const dmg = typeof battle.makeDamage === 'function'
        ? battle.makeDamage({ amount: Number(spec.amount ?? 0), type: spec.type ?? 'true', ...(spec.dmg && typeof spec.dmg === 'object' ? spec.dmg : {}) })
        : { amount: Number(spec.amount ?? 0), type: spec.type ?? 'true' };
      const before = target.hp;
      const dealt = typeof battle.dealDamage === 'function' ? battle.dealDamage(source, target, dmg) : 0;
      const killed = before > 0 && (target.hp <= 0 || target.alive === false);
      return { ok: true, amount: typeof dealt === 'number' ? dealt : Math.max(0, before - target.hp), hp: target.hp, killed };
    },
    heal(spec = {}) {
      const target = findUnit(battle, spec.target);
      if (!target) return { ok: false, reason: 'no-target' };
      const source = findUnit(battle, spec.source);
      const before = target.hp;
      const healed = typeof battle.heal === 'function' ? battle.heal(source, target, Number(spec.amount ?? 0), spec.opts ?? {}) : 0;
      return { ok: true, amount: typeof healed === 'number' ? healed : Math.max(0, target.hp - before), hp: target.hp };
    },
    buffs: {
      has(target, buff) {
        const u = findUnit(battle, target);
        return !!(u && (u.buffs ?? []).some((b) => b.key === buff || b.status === buff));
      },
      apply(spec = {}) {
        const u = findUnit(battle, spec.target);
        if (!u || typeof battle.addBuff !== 'function') return { ok: false, reason: 'no-target' };
        const extra = spec.value && typeof spec.value === 'object' && !Array.isArray(spec.value) ? spec.value : {};
        const buff = battle.addBuff(u, { key: String(spec.buff), duration: Number(spec.duration ?? 0), ...extra });
        return buff ? { ok: true, key: buff.key, duration: buff.duration } : { ok: false, reason: 'refused' };
      },
      remove(target, buff) {
        const u = findUnit(battle, target);
        if (!u || typeof battle.removeBuff !== 'function') return 0;
        return battle.removeBuff(u, buff);
      },
      list(target) {
        const u = findUnit(battle, target);
        if (!u) return [];
        return (u.buffs ?? []).map((b) => ({ buff: b.key, duration: b.timeLeft ?? b.duration ?? 0, value: b.mods ? clone(b.mods) : null }));
      },
    },
    /** Enemies only in M1.5; tokens/devices need an owner PlayerState and are M2. */
    spawn(spec = {}) {
      if (typeof battle.spawnEnemy !== 'function') return { ok: false, reason: 'unsupported' };
      if (spec.side === 'ally' || spec.token || spec.device) return { ok: false, reason: 'ally-spawn-unsupported' };
      const key = spec.enemyKey ?? spec.key ?? spec.id;
      if (!key) return { ok: false, reason: 'no-key' };
      const unit = battle.spawnEnemy(String(key), {
        pos: [Number(spec.y ?? 0), Number(spec.x ?? 0)],
        ...(spec.mods ? { mods: spec.mods } : {}),
        ...(spec.tag ? { tag: spec.tag } : {}),
      });
      return unit ? { ok: true, id: unit.id } : { ok: false, reason: 'refused' };
    },
    rng(stream = 'default') {
      const r = simRng(deriveSeed(battle.seed ?? 0, `keel:${stream}`));
      return { next: () => r(), int: (n) => r.int(n), pick: (arr) => r.pick(arr) };
    },
    fx(kind, at = null, data = null) {
      if (typeof battle.fx !== 'function') return false;
      battle.fx(String(kind), { ...(at && typeof at === 'object' ? { x: at.x, y: at.y } : {}), ...(data && typeof data === 'object' ? data : {}) });
      return true;
    },
    /** Advance the battle once when `drive` is on; the hook bus drives the runtime otherwise. */
    tick(_dt = 1 / 30) {
      if (!drive || typeof battle.step !== 'function') return host.frame;
      battle.step();
      return host.frame;
    },
    snapshot() { return { frame: host.frame, seed: host.seed, units: host.units() }; },
    restore() { throw new TypeError('the Stronghold host restores through the battle snapshot, not this method'); },
  };
  return host;
}
