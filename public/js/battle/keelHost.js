// public/js/battle/keelHost.js — the browser Keel host over a live `Battle` (the same SIM_HOST_METHODS surface as the
// server's server/keel/stronghold-host.js). The seeded PRNG comes from `/sim/rng.js` (passed in), so both sides make the
// same rolls; no Unit or Battle crosses into a plugin.

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
    items: Array.isArray(u.items) ? [...u.items] : [],
    sp: Math.max(0, Number(u.skill?.sp) || 0),
    spTotal: Math.max(0, Number(u.skill?.spTotal) || 0),
    spCost: Math.max(0, Number(u.skill?.baseSpCost ?? u.skill?.spCost) || 0),
    blockCnt: Math.max(0, Number(u.s?.blockCnt ?? u.base?.blockCnt) || 0),
    rangeGrid: Array.isArray(u.rangeGrid) ? u.rangeGrid.map((r) => (Array.isArray(r) ? [...r] : r)) : [],
    dir: typeof u.dir === 'string' ? u.dir : null,
    tier: Number(u.def?.tier ?? u.tier ?? 0) || 0,
    hidden: !!u.hidden,
    defId: u.defId ?? u.def?.id ?? null,
    bonds: Array.isArray(u.def?.bonds) ? [...u.def.bonds] : [],
  };
}

/**
 * @param {any} battle a `Battle` (or a test double with the same public methods)
 * @param {{ rng: (seed: number) => any, deriveSeed: (seed: number, salt: string) => number, drive?: boolean }} opts
 */
