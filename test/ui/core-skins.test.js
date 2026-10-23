// 核心皮肤 (docs/SKINS.md): the catalogue is part of the project, merged under every plugin layer. These tests cover
// the merge itself, the one-shot loader and the /skins/ route; the picker / battle sides keep their own suites.

import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCosmeticLayers } from '../../public/js/cosmetics.js';
import { installCoreSkins } from '../../public/js/coreSkins.js';
import { startServer } from '../../server/index.js';

const base = Object.freeze({
  chars: { char_1: { portrait: '/base/1.png', skins: { 'char_1@base': { name: 'Base', group: 'BASE' } } } },
  skills: { s1: '/base/s1.png' },
});

describe('cosmetics.setCore: core skins under the plugin layers', () => {
  test('merges skins and illust into the manifest without mutating the base', () => {
    const layers = createCosmeticLayers();
    assert.equal(layers.active, false);
    layers.setCore({
      char_1: { skins: { 'char_1@core': { name: 'Core', group: 'CORE', portrait: '/skins/1.webp' } } },
      char_2: { illust: '/skins/2_illust.webp', skins: { 'char_2@core': { name: 'Two', group: 'CORE' } } },
    });
    assert.equal(layers.active, true);
    const out = layers.apply(base);
    assert.notEqual(out, base);
    assert.equal(out.skills, base.skills, 'unrelated manifest fields are kept');
    assert.deepEqual(Object.keys(out.chars.char_1.skins).sort(), ['char_1@base', 'char_1@core']);
    assert.equal(out.chars.char_1.skins['char_1@core'].portrait, '/skins/1.webp');
    assert.equal(out.chars.char_2.illust, '/skins/2_illust.webp');
    assert.deepEqual(Object.keys(base.chars), ['char_1'], 'the input manifest is never mutated');
    assert.equal(out.chars.char_1.skins['char_1@core'].name, 'Core');
  });

  test('null clears the layer and restores the base identity', () => {
    const layers = createCosmeticLayers();
    layers.setCore({ char_1: { skins: { x: { name: 'X' } } } });
    assert.notEqual(layers.apply(base), base);
    layers.setCore(null);
    assert.equal(layers.active, false);
    assert.equal(layers.apply(base), base, 'no layer → the same manifest object (memo identity)');
  });

  test('an unloaded manifest is left alone and picks the skins up once it arrives', () => {
    const layers = createCosmeticLayers();
    layers.setCore({ char_1: { skins: { x: { name: 'X' } } } });
    const empty = Object.freeze({});
    assert.equal(layers.apply(empty), empty, 'no chars yet: nothing to merge');
    const later = layers.apply(base);
    assert.ok(later.chars.char_1.skins.x, 'the next apply merges');
  });
});

describe('coreSkins.installCoreSkins: one catalogue load', () => {
  test('fetches /skins/catalogue.json once and lays its chars', async () => {
    const doc = { version: 1, chars: { char_9: { skins: { 'char_9@x': { name: 'Nine' } } } } };
    let calls = 0;
    const fetchImpl = async (url, init) => {
      calls++;
      assert.equal(url, '/skins/catalogue.json');
      assert.equal(init?.cache, 'no-cache');
      return { ok: true, json: async () => doc };
    };
    const first = installCoreSkins({ fetch: fetchImpl });
    const second = installCoreSkins({ fetch: fetchImpl });
    assert.equal(first, second, 'the same in-flight promise');
    assert.deepEqual(await first, doc);
    assert.equal(calls, 1);
  });
});

describe('/skins/: the core catalogue and its art', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sp-skins-'));
  mkdirSync(join(tmp, 'sets', 'local-skins', 'media'), { recursive: true });
  writeFileSync(join(tmp, 'catalogue.json'), JSON.stringify({ version: 1, chars: { char_1: { skins: {} } } }));
  writeFileSync(join(tmp, 'sets', 'local-skins', 'media', 'a.webp'), Buffer.from('RIFF....WEBP'));
  let srv;
  before(async () => { srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, skinsDir: tmp }); });
  after(async () => { await srv?.close(); rmSync(tmp, { recursive: true, force: true }); });

  test('serves the catalogue no-cache and the art with the long media cache', async () => {
    const cat = await fetch(`${srv.url}/skins/catalogue.json`);
    assert.equal(cat.status, 200);
    assert.match(cat.headers.get('content-type'), /application\/json/);
    assert.equal(cat.headers.get('cache-control'), 'no-cache');
    assert.equal((await cat.json()).chars.char_1 !== undefined, true);
    const art = await fetch(`${srv.url}/skins/sets/local-skins/media/a.webp`);
    assert.equal(art.status, 200);
    assert.match(art.headers.get('cache-control'), /max-age=86400/);
  });

  test('a missing set file is a 404, not another mount', async () => {
    const r = await fetch(`${srv.url}/skins/sets/local-skins/media/missing.webp`);
    assert.equal(r.status, 404);
  });
});
