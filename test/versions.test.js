// test/versions.test.js — the official-version registry (shared/versions.js) and the version data layer
// (server/data.js): two entries (the default 盟约 and 规程·序列Ⅰ), the default staying the default (owner 2026-11-15),
// the historical directories deliberately absent, and the paths/ids a version build and its match host rely on.
// The 规程 data itself arrives with its build profile (test/data-versions.test.js will compare it then).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DEFAULT_VERSION, LOBBY_DEFAULT_VERSION, VERSIONS, versionById, versionSlug, versionOfData, officialModeId } from '../shared/versions.js';
import { DATA_DIR, getData, getVersionData, resetData, resetVersionData, versionDataDir } from '../server/data.js';

const quiet = { warn() {}, error() {}, info() {} };

test('the registry lists the default and 规程·序列Ⅰ only, with the fields a build and a room need', () => {
  assert.equal(DEFAULT_VERSION, 'act2autochess');
  assert.equal(LOBBY_DEFAULT_VERSION, DEFAULT_VERSION, 'the owner kept the lobby on 盟约 (2026-11-15), unlike the mainline');
  assert.deepEqual(VERSIONS.map((v) => v.id), ['act2autochess', 'act3autochess@V3_1']);
  const def = versionById('act2autochess');
  assert.equal(def.dir, '', 'the default reads data/*.json');
  assert.equal(def.family, 'covenant');
  assert.deepEqual(def.roomModes, ['solo', 'coop']);
  const reg = versionById('act3autochess@V3_1');
  assert.equal(reg.season, 'act3autochess');
  assert.equal(reg.family, 'regulation');
  assert.equal(reg.dir, 'versions/act3autochess-v3_1/');
  assert.equal(versionSlug(reg), 'act3autochess-v3_1');
  // the three historical mainline directories are a deliberate fork divergence
  for (const id of ['act1autochess', 'act1autochess@V1_1', 'act2autochess@V2_1']) assert.equal(versionById(id), null, id);
  assert.equal(VERSIONS.every((v) => Object.isFrozen(v) && Object.isFrozen(v.roomModes)), true, 'frozen');
});

test('versionSlug and versionOfData: the default is a code constant, a built dir names itself', () => {
  assert.equal(versionSlug(versionById('act2autochess')), 'act2autochess');
  assert.equal(versionOfData(null), DEFAULT_VERSION);
  assert.equal(versionOfData({}), DEFAULT_VERSION);
  assert.equal(versionOfData({ config: {} }), DEFAULT_VERSION);
  assert.equal(versionOfData({ config: { version: { id: 'act3autochess@V3_1' } } }), 'act3autochess@V3_1');
  assert.equal(versionOfData({ config: { version: { id: 7 } } }), DEFAULT_VERSION, 'a non-string id is not a version');
});

test('officialModeId: a config mode id passes through, a ladder finds the first mode of its type and difficulty', () => {
  const plain = { modes: { mode_solo_normal: { type: 'SINGLE', difficulty: 'NORMAL', sortId: 1 }, mode_coop_hard: { type: 'MULTI', difficulty: 'HARD', sortId: 2 } } };
  assert.equal(officialModeId(plain, 'solo', 'NORMAL'), 'mode_solo_normal');
  assert.equal(officialModeId(plain, 'solo', 'mode_solo_normal'), 'mode_solo_normal', 'an existing mode id passes through');
  assert.equal(officialModeId(plain, 'coop', 'HARD'), 'mode_coop_hard');
  assert.equal(officialModeId({}, 'solo', 'NORMAL'), null);
  // 规程's ladder: the ids are not mode_<type>_<difficulty>, so the difficulty picks the first of its type in sortId order
  const ladder = { modes: {
    mode_solo_normal: { type: 'SINGLE', difficulty: 'NORMAL', sortId: 5 },
    regulation_3: { type: 'SINGLE', difficulty: 'NORMAL', sortId: 2 },
    regulation_5: { type: 'SINGLE', difficulty: 'HARD', sortId: 4 },
  } };
  assert.equal(officialModeId(ladder, 'solo', 'NORMAL'), 'regulation_3');
  assert.equal(officialModeId(ladder, 'solo', 'HARD'), 'regulation_5');
  assert.equal(officialModeId(ladder, 'coop', 'NORMAL'), null, 'no MULTI mode in this config');
});

test('versionDataDir: a path inside data/ for a registered non-default id, null otherwise', () => {
  assert.equal(versionDataDir('act2autochess'), null, 'the default is data/ itself');
  assert.equal(versionDataDir('nope'), null);
  const dir = versionDataDir('act3autochess@V3_1');
  assert.equal(path.dirname(path.dirname(dir)), DATA_DIR, 'under data/');
  assert.equal(path.basename(dir), 'act3autochess-v3_1');
  assert.ok(!dir.includes('@'), 'the directory is the slug, never the id');
});

test('getVersionData: the default (and an unregistered id) is the process-wide singleton; a version loads once', () => {
  resetVersionData();
  resetData();
  const data = getData({ log: quiet });
  assert.equal(getVersionData('act2autochess', { log: quiet }), data);
  assert.equal(getVersionData(undefined, { log: quiet }), data);
  assert.equal(getVersionData('act1autochess', { log: quiet }), data, 'an id this fork does not register reads the default');
  // 规程's directory arrives with its build (Phase 1); what the layer guarantees now is one frozen load per id
  const first = getVersionData('act3autochess@V3_1', { log: quiet });
  assert.equal(typeof first, 'object');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(getVersionData('act3autochess@V3_1', { log: quiet }), first, 'cached');
  assert.notEqual(first, data, 'never the default singleton');
  resetVersionData();
  resetData();
});
