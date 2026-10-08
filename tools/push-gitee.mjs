#!/usr/bin/env node
// tools/push-gitee.mjs — commit the dev tree into the git store and push it to Gitee (docs/AI-WORKFLOW.md §commit/push).
//
// The working project (`Stronghold-Protocol`) has NO `.git`: it is the single source of truth for the files on disk.
// The full history lives in the sibling git store `_merge-scratch` (branch `ours`). This helper mirrors the dev tree
// into that store (tracked files only — `git ls-files`, so `.gitignore` is respected: `node_modules`, `.cache`,
// `.venv-extract`, `__pycache__`, `test/e2e/out`, `public/assets`, `public/fonts`, `public/vendor`, `logs`, `var`,
// `data/local-assets.json` are never copied), commits, and pushes the store's HEAD to the Gitee remote.
//
// The owner's convention: "之后每次有更新都提交下" — after every change, run this so the Gitee copy tracks the dev tree.
//
// Usage (run from either tree; defaults are derived from the script location, overridable by env):
//   node tools/push-gitee.mjs                     # sync + commit + push to `gitee` branch `master`
//   node tools/push-gitee.mjs -m "message"        # explicit commit message (default: dated summary)
//   node tools/push-gitee.mjs --branch main       # push to another remote branch
//   node tools/push-gitee.mjs --dry-run           # show what would change, copy/stage/commit/push nothing
//   node tools/push-gitee.mjs --no-push           # sync + commit locally, skip the push
//   SP_DEV_TREE=<dir> SP_SCRATCH=<dir> node tools/push-gitee.mjs
//
// Credentials: the Gitee URL carries none. A push needs a Gitee username + personal access token. Supply them with a
// credential helper (`git config --global credential.helper manager`, then let it prompt once), or store them
// (Windows Credential Manager / `~/.git-credentials`), or set `GIT_USERNAME` + `GIT_PASSWORD`/`GITEE_TOKEN` for this
// run. Never write the token into the repository.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_ROOT = resolve(HERE, '..');                 // <repo>/tools/.. = the checkout this script lives in
const PARENT = dirname(SELF_ROOT);
const NAME = basename(SELF_ROOT).toLowerCase();

/** The dev tree (files on disk) and the git store (history), derived from the script location or the environment. */
const DEV_ROOT = process.env.SP_DEV_TREE
  ? resolve(process.env.SP_DEV_TREE)
  : (NAME === '_merge-scratch' ? join(PARENT, 'Stronghold-Protocol') : SELF_ROOT);
const SCRATCH_ROOT = process.env.SP_SCRATCH
  ? resolve(process.env.SP_SCRATCH)
  : (NAME === '_merge-scratch' ? SELF_ROOT : join(PARENT, '_merge-scratch'));

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
if (has('-h') || has('--help')) {
  console.log('usage: node tools/push-gitee.mjs [-m <message>] [--branch <name>] [--remote <name>] [--dry-run] [--no-push]');
  process.exit(0);
}
const MESSAGE = valOf('-m', valOf('--message', ''));
const BRANCH = valOf('--branch', 'master');
const REMOTE = valOf('--remote', 'gitee');
const DRY = has('--dry-run');
const NO_PUSH = has('--no-push');

