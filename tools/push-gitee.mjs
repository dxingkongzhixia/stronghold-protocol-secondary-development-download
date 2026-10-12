#!/usr/bin/env node
// tools/push-gitee.mjs — publish the git store to its remotes, then re-mirror the dev tree (docs/AI-WORKFLOW.md §c).
//
// DIRECTION — this is the whole point: STORE → REMOTES → DEV TREE, never the reverse.
//   * The git store `_merge-scratch` (branch `ours`) is the SINGLE SOURCE OF TRUTH: it owns the history and the
//     committed files. The working project (`Stronghold-Protocol`) has NO `.git` and is a MIRROR of the store.
//   * The helper NEVER copies dev-tree content over store content. If the dev tree differs from the store it WARNS
//     and then RESTORES the dev tree from the store — it does not silently commit the dev-tree state.
//   * `--from-dev` is the explicit, opt-in escape hatch that keeps the old reverse sync (dev tree → store). It is
//     OFF by default on purpose: running it when the store has advanced reverts the store's newer commits, which is
//     exactly the hazard that bit earlier tasks.
//
// Remotes (convention): `github` is the PRIMARY repository, `gitee` is the 国内下载镜像 (mirror). A normal run pushes
// the store's HEAD to EVERY configured remote, primary first, then mirrors the store back into the dev tree. Use
// `--remote <name>` (repeatable) to push only some, or `--all-remotes` to force both even on a fresh store.
//
// What a run does, in order:
//   1. Commit what you staged in the store (with `--only` it stages those paths first) — `-m` sets the message.
//      Nothing is ever staged from the dev tree unless `--from-dev` is passed.
//   2. Push the store's HEAD to each target remote as a fast-forward (`HEAD:refs/heads/<branch>`; NEVER forced),
//      and with `--tags` push the tags too (`refs/tags/*`; still never forced).
//   3. Mirror the store's tracked files back into the dev tree (`.gitignore` respected; files that exist only in
//      the dev tree are left alone; shared junctions are skipped so files are never copied onto themselves).
//
// The owner's convention: "之后每次有更新都提交下" — after every change, commit it in the store and publish it here.
//
// Usage (run from either tree; defaults are derived from the script location, overridable by env):
//   node tools/push-gitee.mjs                     # commit (what is staged) + push to every configured remote + mirror
//   node tools/push-gitee.mjs -m "message"        # explicit commit message (default: dated summary)
//   node tools/push-gitee.mjs --branch main       # push to another remote branch
//   node tools/push-gitee.mjs --remote github     # push ONLY the named remote (repeatable / comma-separated)
//   node tools/push-gitee.mjs --all-remotes       # force github (primary) + gitee (mirror), adding them if missing
//   node tools/push-gitee.mjs --tags              # also push the tags (refs/tags/*) to each target remote
//   node tools/push-gitee.mjs --dry-run           # report only: nothing staged, committed, pushed or mirrored
//   node tools/push-gitee.mjs --no-push           # commit + mirror locally, skip the push
//   node tools/push-gitee.mjs --only public/js/render/fx --only docs/ASSETS.md   # stage/commit and mirror ONLY these
//                                                 # (the store is shared and may hold unrelated WIP; without
//                                                 #  --only only already-staged paths are committed)
//   node tools/push-gitee.mjs --from-dev          # OPT-IN, NOT the default: copy the dev tree into the store
//                                                 # (the old behaviour; only when you know the dev tree is ahead)
//   GIT_USERNAME=marseille1 GIT_PASSWORD=<token> node tools/push-gitee.mjs   # Gitee per-run creds (temp file outside repo)
//   GITHUB_TOKEN=<pat> node tools/push-gitee.mjs  # GitHub per-run creds (else the configured credential helper)
//   SP_DEV_TREE=<dir> SP_SCRATCH=<dir> node tools/push-gitee.mjs
//
// Credentials: neither URL carries any, and none is ever written into the repository.
//   * Gitee — the ASCII login name (`marseille1`) + a personal access token; set `GITEE_USERNAME`/`GITEE_TOKEN`
//     (aliases `GIT_USERNAME`/`GIT_PASSWORD`) or sign in once with `--interactive`. The helper writes them to a temp
//     credential file OUTSIDE the repo and resets the helper list, so a stale system `credential.helper=manager`
//     cannot shadow the token.
//   * GitHub — the OWNER's credential. By default the configured credential helper is used as-is (e.g. Git Credential
//     Manager already signed in). Set `GITHUB_TOKEN` (alias `GH_TOKEN`) — a PAT with `repo` scope, `GITHUB_USERNAME`
//     optional — for a per-run token, handled the same way (temp file outside the repo). If GitHub still asks for
//     credentials the helper reports exactly what is needed; it never guesses a token.
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

