// shared/keel/state.js — a plugin's JSON state slice, snapshots and version migrations.
//
// The runtime owns one slice per module. `get()` returns a copy, so a module cannot mutate the runtime's copy by
// accident; all writes go through `patch` / `set` / `replace`. Only JSON values are accepted.

export class KeelStateError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'KeelStateError';
    this.code = code;
  }
}

// A plugin's objects may come from another realm (the browser's Keel sandbox frame or a Worker): accept any realm's
// Object.prototype, not only this module's. A class instance's prototype still has Object.prototype above it, so it is
// rejected as before.
const isPlain = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === null || Object.getPrototypeOf(proto) === null;
};

/**
 * Reject anything JSON cannot carry. The path is included so an author can find the field.
 * @param {unknown} value
 * @param {string} [path]
 */
export function assertJson(value, path = 'state') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new KeelStateError('KEEL_STATE_JSON', `${path} is not a finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJson(v, `${path}[${i}]`));
    return;
  }
  if (isPlain(value)) {
    for (const [k, v] of Object.entries(value)) assertJson(v, `${path}.${k}`);
    return;
  }
  throw new KeelStateError('KEEL_STATE_JSON', `${path} is not JSON (${value === undefined ? 'undefined' : typeof value})`);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * One module's state.
 * @param {any} [initial]
 * @param {{ version?: number }} [opts]
 */
export function createState(initial = {}, opts = {}) {
  assertJson(initial, 'state');
  let value = clone(initial);
  let version = Number.isInteger(opts.version) && opts.version > 0 ? opts.version : 1;
  /** @type {Map<number, (old: any) => any>} */
  const migrations = new Map();

  return {
    get version() { return version; },
    /** A copy of the current value. */
    get() { return clone(value); },
    /** Replace the whole value. */
    set(next) {
      assertJson(next, 'state');
      value = clone(next);
      return this.get();
    },
    /** Shallow-merge a plain object; arrays and scalars are replaced. */
    patch(partial) {
      if (!isPlain(partial)) throw new KeelStateError('KEEL_STATE_PATCH', 'patch() needs a plain object');
      assertJson(partial, 'state.patch');
      value = { ...(isPlain(value) ? value : {}), ...clone(partial) };
      assertJson(value, 'state');
      return this.get();
    },
    /** Replace the value; the same as set(), named for the content graph. */
    replace(next) { return this.set(next); },
    snapshot() {
      return { version, value: clone(value) };
    },
    /** Restore a snapshot; a version gap needs a registered migration, never a silent guess. */
    restore(snapshot) {
      if (!isPlain(snapshot) || !Number.isInteger(snapshot.version) || !Object.hasOwn(snapshot, 'value')) {
        throw new KeelStateError('KEEL_STATE_SNAPSHOT', 'restore() needs { version, value }');
      }
      let v = snapshot.version;
      let next = clone(snapshot.value);
      while (v < version) {
        const migrate = migrations.get(v);
        if (!migrate) throw new KeelStateError('KEEL_STATE_MIGRATION', `no migration from state version ${v} to ${v + 1}`);
        next = migrate(next);
        assertJson(next, 'state');
        v += 1;
      }
      if (v > version) throw new KeelStateError('KEEL_STATE_VERSION', `snapshot is version ${v}, this module reads ${version}`);
      value = next;
      return this.get();
    },
    /** Register a migration from `from` to `from + 1`. */
    migrate(from, fn) {
      if (!Number.isInteger(from) || from < 1) throw new KeelStateError('KEEL_STATE_MIGRATION', 'migrate(from) needs a positive integer');
      if (typeof fn !== 'function') throw new KeelStateError('KEEL_STATE_MIGRATION', 'migrate(from, fn) needs a function');
      migrations.set(from, fn);
      return this;
    },
    /** Bump the state version (a module that adds a migration in the same release). */
    bump() { version += 1; return version; },
  };
}