export function createBattleKeelHost(battle, opts = {}) {
  if (!battle) throw new TypeError('createBattleKeelHost needs a battle');
  if (typeof opts.rng !== 'function' || typeof opts.deriveSeed !== 'function') throw new TypeError('createBattleKeelHost needs rng and deriveSeed');
  const drive = opts.drive === true;
  const pid = opts.playerId ?? battle.players?.[0]?.playerId ?? null;

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
    bonds: {
      get(bondId) {
        const b = pid == null ? null : battle.getPlayer?.(pid)?.bonds?.[String(bondId)];
        return b && typeof b === 'object' ? { id: String(bondId), ...clone(b) } : null;
      },
      list() {
        const all = pid == null ? null : battle.getPlayer?.(pid)?.bonds;
        if (!all || typeof all !== 'object') return [];
        return Object.entries(all).map(([id, b]) => ({ id, ...clone(b ?? {}) }))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      },
      /** Adds live layers through the engine's own clamp (BOND_LAYER_CAP, disabled gains). */
      addLayers(bondId, n) {
        const id = String(bondId);
        const added = pid != null && typeof battle.addLayers === 'function' ? battle.addLayers(pid, id, Number(n), 'keel') : 0;
        const b = pid == null ? null : battle.getPlayer?.(pid)?.bonds?.[id];
        return { ok: added > 0, added: Number(added) || 0, layers: Math.max(0, Number(b?.layers) || 0) };
      },
    },
    /**
     * Enemies plus ally tokens (`kind: 'token'`) and stage devices (`kind: 'device'`); the owner defaults to the battle's
     * player (or `attachKeel`'s `playerId`).
     */
    spawn(spec = {}) {
      const row = Number.isInteger(spec.row) ? spec.row : Number(spec.y);
      const col = Number.isInteger(spec.col) ? spec.col : Number(spec.x);
      const owner = spec.owner && typeof spec.owner === 'object' ? findUnit(battle, spec.owner)
        : spec.owner != null ? spec.owner : pid;
      if (spec.kind === 'token' || spec.tokenId != null) {
        if (typeof battle.spawnToken !== 'function') return { ok: false, reason: 'unsupported' };
        const tokenId = spec.tokenId ?? spec.key ?? spec.id;
        if (!tokenId) return { ok: false, reason: 'no-key' };
        if (!Number.isInteger(row) || !Number.isInteger(col)) return { ok: false, reason: 'no-tile' };
        const unit = battle.spawnToken(owner, String(tokenId), row, col, {
          ...(spec.force ? { force: true } : {}),
          ...(spec.anySource ? { anySource: true } : {}),
          ...(spec.hp != null ? { hp: Number(spec.hp) } : {}),
          ...(spec.duration != null ? { duration: Number(spec.duration) } : {}),
          ...(spec.stats && typeof spec.stats === 'object' ? { stats: spec.stats } : {}),
          ...(spec.dir ? { dir: spec.dir } : {}),
          ...(spec.facing ? { facing: spec.facing } : {}),
          ...(spec.untargetable ? { untargetable: true } : {}),
          ...(spec.def && typeof spec.def === 'object' ? { def: spec.def } : {}),
        });
        return unit ? { ok: true, id: unit.id } : { ok: false, reason: 'refused' };
      }
      if (spec.kind === 'device' || spec.deviceKey != null) {
        if (typeof battle.spawnDevice !== 'function') return { ok: false, reason: 'unsupported' };
        const key = spec.deviceKey ?? spec.key ?? spec.id;
        if (!key) return { ok: false, reason: 'no-key' };
        if (!Number.isInteger(row) || !Number.isInteger(col)) return { ok: false, reason: 'no-tile' };
        const unit = battle.spawnDevice(String(key), row, col, {
          ...(spec.hp != null ? { hp: Number(spec.hp) } : {}),
          ...(spec.obstacle != null ? { obstacle: !!spec.obstacle } : {}),
          ...(spec.obstacleKind ? { obstacleKind: spec.obstacleKind } : {}),
          ...(spec.blockCnt != null ? { blockCnt: Number(spec.blockCnt) } : {}),
          ...(spec.name ? { name: String(spec.name) } : {}),
          ...(spec.atk != null ? { atk: Number(spec.atk) } : {}),
          ...(spec.def != null ? { def: Number(spec.def) } : {}),
          ...(spec.res != null ? { res: Number(spec.res) } : {}),
          ...(spec.bat != null ? { bat: Number(spec.bat) } : {}),
          ...(spec.aspd != null ? { aspd: Number(spec.aspd) } : {}),
          ...(spec.dir ? { dir: spec.dir } : {}),
        });
        return unit ? { ok: true, id: unit.id } : { ok: false, reason: 'refused' };
      }
      if (typeof battle.spawnEnemy !== 'function') return { ok: false, reason: 'unsupported' };
      const key = spec.enemyKey ?? spec.key ?? spec.id;
      if (!key) return { ok: false, reason: 'no-key' };
      const unit = battle.spawnEnemy(String(key), {
        pos: [Number(spec.y ?? 0), Number(spec.x ?? 0)],
        ...(spec.mods ? { mods: spec.mods } : {}),
        ...(spec.tag ? { tag: spec.tag } : {}),
      });
      return unit ? { ok: true, id: unit.id } : { ok: false, reason: 'refused' };
    },
    status: {
      /** Apply any status key, including a plugin-defined one (`STATUS[key]` falls back to a flag of that name). */
      apply(target, key, opts = {}) {
        const u = findUnit(battle, target);
        if (!u || typeof battle.applyStatus !== 'function') return { ok: false, reason: 'no-target' };
        const source = opts.source != null ? findUnit(battle, opts.source) : null;
        const ok = battle.applyStatus(u, String(key), {
          ...(opts.duration != null ? { duration: Number(opts.duration) } : {}),
          ...(opts.value !== undefined ? { value: opts.value } : {}),
          ...(source ? { source } : {}),
          ...(opts.force ? { force: true } : {}),
        });
        return { ok: !!ok, key: String(key) };
      },
      remove(target, key) {
        const u = findUnit(battle, target);
        if (!u || typeof battle.removeBuff !== 'function') return 0;
        return battle.removeBuff(u, String(key));
      },
    },
    rng(stream = 'default') {
      const r = opts.rng(opts.deriveSeed(battle.seed ?? 0, `keel:${stream}`));
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
