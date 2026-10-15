// test/speed.test.js — the console's 测速 (server/speed.js, docs/MATCHMAKING.md §12.2): the rate maths, the origin
// list read from public/asset-mirrors.json, the capped / budgeted read, the per-origin judgement, the cooldown, and
// — the point of the module — that its rule stays identical to the CLIENT's (public/js/assetMirror.js), because the
// console is only useful if it predicts what a player actually gets.
//
// No network: every probe injects a fake fetch and a fake clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SPEED_SAMPLES, RELAY_MIN_BPS, MIRROR_MIN_BPS, SPEED_BUDGET_MS, SPEED_BYTE_CAP, SPEED_COOLDOWN_MS,
  rateOf, pickMirror, labelOf, readOrigins, readCapped, measureOrigin, probeOrigins, createSpeedProbe,
} from '../server/speed.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIENT = readFileSync(new URL('../public/js/assetMirror.js', import.meta.url), 'utf8');

/** A fetch that answers `ok` with `bytes` in `chunk`-sized pieces; `fail` makes it reject. */
function fakeFetch({ bytes = 110 * 1024, chunk = 64 * 1024, fail = false } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (fail) throw new Error('refused');
    let sent = 0;
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (sent >= bytes) return { done: true, value: undefined };
            const n = Math.min(chunk, bytes - sent);
            sent += n;
            return { done: false, value: new Uint8Array(n) };
          },
          cancel: async () => {},
        }),
      },
    };
  };
  fn.calls = calls;
  return fn;
}

/** A clock that advances a fixed step per call, so a rate is deterministic without waiting. */
function fakeClock(step = 250) {
  let t = 0;
  return () => (t += step);
}

test('rateOf is bytes per second, and 0 when nothing (or no time) arrived', () => {
  assert.equal(rateOf(1000, 10), 100000);
  assert.equal(rateOf(0, 10), 0);
  assert.equal(rateOf(1000, 0), 0);
});

test('the samples and the bars are the CLIENT\'s own (public/js/assetMirror.js)', () => {
  // the six committed portraits, exactly as the client lists them
  for (const p of SPEED_SAMPLES) assert.ok(CLIENT.includes(`'${p}'`), `the client still samples ${p}`);
  const clientSamples = CLIENT.match(/SPEED_SAMPLES = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(clientSamples, 'the client still exports SPEED_SAMPLES');
  const paths = clientSamples[1].match(/'(\/assets\/[^']+)'/g) || [];
  assert.equal(paths.length, SPEED_SAMPLES.length, 'same number of samples as the client');
  // the two thresholds and the budgets, parsed out of the client and compared numerically
  const num = (re) => {
    const m = CLIENT.match(re);
    assert.ok(m, `the client still declares ${re}`);
    return Number(m[1]);
  };
  assert.equal(RELAY_MIN_BPS / 1048576, num(/RELAY_MIN_BPS = ([\d.]+) \* 1024 \* 1024/), 'relay bar matches the client');
  assert.equal(MIRROR_MIN_BPS / 1048576, num(/MIRROR_MIN_BPS = ([\d.]+) \* 1024 \* 1024/), 'mirror bar matches the client');
  assert.equal(SPEED_BUDGET_MS, num(/SPEED_TIMEOUT_MS = (\d+)/), 'probe budget matches the client');
  assert.equal(SPEED_BYTE_CAP, num(/SPEED_BYTE_CAP = (\d+) \* 1024/) * 1024, 'byte cap matches the client');
});

test('pickMirror is the client rule: the first origin that clears its own bar, else the game server', () => {
  const relay = { base: 'http://relay', full: true, bps: RELAY_MIN_BPS };
  const mirror = { base: 'https://cdn', full: false, bps: MIRROR_MIN_BPS };
  assert.equal(pickMirror([relay, mirror]), 'http://relay');
  assert.equal(pickMirror([{ ...relay, bps: RELAY_MIN_BPS - 1 }, mirror]), 'https://cdn', 'a slow relay yields to the mirror');
  assert.equal(pickMirror([{ ...relay, bps: 1 }, { ...mirror, bps: 1 }]), '', 'nothing passes → the game server');
  assert.equal(pickMirror([]), '');
  assert.equal(pickMirror([{ base: '', bps: 1e9 }]), '', 'an empty base is skipped');
  // a full origin is judged by the relay bar, a plain mirror by the mirror bar
  assert.equal(pickMirror([{ base: 'x', full: true, bps: MIRROR_MIN_BPS }]), '', 'a full origin needs the higher bar');
});

test('labelOf names the configured origins the way the console shows them', () => {
  assert.equal(labelOf('http://123.57.150.185'), '中继');
  assert.equal(labelOf('https://gh-proxy.com/https://raw.githubusercontent.com/o/r/master/public'), 'GitHub 镜像 · gh-proxy');
  assert.equal(labelOf('https://cdn.jsdelivr.net/gh/o/r@master/public'), 'GitHub 镜像 · jsDelivr');
  assert.equal(labelOf(''), '本服务器');
});

