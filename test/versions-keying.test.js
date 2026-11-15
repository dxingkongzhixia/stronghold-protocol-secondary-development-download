// test/versions-keying.test.js — official kit keying across versions (server/sim/content/index.js officialKitKey,
// kits/index.js KIT_CHAR_IDS): the default data and plugin content sets keep the by-id lookup; another official
// version's build (config.version) resolves a chess's kit by its charId, because act3autochess reuses chess ids for
// other operators. A version operator without a kit must be listed in PENDING_KIT_CHARS (the P2 batches) so coverage
// is visible, not silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../server/data.js';
import { KITS, officialKitKey } from '../server/sim/content/index.js';
import { KIT_CHAR_IDS, PENDING_KIT_CHARS } from '../server/sim/content/kits/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = { warn() {}, error() {}, info() {} };
const dataOf = (dir) => ({
  chess: JSON.parse(readFileSync(path.join(dir, 'chess.json'), 'utf8')),
  config: JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8')),
});

/** Data directories checked: the default and every data/versions/<slug>/ with a chess.json. */
const DIRS = [
  { label: 'data', data: getData({ log: quiet }) },
  ...(() => {
    const vdir = path.join(ROOT, 'data', 'versions');
    if (!existsSync(vdir)) return [];
    return readdirSync(vdir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      .filter((e) => e.isDirectory() && existsSync(path.join(vdir, e.name, 'chess.json')))
      .map((e) => ({ label: `data/versions/${e.name}`, data: dataOf(path.join(vdir, e.name)) }));
  })(),
];

test('the default data keeps the by-id kit lookup (KIT_CHAR_IDS matches each chess record)', () => {
  const data = DIRS[0].data;
  for (const [key, charId] of Object.entries(KIT_CHAR_IDS)) {
    const rec = data.chess[key];
    assert.ok(rec, `${key}: the default data has it`);
    assert.equal(rec.charId, charId, `${key}: KIT_CHAR_IDS names the operator it was written for`);
    assert.equal(officialKitKey({ id: key, baseId: key, charId: rec.charId, tier: rec.tier }, data), key);
  }
  // a tier kit key whose operator is not the record's (the version collision) runs the charId's kit only on a version
  const colliding = { id: 'chess_char_1_01_a', baseId: 'chess_char_1_01_a', charId: 'char_4207_branch', tier: 1 };
  assert.equal(officialKitKey(colliding, data), 'chess_char_1_01_a', 'default data: ids win');
});

test('a version build resolves each chess to a kit written for its own charId, or lists it as pending', () => {
  const pending = new Set(PENDING_KIT_CHARS);
  const resolved = new Set();
  for (const { label, data } of DIRS.slice(1)) {
    const isVersion = !!data.config?.version;
    assert.ok(isVersion, `${label}: carries config.version`);
    for (const [id, rec] of Object.entries(data.chess)) {
      if (!rec || rec.isGolden === true || rec.visible === false || !rec.charId) continue;
      const def = { id, baseId: id, charId: rec.charId, tier: rec.tier };
      const key = officialKitKey(def, data);
      if (key == null) {
        assert.ok(pending.has(rec.charId), `${label} ${id} (${rec.charId}) has no kit and is not PENDING_KIT_CHARS`);
        continue;
      }
      assert.ok(Object.hasOwn(KITS, key), `${label} ${id}: ${key} is a kit`);
      const written = KIT_CHAR_IDS[key];
      assert.ok((written ?? key) === rec.charId, `${label} ${id}: kit ${key} was written for ${written ?? key}, not ${rec.charId}`);
      resolved.add(rec.charId);
    }
    // act3's colliding ids: the kit of the record's operator, not the default data's operator of that id
    if (label.endsWith('act3autochess-v3_1')) {
      const keyOf = (id) => { const r = data.chess[id]; return officialKitKey({ id, baseId: id, charId: r.charId, tier: r.tier }, data); };
      assert.equal(keyOf('chess_char_1_01_a'), 'chess_char_2_17_a', '折桠 (a tier-2 kit) under chess_char_1_01_a');
      assert.equal(keyOf('chess_char_1_02_a'), 'chess_char_1_12_a', '艾丝黛尔 under chess_char_1_02_a');
      assert.equal(keyOf('chess_char_5_26_a'), 'char_002_amiya', '阿米娅 now resolves by charId');
      assert.equal(keyOf('chess_char_1_15_a'), null, '褐果 is still in PENDING_KIT_CHARS');
    }
  }
  // a listed operator that gets a kit must leave PENDING_KIT_CHARS (the list stays honest)
  for (const charId of pending) assert.ok(!resolved.has(charId), `${charId} has a kit now: remove it from PENDING_KIT_CHARS`);
});

test('a plugin content set on the default data keeps the by-id lookup', () => {
  const data = { ...DIRS[0].data, config: { ...DIRS[0].data.config } };
  delete data.config.version;
  const def = { id: 'chess_char_1_01_a', baseId: 'chess_char_1_01_a', charId: 'char_4207_branch', tier: 1 };
  assert.equal(officialKitKey(def, data), 'chess_char_1_01_a');
});

test('a stand-in or a DIY piece resolves by charId on every data', () => {
  const data = DIRS[0].data;
  assert.equal(officialKitKey({ id: 'chess_char_1_01_a', baseId: 'chess_char_1_01_a', charId: 'char_609_acguad', standInFor: 'char_498_inside' }, data), 'char_609_acguad');
  assert.equal(officialKitKey({ id: 'chess_char_1_01_a', baseId: 'chess_char_1_01_a', charId: 'char_112_siege', diyFor: 'chess_char_1_01_a' }, data), 'char_112_siege');
  assert.equal(officialKitKey({ id: 'chess_char_1_01_a', baseId: 'chess_char_1_01_a', charId: 'char_999_none', diyFor: 'chess_char_1_01_a' }, data), null);
});
