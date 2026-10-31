// N3: `keel new / test / pack` and `keel dev` — the author's everyday commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (...args) => spawnSync(process.execPath, ['tools/keel.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
const json = (r) => JSON.parse(r.stdout);

test('keel new copies a native template, rewrites its namespace and keeps the lock valid', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-new-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const made = run('new', 'keel-reference', 'my-ref', '--dir', tmp, '--name', '我的参考', '--json');
  assert.equal(made.status, 0, made.stderr);
  const out = json(made);
  assert.equal(out.id, 'my-ref');
  assert.equal(out.lock, true, 'the copied lock was regenerated for the new id');
  const dir = path.join(tmp, 'my-ref');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  assert.equal(manifest.id, 'my-ref');
  assert.equal(manifest.name.zh, '我的参考');
  const enemy = fs.readFileSync(path.join(dir, 'content/enemies.json'), 'utf8');
  assert.match(enemy, /enemy_x_my_ref_crystal/, 'record ids stay in the new plugin namespace');
  assert.doesNotMatch(enemy, /keel_reference/);

  const check = run('check', dir, '--strict');
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const smoke = run('test', dir, '--json');
  assert.equal(smoke.status, 0, smoke.stdout + smoke.stderr);
  assert.deepEqual(json(smoke).errors, []);
});

test('keel new refuses an existing folder and a template that is not native', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-new-bad-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'taken'));
  const taken = run('new', 'keel-content', 'taken', '--dir', tmp);
  assert.equal(taken.status, 2);
  assert.match(taken.stderr, /already exists/);
  const missing = run('new', 'keel-nope', 'demo', '--dir', tmp);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no native template/);
});

test('keel pack writes the lock and a zip', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-pack-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const made = run('new', 'keel-content', 'pack-demo', '--dir', tmp);
  assert.equal(made.status, 0, made.stderr);
  const dir = path.join(tmp, 'pack-demo');
  const out = path.join(tmp, 'dist') + path.sep;
  const packed = run('pack', dir, '--zip', '--out', out, '--json');
  assert.equal(packed.status, 0, packed.stdout + packed.stderr);
  const body = json(packed);
  assert.equal(body.wrote, true);
  assert.ok(body.files >= 2);
  assert.ok(fs.existsSync(path.join(dir, 'plugin.lock.json')));
  const zips = fs.readdirSync(path.join(tmp, 'dist')).filter((f) => f.endsWith('.zip'));
  assert.equal(zips.length, 1, 'the zip lands in the out folder');
});

test('keel exit reports manifest-2 blockers and mixed folders', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-exit-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'plugins/_template/keel-content'), path.join(tmp, 'keel-only'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'legacy-only'));
  fs.writeFileSync(path.join(tmp, 'legacy-only/plugin.json'), JSON.stringify({
    manifest: 2, id: 'legacy-only', name: 'legacy', version: '0.1.0', app: '*', api: 1, class: 'content', scope: ['room'],
  }, null, 2));
  fs.mkdirSync(path.join(tmp, 'mixed'));
  fs.copyFileSync(path.join(ROOT, 'plugins/_template/keel-content/plugin.json'), path.join(tmp, 'mixed/plugin.keel.json'));
  fs.writeFileSync(path.join(tmp, 'mixed/plugin.json'), JSON.stringify({ manifest: 2, id: 'mixed', name: 'mixed', version: '0.1.0', app: '*', api: 1, class: 'content', scope: ['room'] }, null, 2));

  const r = run('exit', '--dir', tmp, '--json');
  assert.equal(r.status, 1, 'a manifest-2-only folder blocks the cutover');
  const out = json(r);
  assert.equal(out.total, 3);
  assert.equal(out.keel, 2);
  assert.deepEqual(out.mixed, ['mixed']);
  assert.deepEqual(out.blockers.map((b) => b.id), ['legacy-only']);
});

test('keel dev checks once and watches the folder', { timeout: 20000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-dev-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const made = run('new', 'keel-policy', 'dev-demo', '--dir', tmp);
  assert.equal(made.status, 0, made.stderr);
  const dir = path.join(tmp, 'dev-demo');
  const child = spawn(process.execPath, ['tools/keel.mjs', 'dev', dir], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no output\n${out}`)), 12000);
    child.stdout.on('data', (b) => {
      out += b.toString();
      if (/watching/.test(out) && /dev-demo/.test(out)) { clearTimeout(timer); resolve(); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`exited ${code}\n${out}`)); });
  });
  t.after(() => { try { child.kill(); } catch { /* gone */ } });
  await done;
  assert.match(out, /dev-demo/);
  assert.match(out, /watching/);
});
