// tools/push-assets-relay.mjs — publish this checkout to the owner's art relay (docs/ASSETS.md, "The relay").
//
// Publishing order (owner's rule, 2026-10-14): **this first, then gitee / github**. The relay is the origin every client
// hits first, so it has to hold the bytes before a page can ask for them — and it must not depend on the gitee mirror
// being current.
//
// The relay is a bare repository with a `post-receive` hook that checks the pushed branch out into the tree nginx
// serves (`/srv/sp/public`), so **a push IS the deploy**. Its history was fetched from gitee once (fast inside CN), so
// a push from here carries only the new objects.
//
// Usage: node tools/push-assets-relay.mjs [--dry-run] [--branch <b>] [--host <h>] [--key <path>] [--url <git-url>]
//   --dry-run     report what would be pushed (git push --dry-run)
//   --branch      branch to deploy on the relay (default master; SP_RELAY_BRANCH)
//   --host        relay host (default 123.57.150.185; SP_RELAY_HOST)
//   --key         ssh private key (default ~/.ssh/sp-deploy; SP_RELAY_KEY; `-` for the agent/ssh config)
//   --url         full git URL of the relay's bare repo (default root@<host>:/srv/sp.git; SP_RELAY_URL)
//
// Exit codes: 0 pushed (or nothing to do); 1 the push failed.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_RELAY_HOST = '123.57.150.185';
/** The bare repo the post-receive hook deploys from (`git --work-tree=/srv/sp`). */
export const DEFAULT_RELAY_DIR = '/srv/sp.git';
export const DEFAULT_KEY = '~/.ssh/sp-deploy';
export const DEFAULT_BRANCH = 'master';

/**
 * The relay's git URL. `root` because the relay takes the owner's deploy key (docs/ASSETS.md "The relay").
 * @param {string} [host]
 * @param {string} [dir]
 */
export function relayUrl(host = DEFAULT_RELAY_HOST, dir = DEFAULT_RELAY_DIR) {
  return `root@${host}:${dir}`;
}

/** `~` → the home directory, so the key resolves on Windows too (ssh does not expand it there). */
export function expandKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  if (k === '-') return '';
  return k.startsWith('~') ? path.join(homedir(), k.slice(1).replace(/^[/\\]/, '')) : k;
}

/** The ssh command git hands to the transport (the deploy key, never a password). The key is quoted and slash-normalised:
 *  `GIT_SSH_COMMAND` goes through a shell, and on Windows an unquoted `C:\Users\…` loses its backslashes. */
export function sshCommand(key) {
  const k = expandKey(key);
  const parts = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];
  if (k) parts.push('-i', `"${k.split(path.sep).join('/')}"`);
  return parts.join(' ');
}

/** @param {string[]} argv @returns {{ help: boolean, dry: boolean, branch: string, host: string, key: string, url: string }} */
export function parseArgs(argv = []) {
  const val = (f, d) => {
    const i = argv.indexOf(f);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  const host = val('--host', process.env.SP_RELAY_HOST || DEFAULT_RELAY_HOST);
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    dry: argv.includes('--dry-run'),
    branch: val('--branch', process.env.SP_RELAY_BRANCH || DEFAULT_BRANCH),
    host,
    key: val('--key', process.env.SP_RELAY_KEY || DEFAULT_KEY),
    url: val('--url', process.env.SP_RELAY_URL || relayUrl(host)),
  };
}

const USAGE = 'usage: node tools/push-assets-relay.mjs [--dry-run] [--branch <b>] [--host <h>] [--key <path>] [--url <git-url>]';

/**
 * Push HEAD to the relay's bare repo. The hook there checks the branch out, so the push deploys it.
 * @param {{ url: string, branch: string, key: string, dry?: boolean, cwd?: string }} o
 * @returns {{ ok: boolean, out: string, err: string }}
 */
export function pushToRelay({ url, branch, key, dry = false, cwd = process.cwd() } = {}) {
  const args = ['-C', cwd, 'push'];
  if (dry) args.push('--dry-run');
  args.push(url, `HEAD:refs/heads/${branch}`);
  try {
    const out = execFileSync('git', args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_SSH_COMMAND: sshCommand(key) },
    });
    return { ok: true, out: String(out).trim(), err: '' };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '').trim(), err: String(e.stderr || e.message || '').trim() };
  }
}

export function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  if (o.help) { console.log(USAGE); return 0; }
  if (!o.branch) { console.error(`push-assets-relay: no branch to deploy\n${USAGE}`); return 1; }
  console.log(`relay   ${o.url}`);
  console.log(`branch  ${o.branch}${o.dry ? '   (dry run)' : ''}`);
  const r = pushToRelay({ url: o.url, branch: o.branch, key: o.key, dry: o.dry });
  if (r.out) console.log(r.out);
  if (!r.ok) {
    console.error(`push-assets-relay: FAILED\n  ${r.err.split('\n').slice(0, 6).join('\n  ')}`);
    console.error('  (is the relay reachable? is the key installed? docs/ASSETS.md "The relay")');
    return 1;
  }
  console.log('relay deploy ok — now push the same commit to gitee / github');
  return 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) process.exit(main(process.argv.slice(2)));
