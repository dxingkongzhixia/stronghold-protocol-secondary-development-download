// test/push-gitee.test.js — tools/push-gitee.mjs publishes the git STORE to Gitee and re-mirrors the dev tree.
// The direction is unidirectional: **store → gitee → dev tree, never the reverse**. A stale dev tree must never be
// committed over the store (that reverted newer commits — the hazard this pins, docs/AI-WORKFLOW.md §c), and a
// normal run pushes the store and restores the dev tree from it. The old reverse sync is opt-in (`--from-dev`, off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'tools', 'push-gitee.mjs');

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}
function write(dir, rel, text) {
  const abs = join(dir, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}
function read(dir, rel) { return readFileSync(join(dir, ...rel.split('/')), 'utf8'); }
function initStore(store) {
  mkdirSync(store, { recursive: true });
  git(store, ['init', '-q', '-b', 'ours']);
  git(store, ['config', 'user.email', 'test@example.test']);
  git(store, ['config', 'user.name', 'test']);
  git(store, ['config', 'commit.gpgsign', 'false']);
  git(store, ['config', 'core.autocrlf', 'false']);
}
function commit(store, msg, files) {
  for (const [rel, text] of Object.entries(files)) write(store, rel, text);
  git(store, ['add', '-A']);
  git(store, ['commit', '-q', '-m', msg]);
}
/** Export HEAD's tracked files into the dev mirror (no .git) — a fresh checkout of the store. */
function exportToDev(store, dev) {
  mkdirSync(dev, { recursive: true });
  for (const rel of git(store, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter(Boolean)) {
    const abs = join(dev, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    copyFileSync(join(store, ...rel.split('/')), abs);
  }
}
function initBare(remote) { git(dirname(remote), ['init', '-q', '--bare', remote]); }
function run(args, store, dev) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SP_SCRATCH: store, SP_DEV_TREE: dev, GIT_TERMINAL_PROMPT: '0' },
  });
}
/** A throwaway store + dev mirror, removed when the test ends. */
function scenario(t) {
  const root = mkdtempSync(join(tmpdir(), 'push-gitee-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('--help documents the unidirectional flow, the two remotes and the opt-in --from-dev', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--from-dev/);
  assert.match(r.stdout, /--dry-run/);
  assert.match(r.stdout, /--no-push/);
  assert.match(r.stdout, /--remote <name>/);
  assert.match(r.stdout, /--all-remotes/);
  assert.match(r.stdout, /--tags/);
  assert.match(r.stdout, /github \(primary\)/);
  assert.match(r.stdout, /gitee \(mirror\)/);
});

test('store ahead of a stale dev tree: --dry-run reports only, and changes nothing anywhere', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n', 'sub/b.txt': 'bee\n' });
  exportToDev(store, dev);
  commit(store, 'two', { 'a.txt': 'store-two\n', 'sub/c.txt': 'see\n' });
  write(dev, 'scratch.tmp', 'dev only\n'); // untracked and not ignored

  const head = git(store, ['rev-parse', 'HEAD']);
  const tree = git(store, ['ls-tree', '-r', 'HEAD']);
  const r = run(['--dry-run'], store, dev);

  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout + r.stderr, /WARNING: the dev tree differs/);
  assert.match(r.stdout, /--dry-run: nothing staged, committed, pushed or mirrored/);
  assert.equal(git(store, ['rev-parse', 'HEAD']), head, 'store HEAD is unchanged');
  assert.equal(git(store, ['ls-tree', '-r', 'HEAD']), tree, 'store tracked content is unchanged');
  assert.equal(git(store, ['status', '--porcelain']).trim(), '', 'store work tree stays clean');
  assert.equal(read(dev, 'a.txt'), 'one\n', 'the dev tree is not touched by a dry run');
  assert.ok(!existsSync(join(dev, 'sub', 'c.txt')), 'and nothing is mirrored');
});

