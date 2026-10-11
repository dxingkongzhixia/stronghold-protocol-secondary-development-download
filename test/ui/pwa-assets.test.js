// test/ui/pwa-assets.test.js — the PWA install surface the title's 添加到桌面 button depends on: the manifest
// public/index.html links (public/manifest.json) and the mint-rook icon set it names (public/icons/), so a Chromium
// browser can fire beforeinstallprompt. Upstream shipped this in 0.2.3 (commits 90421254 "redraw the install icon …
// manifest sizes, maskable and favicons re-exported" and 9ec84f36 "keeps the 0.2.x mint rook"); this guards that a
// later merge — or a stale deploy — cannot quietly drop it again (the stats.css lesson: whatever index.html needs
// must actually be linked and served).
//
// The icons decode through the asset pipeline's own PNG reader (tools/crop-board-atlas.mjs), so a truncated or
// corrupt export fails here rather than in a launcher.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePng, pngSize } from '../../tools/crop-board-atlas.mjs';

const PUBLIC = new URL('../../public/', import.meta.url);
/** Read a file under public/ by a repo path or a served ('/…') path. */
const read = (rel) => readFileSync(new URL(String(rel).replace(/^\//, ''), PUBLIC));
const BG = [12, 15, 14]; // the manifest's background_color, #0c0f0e

describe('PWA install assets', () => {
  const html = read('index.html').toString('utf8');
  const manifest = JSON.parse(read('manifest.json').toString('utf8'));

  test('index.html links the manifest', () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.json"\s*\/?>/);
  });

  test('the manifest is installable: name/start_url/scope/display and 192 + 512 icons of both purposes', () => {
    assert.ok(manifest.name || manifest.short_name, 'name or short_name');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), `display is ${manifest.display}`);
    assert.deepEqual(manifest.icons.map((i) => `${i.purpose}:${i.sizes}`).sort(),
      ['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']);
  });

  test('every manifest icon exists, is an opaque PNG of the declared size with a visible mark', () => {
    for (const icon of manifest.icons) {
      assert.ok(icon.src.startsWith('/icons/'), icon.src);
      assert.equal(icon.type, 'image/png');
      const size = Number(icon.sizes.split('x')[0]);
      const { w, h, rgba } = decodePng(read(icon.src));
      assert.equal(w, size); assert.equal(h, size);
      let mark = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        assert.equal(rgba[i + 3], 255, `${icon.src} is opaque edge-to-edge`);
        if (rgba[i] !== BG[0] || rgba[i + 1] !== BG[1] || rgba[i + 2] !== BG[2]) mark++;
      }
      assert.ok(mark > size * size * 0.12, `${icon.src} has a real, non-trivial mark`);
      if (icon.purpose === 'maskable') {
        // W3C maskable safe zone is a centred circle of radius 40% of the icon: a launcher's mask must not clip the
        // rook. Anything the background colour does not cover has to sit inside it.
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (rgba[i] === BG[0] && rgba[i + 1] === BG[1] && rgba[i + 2] === BG[2]) continue;
          const dx = x + 0.5 - w / 2, dy = y + 0.5 - h / 2;
          assert.ok(dx * dx + dy * dy <= (size * 0.4) ** 2, `${icon.src} maskable mark clipped at ${x},${y}`);
        }
      }
    }
  });

  test('the favicon / Apple links in index.html resolve to real files of the declared size', () => {
    const links = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]+>/g)].map(([s]) => s);
    assert.ok(links.length >= 4, 'index.html carries the icon set');
    for (const link of links) {
      const href = link.match(/href="([^"]+)"/)[1];
      assert.ok(href.startsWith('/icons/'), href);
      const bytes = read(href);
      if (href.endsWith('.png')) {
        const { w, h } = pngSize(bytes);
        assert.ok(link.includes(`sizes="${w}x${h}"`), `${href} declares its real size ${w}x${h}`);
      } else if (href.endsWith('.svg')) {
        assert.match(bytes.toString(), /viewBox="0 0 512 512"/);
      } else {
        assert.equal(bytes.readUInt16LE(2), 1, `${href} is an ICO`);
        assert.ok(bytes.readUInt16LE(4) >= 1, `${href} has frames`);
      }
    }
  });
});
