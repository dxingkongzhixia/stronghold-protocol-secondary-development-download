// test/keel/e2e-room.test.js �?a real Lobby room selects a Keel content plugin and serves its /cs; a manifest-2
// plugin still loads and composes on the same server (V0: KEEL=1 no longer means Keel-only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startServer } from '../../server/index.js';
import { packPlugin } from '../../server/plugins/pack.js';
import { TestClient } from '../helpers/wsClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The manifest-3 content plugin the room tests select. */
function writeKeelDemo(plugins) {
  const dir = path.join(plugins, 'keel-room-demo');
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data/patch.json'), JSON.stringify({ patch: 1, ops: [] }));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'keel-room-demo', name: 'Keel room demo', version: '1.0.0', app: '*',
    api: { content: 1 }, scope: ['room'], trust: 'data',
    modules: [{ kind: 'content', files: ['data/patch.json'], parts: { data: ['data/patch.json'] }, permissions: ['content.patch'] }],
  }));
}

test('a real room selects a Keel content plugin and serves its Keel /cs', { timeout: 60000 }, async (t) => {
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-keel-room-'));
  t.after(() => { fs.rmSync(tmp, { recursive: true, force: true }); if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const plugins = path.join(tmp, 'plugins');
  writeKeelDemo(plugins);
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: plugins, assetIndex: false });
  const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws');
  t.after(async () => { await c.terminate().catch(() => {}); await srv.close(); });
  const w = await c.hello('Host');
  c.id = w.playerId;
  assert.equal((await c.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' }, 30000)).t, 'ok');
  await c.waitFor('room.state', (s) => s.hostId === c.id, 20000);
  assert.equal((await c.request({ t: 'room.setPlugins', plugins: [{ id: 'keel-room-demo' }] }, 30000)).t, 'ok');
  const state = await c.waitFor('room.state', (s) => s.content?.plugins?.some((p) => p.id === 'keel-room-demo'), 20000);
  assert.equal(state.content.vanilla, false);
  const cs = state.content.cs;
  const base = srv.url.replace(/\/$/, '');
  const index = await (await fetch(`${base}/cs/${cs.slice(0, 16)}/index.json`)).json();
  assert.equal(index.vanilla, false);
  assert.ok(index.plugins.some((p) => p.id === 'keel-room-demo'));
});

test('a real Keel room serves its v2 script to the browser', { timeout: 60000 }, async (t) => {
  const old = { KEEL: process.env.KEEL, SCRIPTS: process.env.SP_PLUGIN_SCRIPTS };
  process.env.KEEL = '1';
  process.env.SP_PLUGIN_SCRIPTS = 'trusted-force';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-keel-script-'));
  t.after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (old.KEEL === undefined) delete process.env.KEEL; else process.env.KEEL = old.KEEL;
    if (old.SCRIPTS === undefined) delete process.env.SP_PLUGIN_SCRIPTS; else process.env.SP_PLUGIN_SCRIPTS = old.SCRIPTS;
  });
  const plugins = path.join(tmp, 'plugins');
  const dir = path.join(plugins, 'keel-script-room');
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sim/index.js'), 'export default function setup(sp) { sp.log?.("keel script room"); }\n');
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'keel-script-room', name: 'Keel script room', version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
    compat: { v2Script: true },
    legacy: { class: 'script', entry: { sim: 'sim/index.js' }, permissions: ['sim.code'] },
  }, null, 2));
  const packed = packPlugin(dir);
  assert.equal(packed.wrote, true, JSON.stringify(packed.build?.issues ?? []));
  const lockHash = createHash('sha256').update(fs.readFileSync(path.join(dir, 'plugin.lock.json'))).digest('hex');
  fs.writeFileSync(path.join(plugins, 'config.json'), JSON.stringify({ trusted: { 'keel-script-room': lockHash } }));
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: plugins, assetIndex: false });
  const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws');
  t.after(async () => { await c.terminate().catch(() => {}); await srv.close(); });
  const w = await c.hello('Host');
  c.id = w.playerId;
  assert.equal((await c.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' }, 30000)).t, 'ok');
  await c.waitFor('room.state', (s) => s.hostId === c.id, 20000);
  assert.equal((await c.request({ t: 'room.setPlugins', plugins: [{ id: 'keel-script-room' }] }, 30000)).t, 'ok');
  const state = await c.waitFor('room.state', (s) => s.content?.plugins?.some((p) => p.id === 'keel-script-room'), 20000);
  const cs = state.content.cs;
  const base = srv.url.replace(/\/$/, '');
  const index = await (await fetch(`${base}/cs/${cs.slice(0, 16)}/index.json`)).json();
  assert.equal(index.execution, 'trusted');
  assert.ok(index.scripts?.['keel-script-room'], 'the room index names the script');
  const body = await (await fetch(`${base}/cs/${cs.slice(0, 16)}/scripts/keel-script-room/sim/index.js`)).text();
  assert.match(body, /setup/);
});
