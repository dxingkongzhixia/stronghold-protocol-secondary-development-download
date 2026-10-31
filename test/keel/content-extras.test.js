// test/keel/content-extras.test.js — dsl grants and wave-derived stage paths in the Keel path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getData } from '../../server/data.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { readPluginFolder } from '../../server/plugins/registry.js';
import { createContentSets } from '../../server/plugins/contentSets.js';
import { createKeelContentSet } from '../../server/keel/content-set.js';
import { createKeelContentSets } from '../../server/keel/content-sets.js';
import { makeMatch } from '../match/harness.js';

test('a Keel content dsl prep spec becomes a player effect', () => {
  const key = 'effect:dsl-demo:income';
  const spec = { dsl: 1, pluginId: 'dsl-demo', meta: { key, on: [{ when: 'income', do: [{ funds: { amount: 15 } }] }] } };
  const h = makeMatch({
    humans: 1,
    keel: { plugins: [{ id: 'dsl-demo', content: { records: [], dsl: [{ pluginId: 'dsl-demo', rel: 'dsl/income.json', spec }] } }] },
  });
  try {
    assert.deepEqual(h.m.keelDslGrants, [key]);
    assert.equal(h.ps('p_0').effects.some((e) => e.key === key), true);
  } finally { h.m.dispose(); }
});

test('a changed wave re-derives ground paths of the stages its mode uses', () => {
  const data = getData();
  const waveId = data.config.modes.mode_single_normal.rounds['1'].template;
  const stageId = data.config.modes.mode_single_normal.stages[0];
  const before = data.stages[stageId].groundPaths;
  const content = {
    records: [],
    stages: new Map(),
    patches: [{
      rel: 'waves.json',
      ops: [{ op: 'append', file: 'waves', id: waveId, path: ['routes'], value: [{ motion: 'WALK', start: [9, 10], end: [9, 4], checkpoints: [] }] }],
    }],
    pluginId: 'wave-demo',
  };
  const merged = mergeKeelData(data, content);
  assert.notDeepEqual(merged.stages[stageId].groundPaths, before);
  assert.ok(merged.stages[stageId].deployTiles);
});

test('Keel content reads offers and i18n documents', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-extras-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const src = path.resolve('test/fixtures/keel/offers-demo');
  fs.copyFileSync(path.join(src, 'offers.json'), path.join(dir, 'offers.json'));
  fs.copyFileSync(path.join(src, 'cards.json'), path.join(dir, 'cards.json'));
  fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ version: 1, lang: 'en', files: { chess: { chess_char_1_01_a: { name: 'Test name' } } } }));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'offers-keel', name: 'Offers', version: '1.0.0', app: '*',
    api: { content: 1 }, scope: ['room'], trust: 'data',
    modules: [{
      kind: 'content',
      files: ['offers.json', 'cards.json', 'en.json'],
      parts: { offers: ['offers.json'], i18n: ['en.json'] },
      permissions: ['content.offers'],
    }],
  }));
  const plugin = await loadKeelPlugin(dir);
  assert.equal(plugin.problems.length, 0, plugin.problems.join('\n'));
  assert.equal(plugin.offers.length, 1);
  assert.equal(plugin.offers[0].id, 'supplies');
  assert.equal(plugin.offers[0].cards.length, 4);
  assert.equal(plugin.content.i18n.length, 1);
  assert.equal(plugin.content.i18n[0].lang, 'en');
});

test('createKeelContentSet builds cs/data from Keel plugins through the shared compiler', async (t) => {
  const dir = path.resolve('plugins/prts-kaltsit');
  if (!fs.existsSync(path.join(dir, 'plugin.keel.json'))) { t.skip('prts-kaltsit is not checked out'); return; }
  const plugin = await loadKeelPlugin(dir);
  const set = createKeelContentSet({ plugins: [plugin] });
  assert.deepEqual(set.problems ?? [], []);
  assert.equal(typeof set.cs, 'string');
  assert.equal(set.data.chess.chess_x_prts_kaltsit_one_a?.charId, 'char_x_prts_kaltsit_one');
  assert.equal(set.data.bands.band_x_prts_kaltsit_touch?.bandId, 'band_x_prts_kaltsit_touch');
  assert.ok(set.data.config.modes);
});

