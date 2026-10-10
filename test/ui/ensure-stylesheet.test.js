// Unit tests (Node) for public/js/ui/ensureStylesheet.js — the safety net that links a screen's stylesheet even when
// the served index.html is stale. Production 2026-10: the served public/index.html was missing the
// /css/screens/stats.css <link> (while every JS/CSS file beside it was byte-identical to the repo), so the 统计数据
// overlay kept its default block layout and its toolbar (导出 / 导入 / 清空) rendered inline in the top-left over the
// still-visible lobby. No DOM here: a minimal fake document.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ensureStylesheet } from '../../public/js/ui/ensureStylesheet.js';

/** Minimal document: a head that records appended children and a link-aware querySelector. */
function fakeDoc(hrefs = []) {
  const links = hrefs.map((href) => ({ rel: 'stylesheet', attrs: { href } }));
  const doc = {
    _links: links,
    appended: [],
    head: { appendChild(el) { links.push({ rel: el.rel, attrs: el.attrs }); doc.appended.push(el); } },
    createElement(tag) {
      return { tagName: String(tag).toUpperCase(), rel: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    },
    querySelector(sel) {
      const m = /^link\[rel="stylesheet"\]\[href="([^"]+)"\]$/.exec(sel);
      if (!m) return null;
      return links.find((l) => l.rel === 'stylesheet' && l.attrs.href === m[1]) || null;
    },
  };
  return doc;
}

describe('ensureStylesheet', () => {
  test('adds the stylesheet link once when it is missing (the stale-index.html case)', () => {
    const doc = fakeDoc();
    assert.equal(ensureStylesheet('/css/screens/stats.css', doc), true);
    assert.equal(doc.appended.length, 1);
    assert.equal(doc.appended[0].rel, 'stylesheet');
    assert.equal(doc.appended[0].attrs.href, '/css/screens/stats.css');
  });

  test('is idempotent: a second call, or a page that already links it, adds nothing', () => {
    const doc = fakeDoc();
    ensureStylesheet('/css/screens/stats.css', doc);
    assert.equal(ensureStylesheet('/css/screens/stats.css', doc), false);
    assert.equal(doc.appended.length, 1);

    const already = fakeDoc(['/css/screens/stats.css']);
    assert.equal(ensureStylesheet('/css/screens/stats.css', already), false);
    assert.equal(already.appended.length, 0);
  });

  test('a different stylesheet link does not count as this one', () => {
    const doc = fakeDoc(['/css/theme.css', '/css/screens/lobby.css']);
    assert.equal(ensureStylesheet('/css/screens/stats.css', doc), true);
    assert.equal(doc.appended.length, 1);
  });

  test('is a no-op without a usable document / href (Node, a non-DOM host)', () => {
    assert.equal(ensureStylesheet('/css/screens/stats.css', undefined), false); // default = globalThis.document (undefined in Node)
    assert.equal(ensureStylesheet('/css/screens/stats.css', null), false);
    assert.equal(ensureStylesheet('/css/screens/stats.css', {}), false);
    assert.equal(ensureStylesheet('/css/screens/stats.css', { head: {}, createElement: () => ({ setAttribute() {} }) }), false, 'no appendChild');
    assert.equal(ensureStylesheet('', fakeDoc()), false);
    assert.equal(ensureStylesheet(null, fakeDoc()), false);
  });
});
