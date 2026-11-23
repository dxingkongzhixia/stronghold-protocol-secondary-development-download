#!/usr/bin/env node
// tools/coverage.mjs — the coverage trend for the engine + shared code (docs/TESTING.md §7.2, docs/TESTING-PLAN.md WS3).
//
//   npm run coverage
//
// Scope: `test/sim/` + `test/content/` only, with the report filtered to `server/sim/**` + `shared/**`. It is a trend,
// not a gate — no thresholds. `test/sim/robustness.test.js` is excluded on purpose: its budgets are wall-clock
// milliseconds, and coverage instrumentation slows every tick enough to fail them (measured 0.62 vs 0.55 ms/tick), so a
// red there says nothing about the code. Pass `--keep-perf` to include it anyway.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERF = ['test/sim/robustness.test.js'];
const keepPerf = process.argv.includes('--keep-perf');

/** @param {string} rel @param {string[]} out */
function walk(rel, out) {
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const next = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(next, out);
    else if (e.name.endsWith('.test.js')) out.push(next);
  }
  return out;
}

const files = [...walk('test/sim', []), ...walk('test/content', [])]
  .filter((f) => keepPerf || !PERF.includes(f));
if (!files.length) {
  console.error('[coverage] no test files found');
  process.exit(2);
}
const args = [
  '--test', '--test-concurrency=4', '--test-timeout=600000', '--experimental-test-coverage',
  '--test-coverage-include=server/sim/**', '--test-coverage-include=shared/**',
  ...files,
];
console.log(`[coverage] ${files.length} files${keepPerf ? ' (incl. perf)' : ' (perf test excluded)'}; report: server/sim + shared`);
const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
process.exit(r.status ?? 1);