test('readOrigins takes the client\'s own list, best first, with the full-origin flag', () => {
  const list = readOrigins(ROOT);
  assert.equal(list.length, 3, 'the file lists three origins');
  assert.equal(list[0].label, '中继');
  assert.equal(list[0].full, true, 'the relay is a full origin (it also serves /media, /scene, /clip)');
  assert.equal(list[0].base, 'http://123.57.150.185');
  for (const o of list.slice(1)) assert.equal(o.full, false, 'the CDN mirrors serve plain files only');
  // a missing / malformed file yields an empty list rather than throwing
  assert.deepEqual(readOrigins(ROOT + '/does-not-exist'), []);
});

test('readCapped stops at the byte cap, and never throws', async () => {
  const big = fakeFetch({ bytes: 10 * 1024 * 1024, chunk: 64 * 1024 });
  const got = await readCapped('http://x/a.png', big, SPEED_BUDGET_MS, SPEED_BYTE_CAP);
  assert.ok(got >= SPEED_BYTE_CAP && got <= SPEED_BYTE_CAP + 64 * 1024, `read about the cap, got ${got}`);
  assert.equal(await readCapped('http://x/a.png', fakeFetch({ fail: true })), 0, 'a refused connection is 0, not a throw');
  assert.equal(await readCapped('http://x/a.png', async () => ({ ok: false, status: 404 })), 0, 'a 404 is 0');
  assert.equal(await readCapped('http://x/a.png', fakeFetch({ bytes: 2048, chunk: 1024 })), 2048, 'counts what arrived');
});

test('measureOrigin sums the parallel samples over the clock (the client\'s method)', async () => {
  const fetchFn = fakeFetch({ bytes: 110 * 1024 });
  const r = await measureOrigin('http://relay', { fetchFn, now: fakeClock(200) });
  assert.equal(fetchFn.calls.length, SPEED_SAMPLES.length, 'one request per sample');
  assert.equal(r.bytes, SPEED_SAMPLES.length * 110 * 1024);
  assert.ok(r.ms > 0 && r.bps > 0, 'a timed rate');
});

test('probeOrigins judges each origin by its own bar and says which one a client would install', async () => {
  const origins = readOrigins(ROOT);
  const relayBase = origins[0].base;
  // the relay answers fast, both CDNs refuse: it must be chosen and cleanly marked
  const fastRelay = async (url) => {
    if (url.startsWith(relayBase)) return fakeFetch({ bytes: 400 * 1024, chunk: 64 * 1024 })(url);
    throw new Error('refused');
  };
  const r = await probeOrigins({ root: ROOT, fetchFn: fastRelay, now: fakeClock(50) });
  assert.equal(r.sources.length, 3);
  assert.equal(r.sources[0].ok, true, 'the relay answered');
  assert.equal(r.sources[0].pass, true, 'and cleared the relay bar');
  for (const s of r.sources.slice(1)) {
    assert.equal(s.ok, false, `${s.label} refused`);
    assert.equal(s.pass, false);
  }
  assert.equal(r.chosen, relayBase);
  assert.equal(r.chosenLabel, '中继');
  assert.equal(r.thresholds.relay, RELAY_MIN_BPS);

  // nothing answers at all → the chain falls back to the game server
  const dead = await probeOrigins({ root: ROOT, fetchFn: fakeFetch({ fail: true }), now: fakeClock(50) });
  assert.equal(dead.chosen, '');
  assert.equal(dead.chosenLabel, '本服务器');
  assert.ok(dead.sources.every((s) => !s.pass));
});

test('createSpeedProbe holds a cooldown so repeat clicks do not hammer the free mirrors', async () => {
  let clock = 0;
  const fetchFn = fakeFetch({ bytes: 200 * 1024 });
  const probe = createSpeedProbe({ root: ROOT, fetchFn, now: () => clock, cooldownMs: SPEED_COOLDOWN_MS });
  const first = await probe.run();
  assert.equal(first.cached, false);
  const perRun = fetchFn.calls.length;
  const second = await probe.run();
  assert.equal(second.cached, true, 'inside the cooldown the previous reading is replayed');
  assert.equal(fetchFn.calls.length, perRun, 'and nothing was fetched again');
  clock += SPEED_COOLDOWN_MS + 1;
  const third = await probe.run();
  assert.equal(third.cached, false, 'past the cooldown it measures again');
  assert.ok(fetchFn.calls.length > perRun);
  const before = fetchFn.calls.length;
  const forced = await probe.run({ force: true });
  assert.equal(forced.cached, false, 'force re-measures at once (the console button)');
  assert.ok(fetchFn.calls.length > before);
});
