// Dynamic-illustration helpers (ui/hub/dynIllust.js): the index loader, the path guards, the ambient-clip pick and
// the cover transform. The PIXI mount itself needs a browser and is exercised by the hub E2E/screenshot checks.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDynId, dynEntryPart, validDynEntry, dynAssetUrl, pickIdle, coverTransform, loadDynIndex, resetDynIndex,
} from '../../public/js/ui/hub/dynIllust.js';

const ENTRY = {
  id: 'char_1038_whitw2@sale#15',
  charId: 'char_1038_whitw2',
  name: '无序的谦卑',
  group: '忒斯特收藏/XVII',
  parts: [{
    part: 'main',
    skel: 'char_1038_whitw2_sale_15/main/illust.skel',
    atlas: 'char_1038_whitw2_sale_15/main/illust.atlas',
    textures: ['char_1038_whitw2_sale_15/main/page.webp'],
    v: '9355203ed81f',
  }],
};

describe('dynamic illustration: index and guards', () => {
  test('sanitizeDynId keeps a plain id and rejects URLs / empty / non-strings', () => {
    assert.equal(sanitizeDynId(ENTRY.id), ENTRY.id);
    assert.equal(sanitizeDynId('char_1038_whitw2'), 'char_1038_whitw2');
    assert.equal(sanitizeDynId('https://evil.test/x'), null);
    assert.equal(sanitizeDynId(''), null);
    assert.equal(sanitizeDynId(null), null);
    assert.equal(sanitizeDynId(42), null);
  });

  test('dynEntryPart prefers the main part; an entry without parts has none', () => {
    assert.equal(dynEntryPart(ENTRY).part, 'main');
    const start = { ...ENTRY, parts: [{ part: 'start', skel: 's.skel', atlas: 's.atlas', textures: [] }, ENTRY.parts[0]] };
    assert.equal(dynEntryPart(start).part, 'main');
    assert.equal(dynEntryPart({ id: 'x' }), null);
    assert.equal(dynEntryPart(null), null);
  });

  test('validDynEntry refuses absolute or traversing paths and missing files', () => {
    assert.equal(validDynEntry(ENTRY), true);
    assert.equal(validDynEntry({ ...ENTRY, id: 'https://x' }), false);
    for (const bad of ['/etc/passwd', '../x.skel', 'a/../../b.skel', 42]) {
      const e = { ...ENTRY, parts: [{ ...ENTRY.parts[0], skel: bad }] };
      assert.equal(validDynEntry(e), false, String(bad));
    }
    assert.equal(validDynEntry({ ...ENTRY, parts: [] }), false);
    assert.equal(validDynEntry(null), false);
  });

  test('dynAssetUrl joins under /assets/dynillust exactly once', () => {
    assert.equal(dynAssetUrl('a/b.skel'), '/assets/dynillust/a/b.skel');
    assert.equal(dynAssetUrl('/a/b.skel'), '/assets/dynillust/a/b.skel');
  });
});

describe('dynamic illustration: the ambient clip and the cover fit', () => {
  test('pickIdle: exact Idle, then idle/default/loop, then the longest clip', () => {
    assert.equal(pickIdle([{ name: 'Interact', duration: 41 }, { name: 'Idle', duration: 6 }]).name, 'Idle');
    assert.equal(pickIdle([{ name: 'idle_loop', duration: 6 }, { name: 'Special', duration: 18 }]).name, 'idle_loop');
    assert.equal(pickIdle([{ name: 'Default', duration: 2 }, { name: 'Special', duration: 18 }]).name, 'Default');
    assert.equal(pickIdle([{ name: 'Start', duration: 5 }, { name: 'Special', duration: 18 }]).name, 'Special');
    assert.equal(pickIdle([{ name: 'Only' }]).name, 'Only');
    assert.equal(pickIdle([]), null);
    assert.equal(pickIdle(null), null);
  });

  test('coverTransform fills the viewport (crop, never letterbox) and centres the bounds', () => {
    const bounds = { x: -856.8, y: -1545.2, width: 1706.2, height: 1576.7 };
    const { scale, x, y } = coverTransform(bounds, 1280, 720);
    assert.ok(Math.abs(scale - Math.max(1280 / bounds.width, 720 / bounds.height)) < 1e-9);
    const cx = (bounds.x + bounds.width / 2) * scale + x;
    const cy = (bounds.y + bounds.height / 2) * scale + y;
    assert.ok(Math.abs(cx - 640) < 1e-6, 'bounds centre sits at the viewport centre');
    assert.ok(Math.abs(cy - 360) < 1e-6);
    // the scaled bounds cover both axes
    assert.ok(bounds.width * scale >= 1280 - 1e-6);
    assert.ok(bounds.height * scale >= 720 - 1e-6);
    // zoom scales the picture up around the same centre
    const z = coverTransform(bounds, 1280, 720, 1.1);
    assert.ok(z.scale > scale);
  });

  test('coverTransform tolerates empty bounds / sizes without NaN', () => {
    const t = coverTransform(null, 0, 0);
    for (const v of [t.scale, t.x, t.y]) assert.ok(Number.isFinite(v));
  });
});

describe('dynamic illustration: the index loader', () => {
  test('filters invalid records and never rejects', async () => {
    resetDynIndex();
    const list = await loadDynIndex({
      fetchFn: async () => ({ ok: true, json: async () => ({ version: 1, entries: [ENTRY, { id: 'https://x' }, null] }) }),
    });
    assert.deepEqual(list.map((e) => e.id), [ENTRY.id]);
  });

  test('a missing index (404) is an empty list, and the reading is cached', async () => {
    resetDynIndex();
    let calls = 0;
    const fetchFn = async () => { calls++; return { ok: false, json: async () => ({}) }; };
    assert.deepEqual(await loadDynIndex({ fetchFn }), []);
    assert.deepEqual(await loadDynIndex({ fetchFn }), []);
    assert.equal(calls, 1);
    resetDynIndex();
  });
});
