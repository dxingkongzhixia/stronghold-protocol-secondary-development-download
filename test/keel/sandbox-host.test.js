// test/keel/sandbox-host.test.js — Keel v2 setup inside a SES match host, not the main process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatchHosts } from '../../server/match/host/index.js';
import { scriptSet } from '../helpers/simHostFixture.js';
import { getData } from '../../server/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function composition() {
  const set = scriptSet('export default function setup() {}', 'sandbox', getData());
  const files = Object.fromEntries(Object.entries(set.data).map(([k, v]) => [k, Buffer.from(JSON.stringify(v))]));
  return { set, contents: { get: () => set, dataBytes: () => files } };
}

test('a Keel v2 setup runs in the sandbox host and its registry reaches Match', { timeout: 60000 }, async (t) => {
  const old = process.env.SP_PLUGIN_SCRIPTS;
  process.env.SP_PLUGIN_SCRIPTS = 'sandbox';
  t.after(() => { if (old === undefined) delete process.env.SP_PLUGIN_SCRIPTS; else process.env.SP_PLUGIN_SCRIPTS = old; });

  const dir = fs.mkdtempSync(path.join(ROOT, 'test/fixtures/keel-sandbox-'));
  const pluginDir = path.join(dir, 'keel-probe');
  fs.mkdirSync(path.join(pluginDir, 'sim'), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'sim/index.js'), `import { kit } from 'sp:sdk@1';\nexport default function setup(sp) { sp.kits.register('char_x_keel_probe', () => ({ skill: { kind: 'passive', mods: { atkFlat: 1 } } })); }\n`);
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'keel-probe', name: 'Keel probe', version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
    compat: { v2Script: true, manifest2: true },
    legacy: { class: 'script', permissions: ['sim.code'], entry: { sim: 'sim/index.js' } },
  }));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const { set, contents } = composition();
  const opts = {
    transport: 'process',
    matchModule: path.join(ROOT, 'test/fixtures/keelSandboxMatch.js'),
    heartbeatMs: 100,
    watchdogMs: 5000,
  };
  const hosts = createMatchHosts({ contents, log: { info() {}, warn() {}, error() {} }, options: opts });
  t.after(() => hosts.close());

  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const messages = [];
  const proxy = hosts.create(set.cs, {
    roomCode: 'TEST', cs: set.cs, requireCs: true,
    keel: { plugins: [{ id: 'keel-probe', dir: pluginDir, manifest: JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8')) }] },
    send() {}, broadcast: (m) => messages.push(m), onEnd: finish,
  });
  proxy.start();
  const timer = setTimeout(() => finish({ reason: 'test-timeout' }), 30000);
  await ended; clearTimeout(timer);

  const probe = messages.find((m) => m?.t === 'm.public')?.keelProbe;
  assert.deepEqual(probe, { ok: true, preloaded: true, sealed: true });
  assert.equal(proxy.ended, true);
});
