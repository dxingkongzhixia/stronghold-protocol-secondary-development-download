// The CDN-mirror prefix of the art manifests (public/js/assetMirror.js). The module's planning is pure, so it is
// tested here in Node: which paths may go to a mirror, how the `~hash` serving segment is stripped, and that the deep
// rewrite leaves the audio / Spine / scene URLs on this server.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isMirrorable, mirrorUrl, rewriteAssetPaths, mirrorPrefix, setMirrorPrefix, DEV_HOSTS, MIRRORS_URL,
  unmirrorUrl, installImageFallback, mirrorRouteUrl, mirrorIsFull,
} from '../public/js/assetMirror.js';

const BASE = 'https://cdn.example/gh/o/r@master/public';

describe('asset mirror prefix (js/assetMirror.js)', () => {
  test('the config is the static mirror list', () => {
    assert.equal(MIRRORS_URL, '/asset-mirrors.json');
  });

  test('images and plain-file assets under /assets/ are mirrorable (the audio and the routes are not)', () => {
    assert.ok(isMirrorable('/assets/char/avatar/x.png'));
    assert.ok(isMirrorable('/assets/~0123456789abcdef/ui/a.webp'));
    // a Spine skeleton/atlas is a plain file every mirror holds, so it rides along with the images (Part B); the
    // audio keeps its extension-less route, and a query / anything outside /assets/ stays put
    assert.ok(!isMirrorable('/media/~0123456789abcdef/bgm/act1'));
    assert.ok(isMirrorable('/assets/spine/op/x.skel'));
    assert.ok(isMirrorable('/assets/spine/op/x.atlas'));
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
    assert.equal(out.spine.s.skel, `${BASE}/assets/spine/op/s.skel`, 'a Spine skeleton rides along with the images');
    assert.equal(out.spine.s.atlas, `${BASE}/assets/spine/op/s.atlas`);
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

  test('the image fallback retries a failed mirrored <img> from this server, once', () => {
    setMirrorPrefix(BASE);
    const listeners = new Map();
    const doc = {
      addEventListener: (type, fn) => listeners.set(type, fn),
    };
    assert.equal(installImageFallback({ doc }), true);
    assert.equal(installImageFallback({ doc }), false, 'installed once per document');
    const el = {
      tagName: 'IMG', dataset: {},
      src: mirrorUrl(BASE, '/assets/~0123456789abcdef/char/avatar/x.png'),
      get currentSrc() { return this.src; },
    };
    listeners.get('error')({ target: el });
    assert.equal(el.src, '/assets/~0123456789abcdef/char/avatar/x.png', 'retried from this server');
    const again = { tagName: 'IMG', dataset: {}, src: `${BASE}/assets/a.png`, get currentSrc() { return this.src; } };
    again.dataset.spMirrorRetry = '1';
    listeners.get('error')({ target: again });
    assert.match(again.src, /^https:/, 'a second failure never loops');
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

  test('plain-file assets a mirror holds are mirrorable; the audio stays on its extension-less route', () => {
    assert.ok(isMirrorable('/assets/spine/op/x/front/x.skel'), 'a Spine skeleton is a plain file');
    assert.ok(isMirrorable('/assets/spine/op/x/front/x.atlas'));
    assert.ok(!isMirrorable('/assets/audio/bgm/x.mp3'), 'the audio keeps /media (a download manager must not sniff it)');
    assert.ok(!isMirrorable('/assets/local/scene/x/scene.bin'), 'the scene bundle keeps /scene');
  });

  test('the prefix defaults to this server, and a dev origin is on the never-mirror list', () => {
    assert.equal(mirrorPrefix(), '');
    setMirrorPrefix(BASE);
    assert.equal(mirrorPrefix(), BASE);
    setMirrorPrefix('');
    assert.ok(DEV_HOSTS.includes('localhost') && DEV_HOSTS.includes('127.0.0.1'));
  });
});