// ------------------------------------------------------------------ git
function git(args, opts = {}) {
  return execFileSync('git', ['-C', SCRATCH_ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
function gitOrNull(args) { try { return git(args); } catch { return null; } }

function fail(msg) { console.error(`\n[push-gitee] ${msg}`); process.exit(1); }

if (!existsSync(DEV_ROOT)) fail(`dev tree not found: ${DEV_ROOT}`);
if (!existsSync(join(SCRATCH_ROOT, '.git'))) fail(`git store not found (no .git): ${SCRATCH_ROOT}`);
if (!existsSync(join(DEV_ROOT, '.gitignore'))) fail(`dev tree has no .gitignore: ${DEV_ROOT}`);

/** Paths (repo-relative, forward slashes) that differ from the store's HEAD, using the dev tree as the work tree. */
function changedPaths() {
  const tracked = git(['--work-tree', DEV_ROOT, 'diff', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean);
  const untracked = git(['--work-tree', DEV_ROOT, 'ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  return { tracked, untracked };
}

/** Remove now-empty parent directories of a deleted file, stopping at the repo root. */
function pruneEmptyDirs(absFile) {
  let dir = dirname(absFile);
  while (dir.startsWith(SCRATCH_ROOT) && dir !== SCRATCH_ROOT) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.length) return;
    try { rmdirSync(dir); } catch { return; }
    dir = dirname(dir);
  }
}

function syncFile(rel) {
  const from = join(DEV_ROOT, ...rel.split('/'));
  const to = join(SCRATCH_ROOT, ...rel.split('/'));
  if (existsSync(from)) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    return 'copy';
  }
  if (existsSync(to)) { rmSync(to); pruneEmptyDirs(to); return 'delete'; }
  return 'skip';
}

// ------------------------------------------------------------------ main
function main() {
  const { tracked, untracked } = changedPaths();
  const all = [...new Set([...tracked, ...untracked])].sort();
  if (!all.length) {
    console.log('[push-gitee] the git store already matches the dev tree — nothing to sync.');
  } else {
    console.log(`[push-gitee] ${all.length} path(s) to sync from ${DEV_ROOT}`);
    if (DRY) for (const rel of all) console.log(`  ${rel}`);
    else for (const rel of all) { const what = syncFile(rel); console.log(`  ${what} ${rel}`); }
  }

  if (DRY) { console.log('[push-gitee] --dry-run: nothing staged, committed or pushed.'); return; }

  git(['add', '-A']);
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (!staged.length) {
    console.log('[push-gitee] nothing staged (the store was already up to date).');
  } else {
    const msg = MESSAGE || `sync dev tree → gitee (${staged.length} file${staged.length === 1 ? '' : 's'}, ${new Date().toISOString().slice(0, 10)})`;
    git(['commit', '-m', msg]);
    console.log(`[push-gitee] committed: ${git(['log', '-1', '--oneline']).trim()}`);
  }

  if (NO_PUSH) { console.log('[push-gitee] --no-push: skipping the push.'); return; }

  // The remote is a convention; add it once if a fresh store lacks it.
  if (!gitOrNull(['remote', 'get-url', REMOTE])) {
    git(['remote', 'add', REMOTE, 'https://gitee.com/marseille1/stronghold-protocol-secondary-development-download.git']);
    console.log(`[push-gitee] added remote ${REMOTE}`);
  }

  console.log(`[push-gitee] pushing HEAD → ${REMOTE}/${BRANCH} ...`);
  try {
    const out = git(['push', REMOTE, `HEAD:refs/heads/${BRANCH}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (out.trim()) console.log(out.trim());
    console.log(`[push-gitee] pushed to ${REMOTE}/${BRANCH}.`);
  } catch (e) {
    const text = `${e.stderr || ''}${e.stdout || ''}${e.message || ''}`;
    if (/could not read Username|Authentication failed|terminal prompts disabled|unable to get password|403/.test(text)) {
      console.error(
        '\n[push-gitee] the commit is in the git store but the PUSH needs Gitee credentials (the URL carries none).\n' +
        '  Provide a Gitee username + personal access token (账号设置 → 私人令牌, scope `projects`) in ONE of these ways:\n' +
        '    1) git credential helper:  git config --global credential.helper manager   (then run the push once and sign in)\n' +
        '    2) store it once:          printf "https://<user>:<token>@gitee.com\\n" > ~/.git-credentials  (chmod 600)\n' +
        '    3) this run only:          $env:GIT_USERNAME="<user>"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs\n' +
        '       (a helper that reads GIT_USERNAME/GIT_PASSWORD is required; the built-in prompt is disabled here.)\n' +
        '  Then re-run:  git -C ' + SCRATCH_ROOT + ' push gitee HEAD:refs/heads/' + BRANCH + '\n' +
        '  Do NOT commit the token into the repository.\n');
      process.exit(2);
    }
    fail(`push failed:\n${text.trim()}`);
  }
}

main();
