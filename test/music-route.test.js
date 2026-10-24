// /music/… — the optional 主界面音乐 pack (var/music, tools/local-extract/music.py). A missing pack is normal; the
// route still answers an empty index and never serves a traversal / non-pack file name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = `music_test_route_${process.pid}_intro.mp3`;
// a minimal MP3-looking payload: the route does not sniff, it only serves var/music files by name
const BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

test('/music/index.json and /music/<file> serve the optional pack; bad names are 404', async (t) => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.port}`;
  const dir = path.join(ROOT, 'var', 'music');
  const file = path.join(dir, NAME);
  mkdirSync(dir, { recursive: true });
  t.after(() => { try { rmSync(file); } catch { /* absent */ } });

  const index = await fetch(`${base}/music/index.json`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') || '', /application\/json/);
  const doc = await index.json();
  assert.ok(doc && typeof doc.entries === 'object');

  writeFileSync(file, BYTES);
  const got = await fetch(`${base}/music/${NAME}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), BYTES);
  const head = await fetch(`${base}/music/${NAME}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(BYTES.length));

  for (const bad of ['/music/../package.json', '/music/nope.mp3', '/music/music_x_loop.wav']) {
    const r = await fetch(`${base}${bad}`);
    assert.equal(r.status, 404, bad);
  }
  const post = await fetch(`${base}/music/${NAME}`, { method: 'POST' });
  assert.equal(post.status, 405);
});