// ------------------------------------------------------------------ remotes
// The publishing conventions of this fork: `github` is the PRIMARY repository, `gitee` the 国内下载镜像. The URLs are
// only defaults — if a remote of that name already exists in the store its URL is used untouched (a fork that keeps
// its own mirrors does not get rewritten).
const REMOTES = {
  github: {
    url: 'https://github.com/dxingkongzhixia/stronghold-protocol-secondary-development-download.git',
    host: 'github.com',
    role: 'primary repository',
    envUser: () => process.env.GITHUB_USERNAME || process.env.GITHUB_USER || '',
    envPass: () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
  },
  gitee: {
    url: 'https://gitee.com/marseille1/stronghold-protocol-secondary-development-download.git',
    host: 'gitee.com',
    role: '国内下载镜像',
    envUser: () => process.env.GITEE_USERNAME || process.env.GIT_USERNAME || '',
    envPass: () => process.env.GITEE_TOKEN || process.env.GIT_PASSWORD || '',
  },
};
/** Push order: the primary first, so a failure mirrors the reachable state instead of leaving the primary stale. */
const REMOTE_ORDER = ['github', 'gitee'];

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
if (has('-h') || has('--help')) {
  console.log('usage: node tools/push-gitee.mjs [-m <message>] [--branch <name>] [--remote <name>]... [--all-remotes] [--tags] [--dry-run] [--no-push] [--only <path>]... [--from-dev] [--interactive]');
  console.log('');
  console.log('  --remote <name>    push only this remote (repeatable / comma-separated); default: every configured');
  console.log('                     remote among github (primary) then gitee (mirror), falling back to gitee');
  console.log('  --all-remotes      push github (primary) + gitee (mirror), adding either remote if the store lacks it');
  console.log('  --tags             also push the tags (refs/tags/*) to each target remote (never forced)');
  console.log('  --branch <name>    remote branch to push (default: master; the store branch stays ours)');
  console.log('  --dry-run          report only: nothing staged, committed, pushed or mirrored');
  console.log('  --no-push          commit + mirror locally, skip the push');
  console.log('  --only <path>      restrict staging and mirroring to this repo-relative path (repeatable, comma-separated)');
  console.log('  --from-dev         OPT-IN reverse sync: copy the dev tree into the store (off by default)');
  console.log('  --interactive      allow a terminal / credential-manager prompt for the push');
  process.exit(0);
}
const MESSAGE = valOf('-m', valOf('--message', ''));
const BRANCH = valOf('--branch', 'master');
const DRY = has('--dry-run');
const NO_PUSH = has('--no-push');
const ALL_REMOTES = has('--all-remotes');
const TAGS = has('--tags');
// --remote <name>[,<name>…] (repeatable): restrict the push to these remotes (in the order given).
const REMOTE_NAMES = (() => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--remote' && argv[i + 1]) out.push(argv[++i]);
    else if (argv[i].startsWith('--remote=')) out.push(argv[i].slice('--remote='.length));
  }
  return out.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
})();
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

/** The remote names this run pushes to, in order. Never auto-pushes to a convention URL that is not configured. */
function pushTargets() {
  const configured = REMOTE_ORDER.filter((n) => gitOrNull(['remote', 'get-url', n]));
  if (REMOTE_NAMES.length) return REMOTE_NAMES;
  if (ALL_REMOTES) return [...REMOTE_ORDER];
  if (configured.length) return configured;
  return ['gitee']; // nothing configured yet: keep the historical default and add gitee below
}

/** The role of a remote name for messages (`primary repository`, `国内下载镜像`, or plain `remote`). */
function remoteRole(name) { return REMOTES[name]?.role || 'remote'; }

/** The credential arguments for one push: env creds (gitee / github) via a temp file outside the repo, else none. */
function credentialArgs(name) {
  const conv = REMOTES[name];
  const user = conv ? conv.envUser() : '';
  const pass = conv ? conv.envPass() : '';
  if (!conv || !user || !pass) return { args: [], envUser: user, tmp: null };
  const tmp = join(tmpdir(), `push-gitee-${name}-${process.pid}.cred`);
  writeFileSync(tmp, `https://${user}:${pass}@${conv.host}\n`, { mode: 0o600 });
  const credPath = tmp.replace(/\\/g, '/'); // git config treats backslashes as escapes
  return {
    args: ['-c', 'credential.helper=', '-c', `credential.helper=store --file=${credPath}`],
    envUser: user,
    tmp,
  };
}

