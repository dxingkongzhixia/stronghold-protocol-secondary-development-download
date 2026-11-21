// test/ci-shards.test.js — the CI split (tools/ci-shards.mjs): every test file in exactly one shard, the same split on
// every machine, loads within MAX_IMBALANCE, and the table's weights coming from a JUnit report. Adapted from the
// mainline's shard tooling (read-only reference).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARD_COUNT, MAX_IMBALANCE, GOLDEN_LANE, testFileList, loadTable, shardsOf, loadsOf, perFileMs, tableFrom } from '../tools/ci-shards.mjs';

/** The sharded suite: everything except the golden corpus lane (its own CI job and `npm run test:golden`). */
const shardable = () => testFileList().filter((f) => !GOLDEN_LANE.includes(f));

test('the shards partition the suite: every file once, none invented', () => {
  const all = testFileList();
  for (const f of GOLDEN_LANE) assert.ok(all.includes(f), `golden lane file ${f} exists`);
  const files = shardable();
  assert.ok(files.length > 500, `the suite has ${files.length} test files`);
  assert.ok(files.includes('test/e2e/coop.e2e.mjs'), 'the explicit e2e file is a file like the globs');
  assert.ok(files.every((f) => !f.includes('\\')), 'forward slashes');
  const shards = shardsOf(files, loadTable());
  assert.equal(shards.length, SHARD_COUNT);
  const seen = shards.flat();
  assert.equal(seen.length, files.length, 'no file in two shards');
  assert.deepEqual([...seen].sort(), [...files].sort());
  for (const s of shards) assert.ok(s.length > 0, 'no empty shard');
});

test('the split is deterministic: the same files and weights give the same shards', () => {
  const files = shardable();
  const table = loadTable();
  assert.deepEqual(shardsOf(files, table), shardsOf([...files].reverse(), table));
});

test('the table is in date and the shards are balanced', () => {
  const table = loadTable();
  assert.equal(table.shards, SHARD_COUNT);
  assert.ok(table.defaultMs > 0);
  const files = shardable();
  const loads = loadsOf(shardsOf(files, table), table);
  const imbalance = Math.max(...loads) / Math.min(...loads);
  assert.ok(imbalance <= MAX_IMBALANCE,
    `shards drifted to ${imbalance.toFixed(2)}× — re-measure: node tools/ci-shards.mjs --write --timings <report.xml>`);
  // every measured file is a test file of this suite (a renamed or deleted file would inflate the table silently)
  const known = new Set(testFileList());
  for (const f of Object.keys(table.measured)) assert.ok(known.has(f), `stale table entry ${f}`);
});

test('perFileMs: sums the JUnit cases by their file, both classname and name forms', () => {
  const xml = [
    '<testsuites><testsuite name="test/a.test.js">',
    '<testcase name="one" classname="test/a.test.js" time="0.25"/>',
    '<testcase name="two" classname="test/a.test.js" time="0.5"/>',
    '</testsuite><testsuite name="test/b.test.js">',
    '<testcase name="three" classname="test/b.test.js" time="1.75"/>',
    '</testsuite><testsuite name="test/c.test.js">',
    '<testcase name="test/c.test.js" time="0.001"/>',
    '</testsuite></testsuites>',
  ].join('');
  assert.deepEqual(perFileMs(xml), { 'test/a.test.js': 750, 'test/b.test.js': 1750, 'test/c.test.js': 1 });
});

test('tableFrom: a file nobody timed weighs defaultMs; a rename keeps only known files', () => {
  const files = ['test/a.test.js', 'test/b.test.js'];
  const table = tableFrom({ 'test/a.test.js': 4000, 'test/gone.test.js': 9000 }, files, 300);
  assert.deepEqual(table, { shards: SHARD_COUNT, defaultMs: 300, measured: { 'test/a.test.js': 4000 } });
  const loads = loadsOf(shardsOf(files, table), table);
  assert.deepEqual([...loads].sort((a, b) => a - b), [0, 0, 300, 4000], 'two files on four shards: the heavy one alone');
});
