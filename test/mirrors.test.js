// test/mirrors.test.js — server/mirrors.js: public/asset-mirrors.json is the ONE place the art origins live (the
// console's 来源配置 view edits it, docs/MATCHMAKING.md §12.3). These cover the read (never throws), the validation
// (what may reach a player), the atomic write with its backup, and the revert.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIRRORS_FILE, BACKUP_FILE, configPath, backupPath, isOrigin, tidyOrigin,
  readMirrors, validateMirrors, writeMirrors, revertMirrors, hasBackup,
} from '../server/mirrors.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A throwaway checkout: `<tmp>/public` (the config) + `<tmp>/var` (the backup). */
function tmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirrors-'));
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  return { root, publicDir, backup: backupPath(root) };
}

test('isOrigin takes http(s) origins only, and tidyOrigin drops trailing slashes', () => {
  for (const ok of ['http://1.2.3.4', 'https://cdn.jsdelivr.net/gh/o/r@master/public', 'http://host:8080/x']) {
    assert.ok(isOrigin(ok), ok);
  }
  for (const bad of ['', '   ', 'ftp://x/y', 'javascript:alert(1)', 'not a url', '//host/x', null, 42, {}]) {
    assert.ok(!isOrigin(bad), String(bad));
  }
  assert.equal(tidyOrigin(' http://host/ '), 'http://host');
  assert.equal(tidyOrigin('https://x/y///'), 'https://x/y');
});

test('readMirrors never throws: absent, malformed and junk entries all come back as empty lists', () => {
  const { publicDir } = tmp();
  assert.deepEqual(readMirrors(publicDir), { note: '', sources: [], fullSources: [], exists: false });
  fs.writeFileSync(configPath(publicDir), '{ not json');
  assert.deepEqual(readMirrors(publicDir), { note: '', sources: [], fullSources: [], exists: false });
  fs.writeFileSync(configPath(publicDir), JSON.stringify({ sources: ['http://a', 42, '', null], fullSources: ['http://a', 'http://not-listed'] }));
  const m = readMirrors(publicDir);
  assert.deepEqual(m.sources, ['http://a'], 'only strings survive');
  assert.deepEqual(m.fullSources, ['http://a'], 'a full source that is not a source is dropped');
  assert.equal(m.exists, true);
});

test('validateMirrors: every entry an http(s) URL, no duplicates, a full origin must be listed', () => {
  assert.deepEqual(validateMirrors({ sources: [], fullSources: [] }), {}, 'empty is legal — the client stays on the server');
  assert.equal(validateMirrors({ sources: ['ftp://x'], fullSources: [] }).error !== undefined, true);
  assert.equal(validateMirrors({ sources: ['http://a', 'http://a/'], fullSources: [] }).error !== undefined, true, 'trailing slash is the same origin');
  assert.equal(validateMirrors({ sources: ['http://a'], fullSources: ['http://b'] }).error !== undefined, true);
  assert.deepEqual(validateMirrors({ sources: ['http://a'], fullSources: ['http://a'] }), {});
  assert.ok(validateMirrors({ sources: 'http://a', fullSources: [] }).error, 'a non-array is refused');
});

test('writeMirrors: valid only, atomic, keeps the note, and keeps the previous file as the backup', () => {
  const { publicDir, backup } = tmp();
  assert.ok(writeMirrors(publicDir, { sources: ['nope'], fullSources: [] }).error, 'a bad URL is refused');
  assert.ok(!fs.existsSync(configPath(publicDir)), 'nothing was written');

  const first = { sources: ['http://relay', 'https://cdn'], fullSources: ['http://relay'] };
  fs.writeFileSync(configPath(publicDir), JSON.stringify({ note: 'THE NOTE', ...first }, null, 2) + '\n');
  assert.ok(writeMirrors(publicDir, { sources: ['http://new'], fullSources: ['http://new'] }, { backup }).ok);
  const now = readMirrors(publicDir);
  assert.deepEqual(now.sources, ['http://new']);
  assert.equal(now.note, 'THE NOTE', 'the note survives an edit');
  assert.ok(!fs.existsSync(configPath(publicDir) + '.tmp'), 'no temp file is left behind');
  assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')).sources, first.sources, 'the previous file is the backup');
  assert.ok(hasBackup(path.dirname(publicDir)));
});

test('revertMirrors puts the backup back; without one it says so', () => {
  const { root, publicDir, backup } = tmp();
  assert.ok(revertMirrors(publicDir, { backup }).error, 'no backup yet');
  fs.writeFileSync(configPath(publicDir), JSON.stringify({ sources: ['http://old'], fullSources: [] }));
  writeMirrors(publicDir, { sources: ['http://edited'], fullSources: [] }, { backup });
  assert.deepEqual(readMirrors(publicDir).sources, ['http://edited']);
  assert.ok(revertMirrors(publicDir, { backup }).ok);
  assert.deepEqual(readMirrors(publicDir).sources, ['http://old'], 'the previous version is back');
  assert.ok(hasBackup(root));
});

test('the shipped config is valid, keeps an unhardcoded order, and still names the relay first', () => {
  const m = readMirrors(path.join(ROOT, 'public'));
  assert.ok(m.exists, `${MIRRORS_FILE} exists`);
  assert.deepEqual(validateMirrors(m), {}, 'the shipped file passes its own validation');
  assert.ok(m.sources.length >= 1, 'at least one origin');
  assert.ok(m.fullSources.length >= 1, 'the relay is marked as a full origin');
  assert.equal(m.sources[0], m.fullSources[0], 'the full origin (the relay) is tried first');
  assert.ok(m.note.length > 0, 'the file keeps its explanation');
  assert.equal(path.basename(backupPath(ROOT)), BACKUP_FILE);
});
