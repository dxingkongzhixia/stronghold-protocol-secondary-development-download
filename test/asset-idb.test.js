// The IndexedDB asset layer (public/js/assetIdb.js). The store itself needs a browser, so this covers what can be
// checked in Node: capability detection, the enable gate the callers read, and that every entry point degrades to a
// no-op instead of throwing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  idbSupported, idbEnabled, setIdbEnabled, idbGet, idbPut, idbInfo, idbClear, idbBlobUrl,
  IDB_NAME, IDB_STORE,
} from '../public/js/assetIdb.js';

describe('IndexedDB asset layer (js/assetIdb.js)', () => {
  test('the store names are its own (not the Service Worker cache)', () => {
    assert.equal(IDB_NAME, 'sp-asset-blobs');
    assert.equal(IDB_STORE, 'files');
  });

  test('capability detection needs indexedDB and createObjectURL', () => {
    assert.equal(idbSupported({}), false);
    assert.equal(idbSupported({ indexedDB: {} }), false);
    const scope = { indexedDB: {}, URL: { createObjectURL() {} } };
    assert.equal(idbSupported(scope), true);
  });

  test('the enable gate defaults to off and the Service Worker wins', () => {
    assert.equal(idbEnabled(), false, 'dormant until main.js decides');
    setIdbEnabled(true);
    assert.equal(idbEnabled(), true);
    setIdbEnabled(false);
    assert.equal(idbEnabled(), false);
  });

  test('every entry point is a safe no-op without a browser (never throws)', async () => {
    assert.equal(await idbGet('/assets/audio/bgm/x.mp3'), null);
    assert.equal(await idbGet(''), null);
    assert.equal(await idbPut('/assets/x', null), false);
    assert.equal(await idbBlobUrl('/assets/x'), null);
    assert.deepEqual(await idbInfo(), { files: 0, bytes: 0 });
    assert.equal(await idbClear(), false);
  });
});