test('createKeelContentSets serves /cs files, i18n, offers and dsl from Keel plugins', async (t) => {
  const dir = path.resolve('plugins/prts-kaltsit');
  if (!fs.existsSync(path.join(dir, 'plugin.keel.json'))) { t.skip('prts-kaltsit is not checked out'); return; }
  const plugin = await loadKeelPlugin(dir);
  const contents = createKeelContentSets({ plugins: new Map([[plugin.id, plugin]]), vanillaData: getData() });
  assert.equal(contents.has(plugin.id), true);
  const resolved = contents.resolve([plugin.id], { scope: 'room' });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  const cs16 = resolved.set.cs.slice(0, 16);
  const chess = contents.file(cs16, 'data/chess.json');
  assert.ok(chess?.body?.length, 'the Keel set serves its patched chess table');
  assert.ok(contents.file(cs16, 'index.json')?.body?.length);
  assert.equal(contents.dataOf(resolved.set.cs).chess.chess_x_prts_kaltsit_one_a.charId, 'char_x_prts_kaltsit_one');
});

test('a Keel i18n overlay is served by the content set the client downloads', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-i18n-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ version: 1, lang: 'en', files: { chess: { chess_char_1_01_a: { name: 'Keel translated name' } } } }));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'i18n-keel', name: 'I18n', version: '1.0.0', app: '*',
    api: { content: 1 }, scope: ['room'], trust: 'data',
    modules: [{ kind: 'content', files: ['en.json'], parts: { i18n: ['en.json'] }, permissions: [] }],
  }));
  const read = await readPluginFolder(dir);
  assert.deepEqual(read.problems, []);
  const registry = { plugin: (key) => (key === 'i18n-keel' ? read.plugin : null), onScan: () => null };
  const contents = createContentSets({ registry, vanillaData: getData(), log: { info() {}, warn() {}, error() {} }, maxSets: () => 2 });
  const resolved = contents.resolve(['i18n-keel'], { scope: 'room' });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  const file = contents.file(resolved.set.cs.slice(0, 16), 'i18n/en.json');
  assert.ok(file?.body?.length);
  assert.match(file.body.toString('utf8'), /Keel translated name/);
});

test('a three-plugin content combination matches the old content set', async (t) => {
  const ids = ['prts-kaltsit', 'prts-source-code', 'black-snake'];
  const dirs = ids.map((id) => path.resolve('plugins', id));
  if (dirs.some((dir) => !fs.existsSync(path.join(dir, 'plugin.keel.json')))) { t.skip('one of the PRTS plugins is not checked out'); return; }
  const base = getData();
  const vanilla = { manifest: base.assets, baseManifest: base.assets, sha256: 'combo' };
  const read = new Map();
  for (const [i, id] of ids.entries()) read.set(id, (await readPluginFolder(dirs[i], { vanilla })).plugin);
  const oldContents = createContentSets({ registry: { plugin: (id) => read.get(id) ?? null, onScan: () => null }, vanillaData: base, log: { info() {}, warn() {}, error() {} }, maxSets: () => 4 });
  const oldSet = oldContents.resolve(ids, { scope: 'room' });
  assert.equal(oldSet.ok, true, JSON.stringify(oldSet));
  const oldData = oldContents.dataOf(oldSet.set.cs);
  const plugins = new Map();
  for (const dir of dirs) { const p = await loadKeelPlugin(dir); plugins.set(p.id, p); }
  const keelContents = createKeelContentSets({ plugins, vanillaData: base });
  const keelSet = keelContents.resolve(ids, { scope: 'room' });
  assert.equal(keelSet.ok, true, JSON.stringify(keelSet));
  const keelData = keelContents.dataOf(keelSet.set.cs);
  const pick = (obj, prefix) => Object.fromEntries(Object.entries(obj ?? {}).filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)));
  for (const [table, prefix] of [['chess', 'chess_x_'], ['enemies', 'enemy_x_'], ['bosses', 'boss_x_'], ['waves', 'wave_x_'], ['tokens', 'token_x_'], ['bands', 'band_x_']]) {
    assert.deepEqual(pick(keelData[table], prefix), pick(oldData[table], prefix), table);
  }
  for (const mode of ['mode_single_normal', 'mode_single_funny', 'mode_multi_funny']) {
    assert.deepEqual(keelData.config.modes[mode]?.bossWeights, oldData.config.modes[mode]?.bossWeights, `${mode}.bossWeights`);
    assert.deepEqual(keelData.config.modes[mode]?.rounds, oldData.config.modes[mode]?.rounds, `${mode}.rounds`);
  }
});
