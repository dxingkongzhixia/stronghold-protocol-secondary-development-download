#!/usr/bin/env node
// tools/ci-shards.mjs — how `npm test` is split across CI jobs: every test file belongs to exactly one shard, and the
// shards carry about the same measured time (ci-shards.json holds the weights).
//
//   node tools/ci-shards.mjs --check            the shards' loads and the imbalance; exit 1 above MAX_IMBALANCE
//   node tools/ci-shards.mjs --print <n>        the files of shard n (1-based), one per line
//   node tools/ci-shards.mjs --run <n>          node --test over exactly those files (one CI job, locally)
//   node tools/ci-shards.mjs --list             one line per shard: its file count and load
//   node tools/ci-shards.mjs --write --timings <report.xml>
//                                               re-weigh the table from a JUnit report and write ci-shards.json
//
// The assignment is the same everywhere and every time: no clock, no network, no randomness — sort the files by weight
// (measured milliseconds, `defaultMs` for a file nobody timed), then give each file to the shard that is lightest so
// far, ties to the lowest shard number. A CI job names its own files through this file, and test/ci-shards.test.js
// checks the same split without a runner.
//
// A new test file needs no measurement: it is weighed with `defaultMs` and lands in the lightest shard. A file that has
// grown a lot should be re-measured (`--write --timings`), which test/ci-shards.test.js flags as the shards drift past
// MAX_IMBALANCE.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The table that holds the weights. */
export const TABLE = 'ci-shards.json';

/** How many test jobs one OS runs (ci.yml's matrix `shard`). */
export const SHARD_COUNT = 4;

/** The slowest shard may take this many times the fastest. Past it the split is worth re-measuring. */
export const MAX_IMBALANCE = 1.3;

/** The test files of `npm test`, as ci.yml passes them (node_modules left out, forward slashes, sorted). */
export const TEST_GLOBS = ['test/**/*.test.js', 'test/e2e/coop.e2e.mjs', 'plugins/_template/**/*.test.js'];

const walk = (dir, out) => {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
};

/**
 * Every test file the three globs name, repo-relative with forward slashes, sorted.
 * @param {string} [root]
 * @returns {string[]}
 */
export function testFileList(root = ROOT) {
  const out = [];
  walk(path.join(root, 'test'), out);
  walk(path.join(root, 'plugins', '_template'), out);
  return [...new Set(out)]
    .map((p) => path.relative(root, p).split(path.sep).join('/'))
    .filter((f) => f.endsWith('.test.js') || f === 'test/e2e/coop.e2e.mjs')
    .sort();
}

/**
 * ci-shards.json: the shard count, the weight of a file nobody timed, and the measured weights.
 * @param {string} [root]
 * @returns {{ shards: number, defaultMs: number, measured: Record<string, number> }}
 */
export function loadTable(root = ROOT) {
  const table = JSON.parse(fs.readFileSync(path.join(root, TABLE), 'utf8'));
  if (table.shards !== SHARD_COUNT) throw new Error(`${TABLE}: ${table.shards} shards, but ci.yml runs ${SHARD_COUNT}`);
  if (!(table.defaultMs > 0)) throw new Error(`${TABLE}: defaultMs must be a positive number`);
  return table;
}

/**
 * The files of every shard, as `SHARD_COUNT` arrays (shard 0 first). Greedy longest-first, ties to the lowest shard.
 * @param {string[]} files
 * @param {{ defaultMs: number, measured: Record<string, number> }} table
 * @returns {string[][]}
 */
export function shardsOf(files, table) {
  const shards = Array.from({ length: SHARD_COUNT }, () => []);
  const loads = new Array(SHARD_COUNT).fill(0);
  const weight = (f) => (Number.isFinite(table.measured[f]) ? table.measured[f] : table.defaultMs);
  const sorted = [...files].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0));
  for (const f of sorted) {
    let best = 0;
    for (let i = 1; i < SHARD_COUNT; i++) if (loads[i] < loads[best]) best = i;
    shards[best].push(f);
    loads[best] += weight(f);
  }
  for (const s of shards) s.sort();
  return shards;
}

/** Each shard's total weight. */
export const loadsOf = (shards, table) =>
  shards.map((s) => s.reduce((n, f) => n + (Number.isFinite(table.measured[f]) ? table.measured[f] : table.defaultMs), 0));

/**
 * The JUnit report's per-file test time: `<testcase … time="1.2"` summed under its file. Node's reporter names the file
 * in `classname` ("test/x.test.js") and, for a file without a suite, in `name` — both forms are read.
 * @param {string} xml
 * @returns {Record<string, number>}
 */
