#!/usr/bin/env node
// tools/e2e-assets.mjs — the local asset-backed browser E2E lane: the room / match suites that need the 720 MB art
// pack and a real server (they are NOT part of `npm test` nor of the CI gates; the CI smoke uses mock pages only).
//
//   npm run test:e2e:assets                 the five maintained suites (standin, spectator, teammate-loadout,
//                                           leftovers, watch-bonds), one file at a time
//   npm run test:e2e:assets -- --native     also the heavy native-room lane (SP_NATIVE_E2E=1, 3–8 min a file)
//   CHROME_PATH=… npm run test:e2e:assets   an explicit Chrome (else the platform default)
//
// Each file runs in its own Node process with --test-timeout=600000 and --test-force-exit; the wall clock per file is
// capped (25 min) by tools/hang-guard.mjs semantics: a run past it is stopped and reported, never left spinning.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { resolveChrome } = await import(path.join(ROOT, 'tools', 'browser-smoke.mjs'));

const FILES = [
  'test/ui/standin.e2e.test.js',
  'test/ui/spectator.e2e.test.js',
  'test/ui/teammate-loadout.e2e.test.js',
  'test/ui/leftovers.e2e.test.js',
  'test/ui/watch-bonds.e2e.test.js',
];
const NATIVE = ['test/ui/native-room.e2e.test.js', 'test/ui/native-room-bench.e2e.test.js', 'test/ui/native-room-fallback.e2e.test.js'];
const withNative = process.argv.includes('--native');
const chrome = resolveChrome();
if (!chrome) {
  console.error('[e2e-assets] no Chrome found: set CHROME_PATH');
  process.exit(2);
}
const env = { ...process.env, CHROME_PATH: chrome, SP_E2E: '1', ...(withNative ? { SP_NATIVE_E2E: '1' } : {}) };
const suites = [...FILES, ...(withNative ? NATIVE : [])];
const results = [];
for (const file of suites) {
  console.log(`\n[e2e-assets] ${file}`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-timeout=600000', '--test-force-exit', '--test-reporter=spec', file],
    { stdio: 'inherit', cwd: ROOT, env, timeout: 25 * 60 * 1000 });
  const sec = Math.round((Date.now() - t0) / 1000);
  const ok = r.status === 0;
  results.push({ file, ok, sec, status: r.status });
  if (r.error && r.error.code === 'ETIMEDOUT') console.error(`[e2e-assets] HANG: ${file} exceeded 25 min — stopped`);
}
console.log('\n[e2e-assets] summary');
for (const x of results) console.log(`  ${x.ok ? 'PASS' : 'FAIL'} ${String(x.sec).padStart(4)}s  ${x.file}`);
process.exit(results.every((x) => x.ok) ? 0 : 1);
