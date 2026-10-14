// The CDN-mirror prefix of the art manifests (public/js/assetMirror.js). The module's planning is pure, so it is
// tested here in Node: which paths may go to a mirror, how the `~hash` serving segment is stripped, and that the deep
// rewrite leaves the audio / Spine / scene URLs on this server.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isMirrorable, mirrorUrl, rewriteAssetPaths, mirrorPrefix, setMirrorPrefix, DEV_HOSTS, MIRRORS_URL,
  unmirrorUrl, installImageFallback, mirrorRouteUrl, mirrorIsFull, mirrorCandidates, nextMirrorCandidate,
  rateOf, pickMirror, initAssetMirror, RELAY_MIN_BPS, MIRROR_MIN_BPS, SPEED_SAMPLE_PATH, SPEED_SAMPLES,
} from '../public/js/assetMirror.js';

const BASE = 'https://cdn.example/gh/o/r@master/public';

describe('asset mirror prefix (js/assetMirror.js)', () => {
  test('the config is the static mirror list', () => {
    assert.equal(MIRRORS_URL, '/asset-mirrors.json');
  });

  test('only images under /assets/ are mirrorable (the audio and the routes are not)', () => {
    assert.ok(isMirrorable('/assets/char/avatar/x.png'));
    assert.ok(isMirrorable('/assets/~0123456789abcdef/ui/a.webp'));
    // the audio's extension-less route, a Spine skeleton/atlas (a mirrored URL's ?h= breaks `validSpine`), a
    // query string and anything outside /assets/ all stay put
    assert.ok(!isMirrorable('/media/~0123456789abcdef/bgm/act1'));
    assert.ok(!isMirrorable('/assets/spine/op/x.skel'));
    assert.ok(!isMirrorable('/assets/spine/op/x.atlas'));
    assert.ok(!isMirrorable('/assets/loading/boot.mp4?v=2'));
    assert.ok(!isMirrorable('/fonts/a.woff2'));
    assert.ok(!isMirrorable('/data/assets.json'));
    assert.ok(!isMirrorable(null));
  });

  test('the ~hash serving segment becomes a ?h= query (the CDN caches an image for a week)', () => {
    assert.equal(mirrorUrl(BASE, '/assets/~0123456789abcdef/char/avatar/x.png'), mirrorUrl(BASE, '/assets/~0123456789abcdef/char/avatar/x.png'));
    assert.equal(mirrorUrl(BASE, '/assets/char/avatar/x.png'), `${BASE}/assets/char/avatar/x.png`);
  });

  test('the deep rewrite walks arrays and objects and leaves the non-images alone', () => {
    const doc = {
      avatars: { a: '/assets/~0123456789abcdef/char/avatar/a.png', b: '/assets/char/avatar/b.webp' },
      audio: ['/assets/audio/bgm/act1.mp3'],
      spine: { s: { skel: '/assets/spine/op/s.skel', atlas: '/assets/spine/op/s.atlas' } },
      label: '叙拉古',
      n: 3,
      deep: [{ img: '/assets/~aaaaaaaaaaaaaaaa/ui/x.png' }],
    };
    const out = rewriteAssetPaths(doc, BASE);
    assert.equal(out.avatars.a, `${BASE}/assets/char/avatar/a.png?h=0123456789abcdef`);
    assert.equal(out.avatars.b, `${BASE}/assets/char/avatar/b.webp`);
    assert.deepEqual(out.audio, ['/assets/audio/bgm/act1.mp3']);
    assert.equal(out.spine.s.skel, '/assets/spine/op/s.skel', 'a Spine skeleton stays root-relative for validSpine');
    assert.equal(out.spine.s.atlas, '/assets/spine/op/s.atlas');
    assert.equal(out.deep[0].img, `${BASE}/assets/ui/x.png?h=aaaaaaaaaaaaaaaa`);
    assert.equal(out.label, '叙拉古');
    assert.equal(out.n, 3);
    // the input is untouched (a copy is returned)
    assert.equal(doc.avatars.a, '/assets/~0123456789abcdef/char/avatar/a.png');
  });

  test('unmirrorUrl is the inverse of mirrorUrl (the ?h= hash comes back as the ~hash segment)', () => {
    setMirrorPrefix(BASE);
    assert.equal(unmirrorUrl(mirrorUrl(BASE, '/assets/~0123456789abcdef/char/avatar/x.png')), '/assets/~0123456789abcdef/char/avatar/x.png');
    assert.equal(unmirrorUrl(mirrorUrl(BASE, '/assets/char/avatar/x.png')), '/assets/char/avatar/x.png', 'a path without a hash round-trips too');
    assert.equal(unmirrorUrl('https://elsewhere/assets/a.png'), null, 'not our prefix');
    assert.equal(unmirrorUrl(''), null);
    assert.equal(unmirrorUrl(null), null);
    setMirrorPrefix('');
    assert.equal(unmirrorUrl(`${BASE}/assets/a.png`), null, 'no prefix installed, nothing to undo');
  });

  test('the chain is the relay, then GitHub and its mirrors, then this server', () => {
    const RELAY = 'http://relay.example';
    const GH = 'https://gh-proxy.com/https://raw.githubusercontent.com/o/r/master/public';
    const JSD = 'https://cdn.jsdelivr.net/gh/o/r@master/public';
    setMirrorPrefix(RELAY, true, [RELAY, GH, JSD]);
    const path = '/assets/~0123456789abcdef/char/avatar/x.png';
    const chain = mirrorCandidates(path);
    assert.deepEqual(chain, [
      mirrorUrl(RELAY, path), mirrorUrl(GH, path), mirrorUrl(JSD, path), path,
    ], 'the relay first, then GitHub and its mirror, this server last');
    assert.equal(nextMirrorCandidate(chain[0]), chain[1]);
    assert.equal(nextMirrorCandidate(chain[2]), chain[3]);
    assert.equal(nextMirrorCandidate(chain[3]), null, 'this server is the last tier');
    // however it is asked — a mirror URL or the plain path — the same chain comes back
    assert.deepEqual(mirrorCandidates(chain[1]), chain);
    assert.deepEqual(mirrorCandidates(path), chain);
    // a route only the relay can answer: its file tiers are added by the caller, so the chain is relay -> this server
    assert.deepEqual(mirrorCandidates('/media/~0123456789abcdef/bgm/act1'),
      [`${RELAY}/media/~0123456789abcdef/bgm/act1`, '/media/~0123456789abcdef/bgm/act1']);
    setMirrorPrefix('');
    assert.deepEqual(mirrorCandidates(path), [path], 'no prefix: this server only');
  });

  test('the image fallback walks the chain and stops at this server', () => {
    setMirrorPrefix(BASE);
    const listeners = new Map();
    const doc = {
      addEventListener: (type, fn) => listeners.set(type, fn),
    };
    assert.equal(installImageFallback({ doc }), true);
    assert.equal(installImageFallback({ doc }), false, 'installed once per document');
    const GH = 'https://gh-proxy.com/x/public';
    setMirrorPrefix(BASE, false, [BASE, GH]);
    const el = {
      tagName: 'IMG', dataset: {},
      src: mirrorUrl(BASE, '/assets/~0123456789abcdef/char/avatar/x.png'),
      get currentSrc() { return this.src; },
    };
    listeners.get('error')({ target: el });
    assert.equal(el.src, mirrorUrl(GH, '/assets/~0123456789abcdef/char/avatar/x.png'), 'tier 2: GitHub');
    listeners.get('error')({ target: el });
    assert.equal(el.src, '/assets/~0123456789abcdef/char/avatar/x.png', 'tier 3: this server');
    listeners.get('error')({ target: el });
    assert.equal(el.src, '/assets/~0123456789abcdef/char/avatar/x.png', 'and it stays there (no loop)');
    const other = { tagName: 'IMG', dataset: {}, src: 'https://elsewhere/a.png', get currentSrc() { return this.src; } };
    listeners.get('error')({ target: other });
    assert.equal(other.src, 'https://elsewhere/a.png', 'a foreign URL is left alone');
    setMirrorPrefix('');
  });

  test('a full origin also carries the extension-less routes; a plain-file mirror never does', () => {
    setMirrorPrefix(BASE, false);
    assert.equal(mirrorIsFull(), false);
    assert.equal(mirrorRouteUrl('/media/~0123456789abcdef/bgm/act1'), '/media/~0123456789abcdef/bgm/act1', 'not a full origin');
    setMirrorPrefix(BASE, true);
    assert.equal(mirrorIsFull(), true);
    assert.equal(mirrorRouteUrl('/media/~0123456789abcdef/bgm/act1'), `${BASE}/media/~0123456789abcdef/bgm/act1`);
    assert.equal(mirrorRouteUrl('/scene/act1autochess_m01/bin'), `${BASE}/scene/act1autochess_m01/bin`);
    assert.equal(mirrorRouteUrl('/clip/boot?v=2'), `${BASE}/clip/boot?v=2`, 'the clip keeps its ?v=');
    assert.equal(mirrorRouteUrl('/assets/char/avatar/a.png'), '/assets/char/avatar/a.png', 'a plain file is not a route');
    assert.equal(unmirrorUrl(mirrorRouteUrl('/scene/x/bin')), '/scene/x/bin', 'and it un-mirrors back');
    assert.equal(unmirrorUrl(`${BASE}/clip/boot?v=2`), '/clip/boot?v=2');
    setMirrorPrefix('');
    assert.equal(mirrorIsFull(), false, 'no prefix, no full origin');
    assert.equal(mirrorRouteUrl('/media/x'), '/media/x');
  });

  test('images only: the Spine skeleton/atlas and the audio stay on this server', () => {
    // a mirrored `.skel` carries a ?h= query and `validSpine` (assets.js) then rejects the entry, so every unit
    // fell back to its placeholder diamond — the image-only rule is deliberate.
    assert.ok(!isMirrorable('/assets/spine/op/x/front/x.skel'));
    assert.ok(!isMirrorable('/assets/spine/op/x/front/x.atlas'));
    assert.ok(!isMirrorable('/assets/audio/bgm/x.mp3'), 'the audio keeps /media (a download manager must not sniff it)');
    assert.ok(!isMirrorable('/assets/local/scene/x/scene.bin'), 'the scene bundle keeps /scene');
    assert.ok(isMirrorable('/assets/spine/op/x/front/x.png'), 'its PAGES are images, so those are mirrored');
  });

  test('the prefix defaults to this server, and a dev origin is on the never-mirror list', () => {
    assert.equal(mirrorPrefix(), '');
    setMirrorPrefix(BASE);
    assert.equal(mirrorPrefix(), BASE);
    setMirrorPrefix('');
    assert.ok(DEV_HOSTS.includes('localhost') && DEV_HOSTS.includes('127.0.0.1'));
  });
});