export function perFileMs(xml) {
  /** @type {Record<string, number>} */
  const out = {};
  const norm = (s) => {
    const f = String(s).replace(/\\/g, '/');
    const root = `${ROOT.replace(/\\/g, '/')}/`;
    return (f.startsWith(root) ? f.slice(root.length) : f).replace(/^\.\//, '');
  };
  const fileOf = (attrs) => {
    // node's reporter writes the file as `file="…\test\a.test.js"`; older shapes put it in classname or name
    const pick = (s) => (/\.(?:test\.js|e2e\.mjs)$/.test(s) ? s : '');
    return pick(/\bfile="([^"]+)"/.exec(attrs)?.[1] ?? '')
      || pick(/classname="([^"]+)"/.exec(attrs)?.[1] ?? '')
      || pick(/name="([^"]+)"/.exec(attrs)?.[1] ?? '');
  };
  for (const m of xml.matchAll(/<testcase\b([^>]*)>/g)) {
    const file = fileOf(m[1]);
    if (!file) continue;
    const ms = Number(/\btime="([\d.]+)"/.exec(m[1])?.[1]);
    if (Number.isFinite(ms)) out[norm(file)] = (out[norm(file)] || 0) + Math.round(ms * 1000);
  }
  return out;
}

/**
 * The table written from a JUnit report: the measured files' milliseconds, any other file at `defaultMs`.
 * @param {Record<string, number>} measured
 * @param {string[]} files
 * @param {number} [defaultMs]
 */
export function tableFrom(measured, files, defaultMs = 250) {
  const known = {};
  for (const f of files) if (Number.isFinite(measured[f]) && measured[f] > 0) known[f] = measured[f];
  return { shards: SHARD_COUNT, defaultMs, measured: known };
}

/** The golden corpus checks run in their own CI job (`npm run test:golden`), not in the four test shards. */
export const GOLDEN_LANE = Object.freeze([
  'test/golden.test.js', 'test/golden-versions.test.js', 'test/golden-diy.test.js', 'test/golden-standins.test.js',
]);

const isMain = import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('ci-shards.mjs');
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const files = testFileList();
  const shardFiles = files.filter((f) => !GOLDEN_LANE.includes(f));
  const tableOrNull = () => { try { return loadTable(); } catch { return null; } };
  if (argv.includes('--check')) {
    const table = loadTable();
    const shards = shardsOf(shardFiles, table);
    const loads = loadsOf(shards, table);
    const slow = Math.max(...loads), fast = Math.min(...loads);
    const imbalance = fast > 0 ? slow / fast : Infinity;
    loads.forEach((ms, i) => console.log(`shard ${i + 1}: ${shards[i].length} files, ${(ms / 1000).toFixed(1)} s`));
    console.log(`golden lane: ${GOLDEN_LANE.length} files (npm run test:golden)`);
    console.log(`imbalance ${imbalance.toFixed(2)} (max ${MAX_IMBALANCE})`);
    if (imbalance > MAX_IMBALANCE) process.exit(1);
  } else if (opt('--print')) {
    const n = Number(opt('--print'));
    const shards = shardsOf(shardFiles, loadTable());
    if (!(n >= 1 && n <= SHARD_COUNT)) { console.error(`--print: shard 1..${SHARD_COUNT}`); process.exit(2); }
    for (const f of shards[n - 1]) console.log(f);
  } else if (opt('--run')) {
    const n = Number(opt('--run'));
    const shards = shardsOf(shardFiles, loadTable());
    if (!(n >= 1 && n <= SHARD_COUNT)) { console.error(`--run: shard 1..${SHARD_COUNT}`); process.exit(2); }
    const child = spawn(process.execPath, ['--test', '--test-concurrency=4', ...shards[n - 1]], { stdio: 'inherit', cwd: ROOT });
    child.on('exit', (code) => process.exit(code ?? 1));
  } else if (argv.includes('--list')) {
    for (const [i, s] of shardsOf(shardFiles, loadTable()).entries()) console.log(`shard ${i + 1}: ${s.length} files`);
  } else if (argv.includes('--write')) {
    const timings = opt('--timings');
    if (!timings) { console.error('--write needs --timings <report.xml>'); process.exit(2); }
    const measured = perFileMs(fs.readFileSync(timings, 'utf8'));
    const next = tableFrom(measured, files, tableOrNull()?.defaultMs ?? 250);
    fs.writeFileSync(path.join(ROOT, TABLE), `${JSON.stringify(next, null, 1)}\n`);
    console.log(`${TABLE}: ${Object.keys(next.measured).length} files weighed`);
  } else {
    console.error('usage: node tools/ci-shards.mjs --check | --print <n> | --run <n> | --list | --write --timings <report.xml>');
    process.exit(2);
  }
}
