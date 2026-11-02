import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cosmetic, png, writePlugin } from '../helpers/pluginFixtures.js';
import {
  VERSION_LOCK_DIR, lockPlugins, readVersionLock, rollbackPlugin, unlockPlugins, versionLockView,
} from '../../server/plugins/lock.js';

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plugin-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugins = path.join(root, 'plugins');
  fs.mkdirSync(plugins);
  const dir = writePlugin(path.join(plugins, 'demo'), cosmetic({
    id: 'demo', permissions: ['assets.add'],
    assets: { chars: { char_1_lock_test: { avatar: 'a.png' } } },
  }), { 'a.png': png(4, 4, [1, 2, 3, 255]) });
  return { root, plugins, dir };
}

const row = (dir, version = '1.0.0') => ({
  id: 'demo', where: dir, class: 'cosmetic', layout: 'folder',
  manifest: { name: { zh: '测试插件', en: 'Demo' }, version },
});

test('lock archives the folder, records version + digest, and rollback restores its bytes', (t) => {
  const { plugins, dir } = setup(t);
  const original = fs.readFileSync(path.join(dir, 'a.png'));
  const locked = lockPlugins(plugins, [row(dir)], { now: Date.UTC(2026, 10, 2) });
  const entry = locked.lock.plugins.demo;
  assert.equal(locked.results[0].version, '1.0.0');
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.match(entry.file, /^demo-1\.0\.0-[a-f0-9]{8}\.zip$/);
  assert.ok(fs.existsSync(path.join(plugins, VERSION_LOCK_DIR, entry.file)));

  // a later install changes a file (the version may stay the same); the lock still names the old bytes
  fs.writeFileSync(path.join(dir, 'a.png'), png(4, 4, [9, 9, 9, 255]));
  const view = versionLockView(plugins, [row(dir)]);
  assert.equal(view.installed[0].match, true, 'the version still matches');
  assert.equal(view.installed[0].locked.archive, true);
  assert.equal(view.error, null);

  const r = rollbackPlugin(plugins, 'demo');
  assert.equal(r.version, '1.0.0');
  assert.ok(r.replaced, 'the changed folder is moved aside');
  assert.deepEqual(fs.readFileSync(path.join(plugins, 'demo', 'a.png')), original);
  assert.ok(fs.existsSync(r.replaced));
});

test('lock skips builtin / file plugins, unlock forgets the pin, and a missing lock refuses rollback', (t) => {
  const { plugins, dir } = setup(t);
  const locked = lockPlugins(plugins, [
    row(dir),
    { id: 'builtin', where: dir, builtin: true, manifest: { version: '1.0.0' } },
    { id: 'lang-file', where: dir, layout: 'file', manifest: { version: '1.0.0' } },
  ]);
  assert.equal(locked.lock.plugins.demo.version, '1.0.0');
  assert.equal(locked.lock.plugins.builtin, undefined);
  assert.equal(locked.lock.plugins['lang-file'], undefined);
  assert.ok(locked.results.some((x) => x.id === 'builtin' && x.skipped === 'builtin'));
  assert.ok(locked.results.some((x) => x.id === 'lang-file' && x.skipped === 'file'));

  const unlocked = unlockPlugins(plugins, ['demo']);
  assert.deepEqual(unlocked.removed, ['demo']);
  assert.equal(readVersionLock(plugins).lock.plugins.demo, undefined);
  assert.throws(() => rollbackPlugin(plugins, 'demo'), /not locked/);
  assert.throws(() => rollbackPlugin(plugins, '../demo'), /invalid plugin id/);
});

test('a tampered archive is refused before the plugin folder is touched', (t) => {
  const { plugins, dir } = setup(t);
  const locked = lockPlugins(plugins, [row(dir)]);
  const archive = path.join(plugins, VERSION_LOCK_DIR, locked.lock.plugins.demo.file);
  const before = fs.readFileSync(path.join(dir, 'a.png'));
  fs.writeFileSync(archive, 'not the zip we locked');
  assert.throws(() => rollbackPlugin(plugins, 'demo'), /does not match its hash/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'a.png')), before, 'the installed folder stays as it was');
});

test('a broken lock document reads as empty with an error instead of throwing', (t) => {
  const { plugins } = setup(t);
  fs.writeFileSync(path.join(plugins, 'lock.json'), '{not json');
  const r = readVersionLock(plugins);
  assert.deepEqual(r.lock.plugins, {});
  assert.match(r.error, /lock\.json/);
  const view = versionLockView(plugins, []);
  assert.match(view.error, /lock\.json/);
});
