// test/keel/contracts.test.js — the frozen Keel surface (shared/keel/contracts.js, docs/keel/CONTRACTS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEEL_STABLE_POINTS, KEEL_EXPERIMENTAL_POINTS, pointsByDomain } from '../../shared/keel/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('24 stable points: unique ids, complete fields, six domains', () => {
  assert.equal(KEEL_STABLE_POINTS.length, 24);
  assert.equal(new Set(KEEL_STABLE_POINTS.map((p) => p.id)).size, 24);
  const domains = new Set(KEEL_STABLE_POINTS.map((p) => p.domain));
  assert.deepEqual([...domains].sort(), ['asset', 'content', 'match', 'policy', 'sim', 'ui']);
  for (const p of KEEL_STABLE_POINTS) {
    for (const key of ['id', 'domain', 'point', 'readable', 'writable', 'capability', 'budget', 'stability']) assert.ok(p[key], `${p.id}.${key}`);
    assert.equal(p.stability, 'stable');
  }
  assert.equal(pointsByDomain().reduce((n, d) => n + d.points.length, 0), 24);
});

test('the experimental list does not overlap the stable points', () => {
  const stable = new Set(KEEL_STABLE_POINTS.map((p) => p.point));
  for (const p of KEEL_EXPERIMENTAL_POINTS) assert.ok(!stable.has(p), p);
});

test('docs/keel/CONTRACTS.md names every stable id and nothing unknown', () => {
  const file = path.join(ROOT, 'docs/keel/CONTRACTS.md');
  assert.ok(fs.existsSync(file), 'docs/keel/CONTRACTS.md exists');
  const text = fs.readFileSync(file, 'utf8');
  const ids = new Set([...text.matchAll(/^\|\s*\*{0,2}([A-Z]\d+)\*{0,2}\s*\|/gm)].map((m) => m[1]));
  const stable = new Set(KEEL_STABLE_POINTS.map((p) => p.id));
  assert.deepEqual([...stable].filter((id) => !ids.has(id)), []);
  assert.deepEqual([...ids].filter((id) => !stable.has(id)), []);
});
