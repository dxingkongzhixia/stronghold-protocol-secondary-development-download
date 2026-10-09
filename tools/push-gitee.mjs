#!/usr/bin/env node
// tools/push-gitee.mjs — publish the git store to Gitee, then re-mirror the dev tree (docs/AI-WORKFLOW.md §c).
//
// DIRECTION — this is the whole point: STORE → GITEE → DEV TREE, never the reverse.
//   * The git store `_merge-scratch` (branch `ours`) is the SINGLE SOURCE OF TRUTH: it owns the history and the
//     committed files. The working project (`Stronghold-Protocol`) has NO `.git` and is a MIRROR of the store.
//   * The helper NEVER copies dev-tree content over store content. If the dev tree differs from the store it WARNS
//     and then RESTORES the dev tree from the store — it does not silently commit the dev-tree state.
//   * `--from-dev` is the explicit, opt-in escape hatch that keeps the old reverse sync (dev tree → store). It is
//     OFF by default on purpose: running it when the store has advanced reverts the store's newer commits, which is
//     exactly the hazard that bit earlier tasks.
//
// What a run does, in order:
//   1. Commit what you staged in the store (with `--only` it stages those paths first) — `-m` sets the message.
//      Nothing is ever staged from the dev tree unless `--from-dev` is passed.
//   2. Push the store's HEAD to the Gitee remote as a fast-forward (`HEAD:refs/heads/master`; NEVER forced).
//   3. Mirror the store's tracked files back into the dev tree (`.gitignore` respected; files that exist only in
//      the dev tree are left alone; shared junctions are skipped so files are never copied onto themselves).
//
// The owner's convention: "之后每次有更新都提交下" — after every change, commit it in the store and publish it here.
//
// Usage (run from either tree; defaults are derived from the script location, overridable by env):
//   node tools/push-gitee.mjs                     # commit (what is staged) + push to `gitee` + mirror into the dev tree
//   node tools/push-gitee.mjs -m "message"        # explicit commit message (default: dated summary)
//   node tools/push-gitee.mjs --branch main       # push to another remote branch
//   node tools/push-gitee.mjs --dry-run           # report only: nothing staged, committed, pushed or mirrored
//   node tools/push-gitee.mjs --no-push           # commit + mirror locally, skip the push
//   node tools/push-gitee.mjs --only public/js/render/fx --only docs/ASSETS.md   # stage/commit and mirror ONLY these
//                                                 # (the store is shared and may hold unrelated WIP; without
//                                                 #  --only only already-staged paths are committed)
//   node tools/push-gitee.mjs --from-dev          # OPT-IN, NOT the default: copy the dev tree into the store
//                                                 # (the old behaviour; only when you know the dev tree is ahead)
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

/** The dev tree (mirror, no history) and the git store (history, source of truth). */
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
  console.log('usage: node tools/push-gitee.mjs [-m <message>] [--branch <name>] [--remote <name>] [--dry-run] [--no-push] [--only <path>]... [--from-dev] [--interactive]');
  process.exit(0);
}
const MESSAGE = valOf('-m', valOf('--message', ''));
const BRANCH = valOf('--branch', 'master');
const REMOTE = valOf('--remote', 'gitee');
const DRY = has('--dry-run');
const NO_PUSH = has('--no-push');
// --only <path>[,<path>…] (repeatable): restrict staging and mirroring to these repo-relative paths (a path or a
// directory prefix). The git store is shared and can hold other work-in-progress, so this keeps a run to exactly
// what it names. Empty (the default) mirrors everything and commits only what is already staged.
const ONLY = (() => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only' && argv[i + 1]) out.push(argv[++i]);
    else if (argv[i].startsWith('--only=')) out.push(argv[i].slice('--only='.length));
  }
  return out.flatMap((s) => s.split(','))
    .map((s) => s.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean);
})();
const onlyMatch = (rel) => !ONLY.length || ONLY.some((p) => rel === p || rel.startsWith(`${p}/`));
// OPT-IN, default OFF: copy the dev tree INTO the store. Without it the store is never written from the dev tree.
const FROM_DEV = has('--from-dev');
// By default the push never blocks on a terminal/GUI credential prompt (an agent has none); a stored credential is
// still used. `--interactive` re-enables the prompt for a one-time sign-in.
const INTERACTIVE = has('--interactive');

