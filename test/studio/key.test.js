// server/studio/key.js — the studio's key: 128 random bits in plugins/.studio-key, compared in constant time. File I/O
// against a temp folder; no server, no Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KEY_FILE, KEY_PATTERN, loadStudioKey, sameKey } from '../../server/studio/key.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-studio-key-'));

test('KEY_PATTERN: 22–64 base64url characters', () => {
  assert.equal(KEY_PATTERN.test('a'.repeat(22)), true);
  assert.equal(KEY_PATTERN.test('A-z_0'.repeat(6)), true);
  assert.equal(KEY_PATTERN.test('a'.repeat(64)), true);
  assert.equal(KEY_PATTERN.test('a'.repeat(21)), false);
  assert.equal(KEY_PATTERN.test('a'.repeat(65)), false);
  assert.equal(KEY_PATTERN.test('has space in it 1234567890'), false);
  assert.equal(KEY_PATTERN.test(''), false);
});

test('loadStudioKey: creates plugins/.studio-key once, keeps it across calls, and returns 128 bits', () => {
  const dir = tmp();
  const a = loadStudioKey(dir);
  assert.equal(a.saved, true);
  assert.equal(a.file, path.join(dir, KEY_FILE));
  assert.equal(KEY_PATTERN.test(a.key), true);
  assert.equal(fs.readFileSync(a.file, 'utf8').trim(), a.key);
  if (process.platform !== 'win32') assert.equal(fs.statSync(a.file).mode & 0o777, 0o600, 'the key is owner-only');
  const b = loadStudioKey(dir);
  assert.equal(b.key, a.key, 'the same key after a restart');
  assert.equal(b.saved, true);
});

test('loadStudioKey: a corrupt file is replaced; an unwritable folder still yields a key for this start', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, KEY_FILE), 'not a key\n');
  const a = loadStudioKey(dir);
  assert.equal(KEY_PATTERN.test(a.key), true);
  assert.equal(fs.readFileSync(a.file, 'utf8').trim(), a.key);

  const file = path.join(tmp(), 'a-file');
  fs.writeFileSync(file, 'x');
  const warned = [];
  const b = loadStudioKey(path.join(file, 'plugins'), { log: { warn: (m) => warned.push(m) } });
  assert.equal(b.saved, false);
  assert.equal(KEY_PATTERN.test(b.key), true, 'one per start');
  assert.equal(warned.length, 1);
  assert.match(warned[0], /cannot keep the studio's key/);
});

test('sameKey: equal strings only, constant-time compare, never throws on odd input', () => {
  assert.equal(sameKey('abc', 'abc'), true);
  assert.equal(sameKey('abc', 'abd'), false);
  assert.equal(sameKey('abc', 'abcd'), false);
  assert.equal(sameKey('', 'abc'), false);
  assert.equal(sameKey('abc', ''), false, 'an empty key never matches');
  assert.equal(sameKey(undefined, 'abc'), false);
  assert.equal(sameKey(['abc'], 'abc'), false);
  assert.equal(sameKey('abc', null), false);
});
