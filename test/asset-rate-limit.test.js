// test/asset-rate-limit.test.js — the server's bulk-asset download pacing (server/http/files.js RateLimiter /
// assetRateBytesPerSec): a server fetch is the last resort after the CDN mirrors, throttled so a pre-cache never
// starves live matches. docs/OUR-FEATURES.md §10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, assetRateBytesPerSec } from '../server/http/files.js';

test('assetRateBytesPerSec: default 1.2 MB/s, overridable, 0 disables', () => {
  assert.equal(assetRateBytesPerSec({}), 1200 * 1024);
  assert.equal(assetRateBytesPerSec({ SP_ASSET_RATE_KBPS: '' }), 1200 * 1024);
  assert.equal(assetRateBytesPerSec({ SP_ASSET_RATE_KBPS: '512' }), 512 * 1024);
  assert.equal(assetRateBytesPerSec({ SP_ASSET_RATE_KBPS: '0' }), 0, '0 = unlimited');
  assert.equal(assetRateBytesPerSec({ SP_ASSET_RATE_KBPS: 'nonsense' }), 0, 'a bad value disables rather than hanging');
});

test('RateLimiter: rate 0 is free (resolves at once)', async () => {
  const lim = new RateLimiter(0);
  const t0 = Date.now();
  await lim.take(10_000_000);
  assert.ok(Date.now() - t0 < 50);
});

test('RateLimiter: within the burst resolves immediately', async () => {
  const lim = new RateLimiter(2000, 2000);
  const t0 = Date.now();
  await lim.take(2000);
  assert.ok(Date.now() - t0 < 50, 'the first burst is free');
});

test('RateLimiter: paces the next request to ~n / rate', async () => {
  const lim = new RateLimiter(2000, 2000); // 2 KB/s
  await lim.take(2000);                     // drain the burst
  const t0 = Date.now();
  await lim.take(4000);                     // capped to capacity 2000 → ~1 s at 2 KB/s
  const dt = Date.now() - t0;
  assert.ok(dt >= 800 && dt < 2500, `paced ${dt} ms (expected ~1000)`);
});