describe('asset mirror: the origin is picked by MEASURED throughput', () => {
  const RELAY = 'http://relay.test';
  const GH = 'https://gh.test';

  test('rateOf: bytes per second; 0 when nothing arrived', () => {
    assert.equal(rateOf(1000, 1000), 1000);
    assert.equal(rateOf(2 * 1024 * 1024, 1000), 2 * 1024 * 1024);
    assert.equal(rateOf(0, 500), 0);
    assert.equal(rateOf(500, 0), 0);
  });

  test('pickMirror: the FIRST candidate that clears its own bar wins (relay 1.2 MB/s, mirror 1.0 MB/s)', () => {
    const relay = { base: RELAY, full: true };
    const gh = { base: GH, full: false };
    assert.equal(RELAY_MIN_BPS, 1.2 * 1024 * 1024, 'the relay bar is 1.2 MB/s');
    assert.equal(MIRROR_MIN_BPS, 1.0 * 1024 * 1024, 'a mirror bar is 1.0 MB/s');
    // a relay that clears 1.2 MB/s keeps its first place even when a mirror is faster
    assert.equal(pickMirror([{ ...relay, bps: 1.5 * 1024 * 1024 }, { ...gh, bps: 9 * 1024 * 1024 }]), RELAY);
    // a SLOW relay (below 1.2 MB/s — what the owner's box measures) hands over to the GitHub mirror
    assert.equal(pickMirror([{ ...relay, bps: 0.4 * 1024 * 1024 }, { ...gh, bps: 2 * 1024 * 1024 }]), GH);
    // a mirror below 1 MB/s is not used either → the chain keeps this server
    assert.equal(pickMirror([{ ...relay, bps: 100 * 1024 }, { ...gh, bps: 0.9 * 1024 * 1024 }]), '');
    // nothing measurable → this server
    assert.equal(pickMirror([{ ...relay, bps: 0 }, { ...gh, bps: 0 }]), '');
    assert.equal(pickMirror([]), '');
    assert.equal(pickMirror(null), '');
  });

  test('initAssetMirror: times every origin on the sample and installs the first one over its bar', async () => {
    const cfg = { sources: [RELAY, GH], fullSources: [RELAY] };
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      if (url.endsWith(MIRRORS_URL)) return { ok: true, json: async () => cfg };
      const slow = url.startsWith(RELAY);                    // the relay crawls, gh-proxy is fast
      await new Promise((r) => setTimeout(r, slow ? 40 : 0));
      return { ok: true, body: null, arrayBuffer: async () => new ArrayBuffer(slow ? 4 * 1024 : 400 * 1024) };
    };
    const chosen = await initAssetMirror({ fetchFn, hostname: 'game.test' });
    assert.equal(chosen, GH, 'the slow relay is skipped for the fast mirror');
    assert.equal(mirrorPrefix(), GH);
    assert.ok(calls.some((u) => u.startsWith(RELAY + SPEED_SAMPLE_PATH)), 'the relay was measured on the sample');
    assert.ok(calls.some((u) => u.startsWith(GH + SPEED_SAMPLE_PATH)), 'and so was the mirror');
    setMirrorPrefix('');
  });

  test('initAssetMirror: every origin below its bar leaves the chain on this server', async () => {
    const cfg = { sources: [RELAY, GH], fullSources: [RELAY] };
    const fetchFn = async (url) => {
      if (url.endsWith(MIRRORS_URL)) return { ok: true, json: async () => cfg };
      await new Promise((r) => setTimeout(r, 40));
      return { ok: true, body: null, arrayBuffer: async () => new ArrayBuffer(4 * 1024) };
    };
    const chosen = await initAssetMirror({ fetchFn, hostname: 'game.test' });
    assert.equal(chosen, '', 'no origin clears its bar');
    assert.equal(mirrorPrefix(), '');
  });

  test('initAssetMirror: a fresh reading is reused for the TTL; cacheMs 0 forces a re-measure', async () => {
    const saved = globalThis.localStorage;
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    try {
      const cfg = { sources: [RELAY, GH], fullSources: [RELAY] };
      let samples = 0;
      const fetchFn = async (url) => {
        if (url.endsWith(MIRRORS_URL)) return { ok: true, json: async () => cfg };
        samples++;
        return { ok: true, body: null, arrayBuffer: async () => new ArrayBuffer(400 * 1024) };
      };
      await initAssetMirror({ fetchFn, hostname: 'game.test' });
      const first = samples;
      assert.ok(first >= SPEED_SAMPLES.length, 'the first load measures every sample of the first origin');
      await initAssetMirror({ fetchFn, hostname: 'game.test' });
      assert.equal(samples, first, 'a fresh reading is reused (SPEED_CACHE_MS = 2 min), so a warm visit does not re-probe');
      await initAssetMirror({ fetchFn, hostname: 'game.test', cacheMs: 0 });
      assert.ok(samples > first, 'cacheMs 0 forces a re-measure on every call');
      setMirrorPrefix('');
    } finally {
      if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
    }
  });
});
