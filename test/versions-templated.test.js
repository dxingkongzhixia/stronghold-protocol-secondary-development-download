// test/versions-templated.test.js — a templated operator of the 规程 build: the shop row char_002_amiya + tmplId
// char_1037_amiya3 (阿米娅's 医疗 form). tools/build-data.mjs applies the template before buildChess (char_patch_table's
// patchChars is the character record of the template), so the chess is the 医疗 body: its stats, trait, skills, talents,
// module and art are char_1037_amiya3's, while the row's original charId is still the 术师 one in the official table.
// The default 盟约 build has no templated row, so nothing of this touches it (test/backups.test.js pins the default).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../server/data.js';
import { officialKitKey } from '../server/sim/content/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READ = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = loadData(path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1'), { log: quiet });
const chess = (id) => ACT3.chess[id];

test('the 规程 templated chess is built as char_1037_amiya3, its 医疗 body', () => {
  for (const [id, elite] of [['chess_char_5_26_a', false], ['chess_char_5_26_b', true]]) {
    const c = chess(id);
    assert.ok(c, id);
    assert.equal(c.charId, 'char_1037_amiya3', `${id}: the template's charId`);
    assert.equal(c.backup.charId, 'char_1037_amiya3', `${id}: the stand-in is the template too`);
    assert.equal(c.backup.tmplId, null, `${id}: tmplId is applied at build time, not stored`);
    assert.equal(c.backup.skillIndex, 1, `${id}: S2`);
    assert.equal(c.backup.uniEquipId, 'uniequip_002_amiya3', `${id}: the 医疗 module`);
    assert.equal(c.profession, 'MEDIC', `${id}: 咒愈师, not the row's CASTER`);
    assert.equal(c.subProfessionId, 'incantationmedic', id);
    assert.equal(c.subProfessionName, '咒愈师', id);
    assert.deepEqual(c.assets, {
      avatar: elite ? 'char_1037_amiya3_2' : 'char_1037_amiya3',
      portrait: elite ? 'char_1037_amiya3_2' : 'char_1037_amiya3_1',
      spine: 'char_1037_amiya3',
      skillIcon: 'skchr_amiya3_2',
      subProfIcon: 'sub_incantationmedic_icon',
    }, `${id}: art from the template`);
  }
});

test('…and its stats, trait, skills and talents are the template character\'s', () => {
  const a = chess('chess_char_5_26_a'), b = chess('chess_char_5_26_b');
  assert.deepEqual([a.stats.maxHp, a.stats.atk, a.stats.def, a.stats.res, a.stats.cost], [1537, 492, 84, 28, 15]);
  assert.deepEqual([b.stats.maxHp, b.stats.atk, b.stats.def, b.stats.res], [1786, 597, 100, 28]);
  // the incantation trait; the elite's 60 % is the module's override of the template's 50 %
  assert.match(a.trait.desc, /治疗相当于50%伤害的生命值/);
  assert.match(b.trait.desc, /治疗相当于60%伤害的生命值/);
  assert.equal(a.trait.bb.scale, 0.5);
  assert.equal(b.trait.bb.scale, 0.6);
  for (const c of [a, b]) {
    assert.deepEqual(c.skills.map((s) => s.skillId), ['skchr_amiya3_1', 'skchr_amiya3_2'], `${c.chessId}: the 医疗 skills`);
    assert.equal(c.skill.skillId, 'skchr_amiya3_2', `${c.chessId}: S2 is the default`);
    assert.equal(c.skill.name, '慈悲愿景', c.chessId);
    assert.equal(c.skill.index, 1, c.chessId);
    assert.equal(c.talents[0].name, '诚挚期许', `${c.chessId}: the template talent`);
    assert.equal(c.rangeId, '3-3', `${c.chessId}: the 医疗 range, not the 术师 3-1`);
  }
  assert.equal(a.skill.level, 4);
  assert.equal(b.skill.level, 7);
  assert.equal(b.module.id, 'uniequip_002_amiya3');
  assert.equal(b.module.active, true);
  assert.equal(b.statsBase.maxHp, 1686, 'the elite keeps the no-module base');
});

test('the templated preset is still a PRESET: no 补位 unit, and the kit is keyed by the template charId', () => {
  const backups = READ('data/versions/act3autochess-v3_1/backups.json');
  assert.equal(backups.units.char_1037_amiya3, undefined, 'a PRESET fields its own operator');
  assert.equal(backups.units.char_002_amiya, undefined, 'and the 术师 body is not a stand-in of the season');
  for (const id of ['chess_char_5_26_a', 'chess_char_5_26_b']) {
    const c = chess(id);
    assert.equal(c.chessType, 'PRESET', id);
    assert.equal(officialKitKey({ id, baseId: c.baseId, charId: c.charId, tier: c.tier }, ACT3), 'char_1037_amiya3', id);
  }
});

test('the default 盟约 data carries no template: every backup.tmplId is null', () => {
  const chess = READ('data/chess.json');
  assert.deepEqual(Object.values(chess).filter((c) => c.backup?.tmplId).map((c) => c.chessId), []);
});

test('the pinned tables keep the row templated and carry the template in char_patch_table', {
  skip: !existsSync(path.join(ROOT, '.cache', 'gamedata@6f63c14e', 'excel', 'char_patch_table.json')) && 'no pinned cache',
}, () => {
  const act = READ('.cache/gamedata@6f63c14e/excel/activity_table.json').activity.AUTOCHESS.act3autochess.V3_1;
  const row = act.charShopChessDatas.chess_char_5_26_a;
  assert.equal(row.charId, 'char_002_amiya', 'the official row still names the 术师');
  assert.equal(row.tmplId, 'char_1037_amiya3');
  const patch = READ('.cache/gamedata@6f63c14e/excel/char_patch_table.json').patchChars;
  assert.equal(patch.char_1037_amiya3.profession, 'MEDIC', 'char_patch_table holds the template record');
  assert.equal(patch.char_1037_amiya3.subProfessionId, 'incantationmedic');
  assert.ok(!READ('.cache/gamedata@6f63c14e/excel/character_table.json').char_1037_amiya3, 'not in character_table');
});
