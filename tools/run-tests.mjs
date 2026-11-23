#!/usr/bin/env node
// tools/run-tests.mjs — the `npm test` entry. The golden corpus checks (test/golden*.test.js) are skipped here by
// setting SP_SKIP_GOLDEN=1 on the child: the dedicated CI `golden` job and `npm run test:golden` own them. This keeps
// the local suite free of the two long corpus recomputes; `npm run test:fast` still checks the default fast subset.
//
//   npm test                      the suite without the golden corpus checks
//   npm test -- --with-golden     include them
//   TEST_CONCURRENCY=8 npm test   worker count (default 4: the suite's CPU-bound files thrash above that)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withGolden = process.argv.includes('--with-golden') || process.env.SP_TEST_GOLDEN === '1';
const concurrency = Math.max(1, Number(process.env.TEST_CONCURRENCY) || 4);
const extra = process.argv.slice(2).filter((a) => a !== '--with-golden');
const args = [
  '--test', `--test-concurrency=${concurrency}`,
  // A single test over ten minutes is a hang until proven otherwise: fail it with its name instead of waiting forever.
  // (No --test-force-exit here: it turns a test's still-pending promise into a failure — test/ui/morph-bonds.test.js.
  // The browser runners keep it; a whole run that never ends is caught by tools/hang-guard.mjs.)
  '--test-timeout=600000',
  ...extra,
  'test/**/*.test.js', 'test/e2e/coop.e2e.mjs', 'plugins/_template/**/*.test.js',
];
const env = withGolden ? process.env : { ...process.env, SP_SKIP_GOLDEN: '1' };
console.log(`[test] concurrency ${concurrency}${withGolden ? ' (incl. golden)' : ' (golden: npm run test:golden)'}`);
// The runtime skip count, against the 2026-11-23 baseline: informational only (docs/TESTING-PLAN.md WS3). A skip that
// grows is a decision to make in review, not a reason to fail a green suite.
const SKIP_BASELINE = 90;
const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['inherit', 'pipe', 'inherit'] });
let tail = '';
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  tail = (tail + chunk.toString()).slice(-16384);
});
child.on('exit', (code) => {
  const skipped = [...tail.matchAll(/\bskipped (\d+)/g)].pop();
  if (skipped) {
    const n = Number(skipped[1]);
    console.log(`[test] runtime skips: ${n} (baseline ${SKIP_BASELINE}${n > SKIP_BASELINE ? ', ABOVE — a new skip needs a reason' : ''})`);
  }
  process.exit(code ?? 1);
});
