#!/usr/bin/env node
// tools/run-tests.mjs — the `npm test` entry. The golden corpus checks (test/golden*.test.js) are skipped here by
// setting SP_SKIP_GOLDEN=1 on the child: the dedicated CI `golden` job and `npm run test:golden` own them. This keeps
// the local suite free of the two long corpus recomputes; `npm run test:fast` still checks the default fast subset.
//
//   npm test                      the suite without the golden corpus checks
//   npm test -- --with-golden     include them
//   TEST_CONCURRENCY=8 npm test   worker count (default 4: the suite's CPU-bound files thrash above that)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withGolden = process.argv.includes('--with-golden') || process.env.SP_TEST_GOLDEN === '1';
const concurrency = Math.max(1, Number(process.env.TEST_CONCURRENCY) || 4);
const extra = process.argv.slice(2).filter((a) => a !== '--with-golden');
const args = [
  '--test', `--test-concurrency=${concurrency}`, ...extra,
  'test/**/*.test.js', 'test/e2e/coop.e2e.mjs', 'plugins/_template/**/*.test.js',
];
const env = withGolden ? process.env : { ...process.env, SP_SKIP_GOLDEN: '1' };
console.log(`[test] concurrency ${concurrency}${withGolden ? ' (incl. golden)' : ' (golden: npm run test:golden)'}`);
const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT, env });
process.exit(r.status ?? 1);
