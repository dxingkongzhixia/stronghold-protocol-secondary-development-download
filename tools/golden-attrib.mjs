#!/usr/bin/env node
// tools/golden-attrib.mjs — prove that the golden move in the working tree is caused by YOUR change, not by an older drift.
//
// The rule (docs/TESTING.md §4): a sim change that moves test/golden/*.json must be attributed — revert only that change
// and the stored corpus must match byte for byte. This tool runs that experiment without hand-editing:
//
//   node tools/golden-attrib.mjs                       # attribute the changes under server/sim
//   node tools/golden-attrib.mjs --paths server/sim,shared
//   node tools/golden-attrib.mjs --version act3autochess@V3_1
//
// It expects the tree to be in the post-recompute state: test/golden already regenerated (`node tools/golden.mjs
// --update`) and the code change uncommitted. Steps:
//   1. save the regenerated golden diff;  2. restore test/golden from HEAD;
//   3. stash ONLY --paths, run golden → must match (the baseline was green);
//   4. restore your paths and the golden diff, run golden → must mismatch (your change is the only variable).
// Any failure pops the stash and re-applies the golden diff before exiting.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('usage: node tools/golden-attrib.mjs [--paths server/sim,shared] [--version <id>]');
  process.exit(0);
}
const paths = (opt('--paths', 'server/sim') || '').split(',').map((s) => s.trim()).filter(Boolean);
const version = opt('--version', null);

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const golden = (label) => {
  const args = ['tools/golden.mjs', ...(version ? ['--version', version] : [])];
  console.log(`\n[attrib] ${label}: node ${args.join(' ')}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  console.log(out.trim().split('\n').slice(-6).map((l) => '  ' + l).join('\n'));
  return r.status;
};

let patch = null;
let stashed = false;
const recover = () => {
  try { if (stashed) { git('stash', 'pop'); stashed = false; } } catch (err) { console.error('[attrib] stash pop failed:', err.message); }
  try { if (patch && fs.existsSync(patch)) { git('apply', patch); fs.rmSync(patch, { force: true }); } } catch (e) { console.error('[attrib] re-applying the golden diff failed:', e.message); }
};

try {
  const dirtyGolden = git('status', '--porcelain', '--', 'test/golden').trim();
  if (!dirtyGolden) {
    console.error('[attrib] test/golden has no changes: regenerate it first (node tools/golden.mjs --update)');
    process.exit(2);
  }
  patch = path.join(os.tmpdir(), `sp-golden-attrib-${process.pid}.patch`);
  fs.writeFileSync(patch, git('diff', '--binary', '--', 'test/golden'), 'utf8');
  console.log(`[attrib] saved the regenerated golden diff (${paths.join(', ')} reverted next)`);

  git('checkout', 'HEAD', '--', 'test/golden');
  try {
    git('stash', 'push', '-m', `golden-attrib ${process.pid}`, '--', ...paths);
    stashed = true;
  } catch {
    console.error(`[attrib] nothing to stash under ${paths.join(', ')} — pass --paths with your change`);
    process.exit(2);
  }
  const base = golden('baseline (only your change reverted)');
  if (base !== 0) {
    console.error('\n[attrib] FAIL: the stored corpus does not match without your change — the drift is not yours.');
    recover();
    process.exit(1);
  }

  git('stash', 'pop');
  stashed = false;
  git('apply', patch);
  fs.rmSync(patch, { force: true });
  patch = null;
  const after = golden('with your change');
  if (after === 0) {
    console.error('\n[attrib] FAIL: golden still matches with your change — the saved diff does not move it.');
    process.exit(1);
  }
  console.log('\n[attrib] OK: baseline matches without the change, mismatches with it — the move is attributed.');
  process.exit(0);
} catch (e) {
  console.error('[attrib] error:', e?.message || e);
  recover();
  process.exit(1);
}
