// test/asset-index.test.js — server/assetindex.js: the version + per-file index the client's local cache
// (public/sw.js + public/js/assetCache.js) diffs against. Pure collection and versioning, plus a temp-dir disk pass
// and the mtime-keyed cache. docs/OUR-FEATURES.md "local asset cache".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectAssetUrls, indexVersion, buildAssetIndexValue, createAssetIndex, assetSources, relaySource } from '../server/assetindex.js';

test('collectAssetUrls: only /assets and /fonts string leaves, query/hash stripped, de-duplicated', () => {
  const manifest = {
    chars: { a: { avatar: '/assets/char/avatar/a.png', portrait: '/assets/char/portrait/a.png?v=3' } },
    ui: ['/assets/ui/x.webp', '/fonts/Noto.woff2', '/shared/not-an-asset.js', 'assets/relative.png', 'https://x/y.png'],
    nested: { audio: { bgm: '/assets/audio/bgm/m1.mp3#frag' } },
  };
  const urls = new Set(collectAssetUrls(manifest));
  assert.deepEqual([...urls].sort(), [
    '/assets/audio/bgm/m1.mp3',
    '/assets/char/avatar/a.png',
    '/assets/char/portrait/a.png',
    '/assets/ui/x.webp',
    '/fonts/Noto.woff2',
  ].sort());
});

test('indexVersion: order-independent, sensitive to size and membership', () => {
  const a = { '/assets/x.png': 10, '/assets/y.png': 20 };
  const b = { '/assets/y.png': 20, '/assets/x.png': 10 };
  assert.equal(indexVersion(a), indexVersion(b), 'key order does not matter');
  assert.notEqual(indexVersion(a), indexVersion({ '/assets/x.png': 11, '/assets/y.png': 20 }), 'a size change moves it');
  assert.notEqual(indexVersion(a), indexVersion({ '/assets/x.png': 10 }), 'a dropped file moves it');
  assert.equal(indexVersion(a), indexVersion({ ...a }), 'a copy matches');
});

test('buildAssetIndexValue: lists the files that exist under public/, skips the ones this machine lacks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-'));
  const dataDir = path.join(root, 'data');
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'assets', 'char'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'assets', 'char', 'a.png'), Buffer.alloc(1234));
  fs.writeFileSync(path.join(publicDir, 'fonts', 'Noto.woff2'), Buffer.alloc(40));
  fs.writeFileSync(path.join(dataDir, 'assets.json'), JSON.stringify({
    chars: { a: { avatar: '/assets/char/a.png', portrait: '/assets/char/missing.png' } },
    fonts: { ui: '/fonts/Noto.woff2' },
  }));
  const idx = buildAssetIndexValue({ dataDir, publicDir, log: { info() {} } });
  assert.equal(idx.count, 2, 'only the two present files are listed');
  assert.equal(idx.bytes, 1274);
  assert.deepEqual(Object.keys(idx.files).sort(), ['/assets/char/a.png', '/fonts/Noto.woff2'].sort());
  assert.equal(idx.files['/assets/char/a.png'], 1234);
  assert.equal(typeof idx.app, 'string');
  fs.rmSync(root, { recursive: true, force: true });
});

test('createAssetIndex: rebuilds only when a source manifest changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-'));
  const dataDir = path.join(root, 'data');
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(path.join(publicDir, 'assets'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'assets', 'a.png'), Buffer.alloc(5));
  fs.writeFileSync(path.join(dataDir, 'assets.json'), JSON.stringify({ x: '/assets/a.png' }));
  const idx = createAssetIndex({ dataDir, publicDir, log: { info() {} } });
  const first = idx.get();
  fs.writeFileSync(path.join(publicDir, 'assets', 'b.png'), Buffer.alloc(7));
  assert.equal(idx.get(), first, 'no manifest change ⇒ the same cached object');
  fs.writeFileSync(path.join(dataDir, 'assets.json'), JSON.stringify({ x: '/assets/a.png', y: '/assets/b.png' }));
  const next = idx.get();
  assert.notEqual(next, first, 'a manifest change rebuilds');
  assert.equal(next.count, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('assetSources: the config file IS the list — nothing hardcoded; SP_ASSET_REF=\'\' turns it off', () => {
  const savedRelay = process.env.SP_ASSET_RELAY;
  const savedRef = process.env.SP_ASSET_REF;
  delete process.env.SP_ASSET_RELAY;
  delete process.env.SP_ASSET_REF;
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'src-'));
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    const write = (o) => fs.writeFileSync(path.join(publicDir, 'asset-mirrors.json'), JSON.stringify(o));

    // No config → NO origins (and no hardcoded address anywhere): the client stays on the game server.
    assert.deepEqual(assetSources(publicDir), []);
    assert.equal(relaySource(publicDir), '');

    // The file's order is the chain's order; fullSources names the origin that also serves /media,/scene,/clip.
    const list = ['http://10.0.0.9', 'https://gh-proxy.com/x/y', 'https://cdn.jsdelivr.net/gh/o/r@master/public'];
    write({ sources: list, fullSources: ['http://10.0.0.9'] });
    assert.deepEqual(assetSources(publicDir), list, 'the configured order is used as-is');
    assert.equal(relaySource(publicDir), 'http://10.0.0.9', 'the full source is the relay');

    // A config that names no full origin → no relay at all (every route stays on this server).
    write({ sources: ['https://cdn.jsdelivr.net/gh/o/r@master/public'] });
    assert.equal(relaySource(publicDir), '', 'a CDN-only config has no full origin');

    // env overrides: the full origin, and the master switch that turns the whole tier off.
    write({ sources: list, fullSources: ['http://10.0.0.9'] });
    process.env.SP_ASSET_RELAY = 'http://127.0.0.1:9999';
    assert.equal(relaySource(publicDir), 'http://127.0.0.1:9999');
    assert.equal(assetSources(publicDir)[0], 'http://127.0.0.1:9999', 'the override is tried first');
    process.env.SP_ASSET_REF = '';
    assert.deepEqual(assetSources(publicDir), [], 'SP_ASSET_REF="" is the docs\' switch: no origins');
    delete process.env.SP_ASSET_REF;
    delete process.env.SP_ASSET_RELAY;

    fs.rmSync(root, { recursive: true, force: true });
  } finally {
    if (savedRelay === undefined) delete process.env.SP_ASSET_RELAY; else process.env.SP_ASSET_RELAY = savedRelay;
    if (savedRef === undefined) delete process.env.SP_ASSET_REF; else process.env.SP_ASSET_REF = savedRef;
  }
});
