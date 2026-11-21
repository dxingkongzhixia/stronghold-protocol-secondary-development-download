#!/usr/bin/env node
// tools/test-fast.mjs — the local fast gate (batch C, test-system plan #2): every pure-logic, docs, i18n, economy,
// version-data and golden-fast test that a change to these areas touches, in one run. Target: ≤ 2 minutes.
//
//   npm run test:fast                  run test/fast.list
//   npm run test:fast -- --test-name-pattern "settings"   extra node --test flags are forwarded
//
// The list is curated, not automatic: add a file when a new subsystem's fast checks exist. The full suite and the
// shards stay the authority for CI and publishing (npm test / npm run test:shard -- <n>).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = path.join(ROOT, 'test', 'fast.list');
const files = fs.readFileSync(LIST, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error(`[test:fast] missing file(s) in test/fast.list:\n  ${missing.join('\n  ')}`);
  process.exit(2);
}
const started = Date.now();
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...process.argv.slice(2), ...files], {
  stdio: 'inherit', cwd: ROOT,
});
console.log(`[test:fast] ${files.length} files in ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(r.status ?? 1);