/** The extra help an auth failure prints, per remote. */
function authHelp(name) {
  if (name === 'github') {
    return (
      '\n[push-gitee] the store is committed but the GitHub PUSH needs credentials (the URL carries none).\n' +
      '  GitHub is the PRIMARY repository; its credential is the owner\'s. Provide one of:\n' +
      '    0) one-time sign-in:  node tools/push-gitee.mjs --interactive   (or `gh auth login`, GCM, a stored helper)\n' +
      '    1) this run only:     $env:GITHUB_TOKEN="<pat>"; node tools/push-gitee.mjs        # PAT with `repo` scope\n' +
      '       (optional $env:GITHUB_USERNAME="<login>"; the helper writes a temp credential file OUTSIDE the repo)\n' +
      '    2) store it once:     put `https://<login>:<pat>@github.com` in a credential file OUTSIDE the repo, then\n' +
      '       git -C ' + SCRATCH_ROOT + ' config credential.helper ""\n' +
      '       git -C ' + SCRATCH_ROOT + ' config --add credential.helper "store --file=<that-file>"\n' +
      '  Then re-run:  git -C ' + SCRATCH_ROOT + ' push ' + name + ' HEAD:refs/heads/' + BRANCH + '\n' +
      '  Do NOT commit the token into the repository.\n');
  }
  return (
    '\n[push-gitee] the store is committed but the PUSH needs Gitee credentials (the URL carries none).\n' +
    '  The Gitee login name is ASCII (`marseille1`); the Chinese name is only a display name. Provide the login\n' +
    '  name + a personal access token (账号设置 → 私人令牌, scope `projects`) in ONE of these ways:\n' +
    '    0) one-time sign-in:       node tools/push-gitee.mjs --interactive   (lets the credential manager prompt)\n' +
    '    1) this run only:          $env:GIT_USERNAME="marseille1"; $env:GIT_PASSWORD="<token>"; node tools/push-gitee.mjs\n' +
    '       (the helper writes a temp credential file OUTSIDE the repo and resets the helper list for the push)\n' +
    '    2) store it once:          put `https://marseille1:<token>@gitee.com` in a credential file OUTSIDE the repo, then\n' +
    '       git -C ' + SCRATCH_ROOT + ' config credential.helper ""   # reset the system manager helper\n' +
    '       git -C ' + SCRATCH_ROOT + ' config --add credential.helper "store --file=<that-file>"\n' +
    '  Then re-run:  git -C ' + SCRATCH_ROOT + ' push ' + name + ' HEAD:refs/heads/' + BRANCH + '\n' +
    '  Do NOT commit the token into the repository.\n');
}

/** Push the store's HEAD (fast-forward only, never forced) to one remote, then its tags when `--tags` was given. */
function pushToRemote(name) {
  const conv = REMOTES[name];
  // The remote is a convention; add it once if the store lacks it and we know its URL.
  if (!gitOrNull(['remote', 'get-url', name])) {
    if (!conv) fail(`unknown remote '${name}': not configured, and not a known convention (github, gitee) to add.`);
    git(['remote', 'add', name, conv.url]);
    console.log(`[push-gitee] added remote ${name} (${conv.url})`);
  }

  // Per-run credentials from the environment (optional). See the header: gitee uses GITEE_*/GIT_*; github uses
  // GITHUB_TOKEN/GH_TOKEN. The temp file lives OUTSIDE the repo; the token is never written into the repository.
  const cred = credentialArgs(name);
  let pushErr = null;
  try {
    console.log(`[push-gitee] pushing HEAD → ${name}/${BRANCH}${cred.envUser ? ` (as ${cred.envUser})` : ''} ...`);
    const out = git([...cred.args, 'push', name, `HEAD:refs/heads/${BRANCH}`], { stdio: ['ignore', 'pipe', 'pipe'], env: NO_PROMPT_ENV });
    if (out.trim()) console.log(out.trim());
  } catch (e) {
    pushErr = e;
  }

  if (!pushErr && TAGS) {
    try {
      console.log(`[push-gitee] pushing tags → ${name} ...`);
      const out = git([...cred.args, 'push', name, 'refs/tags/*:refs/tags/*'], { stdio: ['ignore', 'pipe', 'pipe'], env: NO_PROMPT_ENV });
      if (out.trim()) console.log(out.trim());
    } catch (e) {
      pushErr = e;
    }
  }

  if (cred.tmp) { try { rmSync(cred.tmp); } catch { /* best effort */ } }

  if (pushErr) {
    const text = `${pushErr.stderr || ''}${pushErr.stdout || ''}${pushErr.message || ''}`;
    if (/non-fast-forward|fetch first|rejected/.test(text)) {
      fail(
        `push rejected: ${name}/${BRANCH} has commits the store does not (never forced).\n` +
        `  ${name} is a ${remoteRole(name)} of the store; if it truly diverged, investigate before pushing again.\n${text.trim()}`,
      );
    }
    if (/could not read Username|Authentication failed|terminal prompts disabled|unable to get password|403/.test(text)) {
      console.error(authHelp(name));
      process.exit(2);
    }
    fail(`push to ${name} failed:\n${text.trim()}`);
  }
  console.log(`[push-gitee] pushed to ${name}/${BRANCH}.`);
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
  const targets = pushTargets();
  console.log(`[push-gitee] store ${SCRATCH_ROOT} @ ${head} → ${targets.join(', ')} (${BRANCH})`);

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
    console.log(`[push-gitee] --dry-run: would push HEAD → ${targets.map((t) => `${t}/${BRANCH}`).join(', ')}${TAGS ? ' + tags' : ''}${NO_PUSH ? ' (skipped: --no-push)' : ''}.`);
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

  // 2. Push the store's HEAD to every target remote (fast-forward only; primary first).
  if (NO_PUSH) console.log('[push-gitee] --no-push: skipping the push.');
  else for (const name of targets) pushToRemote(name);

  // 3. Mirror the store back into the dev tree so it reflects the pushed state.
  mirrorIntoDev();
}

main();
