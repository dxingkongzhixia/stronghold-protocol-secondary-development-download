// public/js/e2eMode.js and its two gates: `?e2e=1` turns off the entry film (ui/entryFilm.js) and the first-run
// 美术资源 modal (ui/assetMode.js) — the two full-screen overlays that swallowed headless tests' clicks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { e2eMode } from '../../public/js/e2eMode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('e2eMode: exactly ?e2e=1 (never absent, 0, or a substring)', () => {
  assert.equal(e2eMode('?e2e=1'), true);
  assert.equal(e2eMode('?a=b&e2e=1'), true);
  assert.equal(e2eMode('?e2e=0'), false);
  assert.equal(e2eMode('?e2e='), false);
  assert.equal(e2eMode('?e2e'), false);
  assert.equal(e2eMode(''), false);
  assert.equal(e2eMode('?e2e=11'), false);
  assert.equal(e2eMode('?x=%'), false, 'a malformed string is off, not a throw');
});

test('the full-screen gates consult the flag', () => {
  assert.match(read('public/js/ui/entryFilm.js'), /if \(e2eMode\(\)\) return;/, 'the entry film returns before mounting');
  assert.match(read('public/js/ui/assetMode.js'), /!E2E && assetCacheSupported\(\)/, 'the first-run prompt stays closed');
});

test('test/helpers/appBoot.mjs appends the flag and seeds the profile', () => {
  const src = read('test/helpers/appBoot.mjs');
  assert.match(src, /searchParams\.set\('e2e', '1'\)/);
  assert.match(src, /sp\.pref\.assetMode/);
  assert.match(src, /sp\.name/);
  assert.match(src, /sp\.entered/);
  assert.match(src, /export async function createRoom/);
  assert.match(src, /export async function openSettings/);
});
