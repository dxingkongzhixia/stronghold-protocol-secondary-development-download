// test/versions-never-merge.test.js — P6: the fork's never-merge surface (docs/UPSTREAM-MERGES.md §0) stays intact while
// the 规程 version runs beside the covenant. These are source-level guards, not behaviour tests: each one names the
// upstream feature the owner excluded and the one thing a later merge could bring back by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const has = (rel, re) => re.test(read(rel));

test('#149: the bond strip is never foldable, and a deployment never folds the shop / moves the camera', () => {
  const game = read('public/js/screens/game.js');
  for (const word of ['bondsCollapsed', 'bonds-toggle', 'gm__bond-list', 'match-bond-strip', 'deployFoldsShop', 'deployFold']) {
    assert.equal(game.includes(word), false, `${word} is back in game.js`);
  }
});

test('本局禁用: the ban only stops offering a bond; an activated one still takes effect', () => {
  const src = read('server/match/bondsMeta.js');
  assert.equal(/if\s*\(gd\.modeInactiveBonds\.has\(id\)\)\s*continue/.test(src), false, 'an inverted ban rule');
  const compute = /export function computeBonds[\s\S]*?\n}/.exec(src)?.[0] || '';
  assert.ok(compute.length > 0);
  assert.equal(compute.includes('modeInactiveBonds.has'), false, 'computeBonds must count every bond');
  assert.match(compute, /raw\[id\]\s*=\s*rawCount/);
});

test('no recent-alliance chips, no asset download / pack, no deploy fold or auto camera', () => {
  const files = [];
  for (const dir of ['public/js', 'shared', 'server', 'test']) {
    const walk = (rel) => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const p = `${rel}/${e.name}`.split('\\').join('/');
        if (e.isDirectory()) walk(p);
        else if (/\.(js|mjs)$/.test(e.name) && p !== 'test/versions-never-merge.test.js') files.push(p);
      }
    };
    walk(dir);
  }
  for (const f of files) {
    const src = read(f);
    for (const word of ['recentRooms', 'rememberRoom']) assert.equal(src.includes(word), false, `${f}: ${word}`);
    if (f === 'tools/check-upstream.mjs') continue;
    for (const word of ['assetPack', 'assetDownload', '下载完整素材', '导入素材包']) assert.equal(src.includes(word), false, `${f}: ${word}`);
  }
});

test('voices stay Chinese + Japanese: no English / Korean / native tracks in audio.js or the manifest', () => {
  for (const rel of ['public/js/audio.js', 'data/assets.json']) {
    const src = read(rel);
    for (const word of ['voiceEn', 'voiceKr', 'voiceNative']) assert.equal(src.includes(word), false, `${rel}: ${word}`);
  }
});

test('the fork keeps its potential / cultivation default (潜能 1 / 未精英化)', () => {
  assert.match(read('shared/potential.js'), /export const POTENTIAL_DEFAULT = POTENTIAL_MIN;/);
  assert.match(read('shared/potential.js'), /export const CULTIVATE_DEFAULT = 0;/);
});

test('the owner\'s enemy / leader boost layer stays in gamedata', () => {
  const src = read('server/match/gamedata.js');
  for (const word of ['enemyBoost', 'bossBoost', 'bossEnemyScale']) assert.ok(src.includes(word), word);
});

test('a free grant is not a shop purchase: acquireItem gates canGain only under the test switch', () => {
  const src = read('server/match/player/acquire.js');
  const at = src.indexOf('acquireItem(');
  assert.ok(at >= 0);
  const block = src.slice(at, src.indexOf('\n  }', at) + 4);
  assert.match(block, /this\.m\.test === true/);
  assert.match(block, /canGain/);
});

test('the fork keeps its own Clementia (no official operator with the same id)', () => {
  const chess = JSON.parse(read('data/chess.json'));
  const ours = Object.values(chess).filter((c) => c.charId === 'char_4231_clemnt');
  assert.ok(ours.length > 0, 'our 克莱门莎 chess');
  assert.ok(fs.existsSync(path.join(ROOT, 'server/sim/content/kits/ops/op-clemnt.js')));
});

test('the 3D board stays the fork\'s (theme grading + apron), and the title page has no asset pack', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'public/js/render/board3d/theme.js')));
  assert.ok(has('public/js/render/board3d/scene.js', /_buildApron/));
  const title = read('public/js/screens/title.js');
  for (const word of ['assetPack', 'assetDownload', '下载完整素材', '导入素材包']) assert.equal(title.includes(word), false, word);
});