test('store ahead of a stale dev tree: a real --no-push never rewrites the store and mirrors the dev tree', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n', 'sub/b.txt': 'bee\n' });
  exportToDev(store, dev);
  commit(store, 'two', { 'a.txt': 'store-two\n', 'sub/c.txt': 'see\n' });
  write(dev, 'scratch.tmp', 'dev only\n');

  const head = git(store, ['rev-parse', 'HEAD']);
  const tree = git(store, ['ls-tree', '-r', 'HEAD']);
  const r = run(['--no-push'], store, dev);

  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(git(store, ['rev-parse', 'HEAD']), head, 'the store commit is never reverted');
  assert.equal(git(store, ['ls-tree', '-r', 'HEAD']), tree, 'the store tracked content is untouched');
  assert.equal(git(store, ['status', '--porcelain']).trim(), '', 'no dev-tree content was staged');
  assert.equal(read(dev, 'a.txt'), 'store-two\n', 'the dev tree is restored from the store');
  assert.equal(read(dev, 'sub/c.txt'), 'see\n', 'new store files reach the dev tree');
  assert.equal(read(dev, 'scratch.tmp'), 'dev only\n', 'dev-only untracked files are never deleted');
});

test('a normal run pushes the store HEAD to gitee/master and mirrors the dev tree', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev'), remote = join(root, 'remote.git');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  commit(store, 'two', { 'a.txt': 'store-two\n', 'sub/c.txt': 'see\n' });
  initBare(remote);
  git(store, ['remote', 'add', 'gitee', remote]);

  const head = git(store, ['rev-parse', 'HEAD']);
  const r = run([], store, dev);

  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /pushed to gitee\/master/);
  assert.equal(git(remote, ['rev-parse', 'master']), head, 'the remote ends at the store HEAD');
  assert.equal(read(dev, 'a.txt'), 'store-two\n', 'the dev tree mirrors the pushed state');
  assert.equal(read(dev, 'sub/c.txt'), 'see\n');
  assert.equal(git(store, ['rev-parse', 'HEAD']), head, 'publishing an in-sync store creates no commit');
});

test('a run pushes to every configured remote: github (primary) first, then the gitee mirror', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  const github = join(root, 'github.git'), gitee = join(root, 'gitee.git');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  commit(store, 'two', { 'a.txt': 'store-two\n', 'sub/c.txt': 'see\n' });
  initBare(github);
  initBare(gitee);
  git(store, ['remote', 'add', 'github', github]);
  git(store, ['remote', 'add', 'gitee', gitee]);

  const head = git(store, ['rev-parse', 'HEAD']);
  const r = run([], store, dev);

  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /pushed to github\/master/, 'the primary is pushed');
  assert.match(r.stdout, /pushed to gitee\/master/, 'the mirror is pushed');
  assert.ok(r.stdout.indexOf('pushed to github/master') < r.stdout.indexOf('pushed to gitee/master'), 'github (primary) goes first');
  assert.equal(git(github, ['rev-parse', 'master']), head, 'the primary ends at the store HEAD');
  assert.equal(git(gitee, ['rev-parse', 'master']), head, 'the mirror ends at the store HEAD');
});

test('--remote restricts the push to the named remote (default pushes to all configured ones)', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  const github = join(root, 'github.git'), gitee = join(root, 'gitee.git');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  initBare(github);
  initBare(gitee);
  git(store, ['remote', 'add', 'github', github]);
  git(store, ['remote', 'add', 'gitee', gitee]);

  const r = run(['--remote', 'gitee'], store, dev);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /pushed to gitee\/master/);
  assert.ok(!/pushed to github/.test(r.stdout), 'the primary is untouched when --remote names only the mirror');
  const githubHasMaster = spawnSync('git', ['-C', github, 'rev-parse', '--verify', 'master'], { encoding: 'utf8' });
  assert.notEqual(githubHasMaster.status, 0, 'the primary still has no master');
});

