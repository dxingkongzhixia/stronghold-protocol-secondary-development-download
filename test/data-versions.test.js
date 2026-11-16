// test/data-versions.test.js — the 规程 build (tools/build-data.mjs --version act3autochess@V3_1): the committed
// data/versions/act3autochess-v3_1/ is exactly what the builder emits from the pinned gamedata cache, and it carries
// the season's counts with 19×21 regulation stages. The pin cache is machine-local (gitignored); without it the
// rebuild test is skipped, like the mainline's data-versions test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIN = path.join(ROOT, '.cache', 'gamedata@6f63c14e');
const havePin = existsSync(path.join(PIN, 'excel', 'activity_table.json'))
  && existsSync(path.join(PIN, 'excel', 'char_patch_table.json')); // the 规程 template operator (阿米娅·医疗) lives there
const DATA = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const json = (name) => JSON.parse(readFileSync(path.join(DATA, `${name}.json`), 'utf8'));

test('the 规程 data is exactly a rebuild from the pinned gamedata', { skip: !havePin && 'no .cache/gamedata@6f63c14e' }, () => {
  const out = mkdtempSync(path.join(tmpdir(), 'sp-act3-'));
  try {
    const r = spawnSync(process.execPath, ['tools/build-data.mjs', '--version', 'act3autochess@V3_1', '--cache', PIN,
      '--offline', '--quiet', '--out', out, '--report', path.join(out, 'build-report.json')], { cwd: ROOT, encoding: 'utf8', timeout: 600_000 });
    assert.equal(r.status, 0, r.stderr);
    const files = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort();
    assert.ok(files.length >= 15, `${files.length} files`);
    for (const f of files) {
      assert.equal(readFileSync(path.join(out, f), 'utf8'), readFileSync(path.join(DATA, f), 'utf8'), `${f} differs from a rebuild`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the 规程 data carries the tuning result-title rules, not the covenant boost', () => {
  const tuning = json('tuning');
  const shared = JSON.parse(readFileSync(path.join(ROOT, 'data', 'tuning.json'), 'utf8'));
  assert.equal(tuning.boost, undefined, 'the owner\'s 盟约 difficulty layer never reaches another official version');
  assert.deepEqual(tuning.titles, shared.titles, 'the result-title rules are the shared ones');
});

test('the 规程 item pools only name items of this version; 凯瑟琳 and 娜仁图亚 are uncapped', () => {
  const choices = json('choices');
  const items = json('items');
  assert.equal(choices.pools.pool_equip_kathe.also, undefined, 'no act2-only 突变细胞 in a 规程 pool');
  assert.equal(choices.pools.pool_equip_narant.maxTier, undefined, 'the blackboard names no tier cap');
  for (const [id, p] of Object.entries(choices.pools)) {
    if (p.kind !== 'equip') continue;
    for (const itemId of [...(p.items || []), ...(p.also || [])]) assert.ok(items[itemId], `${id}: ${itemId} is not a 规程 item`);
  }
});

test('the 规程 data carries the season counts and 19×21 stages', () => {
  const count = (name) => Object.keys(json(name)).length;
  assert.equal(count('chess'), 310);
  assert.equal(count('bonds'), 26);
  assert.equal(count('bands'), 61);
  assert.equal(count('items'), 116);
  assert.equal(count('choices'), 9);
  assert.equal(count('garrisons'), 334);
  assert.equal(count('tokens'), 34);
  assert.equal(count('stages'), 12);
  assert.equal(count('effects'), 465);
  assert.equal(count('bosses'), 16);
  const visible = Object.values(json('chess')).filter((c) => !c.isGolden && c.visible).length;
  assert.equal(visible, 141);
  const stages = json('stages');
  for (const id of ['act3autochess_m01', 'act3autochess_m02', 'act3autochess_m03', 'act3autochess_m04', 'act3autochess_m05',
    'act3autochess_m06', 'act3autochess_m09', 'act3autochess_m10', 'act3autochess_m11', 'act3autochess_m12']) {
    assert.deepEqual(stages[id]?.size, [19, 21], `${id} is the 19×21 board`);
  }
  const config = json('config');
  assert.equal(config.season, 'act3autochess');
  assert.equal(config.hiddenCore.single, 350);
  assert.equal(config.hiddenCore.multi, 1200);
  assert.equal(Object.keys(config.modes).length, 26);
});
