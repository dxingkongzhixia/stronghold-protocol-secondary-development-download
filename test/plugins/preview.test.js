// The main interface's personal plugin preview (owner 2026-10-24): GET /plugins/preview?ids=… composes the chosen
// content plugins (built-in 阵营加强 included) and answers the content set's cs; the page loads it from /cs/<cs>/ like
// a room's set. It is read-only and never used by a match (the room's own set — or vanilla — always wins), and only
// loaded, compatible content plugins of room scope are accepted (no scripts/trusted).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';

const BUILTIN = fs.existsSync('data/builtin/faction-yan.json') && fs.existsSync('data/builtin/faction-rhodes.json');
const skip = BUILTIN ? false : 'data/builtin/ is not present (run tools/build-data.mjs)';
let srv;

before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, assetIndex: false });
});
after(async () => { await srv.close(); });

const preview = (ids) => fetch(`${srv.url}/plugins/preview${ids ? `?ids=${encodeURIComponent(ids)}` : ''}`);

/** The composed data file of a preview set, or null. */
async function table(cs, name) {
  const r = await fetch(`${srv.url}/cs/${cs.slice(0, 16)}/data/${name}.json`);
  return r.ok ? r.json() : null;
}

test('no ids: vanilla (cs null)', { skip }, async () => {
  const r = await preview('');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { cs: null });
});

test('one faction: its shop operators are visible in the composed data, the others stay hidden', { skip }, async () => {
  const r = await preview('faction-yan');
  assert.equal(r.status, 200);
  const { cs } = await r.json();
  assert.match(cs, /^[0-9a-f]{64}$/);
  const chess = await table(cs, 'chess');
  assert.ok(chess, 'the set serves its composed chess table');
  assert.equal(chess.chess_char_2027_wang_a.visible, true, '望 is back');
  assert.equal(chess.chess_char_4132_ascln_a.visible, false, '阿斯卡纶 belongs to another faction');
  const bonds = await table(cs, 'bonds');
  assert.ok(bonds.yanShip.members.includes('chess_char_2027_wang_a'));
  assert.equal(bonds.skillfulShip.members.includes('chess_char_4132_ascln_a'), false);
});

test('two factions: both are composed together (append patches do not overwrite)', { skip }, async () => {
  const { cs } = await (await preview('faction-yan,faction-rhodes')).json();
  const chess = await table(cs, 'chess');
  assert.equal(chess.chess_char_2027_wang_a.visible, true);
  assert.equal(chess.chess_char_4132_ascln_a.visible, true);
  assert.equal(chess.chess_char_1015_aglna2_a.visible, false, '叙拉古 is not selected');
});

test('the same choice twice gives the same cs (memoized composition)', { skip }, async () => {
  const a = await (await preview('faction-yan')).json();
  const b = await (await preview('faction-yan')).json();
  assert.equal(a.cs, b.cs);
});

test('unknown ids and empty ids are refused / vanilla', { skip }, async () => {
  const r = await preview('no-such-plugin');
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'PLUGIN_UNKNOWN', ids: ['no-such-plugin'] });
  const none = await preview('');
  assert.deepEqual(await none.json(), { cs: null });
});
