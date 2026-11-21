// server/studio/targets.js — what a cosmetic plugin can change, found by its official name (DESIGN §32.9,
// docs/PLUGINS.md §15). Pure data: a small handcrafted install, no server, no Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TARGET_KINDS, buildTargets, createTargetIndex, searchTargets, targetOf, targetSpec,
} from '../../server/studio/targets.js';

const data = {
  chess: {
    c1: { charId: 'char_1', name: '德克萨斯', appellation: '凛冬', visible: true },
    c1b: { charId: 'char_1', name: '德克萨斯', appellation: '凛冬', visible: true }, // the same operator again
    c2: { charId: 'char_2', name: '能天使', isGolden: true },
    c3: { charId: 'char_3', name: '隐秘', isHidden: true },
    c4: { charId: 'char_4', name: '不可见', visible: false },
  },
  backups: {
    units: { char_9: { name: '补位干员', appellation: '补' } },
    tokens: { tok_2: { tokenId: 'tok_2', name: '备用器械' } },
  },
  tokens: { tok_1: { tokenId: 'tok_1', name: '战术点', appellation: '点' } },
  enemies: { e1: { key: 'enemy_1', name: '猎狗' } },
  items: { i1: { name: '药剂', iconId: 'item_1' }, i2: { name: '金道具', iconId: 'item_2', isGolden: true } },
  bonds: { b1: { bondId: 'b1', name: '奥术' } },
  bands: { band1: { bandId: 'band1', name: '战术决策' } },
};
const manifest = {
  chars: { char_1: { avatar: 'ui/char_1.png' }, char_9: { avatar: 'ui/char_9.png' } },
  tokens: { tok_1: { avatar: 'ui/tok_1.png' } },
  enemies: { enemy_1: { icon: 'ui/enemy_1.png' } },
  items: { item_1: 'ui/item_1.png' },
  bonds: { b1: 'ui/b1.png' },
  bands: { band1: 'ui/band1.png' },
  ui: { 'room/bg': 'ui/room.png' },
  audio: { bgm: { lobby: {}, combat: {} }, bossBgm: { boss_1: {} }, sfx: { ui: { click: {} }, battle: { hit: {} } } },
};
const all = buildTargets(data, manifest);
const find = (kind, key) => all.find((t) => t.kind === kind && t.key === key);

test('buildTargets: operators once per charId (visible chess + backups), golden / hidden / invisible excluded', () => {
  const ops = all.filter((t) => t.kind === 'operator');
  assert.deepEqual(ops.map((t) => t.key).sort(), ['char_1', 'char_9']);
  assert.equal(find('operator', 'char_1').name, '德克萨斯');
  assert.equal(find('operator', 'char_1').icon, 'ui/char_1.png');
  assert.match(find('operator', 'char_1').alt, /凛冬/);
  assert.equal(find('operator', 'char_2'), undefined, 'a golden record is not an operator target');
  assert.equal(find('operator', 'char_9').name, '补位干员', 'a 补位 / 自选 operator from backups.json');
});

test('buildTargets: tokens, enemies, items, bonds, bands, ui pictures, music tracks and sounds', () => {
  assert.equal(find('token', 'tok_1').name, '战术点');
  assert.equal(find('token', 'tok_2').name, '备用器械');
  assert.equal(find('enemy', 'enemy_1').icon, 'ui/enemy_1.png');
  assert.equal(find('item', 'item_1').name, '药剂');
  assert.equal(find('item', 'item_1').icon, 'ui/item_1.png');
  assert.equal(find('item', 'item_2'), undefined, 'a golden item is skipped');
  assert.equal(find('bond', 'b1').name, '奥术');
  assert.equal(find('band', 'band1').name, '战术决策');
  assert.equal(find('ui', 'room/bg').icon, 'ui/room.png');
  assert.deepEqual(all.filter((t) => t.kind === 'music').map((t) => [t.key, t.group]).sort(), [['boss_1', 'bossBgm'], ['combat', 'bgm'], ['lobby', 'bgm']]);
  assert.deepEqual(all.filter((t) => t.kind === 'sound').map((t) => [t.key, t.group]).sort(), [['click', 'ui'], ['hit', 'battle']]);
  assert.ok(all.every((t) => t.name && t.container.length && 'icon' in t && 'alt' in t));
});

test('buildTargets: an empty or broken data folder yields nothing rather than throwing', () => {
  assert.deepEqual(buildTargets({}, null), []);
  assert.deepEqual(buildTargets({ chess: 'nope', tokens: [] }, { chars: [] }), []);
});

test('searchTargets: exact, then prefix, then inside, then the other names; operators first at the same rank', () => {
  assert.equal(searchTargets(all, '德克萨斯')[0].key, 'char_1');
  assert.equal(searchTargets(all, '德克')[0].key, 'char_1');
  assert.equal(searchTargets(all, '克萨')[0].key, 'char_1');
  assert.equal(searchTargets(all, '凛冬')[0].key, 'char_1', 'the appellation is an alt name');
  assert.equal(searchTargets(all, 'enemy_1')[0].key, 'enemy_1', 'an id matches too');
  assert.deepEqual(searchTargets(all, '战术点').map((t) => t.key), ['tok_1']);
  // the middle dot and spaces are ignored, case too
  assert.equal(searchTargets(all, '战 术·决 策')[0].key, 'band1');
  // an exact enemy name beats an operator whose alt merely contains the text
  assert.equal(searchTargets(all, '猎狗')[0].kind, 'enemy');
  // kinds filter and limit
  assert.deepEqual(searchTargets(all, '', { kinds: ['music'] }).map((t) => t.kind), ['music', 'music', 'music']);
  assert.equal(searchTargets(all, '', { limit: 3 }).length, 3);
  assert.deepEqual(searchTargets(all, 'zzz'), []);
});

test('searchTargets: an empty query lists the targets in the picker\'s kind order', () => {
  const kinds = searchTargets(all, '').map((t) => t.kind);
  const order = Object.keys(TARGET_KINDS);
  assert.equal(kinds[0], 'operator');
  const firstSeen = [...new Set(kinds)];
  assert.deepEqual(firstSeen, order.filter((k) => firstSeen.includes(k)));
});

test('targetOf / targetSpec: <kind>:<key>, a bare key, an unknown kind is a bare key, and no match is null', () => {
  assert.equal(targetOf(all, 'operator:char_1').key, 'char_1');
  assert.equal(targetOf(all, 'char_1').key, 'char_1');
  assert.equal(targetOf(all, 'nope:char_1'), null, 'an unknown prefix is part of the key (nothing matches)');
  assert.equal(targetOf(all, 'enemy:char_1'), null);
  assert.equal(targetOf(all, ''), null);
  assert.equal(targetOf(all, 'operator:nothing'), null);
  for (const t of all) assert.equal(targetOf(all, targetSpec(t)), t);
});

test('createTargetIndex: reads the folder once, keeps the same state while the files are unchanged, rebuilds on a change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-studio-targets-'));
  fs.writeFileSync(path.join(dir, 'chess.json'), JSON.stringify(data.chess));
  fs.writeFileSync(path.join(dir, 'assets.json'), JSON.stringify(manifest));
  const index = createTargetIndex(dir);
  const a = index();
  assert.ok(a.targets.some((t) => t.key === 'char_1'));
  assert.equal(index(), a, 'the same object until a file changes');
  fs.writeFileSync(path.join(dir, 'enemies.json'), JSON.stringify({ e2: { key: 'enemy_2', name: '源石虫' } }));
  const b = index();
  assert.notEqual(b, a);
  assert.ok(b.targets.some((t) => t.key === 'enemy_2'));
});
