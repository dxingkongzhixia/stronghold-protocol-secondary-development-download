// test/keel/cli.test.js �?tools/keel.mjs (M0: read-only graph, check, migrate, surface).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (...args) => spawnSync(process.execPath, ['tools/keel.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
const json = (r) => JSON.parse(r.stdout);

test('graph --json describes the Keel content template', () => {
  const r = run('graph', '_template/keel-content', '--json');
  assert.equal(r.status, 0, r.stderr);
  const g = json(r);
  assert.equal(g.id, 'keel-content');
  assert.equal(g.source, 'v3');
  assert.ok(g.kinds.includes('content'));
  assert.ok(g.permissions.includes('content.define'));
});

test('check exits 0 without problems, strict included', () => {
  const ok = run('check', '_template/keel-content', '--strict');
  assert.equal(ok.status, 0, ok.stderr);
});

test('migrate prints a manifest 3 without writing by default', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-migrate-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, 'legacy-demo');
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 2, id: 'legacy-demo', name: 'Legacy demo', version: '1.0.0', app: '*', api: 1, class: 'content',
    scope: ['room'], permissions: ['data.patch'], data: ['data/patch.json'],
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'data/patch.json'), JSON.stringify({ patch: 1, ops: [] }));
  const r = run('migrate', dir, '--json');
  assert.equal(r.status, 0, r.stderr);
  const m = json(r);
  assert.equal(m.manifest.manifest, 3);
  assert.equal(m.manifest.compat.manifest2, true);
  assert.equal(fs.existsSync(path.join(dir, 'plugin.keel.json')), false);
});

test('migrate --write refuses a trusted plugin whose server/page code the Keel path cannot run', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-trusted-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, 'trusted-demo');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 2, id: 'trusted-demo', name: { zh: '受信示例', en: 'Trusted demo' }, version: '0.1.0',
    app: '>=0.3.0 <0.4.0', api: 1, class: 'trusted', scope: ['room'], sourceLang: 'zh', license: 'CC0-1.0',
    permissions: ['trusted.server', 'trusted.page'], entry: { server: 'server.js', client: 'client.js' },
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'server.js'), 'export default {};\n');
  fs.writeFileSync(path.join(dir, 'client.js'), 'export default {};\n');
  const r = run('migrate', dir, '--write');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /legacy loader/);
  assert.equal(fs.existsSync(path.join(dir, 'plugin.keel.json')), false);
});

test('import previews a draft and --write never overwrites an existing Keel manifest', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-import-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, 'data-demo');
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 2, id: 'data-demo', name: 'Demo data', version: '1.0.0', app: '*', api: 1, class: 'content',
    scope: ['room'], permissions: ['data.patch'], data: ['data/patch.json'],
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'data/patch.json'), JSON.stringify({ patch: 1, ops: [] }));
  const preview = run('import', dir, '--json');
  assert.equal(preview.status, 0, preview.stderr);
  const draft = json(preview);
  assert.equal(draft.draft, true);
  assert.equal(draft.manifest.manifest, 3);
  assert.equal(fs.existsSync(path.join(dir, 'plugin.keel.json')), false);

  const first = run('import', dir, '--write');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'plugin.keel.json')));
  const second = run('import', dir, '--write');
  assert.equal(second.status, 2);
  assert.match(second.stderr, /never overwrites/);
});

test('surface --check agrees with docs/keel/CONTRACTS.md', () => {
  const r = run('surface', '--check', '--json');
  assert.equal(r.status, 0, r.stderr);
  const s = json(r);
  assert.equal(s.stable, 24);
  assert.deepEqual(s.problems, []);
});

test('run executes the keel-demo sim module on the fake host', () => {
  const r = run('run', 'test/fixtures/keel-demo', '--seed', '1', '--frames', '60', '--json');
  assert.equal(r.status, 0, r.stderr);
  const out = json(r);
  assert.equal(out.frames, 60);
  const state = Object.values(out.state)[0].value;
  assert.deepEqual(state, { ticks: 60, hits: 4, kills: 1, ended: true, frame: 60 });
  assert.deepEqual(out.errors, []);
  assert.match(out.hash, /^[0-9a-f]{8}$/);
});

test('run executes the keel-survival template', () => {
  const r = run('run', '_template/keel-survival', '--seed', '1', '--frames', '60', '--json');
  assert.equal(r.status, 0, r.stderr);
  const state = Object.values(json(r).state)[0].value;
  assert.deepEqual([state.ticks, state.spawned, state.hits, state.kills, state.ended], [60, 2, 15, 1, true]);
});

test('run reports a content-only plugin as having no executable modules', () => {
  const r = run('run', '_template/keel-content', '--json');
  assert.equal(r.status, 0, r.stderr);
  const out = json(r);
  assert.deepEqual(out.modules, []);
  assert.match(out.note, /no executable modules/);
});

test('a local PRTS plugin, when present, reads as a content + asset graph', (t) => {
  const dir = path.join(ROOT, 'plugins/prts-source-code');
  if (!fs.existsSync(dir)) { t.skip('PRTS is not checked out (plugins/* is git-ignored)'); return; }
  const r = run('graph', 'prts-source-code', '--json');
  assert.equal(r.status, 0, r.stderr);
  const g = json(r);
  assert.equal(g.trust, 'data');
  assert.ok(g.kinds.includes('content'));
  assert.ok(g.permissions.includes('content.patch'));
});
