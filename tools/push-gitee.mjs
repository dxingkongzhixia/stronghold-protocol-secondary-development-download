#!/usr/bin/env node
// tools/push-gitee.mjs — commit the dev tree into the git store and push it to Gitee (docs/AI-WORKFLOW.md §commit/push).
//
// The working project (`Stronghold-Protocol`) has NO `.git`: it is the single source of truth for the files on disk.
// The full history lives in the sibling git store `_merge-scratch` (branch `ours`). This helper mirrors the dev tree
// into that store (tracked files only — `git ls-files`, so `.gitignore` is respected: `node_modules`, `.cache`,
// `.venv-extract`, `__pycache__`, `test/e2e/out`, `logs`, `var`, `data/local-assets.json` are never copied), commits,
// and pushes the store's HEAD to the Gitee remote. The runtime static resources (`public/assets`, `public/fonts`,
// `public/vendor`) ARE committed now, and the two trees share them through junctions — `syncFile` leaves a path alone
// when its real location is the same file in both trees.
//
// The owner's convention: "之后每次有更新都提交下" — after every change, run this so the Gitee copy tracks the dev tree.
//
// Usage (run from either tree; defaults are derived from the script location, overridable by env):
//   node tools/push-gitee.mjs                     # sync + commit + push to `gitee` branch `master`
//   node tools/push-gitee.mjs -m "message"        # explicit commit message (default: dated summary)
//   node tools/push-gitee.mjs --branch main       # push to another remote branch
//   node tools/push-gitee.mjs --dry-run           # show what would change, copy/stage/commit/push nothing
//   node tools/push-gitee.mjs --no-push           # sync + commit locally, skip the push
//   GIT_USERNAME=marseille1 GIT_PASSWORD=<token> node tools/push-gitee.mjs   # per-run creds (temp file outside repo)
//   SP_DEV_TREE=<dir> SP_SCRATCH=<dir> node tools/push-gitee.mjs
//
// Credentials: the Gitee URL carries none. A push needs the ASCII Gitee login name (`marseille1`) + a personal access
// token. Supply them with a credential helper (`node tools/push-gitee.mjs --interactive` signs in once), or set
// `GIT_USERNAME` + `GIT_PASSWORD` (aliases `GITEE_USERNAME`/`GITEE_TOKEN`) for this run — the helper writes them to a
// temp credential file OUTSIDE the repo and resets the helper list, so a stale system `credential.helper=manager`
// cannot shadow the token. Never write the token into the repository.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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
  console.log('usage: node tools/push-gitee.mjs [-m <message>] [--branch <name>] [--remote <name>] [--dry-run] [--no-push] [--interactive]');
  process.exit(0);
}
const MESSAGE = valOf('-m', valOf('--message', ''));
const BRANCH = valOf('--branch', 'master');
const REMOTE = valOf('--remote', 'gitee');
const DRY = has('--dry-run');
const NO_PUSH = has('--no-push');
// By default the push never blocks on a terminal/GUI credential prompt (an agent has none); a stored credential is
// still used. `--interactive` re-enables the prompt for a one-time sign-in.
const INTERACTIVE = has('--interactive');

// ------------------------------------------------------------------ git
function git(args, opts = {}) {
  return execFileSync('git', ['-C', SCRATCH_ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
const NO_PROMPT_ENV = INTERACTIVE
  ? { ...process.env }
  : { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GCM_PROVIDER: 'generic' };
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
    // The asset trees (`public/assets`, `public/fonts`, `public/vendor`) are junctions shared by both trees, so a
    // change in the dev tree is already visible in the store and `from`/`to` are the same real file. Copying a file
    // onto itself fails on Windows — nothing to do, the store already has the new bytes.
    let same = false;
    try { same = realpathSync(from) === realpathSync(to); } catch { same = false; }
    if (same) return 'same';
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

  // Per-run credentials from the environment (optional). The Gitee URL carries none, and this machine's SYSTEM
  // gitconfig sets `credential.helper=manager`, which can shadow a supplied token with a stale stored credential.
  // So when GIT_USERNAME/GIT_PASSWORD (or GITEE_USERNAME/GITEE_TOKEN) are set, write them to a temp credential file
  // OUTSIDE the repo and reset the helper list for this one push. The token is never written into the repository.
  const ENV_USER = process.env.GIT_USERNAME || process.env.GITEE_USERNAME || '';
  const ENV_PASS = process.env.GIT_PASSWORD || process.env.GITEE_TOKEN || '';
  const credArgs = [];
  let credTmp = null;
  if (ENV_USER && ENV_PASS) {
    credTmp = join(tmpdir(), `push-gitee-${process.pid}.cred`);
    writeFileSync(credTmp, `https://${ENV_USER}:${ENV_PASS}@gitee.com\n`, { mode: 0o600 });
    const credPath = credTmp.replace(/\\/g, '/'); // git config treats backslashes as escapes
    credArgs.push('-c', 'credential.helper=', '-c', `credential.helper=store --file=${credPath}`);
  }

  console.log(`[push-gitee] pushing HEAD → ${REMOTE}/${BRANCH}${ENV_USER ? ` (as ${ENV_USER})` : ''} ...`);
  let pushOut = null, pushErr = null;
  try {
    pushOut = git([...credArgs, 'push', REMOTE, `HEAD:refs/heads/${BRANCH}`], { stdio: ['ignore', 'pipe', 'pipe'], env: NO_PROMPT_ENV });
  } catch (e) {
    pushErr = e;
  } finally {
    if (credTmp) { try { rmSync(credTmp); } catch { /* best effort */ } }
  }

  if (pushErr) {
    const text = `${pushErr.stderr || ''}${pushErr.stdout || ''}${pushErr.message || ''}`;
    if (/could not read Username|Authentication failed|terminal prompts disabled|unable to get password|403/.test(text)) {
      console.error(
        '\n[push-gitee] the commit is in the git store but the PUSH needs Gitee credentials (the URL carries none).\n' +
        '  The Gitee login name is ASCII (`marseille1`); the Chinese name is only a display name. Provide the login\n' +
        '  name + a personal access token (账号设置 → 私人令牌, scope `projects`) in ONE of these ways:\n' +
        '    0) one-time sign-in:       node tools/push-gitee.mjs --interactive   (lets the credential manager prompt)\n' +
        '    1) this run only:          $env:GIT_USERNAME="marseille1"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs\n' +
        '       (the helper writes a temp credential file OUTSIDE the repo and resets the helper list for the push)\n' +
        '    2) store it once:          put `https://marseille1:<token>@gitee.com` in a credential file OUTSIDE the repo, then\n' +
        '       git -C ' + SCRATCH_ROOT + ' config credential.helper ""   # reset the system manager helper\n' +
        '       git -C ' + SCRATCH_ROOT + ' config --add credential.helper "store --file=<that-file>"\n' +
        '  Then re-run:  git -C ' + SCRATCH_ROOT + ' push gitee HEAD:refs/heads/' + BRANCH + '\n' +
        '  Do NOT commit the token into the repository.\n');
      process.exit(2);
    }
    fail(`push failed:\n${text.trim()}`);
  }
  if (pushOut.trim()) console.log(pushOut.trim());
  console.log(`[push-gitee] pushed to ${REMOTE}/${BRANCH}.`);
}

main();
