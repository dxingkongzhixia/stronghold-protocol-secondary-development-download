// test/keel/builtin.test.js — the seven built-in faction plugins also work as Keel content patches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinPlugins } from '../../server/plugins/builtin.js';
import { getData } from '../../server/data.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { Match } from '../../server/match/Match.js';

test('every built-in faction has a Keel manifest and applies through mergeKeelData', () => {
  const plugins = builtinPlugins();
  assert.equal(plugins.length, 7);
  const base = getData();
  for (const plugin of plugins) {
    assert.equal(plugin.keel.manifest, 3, `${plugin.id} keel manifest`);
    assert.equal(plugin.manifest.class, 'content');
    assert.deepEqual(plugin.manifest.parts.data.files, [`builtin/faction-${plugin.id.replace(/^faction-/, '')}.json`]);
    assert.ok(plugin.content.patches.length, `${plugin.id} patch`);
    const merged = mergeKeelData(base, plugin.content);
    assert.notEqual(merged, base);
    assert.ok(Object.keys(merged.chess).some((id) => merged.chess[id].visible && !base.chess[id]?.visible), `${plugin.id} restores a chess`);
  }
});

test('a built-in faction works as a Keel room descriptor', () => {
  const plugin = builtinPlugins()[0];
  const m = new Match({
    roomCode: 'TEST', mode: 'coop', difficulty: 'NORMAL',
    seats: [{ seat: 0, playerId: 'p_0', name: 'P', isBot: false, connected: true }],
    seed: 1, data: getData(), log: { info() {}, warn() {}, error() {}, debug() {} },
    send() {}, broadcast() {}, onEnd() {}, keel: { plugins: [plugin] },
  });
  try {
    assert.equal(m.gd.chess('chess_char_1052_kalts2_a')?.visible, true);
    assert.equal(m.data.bonds.emptyShip.members.includes('chess_char_1052_kalts2_a'), true);
  } finally { m.dispose(); }
});
