// test/sw-fetch.test.js — public/sw.js: the local cache first, then the source chain
// (the owner's relay → the CDN mirrors → the game server as the last resort), with a hashed `~<hash>` request
// normalized to the real path + `?h=` so every tier can serve it.
//
// The worker is a classic script (no imports), so it is booted here in a fake worker scope with node:vm — the same
// trick test/sim/simcheck.test.js and test/ui/fieldHost-lifecycle.test.js use for browser-shaped code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SW = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');
const ORIGIN = 'http://game.test';
const RELAY = 'http://relay.test';
const GH = 'https://gh-proxy.com/https://raw.githubusercontent.com/o/r/master/public';
const JSD = 'https://cdn.jsdelivr.net/gh/o/r@master/public';

/**
 * Boot public/sw.js in a fake worker scope.
 * @param {{ index?: object|null, cached?: string|null, respond?: (url: string) => { ok?: boolean, size?: number } }} o
 */
function boot({ index = null, cached = null, respond = () => ({ ok: true }) } = {}) {
  const calls = [];
  const puts = [];
  const store = new Map();
  if (cached) store.set(cached, { fromCache: true });
  const listeners = {};
  const cache = {
    match: async (req) => store.get(req.url),
    put: async (req, res) => { puts.push(req.url); store.set(req.url, res); },
  };
  const json = (value) => ({ ok: true, status: 200, headers: {}, json: async () => value, arrayBuffer: async () => new ArrayBuffer(0) });
  const ctx = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: { open: async () => cache, delete: async () => true },
    Response: class { constructor(buf, init = {}) { this.buf = buf; this.status = init.status ?? 200; this.ok = true; this.headers = new Headers(init.headers); } clone() { return this; } },
    Headers,
    AbortController: globalThis.AbortController,
    URL,
    console,
    setTimeout,
    clearTimeout,
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);
      if (url.endsWith('/asset-index.json')) return json(index);
      if (!/^https?:/.test(url.slice(0, 5)) && url.startsWith(ORIGIN)) return json(null); // the game server (last resort)
      const r = respond(url);
      if (r.ok === false) throw new Error('mirror down');
      return { ok: true, status: 200, headers: r.headers ?? {}, arrayBuffer: async () => new ArrayBuffer(r.size ?? 0) };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SW, 'utf8'), ctx);
  const handler = listeners.fetch;
  const get = (url) => {
    let out;
    handler({ request: { method: 'GET', url, headers: { has: () => false } }, respondWith: (p) => { out = p; } });
    return Promise.resolve(out);
  };
  return { get, calls, puts, index: json };
}

test('sw.js: a cache hit answers with no network call at all', async () => {
  const asset = `${ORIGIN}/assets/~abc1234567/char/avatar/a.png`;
  const sw = boot({ cached: asset });
  const res = await sw.get(asset);
  assert.equal(res.fromCache, true, 'the cached response');
  assert.deepEqual(sw.calls, [], 'nothing was fetched');
});

test('sw.js: on a miss the RELAY is tried first, with the real path + ?h= (the mirrors cannot serve ~hash)', async () => {
  const asset = `${ORIGIN}/assets/~abc1234567/char/avatar/a.png`;
  const sw = boot({
    index: { revision: 'r1', files: { '/assets/char/avatar/a.png': 4 }, sources: [RELAY, GH, JSD] },
    respond: (url) => ({ ok: url.startsWith(RELAY), size: 4 }),
  });
  const res = await sw.get(asset);
  assert.equal(res.ok, true);
  assert.deepEqual(sw.calls, [
    '/asset-index.json',
    `${RELAY}/assets/char/avatar/a.png?h=abc1234567`,
  ], 'the relay first, asked for the real path');
  assert.deepEqual(sw.puts, [asset], 'cached under the page\'s own (hashed) URL');
});

test('sw.js: a failing relay walks gh-proxy → jsDelivr → the game server (the last resort), same normalized path', async () => {
  const asset = `${ORIGIN}/assets/~abc1234567/char/avatar/a.png`;
  const plain = `${RELAY}/assets/char/avatar/a.png?h=abc1234567`;
  const sw = boot({
    index: { revision: 'r1', files: { '/assets/char/avatar/a.png': 4 }, sources: [RELAY, GH, JSD] },
    respond: (url) => (url === `${JSD}/assets/char/avatar/a.png?h=abc1234567` ? { ok: true, size: 4 } : { ok: false }),
  });
  await sw.get(asset);
  assert.deepEqual(sw.calls.slice(1), [
    plain,
    `${GH}/assets/char/avatar/a.png?h=abc1234567`,
    `${JSD}/assets/char/avatar/a.png?h=abc1234567`,
  ], 'relay → gh-proxy → jsDelivr; the game server is only reached when all of them fail');
});

test('sw.js: a mirror whose byte size disagrees with the index is skipped (the check now runs for hashed URLs)', async () => {
  const asset = `${ORIGIN}/assets/~abc1234567/char/avatar/a.png`;
  const sw = boot({
    index: { revision: 'r1', files: { '/assets/char/avatar/a.png': 4 }, sources: [RELAY, GH] },
    respond: (url) => (url.startsWith(RELAY) ? { ok: true, size: 99 } : { ok: true, size: 4 }),
  });
  await sw.get(asset);
  assert.deepEqual(sw.calls.slice(1), [
    `${RELAY}/assets/char/avatar/a.png?h=abc1234567`,
    `${GH}/assets/char/avatar/a.png?h=abc1234567`,
  ], 'the wrong-sized relay copy is skipped for the next source');
});

test('sw.js: an unhashed request is passed through unchanged', async () => {
  const asset = `${ORIGIN}/assets/char/avatar/a.png`;
  const sw = boot({
    index: { revision: 'r1', files: { '/assets/char/avatar/a.png': 4 }, sources: [RELAY] },
    respond: () => ({ ok: true, size: 4 }),
  });
  await sw.get(asset);
  assert.deepEqual(sw.calls, ['/asset-index.json', `${RELAY}/assets/char/avatar/a.png`]);
});

test('sw.js: a mirror-served stylesheet is relabelled from its extension (raw.githubusercontent says text/plain)', async () => {
  const asset = `${ORIGIN}/assets/~abc1234567/ui/statistics/fonts.css`;
  const sw = boot({
    index: { revision: 'r1', files: { '/assets/ui/statistics/fonts.css': 241 }, sources: [GH] },
    respond: () => ({ ok: true, size: 241, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
  });
  const res = await sw.get(asset);
  assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8', 'a stylesheet must not be served as text/plain');
  const png = `${ORIGIN}/assets/~abc1234567/ui/statistics/heading-bar.png`;
  const sw2 = boot({
    index: { revision: 'r1', files: { '/assets/ui/statistics/heading-bar.png': 34774 }, sources: [GH] },
    respond: () => ({ ok: true, size: 34774, headers: { 'content-type': 'image/png' } }),
  });
  const res2 = await sw2.get(png);
  assert.equal(res2.headers.get('content-type'), 'image/png', 'a type the extension map does not know is left as the source sent it');
});

