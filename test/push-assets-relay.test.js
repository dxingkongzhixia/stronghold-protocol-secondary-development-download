// test/push-assets-relay.test.js — tools/push-assets-relay.mjs.
//
// The pure parts (the relay URL, the key expansion, the ssh command, the arguments) and one dry run against the real
// repository — no network: --dry-run stops at git's own report.
// Run: node --test test/push-assets-relay.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RELAY_DIR, DEFAULT_RELAY_HOST, DEFAULT_RELAY_PORT, expandKey, parseArgs, pushToRelay, relayUrl, sshCommand,
} from '../tools/push-assets-relay.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the relay URL names the owner’s box, its NAT ssh port and the bare repo the hook deploys from', () => {
  assert.equal(relayUrl(), `ssh://root@${DEFAULT_RELAY_HOST}:${DEFAULT_RELAY_PORT}${DEFAULT_RELAY_DIR}`);
  assert.equal(relayUrl('10.0.0.1', '/srv/x.git', 22), 'root@10.0.0.1:/srv/x.git', 'the default port keeps the scp form');
  assert.equal(relayUrl('10.0.0.1', '/srv/x.git', 2222), 'ssh://root@10.0.0.1:2222/srv/x.git');
});

test('the key expands (~ resolves on Windows too) and never rides as a password', () => {
  assert.equal(expandKey('~/.ssh/sp-deploy'), path.join(homedir(), '.ssh', 'sp-deploy'));
  assert.equal(expandKey('/abs/key'), '/abs/key');
  assert.equal(expandKey('-'), '', 'dash = the agent / ssh config');
  const cmd = sshCommand('~/.ssh/sp-deploy');
  assert.match(cmd, /^ssh /);
  assert.match(cmd, /-o BatchMode=yes/, 'never prompt: a missing key must fail, not hang');
  assert.ok(cmd.includes(path.join(homedir(), '.ssh', 'sp-deploy').split(path.sep).join('/')), 'the key path survives the shell');
  assert.doesNotMatch(cmd, /sshpass|password/i, 'the key rides in the ssh command, never a password');
  assert.equal(sshCommand('-').includes('-i'), false);
});

test('arguments and their environment fallbacks', () => {
  const d = parseArgs([]);
  assert.equal(d.branch, 'master');
  assert.equal(d.host, DEFAULT_RELAY_HOST);
  assert.equal(d.key, '~/.ssh/sp-deploy');
  assert.equal(d.url, relayUrl(DEFAULT_RELAY_HOST, DEFAULT_RELAY_DIR, DEFAULT_RELAY_PORT));
  assert.equal(d.dry, false);
  const o = parseArgs(['--dry-run', '--branch', 'release', '--host', 'relay.example', '--key', '/k', '--url', 'u']);
  assert.deepEqual([o.dry, o.branch, o.host, o.key, o.url], [true, 'release', 'relay.example', '/k', 'u']);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('the push never throws: a bad target comes back as a reportable failure', () => {
  const r = pushToRelay({ url: 'root@127.0.0.1:1/nonexistent.git', branch: 'master', key: '-', dry: true, cwd: ROOT });
  assert.equal(typeof r.ok, 'boolean');
  if (!r.ok) assert.ok(r.err.length > 0, 'a failure explains itself');
});