test('--tags pushes the tags (refs/tags/*) to the target remote, never forced', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  const gitee = join(root, 'gitee.git');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  git(store, ['tag', 'backup/pre-3d-scenes']);
  initBare(gitee);
  git(store, ['remote', 'add', 'gitee', gitee]);

  const r = run(['--remote', 'gitee', '--tags'], store, dev);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(git(gitee, ['tag', '-l']), /backup\/pre-3d-scenes/, 'the tag reached the remote');
});

test('--all-remotes forces both even when the store has only one configured remote', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  const gitee = join(root, 'gitee.git');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  initBare(gitee);
  git(store, ['remote', 'add', 'gitee', gitee]);
  // a `github` remote that already exists (a local bare) so --all-remotes never reaches the network
  const github = join(root, 'github.git');
  initBare(github);
  git(store, ['remote', 'add', 'github', github]);

  const r = run(['--all-remotes'], store, dev);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /pushed to github\/master/);
  assert.match(r.stdout, /pushed to gitee\/master/);
});

test('an unknown --remote fails clearly (no convention URL to add, no network)', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);

  const r = run(['--remote', 'nope'], store, dev);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /unknown remote 'nope'/);
});

test('a diverged remote is rejected, never force-pushed', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  const remote = join(root, 'remote.git'), clone = join(root, 'clone');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  initBare(remote);
  git(store, ['remote', 'add', 'gitee', remote]);
  assert.equal(run([], store, dev).status, 0, 'the first push lands');

  // the mirror remote gains a commit the store does not have
  git(dirname(clone), ['clone', '-q', remote, clone]);
  git(clone, ['config', 'user.email', 'test@example.test']);
  git(clone, ['config', 'user.name', 'test']);
  write(clone, 'remote-only.txt', 'remote\n');
  git(clone, ['add', '-A']);
  git(clone, ['commit', '-q', '-m', 'remote only']);
  git(clone, ['push', '-q', 'origin', 'master']);
  const remoteHead = git(remote, ['rev-parse', 'master']);

  const r = run([], store, dev);
  assert.notEqual(r.status, 0, 'a non-fast-forward push fails');
  assert.match(r.stderr + r.stdout, /never forced|non-fast-forward|rejected/);
  assert.equal(git(remote, ['rev-parse', 'master']), remoteHead, 'the remote is not rewritten');
});

test('--from-dev is the explicit opt-in reverse sync; without it the dev tree is never committed', (t) => {
  const root = scenario(t);
  const store = join(root, 'store'), dev = join(root, 'dev');
  initStore(store);
  commit(store, 'one', { '.gitignore': 'ignored.txt\n', 'a.txt': 'one\n' });
  exportToDev(store, dev);
  const before = git(store, ['rev-parse', 'HEAD']);

  // default: a dev-tree edit is warned about, not committed; the dev tree is restored from the store
  write(dev, 'a.txt', 'dev edit\n');
  write(dev, 'new.txt', 'brand new\n');
  const plain = run(['--no-push'], store, dev);
  assert.equal(plain.status, 0, plain.stderr + plain.stdout);
  assert.equal(git(store, ['rev-parse', 'HEAD']), before, 'the default run does not commit dev content');
  assert.equal(read(dev, 'a.txt'), 'one\n', 'the dev tree is restored from the store');
  assert.ok(existsSync(join(dev, 'new.txt')), 'a dev-only untracked file is left in place');
  assert.ok(!existsSync(join(store, 'new.txt')), 'and is not committed to the store by default');

  // opt-in: --from-dev copies the dev tree into the store and commits it
  write(dev, 'a.txt', 'dev edit\n');
  const opt = run(['--from-dev', '--no-push', '-m', 'dev wins'], store, dev);
  assert.equal(opt.status, 0, opt.stderr + opt.stdout);
  assert.notEqual(git(store, ['rev-parse', 'HEAD']), before, '--from-dev makes a new store commit');
  assert.equal(read(store, 'a.txt'), 'dev edit\n');
  assert.equal(read(store, 'new.txt'), 'brand new\n');
  assert.match(git(store, ['log', '-1', '--oneline']), /dev wins/);
});
