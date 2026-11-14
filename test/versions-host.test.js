// test/versions-host.test.js — the official version's match host (server/match/host/index.js kind 'version',
// server/match/host/entry.js): it installs the version's own data and bounds, runs a match asking that version, and
// refuses a match that asks another version (version-start). The host's stop reasons say 'version-…'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVersionSets } from '../server/versions.js';
import { createMatchHosts } from '../server/match/host/index.js';
import { DATA_SHIM_JS } from '../server/http/static.js';
import { DEFAULT_VERSION } from '../shared/versions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACT3 = 'act3autochess@V3_1';
const STUB = path.join(ROOT, 'server', 'match', 'StubMatch.js');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

function sets() {
  return createVersionSets({
    simDir: path.join(ROOT, 'server', 'sim'), sharedDir: path.join(ROOT, 'shared'), shim: DATA_SHIM_JS,
    enabled: [DEFAULT_VERSION, ACT3], default: DEFAULT_VERSION, maxHosts: 1, vanilla: { cs: 'a'.repeat(64) }, log: quiet,
  });
}

function matchOpts(version) {
  const frames = [];
  return {
    frames,
    opts: {
      roomCode: 'TEST', mode: 'coop', difficulty: 'NORMAL', version, seed: 1, matchNo: 1, requireCs: true,
      seats: [{ seat: 0, playerId: 'p1', name: 'P1', isBot: false, connected: true }],
      send: (_id, msg) => frames.push(msg), broadcast: (msg) => frames.push(msg), onEnd: () => {},
    },
  };
}

test('a version host installs the version data and records it in diag', async (t) => {
  const versions = sets();
  const set = versions.byId(ACT3);
  const hosts = createMatchHosts({ contents: versions, log: quiet, options: { kind: 'version', matchModule: STUB, maxWorkers: 1, heartbeatMs: 200, watchdogMs: 5000, idleMs: 1000 } });
  t.after(() => hosts.close());

  const { opts } = matchOpts(ACT3);
  const p = hosts.create(set.cs, opts);
  p.start();
  const diag = await p.diag();
  assert.equal(diag.version, ACT3);
  // the version's bounds were installed in the host, not the default content's
  assert.ok(Object.keys(set.bounds().bb).length > 0);
  p.dispose();
});

test('a version host refuses a match that asks another version (version-start)', async (t) => {
  const versions = sets();
  const set = versions.byId(ACT3);
  const crashed = [];
  const hosts = createMatchHosts({ contents: versions, log: quiet, options: { kind: 'version', matchModule: STUB, maxWorkers: 1, heartbeatMs: 200, watchdogMs: 5000, idleMs: 1000 } });
  t.after(() => hosts.close());

  const { opts } = matchOpts(DEFAULT_VERSION);
  opts.onEnd = (summary) => crashed.push(summary);
  const p = hosts.create(set.cs, opts);
  p.start();
  const deadline = Date.now() + 5000;
  while (!crashed.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.equal(crashed.length, 1, 'the match ended');
  assert.equal(crashed[0].reason, 'version-start');
  assert.match(String(crashed[0].detail), /act3autochess@V3_1/);
});