// ------------------------------------------------------------------ git
/** Run git against the STORE (its own work tree / index). */
function git(args, opts = {}) {
  return execFileSync('git', ['-C', SCRATCH_ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}
/** Run git with the DEV TREE as the work tree — READ-ONLY queries (diff/ls-files) against the store's history. */
function devGit(args) { return git(['--work-tree', DEV_ROOT, ...args]); }
const NO_PROMPT_ENV = INTERACTIVE
  ? { ...process.env }
  : { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GCM_PROVIDER: 'generic' };
function gitOrNull(args) { try { return git(args); } catch { return null; } }
function lines(out) { return out.split('\0').filter(Boolean); }

function fail(msg) { console.error(`\n[push-gitee] ${msg}`); process.exit(1); }

if (!existsSync(DEV_ROOT)) fail(`dev tree not found: ${DEV_ROOT}`);
if (!existsSync(join(SCRATCH_ROOT, '.git'))) fail(`git store not found (no .git): ${SCRATCH_ROOT}`);
if (!existsSync(join(DEV_ROOT, '.gitignore'))) fail(`dev tree has no .gitignore: ${DEV_ROOT}`);

/** True when the two paths are the same real file (the shared asset junctions) — never copy a file onto itself. */
function sameRealFile(a, b) {
  try { return realpathSync(a) === realpathSync(b); } catch { return false; }
}

/** Remove now-empty parent directories of a deleted file, stopping at the given repository root. */
function pruneEmptyDirs(absFile, root) {
  let dir = dirname(absFile);
  while (dir.startsWith(root) && dir !== root) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.length) return;
    try { rmdirSync(dir); } catch { return; }
    dir = dirname(dir);
  }
}

/** Paths the dev tree has that differ from the store's HEAD (tracked edits/deletes) and files it adds (untracked). */
function devTreeDrift() {
  const tracked = lines(devGit(['diff', '--name-only', '-z', 'HEAD']));
  const untracked = lines(devGit(['ls-files', '--others', '--exclude-standard', '-z']));
  return { tracked, untracked };
}

/** Copy one path dev tree → store (`--from-dev` only). Mirrors the historic syncFile. */
function copyIntoStore(rel) {
  const from = join(DEV_ROOT, ...rel.split('/'));
  const to = join(SCRATCH_ROOT, ...rel.split('/'));
  if (existsSync(from)) {
    if (sameRealFile(from, to)) return 'same';
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    return 'copy';
  }
  if (existsSync(to)) { rmSync(to); pruneEmptyDirs(to, SCRATCH_ROOT); return 'delete'; }
  return 'skip';
}

/** Copy one tracked path store → dev tree (the default direction). */
function copyIntoDev(rel) {
  const from = join(SCRATCH_ROOT, ...rel.split('/'));
  const to = join(DEV_ROOT, ...rel.split('/'));
  if (existsSync(from)) {
    if (sameRealFile(from, to)) return 'same';
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    return 'copy';
  }
  if (existsSync(to)) { rmSync(to); pruneEmptyDirs(to, DEV_ROOT); return 'delete'; }
  return 'skip';
}

/** Paths where the dev tree still differs from the (committed) store HEAD — i.e. what the mirror must touch. */
function mirrorPaths() {
  return lines(devGit(['diff', '--name-only', '-z', 'HEAD'])).filter(onlyMatch).sort();
}

function pushToGitee() {
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

  // A plain push is fast-forward-only and NEVER forced: if the remote has commits we don't, it is rejected.
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
    if (/non-fast-forward|fetch first|rejected/.test(text)) {
      fail(
        `push rejected: ${REMOTE}/${BRANCH} has commits the store does not (never forced).\n` +
        `  The Gitee remote is a mirror of the store; if it truly diverged, investigate before pushing again.\n${text.trim()}`,
      );
    }
    if (/could not read Username|Authentication failed|terminal prompts disabled|unable to get password|403/.test(text)) {
      console.error(
        '\n[push-gitee] the store is committed but the PUSH needs Gitee credentials (the URL carries none).\n' +
        '  The Gitee login name is ASCII (`marseille1`); the Chinese name is only a display name. Provide the login\n' +
        '  name + a personal access token (账号设置 → 私人令牌, scope `projects`) in ONE of these ways:\n' +
        '    0) one-time sign-in:       node tools/push-gitee.mjs --interactive   (lets the credential manager prompt)\n' +
        '    1) this run only:          $env:GIT_USERNAME="marseille1"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs\n' +
        '       (the helper writes a temp credential file OUTSIDE the repo and resets the helper list for the push)\n' +
        '    2) store it once:          put `https://marseille1:<token>@gitee.com` in a credential file OUTSIDE the repo, then\n' +
        '       git -C ' + SCRATCH_ROOT + ' config credential.helper ""   # reset the system manager helper\n' +
        '       git -C ' + SCRATCH_ROOT + ' config --add credential.helper "store --file=<that-file>"\n' +
        '  Then re-run:  git -C ' + SCRATCH_ROOT + ' push ' + REMOTE + ' HEAD:refs/heads/' + BRANCH + '\n' +
        '  Do NOT commit the token into the repository.\n');
      process.exit(2);
    }
    fail(`push failed:\n${text.trim()}`);
  }
  if (pushOut.trim()) console.log(pushOut.trim());
  console.log(`[push-gitee] pushed to ${REMOTE}/${BRANCH}.`);
}

