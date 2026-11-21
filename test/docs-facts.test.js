// test/docs-facts.test.js — documentation ⇄ repository facts (docs audit, phase 1):
//   * every `npm run <script>` a document names exists in package.json;
//   * every `node tools/<file>` a document names exists on disk;
//   * the version agrees across package.json, the README badge and shared/constants.js APP_VERSION;
//   * every docs/**/*.md outside history/ and research/ is reachable from docs/README.md (no orphans);
//   * every file test/fast.list names exists.
// Prose counts (test counts, file counts) are deliberately not asserted here: the docs no longer write them down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = new Set(Object.keys(pkg.scripts));

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
};
const DOCS = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', ...walk(path.join(ROOT, 'docs'))];

test('every `npm run <script>` a document names exists in package.json', () => {
  const bad = new Map();
  for (const d of DOCS) {
    const text = fs.readFileSync(path.join(ROOT, d), 'utf8');
    for (const m of text.matchAll(/npm run ([a-z][\w:.-]*)/g)) {
      if (!scripts.has(m[1])) bad.set(m[1], [...(bad.get(m[1]) ?? []), d]);
    }
  }
  assert.deepEqual([...bad].map(([s, where]) => `${s} (${where[0]})`), []);
});

test('every `node tools/<file>` a document names exists', () => {
  const bad = new Map();
  for (const d of DOCS) {
    const text = fs.readFileSync(path.join(ROOT, d), 'utf8');
    for (const m of text.matchAll(/node (tools\/[\w./-]+\.(?:mjs|js))/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) bad.set(m[1], [...(bad.get(m[1]) ?? []), d]);
    }
  }
  assert.deepEqual([...bad].map(([f, where]) => `${f} (${where[0]})`), []);
});

test('the version agrees: package.json, README badge, shared/constants.js APP_VERSION', () => {
  const badge = /version-([0-9][0-9.]*)-/.exec(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'))?.[1];
  const app = /APP_VERSION\s*=\s*['"]([^'"]+)/.exec(fs.readFileSync(path.join(ROOT, 'shared', 'constants.js'), 'utf8'))?.[1];
  assert.equal(badge, pkg.version, 'README badge');
  assert.equal(app, pkg.version, 'APP_VERSION');
});

test('every non-history/research doc is reachable from docs/README.md', () => {
  const start = 'docs/README.md';
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift();
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      const target = path.normalize(path.join(path.dirname(f), m[1])).replace(/\\/g, '/');
      if (seen.has(target) || !fs.existsSync(path.join(ROOT, target))) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  const expected = DOCS.filter((f) => f.startsWith('docs/') && !f.startsWith('docs/history/') && !f.startsWith('docs/research/'));
  const orphans = expected.filter((f) => !seen.has(f));
  assert.deepEqual(orphans, [], 'link these from docs/README.md (or move them under history/ / research/)');
});

test('every file in test/fast.list exists', () => {
  const list = fs.readFileSync(path.join(ROOT, 'test', 'fast.list'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(list.length >= 10, 'the fast tier has its curated files');
  assert.deepEqual(list.filter((f) => !fs.existsSync(path.join(ROOT, f))), []);
});
