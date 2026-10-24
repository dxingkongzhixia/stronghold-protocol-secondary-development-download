// 阵营加强 built-in plugins (owner 2026-10-24): the 8 custom shop operators are NOT in the vanilla game — the generated
// data hides their records and drops them from bond member lists. Each faction ships a built-in content plugin
// (server/plugins/builtin.js + data/builtin/faction-*.json) that restores its own operators when the room's host turns it
// on; off is the default (`plugins/config.json` `default: []`). The official 自选 picks of those operators stay in the
// vanilla data (backups.diy.officialPool), so switching the plugin off only removes their shop forms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { BUILTIN_FACTIONS, builtinId } from '../../server/plugins/builtin.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const skip = hasGeneratedData() && fs.existsSync('data/builtin/faction-yan.json') ? false : 'generated data with data/builtin/ is not present';
const registry = () => createPluginRegistry({
  publicDir: 'public', dataDir: 'data', packsDir: 'packs', pluginsDir: 'plugins',
}, { app: '0.4.0', log: { info() {}, warn() {} } });

/** The two chess ids of one built-in operator (tools/build-data.mjs CUSTOM_CHESS). */
const OPERATOR = {
  yan: ['chess_char_2027_wang_a', 'chess_char_2027_wang_b', 'char_2027_wang', 'yanShip'],
  rhodes: ['chess_char_4132_ascln_a', 'chess_char_4132_ascln_b', 'char_4132_ascln', 'skillfulShip'],
  egir: ['chess_char_4231_clemnt_a', 'chess_char_4231_clemnt_b', 'char_4231_clemnt', 'egirShip'],
};

test('the catalogue lists the built-in 阵营加强 plugins (category faction, room scope, no files)', { skip }, () => {
  const r = registry();
  const idx = r.pluginIndex({ vanilla: null });
  const builtins = idx.plugins.filter((p) => p.builtin);
  assert.deepEqual(builtins.map((p) => p.id).sort(), BUILTIN_FACTIONS.map((f) => builtinId(f.id)).sort());
  for (const p of builtins) {
    assert.equal(p.class, 'content');
    assert.equal(p.category, 'faction');
    assert.deepEqual(p.scope, ['room']);
    assert.equal(p.status, 'loaded');
    assert.equal(p.source, 'builtin');
    assert.match(p.name, /阵营加强/);
    assert.equal(p.vs, undefined, 'a built-in plugin has no art of its own');
  }
});

test('vanilla: the custom shop operators are hidden and out of every bond list', { skip }, () => {
  const set = buildContentSet({ registry: registry(), ids: [] });
  assert.deepEqual(set.problems, []);
  assert.equal(set.vanilla, true);
  for (const [base, golden, , bond] of Object.values(OPERATOR)) {
    assert.equal(set.data.chess[base].visible, false, `${base} is not offered in the shop`);
    assert.equal(set.data.chess[golden].visible, false, `${golden} too`);
    assert.equal(set.data.bonds[bond].members.includes(base), false, `${bond} does not count it`);
    assert.equal(set.data.bonds[bond].visibleMembers?.includes(base) ?? false, false);
  }
  // ...while the official 自选 role is still there (the off state the owner asked for)
  const picks = set.data.backups.diy.officialPool;
  assert.ok(picks.includes('char_2027_wang'));
  assert.ok(picks.includes('char_4231_clemnt'));
});

test('one faction on: only its operators come back, with their bond membership', { skip }, () => {
  const set = buildContentSet({ registry: registry(), ids: ['faction-yan'] });
  assert.deepEqual(set.problems, []);
  assert.equal(set.vanilla, false, 'a faction boost is gameplay: the match is unofficial');
  const [base, golden, , bond] = OPERATOR.yan;
  assert.equal(set.data.chess[base].visible, true);
  assert.equal(set.data.chess[golden].visible, true);
  assert.ok(set.data.bonds[bond].members.includes(base));
  assert.ok(set.data.bonds[bond].visibleMembers.includes(base));
  // the other factions stay off
  for (const key of ['rhodes', 'egir']) {
    const [b] = OPERATOR[key];
    assert.equal(set.data.chess[b].visible, false, `${key} is still off`);
  }
  // the ban pool reads visibleChess: a hidden operator cannot be drawn into it
  assert.ok(set.data.chess[OPERATOR.rhodes[0]].visible === false);
});

test('two factions on: both are restored (patches append, they do not overwrite each other)', { skip }, () => {
  const set = buildContentSet({ registry: registry(), ids: ['faction-rhodes', 'faction-yan'] });
  assert.deepEqual(set.problems, []);
  for (const key of ['rhodes', 'yan']) {
    const [base, , , bond] = OPERATOR[key];
    assert.equal(set.data.chess[base].visible, true, `${key} visible`);
    assert.ok(set.data.bonds[bond].members.includes(base), `${key} bond member`);
  }
  assert.equal(set.data.chess[OPERATOR.egir[0]].visible, false, 'the factions not chosen stay off');
});

test('the built-in patch is a plain data patch the content set hashes (cs changes; no files of its own)', { skip }, () => {
  const doc = JSON.parse(fs.readFileSync('data/builtin/faction-yan.json', 'utf8'));
  assert.equal(doc.patch, 1);
  assert.ok(doc.ops.length > 0);
  assert.ok(doc.ops.every((op) => op.file === 'chess' || op.file === 'bonds'));
  const plain = buildContentSet({ registry: registry(), ids: [] });
  const yan = buildContentSet({ registry: registry(), ids: ['faction-yan'] });
  assert.notEqual(yan.cs, plain.cs);
  assert.deepEqual(yan.plugins.map((p) => p.id), ['faction-yan']);
});
