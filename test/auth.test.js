// test/auth.test.js — accounts & sessions (server/db.mjs + server/auth.js, docs/MATCHMAKING.md): scrypt hashing,
// case-insensitive unique names, login, and session expiry. In-memory SQLite (node:sqlite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../server/db.mjs';
import { AuthService, hashPassword, verifyPassword, cleanName, nameError, passwordError } from '../server/auth.js';

test('password hashing round-trips and rejects wrong input', () => {
  const h = hashPassword('hunter2!');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.ok(verifyPassword('hunter2!', h));
  assert.ok(!verifyPassword('wrong', h));
  assert.ok(!verifyPassword('hunter2!', 'garbage'));
  assert.ok(!verifyPassword('hunter2!', null));
  assert.notEqual(hashPassword('same'), hashPassword('same'), 'a fresh salt each time');
});

test('display-name cleaning and limits', () => {
  assert.equal(cleanName('  d星空   之下  '), 'd星空 之下', 'trim + collapse runs of spaces');
  assert.equal(cleanName('a\tb\nc'), 'abc', 'control characters (tab / newline) stripped');
  assert.equal(cleanName('a\u200bb\u202ec'), 'abc', 'zero-width / bidi stripped');
  assert.equal(nameError('a'), 'BAD_NAME');
  assert.equal(nameError('ab'), null);
  assert.equal(nameError('a'.repeat(12)), null);
  assert.equal(nameError('a'.repeat(13)), 'BAD_NAME');
  assert.equal(passwordError('12345'), 'BAD_PASSWORD');
  assert.equal(passwordError('123456'), null);
});

test('register / duplicate names (case-insensitive) / login / sessions', () => {
  let t = 1_000_000;
  const auth = new AuthService({ db: openMemoryDb(), now: () => t });

  const r = auth.register('Hero', 'secret1');
  assert.equal(r.error, undefined);
  assert.ok(r.account.id > 0 && typeof r.token === 'string' && r.token.length >= 32);
  assert.deepEqual(auth.resolve(r.token), { id: r.account.id, name: 'Hero' });

  assert.equal(auth.register('Hero', 'other12').error, 'NAME_TAKEN');
  assert.equal(auth.register('hero', 'other12').error, 'NAME_TAKEN', 'names are unique case-insensitively');
  assert.equal(auth.register('Villain', 'x').error, 'BAD_PASSWORD', 'short password refused before the name is used');
  assert.equal(auth.register('V', 'longenough').error, 'BAD_NAME');

  assert.equal(auth.login('Hero', 'nope!!!').error, 'BAD_CREDENTIALS');
  assert.equal(auth.login('Nobody', 'secret1').error, 'BAD_CREDENTIALS');
  const l = auth.login('HERO', 'secret1');
  assert.equal(l.account.id, r.account.id);
  assert.notEqual(l.token, r.token, 'a new session token per login');
  assert.deepEqual(auth.resolve(l.token), { id: r.account.id, name: 'Hero' });

  auth.logout(l.token);
  assert.equal(auth.resolve(l.token), null, 'logged out');

  t += 40 * 24 * 60 * 60 * 1000; // past the 30-day TTL
  assert.equal(auth.resolve(r.token), null, 'expired');
});

test('login rotates the account session: the older token is invalidated', () => {
  const auth = new AuthService({ db: openMemoryDb(), now: () => 0 });
  const r = auth.register('Solo', 'secret1');
  assert.deepEqual(auth.resolve(r.token), { id: r.account.id, name: 'Solo' });
  const l = auth.login('Solo', 'secret1');
  assert.equal(auth.resolve(r.token), null, 'the older token no longer resolves');
  assert.deepEqual(auth.resolve(l.token), { id: r.account.id, name: 'Solo' });
  // logging in again rotates once more
  const l2 = auth.login('solo', 'secret1');
  assert.equal(auth.resolve(l.token), null);
  assert.ok(auth.resolve(l2.token));
});