function mirrorIntoDev() {
  const paths = mirrorPaths();
  if (!paths.length) {
    console.log('[push-gitee] dev tree already mirrors the store.');
    return;
  }
  console.log(`[push-gitee] mirroring ${paths.length} path(s) store → dev tree ...`);
  for (const rel of paths) { const what = copyIntoDev(rel); console.log(`    ${what} ${rel}`); }
}

// ------------------------------------------------------------------ main
function main() {
  const head = git(['rev-parse', '--short', 'HEAD']).trim();
  console.log(`[push-gitee] store ${SCRATCH_ROOT} @ ${head} → ${REMOTE}/${BRANCH}`);

  const { tracked, untracked } = devTreeDrift();
  const drift = [...new Set([...tracked, ...untracked])].filter(onlyMatch).sort();

  // (a) The dev tree is a mirror. Warn when it diverges; never commit its content unless --from-dev says so.
  if (drift.length && !FROM_DEV) {
    console.warn(`[push-gitee] WARNING: the dev tree differs from the store in ${drift.length} path(s):`);
    for (const rel of drift) console.warn(`    ${rel}`);
    console.warn('[push-gitee] the STORE is the source of truth — these are NOT committed; the dev tree is restored');
    console.warn('[push-gitee] from the store below. Pass --from-dev to copy them into the store instead (opt-in).');
  }

  if (DRY) {
    if (FROM_DEV) {
      console.log(`[push-gitee] --dry-run: --from-dev would copy ${drift.length} dev-tree path(s) into the store and commit.`);
    } else {
      const staged = lines(git(['diff', '--cached', '--name-only', '-z']));
      console.log(`[push-gitee] --dry-run: ${staged.length} already-staged path(s) would be committed; store HEAD stays ${head}.`);
      if (drift.length) {
        console.log(`[push-gitee] --dry-run: the store would be mirrored onto the dev tree (${drift.length} path(s)):`);
        for (const rel of drift) console.log(`    ${rel}`);
      }
    }
    console.log(`[push-gitee] --dry-run: would push HEAD → ${REMOTE}/${BRANCH}${NO_PUSH ? ' (skipped: --no-push)' : ''}.`);
    console.log('[push-gitee] --dry-run: nothing staged, committed, pushed or mirrored.');
    return;
  }

  // 1. Commit. Only --from-dev stages dev-tree content; otherwise only paths already staged (or named by --only).
  if (FROM_DEV && drift.length) {
    console.log(`[push-gitee] --from-dev: copying ${drift.length} path(s) from ${DEV_ROOT} into the store ...`);
    for (const rel of drift) { const what = copyIntoStore(rel); console.log(`    ${what} ${rel}`); }
    if (ONLY.length) git(['add', '-A', '--', ...ONLY]);
    else git(['add', '-A']);
  } else if (ONLY.length) {
    git(['add', '-A', '--', ...ONLY]);
  }
  const staged = lines(git(['diff', '--cached', '--name-only', '-z']));
  if (staged.length) {
    const msg = MESSAGE || `publish store (${staged.length} file${staged.length === 1 ? '' : 's'}, ${new Date().toISOString().slice(0, 10)})`;
    git(['commit', '-m', msg]);
    console.log(`[push-gitee] committed: ${git(['log', '-1', '--oneline']).trim()}`);
  } else {
    console.log('[push-gitee] nothing staged — publishing the store as it stands.');
  }

  // 2. Push the store's HEAD to Gitee (fast-forward only).
  if (NO_PUSH) console.log('[push-gitee] --no-push: skipping the push.');
  else pushToGitee();

  // 3. Mirror the store back into the dev tree so it reflects the pushed state.
  mirrorIntoDev();
}

main();
