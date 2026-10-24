// ui/previewPlugins.js — the main interface's personal content-preview switches (owner 2026-10-24). The composed set
// itself is the server's (/plugins/preview, test/plugins/preview.test.js); here the browser side: which rows the dialog
// offers, and that a resolved answer is published on the app store (ui.previewCs, content.js installs it) / cleared on an
// empty choice or a refusal.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { previewPlugins, previewStore, resolvePreview, PREVIEW_LIMIT } from '../../public/js/ui/previewPlugins.js';
import { store } from '../../public/js/store.js';

describe('the main interface plugin preview (ui/previewPlugins.js)', () => {
  test('only loaded, compatible content plugins of room scope are offered (no cosmetics, scripts or trusted)', () => {
    const rows = previewPlugins([
      { id: 'a', class: 'content', status: 'loaded', scope: ['room'] },
      { id: 'b', class: 'content', status: 'loaded', scope: ['room'], compatible: false },
      { id: 'c', class: 'content', status: 'disabled', scope: ['room'] },
      { id: 'd', class: 'content', status: 'loaded', scope: ['personal'] },
      { id: 'e', class: 'cosmetic', status: 'loaded', scope: ['room'] },
      { id: 'f', class: 'script', status: 'loaded', scope: ['room'] },
      { id: 'g', class: 'trusted', status: 'loaded', scope: ['room', 'server'] },
    ]);
    assert.deepEqual(rows.map((p) => p.id), ['a']);
  });

  test('the answer is published as ui.previewCs; an empty choice returns to vanilla', async () => {
    const cs = 'ab'.repeat(32);
    store.patch('ui', { previewCs: null });
    const seen = [];
    const fetch = async (url) => { seen.push(url); return { ok: true, json: async () => ({ cs }) }; };
    await resolvePreview(['faction-yan'], { fetch });
    assert.equal(store.get().ui.previewCs, cs);
    assert.equal(previewStore.get().status, 'ready');
    assert.match(seen[0], /\/plugins\/preview\?ids=faction-yan$/);
    await resolvePreview([], { fetch });
    assert.equal(store.get().ui.previewCs, null);
    assert.equal(previewStore.get().status, 'idle');
  });

  test('a refusal clears the preview and says why (the screens fall back to vanilla)', async () => {
    store.patch('ui', { previewCs: 'ab'.repeat(32) });
    await resolvePreview(['faction-yan'], { fetch: async () => ({ ok: false, status: 409, json: async () => ({ error: 'PLUGIN_BUSY' }) }) });
    assert.equal(store.get().ui.previewCs, null);
    assert.equal(previewStore.get().status, 'failed');
    assert.match(previewStore.get().error, /PLUGIN_BUSY/);
  });

  test('the request caps the ids and keeps their order', async () => {
    let url = '';
    const fetch = async (u) => { url = u; return { ok: true, json: async () => ({ cs: 'cd'.repeat(32) }) }; };
    const many = Array.from({ length: PREVIEW_LIMIT + 3 }, (_, i) => `p-${i}`);
    await resolvePreview(many, { fetch });
    const ids = new URL(url, 'http://x').searchParams.get('ids').split(',');
    assert.equal(ids.length, PREVIEW_LIMIT);
    assert.deepEqual(ids.slice(0, 3), ['p-0', 'p-1', 'p-2']);
  });
});
