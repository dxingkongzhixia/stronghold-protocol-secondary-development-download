// shared/keel/commands.js — the command log. Every write a module makes goes through a command, so a replay can be
// rebuilt from the same seed + commands (docs/keel/RUNTIME.md §commands).

import { hashJson } from './hash.js';

export class KeelCommandError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'KeelCommandError';
    this.code = code;
  }
}

/**
 * @param {{ frame?: () => number, apply?: (command: any) => any, limit?: number }} [opts]
 */
export function createCommandBus(opts = {}) {
  const frame = typeof opts.frame === 'function' ? opts.frame : () => 0;
  const apply = typeof opts.apply === 'function' ? opts.apply : null;
  const limit = Number.isInteger(opts.limit) ? opts.limit : 10000;
  /** @type {{ seq: number, frame: number, command: any, result?: any }[]} */
  let log = [];

  return {
    get length() { return log.length; },
    /** A copy of the log. */
    snapshot() { return JSON.parse(JSON.stringify(log)); },
    /** Replace the log (a replay or a restore). */
    restore(next) {
      if (!Array.isArray(next)) throw new KeelCommandError('KEEL_COMMAND_LOG', 'restore() needs an array');
      log = JSON.parse(JSON.stringify(next));
      return this.snapshot();
    },
    /** Clear the log. */
    clear() { log = []; },
    /**
     * Validate, record and apply one command.
     * @param {any} command
     */
    dispatch(command) {
      if (!command || typeof command !== 'object' || Array.isArray(command)) {
        throw new KeelCommandError('KEEL_COMMAND_SHAPE', 'a command is a plain object');
      }
      if (typeof command.type !== 'string' || !command.type.trim()) {
        throw new KeelCommandError('KEEL_COMMAND_TYPE', 'a command needs a non-empty "type"');
      }
      if (log.length >= limit) throw new KeelCommandError('KEEL_COMMAND_LIMIT', `more than ${limit} commands`);
      const entry = { seq: log.length, frame: frame(), command: JSON.parse(JSON.stringify(command)) };
      const result = apply ? apply(entry.command) : undefined;
      if (result !== undefined) entry.result = result;
      log.push(entry);
      return result;
    },
    /** Replay the log through another handler (often the same apply). */
    replay(handler) {
      if (typeof handler !== 'function') throw new KeelCommandError('KEEL_COMMAND_REPLAY', 'replay(handler) needs a function');
      return log.map((entry) => handler(entry.command, entry));
    },
    /** A stable hash of the log. */
    hash() { return hashJson(log); },
  };
}
