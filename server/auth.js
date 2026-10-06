// server/auth.js — accounts & sessions for 野排 (docs/MATCHMAKING.md). Username + password, unique (case-insensitive)
// display names, scrypt-hashed passwords, opaque session tokens persisted in SQLite (server/db.mjs).
//
// The auth messages are answered by server/lobby.js (auth.register / auth.login → auth.ok { account, token }); a hello
// carrying `accountToken` rebinds the session to that account. 野排 (mm.join) requires a bound account.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AUTH_NAME_MIN, AUTH_NAME_MAX, AUTH_PASS_MIN, AUTH_PASS_MAX, ROLES } from '../shared/constants.js';

/** scrypt parameters (cost is stored in the hash string, so it can be raised later without breaking old hashes). */
const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64 });
/** Account sessions last this long (the client keeps the token in localStorage and sends it in `hello`). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** `scrypt$N$r$p$saltHex$hashHex`. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verification against a stored hash. Never throws. */
export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(String(password), salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

/** A 256-bit opaque session token. */
export const newSessionToken = () => randomBytes(32).toString('hex');

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/g;
const LONE_SURR = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Trim control / bidi / lone-surrogate junk and collapse whitespace — NO length cap (validate first). */
function normalizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(CONTROL, '').replace(LONE_SURR, '').replace(/\s+/g, ' ').trim();
}

/** The stored display name: normalized and capped at AUTH_NAME_MAX. */
export function cleanName(raw) { return normalizeName(raw).slice(0, AUTH_NAME_MAX); }

/** @returns {string|null} an ERR code (BAD_NAME) or null when acceptable (checked on the UNCAPPED length) */
export function nameError(raw) {
  const n = normalizeName(raw);
  return n.length >= AUTH_NAME_MIN && n.length <= AUTH_NAME_MAX ? null : 'BAD_NAME';
}

/** @returns {string|null} an ERR code (BAD_PASSWORD) or null */
export function passwordError(pw) {
  if (typeof pw !== 'string') return 'BAD_PASSWORD';
  return pw.length >= AUTH_PASS_MIN && pw.length <= AUTH_PASS_MAX ? null : 'BAD_PASSWORD';
}

/** The account fields sent to the client (never the hash). `role` is a shared/constants.js ROLES key, or null. */
export const publicAccount = (row) => ({ id: row.id, name: row.name, role: row.role ?? null });

/**
 * Accounts + sessions over the SQLite connection from server/db.mjs. All methods are synchronous (the statements are
 * microsecond-scale; the server is single-threaded and this keeps the API simple).
 */
export class AuthService {
  /** @param {{ db: any, now?: () => number, sessionTtlMs?: number }} opts */
  constructor({ db, now = Date.now, sessionTtlMs = SESSION_TTL_MS }) {
    this.db = db;
    this.now = now;
    this.sessionTtlMs = sessionTtlMs;
    this.q = {
      byNameLower: db.prepare('SELECT * FROM accounts WHERE name_lower = ?'),
      byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
      insert: db.prepare('INSERT INTO accounts (name, name_lower, pass_hash, created_at) VALUES (?, ?, ?, ?)'),
      touch: db.prepare('UPDATE accounts SET last_login = ? WHERE id = ?'),
      insertSession: db.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
      getSession: db.prepare('SELECT * FROM sessions WHERE token = ?'),
      delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
      delByAccount: db.prepare('DELETE FROM sessions WHERE account_id = ?'),
      purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
      list: db.prepare('SELECT id, name, created_at, last_login, banned, role FROM accounts ORDER BY id'),
      setRole: db.prepare('UPDATE accounts SET role = ? WHERE id = ?'),
    };
  }

  /** Every account, without the password hash (the /admin account table). */
  listAccounts() { return this.q.list.all(); }

  /**
   * Assign (or clear, with `null`) an account's role — shared/constants.js ROLES. The name is looked up like login
   * (case-insensitively). Used by `tools/role.mjs`.
   * @param {string} rawName @param {string|null} role
   * @returns {{ account: { id:number, name:string, role:string|null } } | { error: string }}
   */
  setRole(rawName, role) {
    const name = cleanName(rawName);
    const row = name ? this.q.byNameLower.get(name.toLowerCase()) : null;
    if (!row) return { error: 'NO_ACCOUNT' };
    const next = role == null || role === '' ? null : String(role);
    if (next != null && !Object.prototype.hasOwnProperty.call(ROLES, next)) return { error: 'BAD_ROLE' };
    this.q.setRole.run(next, row.id);
    return { account: publicAccount(this.q.byId.get(row.id)) };
  }

  /** @returns {{ account: {id:number,name:string}, token: string } | { error: string }} */
  register(rawName, password) {
    const ne = nameError(rawName); if (ne) return { error: ne };
    const pe = passwordError(password); if (pe) return { error: pe };
    const name = cleanName(rawName);
    const lower = name.toLowerCase();
    if (this.q.byNameLower.get(lower)) return { error: 'NAME_TAKEN' };
    const now = this.now();
    let row;
    try {
      const r = this.q.insert.run(name, lower, hashPassword(password), now);
      row = this.q.byId.get(r.lastInsertRowid);
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e?.message))) return { error: 'NAME_TAKEN' };
      throw e;
    }
    return { account: publicAccount(row), token: this._newSession(row.id, now) };
  }

  /** @returns {{ account: {id:number,name:string}, token: string } | { error: string }} */
  login(rawName, password) {
    const name = cleanName(rawName);
    const row = name ? this.q.byNameLower.get(name.toLowerCase()) : null;
    if (!row || row.banned || !verifyPassword(password, row.pass_hash)) return { error: 'BAD_CREDENTIALS' };
    const now = this.now();
    this.q.touch.run(now, row.id);
    // One account = one active session: logging in invalidates every older token, so an old device cannot re-bind
    // (its next hello resolves to nothing → SESSION_EXPIRED). The live old socket is kicked by Lobby.bindAccount.
    this.q.delByAccount.run(row.id);
    return { account: publicAccount(row), token: this._newSession(row.id, now) };
  }

  /** @returns {{id:number,name:string}|null} the account a session token belongs to (null when unknown / expired). */
  resolve(token) {
    if (typeof token !== 'string' || !token) return null;
    const s = this.q.getSession.get(token);
    if (!s) return null;
    if (s.expires_at <= this.now()) { this.q.delSession.run(token); return null; }
    const acc = this.q.byId.get(s.account_id);
    return acc && !acc.banned ? publicAccount(acc) : null;
  }

  logout(token) { if (typeof token === 'string' && token) this.q.delSession.run(token); }

  /** Drop expired sessions (call periodically). */
  purge() { this.q.purge.run(this.now()); }

  _newSession(accountId, now) {
    let token;
    do token = newSessionToken(); while (this.q.getSession.get(token));
    this.q.insertSession.run(token, accountId, now, now + this.sessionTtlMs);
    return token;
  }
}
