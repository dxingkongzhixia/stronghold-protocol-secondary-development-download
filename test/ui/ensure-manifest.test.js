// Unit tests (Node) for public/js/ui/ensureManifest.js — the safety net that keeps the PWA manifest linked even when
// the served index.html is stale. A stale index.html without the <link rel="manifest"> would hide the title's
// 添加到桌面 button (the browser never offers an install), exactly like the missing stats.css <link> that broke the
// 统计数据 overlay (ui/ensureStylesheet.js). No DOM here: a minimal fake document.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ensureManifestLink } from '../../public/js/ui/ensureManifest.js';

/** Minimal document: a head that records appended children and a manifest-aware querySelector. */
function fakeDoc(links = []) {
  const existing = links.map((rel) => ({ rel, attrs: {} }));
  const doc = {
    appended: [],
    head: { appendChild(el) { existing.push(el); doc.appended.push(el); } },
    createElement(tag) {
      return { tagName: String(tag).toUpperCase(), rel: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    },
    querySelector(sel) {
      return sel === 'link[rel="manifest"]' ? existing.find((l) => l.rel === 'manifest') || null : null;
    },
  };
  return doc;
}

describe('ensureManifestLink', () => {
  test('adds the manifest link when it is missing (the stale-index.html case)', () => {
    const doc = fakeDoc();
    assert.equal(ensureManifestLink('/manifest.json', doc), true);
    assert.equal(doc.appended.length, 1);
    assert.equal(doc.appended[0].rel, 'manifest');
    assert.equal(doc.appended[0].attrs.href, '/manifest.json');
  });

  test('is idempotent: a page that already links a manifest is left alone', () => {
    const doc = fakeDoc(['manifest']);
    assert.equal(ensureManifestLink('/manifest.json', doc), false);
    assert.equal(doc.appended.length, 0);
    const once = fakeDoc();
    ensureManifestLink('/manifest.json', once);
    assert.equal(ensureManifestLink('/manifest.json', once), false);
    assert.equal(once.appended.length, 1);
  });

  test('is a no-op without a usable document / href (Node, a non-DOM host)', () => {
    assert.equal(ensureManifestLink('/manifest.json', undefined), false); // default = globalThis.document (undefined in Node)
    assert.equal(ensureManifestLink('/manifest.json', null), false);
    assert.equal(ensureManifestLink('/manifest.json', {}), false);
    assert.equal(ensureManifestLink('/manifest.json', { head: {}, createElement: () => ({ setAttribute() {} }) }), false, 'no appendChild');
    assert.equal(ensureManifestLink('', fakeDoc()), false);
    assert.equal(ensureManifestLink(null, fakeDoc()), false);
  });
});
