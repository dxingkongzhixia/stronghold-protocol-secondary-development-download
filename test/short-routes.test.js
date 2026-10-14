// The extension-less battlefield-scene route: shared/scene.js (the mapping both sides share) and the live route
// server/http/scene.js serves. The point of the route is the download-manager trick the audio already uses: a URL with
// no extension is not something IDM / 迅雷 / FDM hijack out of a fetch, and a stolen scene.bin leaves the 3D board on
// its procedural fallback.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCENE_PREFIX, SCENE_PARTS, SCENE_FILE_PARTS, sceneRouteUrl, scenePartFile } from '../shared/scene.js';
import { CLIP_PREFIX, CLIP_PARTS, clipUrl, clipFile } from '../shared/clip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = 'act2autochess_m04';
const BIN = path.join(ROOT, 'public', 'assets', 'local', 'scene', STAGE, SCENE_PARTS.bin);
const META = path.join(ROOT, 'public', 'assets', 'local', 'scene', STAGE, SCENE_PARTS.meta);

describe('the extension-less scene route (shared/scene.js + server/http/scene.js)', () => {
  test('the mapping is one place, extension-less, and round-trips', () => {
    assert.equal(SCENE_PREFIX, '/scene/');
    assert.equal(sceneRouteUrl(STAGE, 'bin'), `/scene/${STAGE}/bin`);
    assert.equal(sceneRouteUrl(STAGE, 'meta'), `/scene/${STAGE}/meta`);
    for (const url of [sceneRouteUrl(STAGE, 'bin'), sceneRouteUrl(STAGE, 'meta')]) {
      assert.ok(!/\.[a-z0-9]+$/i.test(url), `no extension in ${url} (that is the whole point)`);
    }
    assert.equal(scenePartFile('bin'), 'scene.bin');
    assert.equal(scenePartFile('meta'), 'scene.json');
    assert.equal(scenePartFile('nope'), null);
    assert.deepEqual(SCENE_FILE_PARTS, { 'scene.json': 'meta', 'scene.bin': 'bin' });
  });

  test('a live request serves the bundle and refuses everything else', async (t) => {
    if (!existsSync(BIN) || !existsSync(META)) { t.skip('scene bundles not extracted here'); return; }
    const { startServer } = await import('../server/index.js');
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    const base = `http://127.0.0.1:${srv.port}`;
    try {
      const bin = await fetch(`${base}${sceneRouteUrl(STAGE, 'bin')}`);
      assert.equal(bin.status, 200, 'the scene bundle is served');
      assert.equal(bin.headers.get('content-type'), 'application/octet-stream');
      assert.ok(Number(bin.headers.get('content-length')) > 1000, 'a real binary, not an error page');
      const meta = await fetch(`${base}${sceneRouteUrl(STAGE, 'meta')}`);
      assert.equal(meta.status, 200);
      assert.match(meta.headers.get('content-type') || '', /application\/json/);
      const doc = await meta.json();
      assert.ok(doc && doc.version, 'the scene.json parses');
      // anything else is refused: an unknown part, a missing stage. (A traversal cannot be tested through fetch —
      // the WHATWG URL parser normalises `..` and even `%2e%2e` away before the request leaves; the handlers check it.)
      for (const bad of [`/scene/${STAGE}/nope`, '/scene/nostage/bin']) {
        const r = await fetch(`${base}${bad}`);
        assert.ok(r.status === 404 || r.status === 403, `${bad} is refused (got ${r.status})`);
      }
    } finally { await srv.close(); }
  });

  test('the clip route is extension-less, versioned and round-trips', () => {
    assert.equal(CLIP_PREFIX, '/clip/');
    assert.equal(clipUrl('boot'), '/clip/boot');
    assert.equal(clipUrl('boot', 2), '/clip/boot?v=2');
    assert.ok(!/\.[a-z0-9]+(\?|$)/i.test(clipUrl('boot', 2)), 'no media extension in the path');
    assert.equal(clipFile('boot'), 'loading/boot.mp4');
    assert.equal(clipFile('../etc/passwd'), null);
    assert.deepEqual(Object.keys(CLIP_PARTS), ['boot']);
  });

  test('a live clip request streams the file and refuses anything else', async (t) => {
    const clip = path.join(ROOT, 'public', 'assets', ...CLIP_PARTS.boot.split('/'));
    if (!existsSync(clip)) { t.skip('no boot clip here'); return; }
    const { startServer } = await import('../server/index.js');
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    const base = `http://127.0.0.1:${srv.port}`;
    try {
      const r = await fetch(`${base}${clipUrl('boot', 2)}`);
      assert.equal(r.status, 200, 'the clip is served');
      assert.match(r.headers.get('content-type') || '', /video\/mp4/);
      assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable', 'the ?v= makes it immutable');
      assert.ok(Number(r.headers.get('content-length')) > 100000, 'a real clip, not an error page');
      for (const bad of ['/clip/nope', '/clip/boot/extra']) {
        const bad1 = await fetch(`${base}${bad}`);
        assert.ok(bad1.status === 404 || bad1.status === 403, `${bad} is refused (got ${bad1.status})`);
      }
    } finally { await srv.close(); }
  });
});
