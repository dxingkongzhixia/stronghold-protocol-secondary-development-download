// test/golden-versions.test.js — 规程's golden corpus (test/golden/act3autochess-v3_1/*.json): generated on THIS tree
// (not copied from the mainline: the engine, operator kits and damage formulas differ) by
//   node tools/golden.mjs --version act3autochess@V3_1 --update
// and recomputed here over the fast subset. The default 盟约 corpus (test/golden/*.json) is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'test', 'golden', 'act3autochess-v3_1');
const FAMILIES = ['roster', 'bonds', 'fields', 'matches', 'standins', 'diy'];

test('the regulation corpus has its six golden files, self-labelled and free of engine errors', () => {
  for (const f of FAMILIES) {
    const doc = JSON.parse(readFileSync(path.join(DIR, `${f}.json`), 'utf8'));
    assert.equal(doc.family, f);
    assert.equal(doc.version, 'act3autochess@V3_1', `${f}: version`);
    assert.ok(Object.keys(doc.scenarios).length > 0, `${f}: scenarios`);
    for (const [id, d] of Object.entries(doc.scenarios)) {
      const errs = d.errors || {};
      const total = typeof errs.count === 'number' ? errs.count : Object.values(errs).reduce((n, v) => n + (typeof v === 'number' ? v : 0), 0);
      assert.equal(total, 0, `${f}/${id}: ${JSON.stringify(errs)}`);
    }
  }
});

test('the regulation corpus recomputes to its stored digests (fast subset)', () => {
  const r = spawnSync(process.execPath,
    ['tools/golden.mjs', '--version', 'act3autochess@V3_1', '--fast', '--jobs', '4'],
    { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  for (const f of FAMILIES) assert.match(r.stdout, new RegExp(`golden ${f}: \\d+ scenarios match`), `${f}: ${r.stdout}`);
});
