// test/keel/wiring.test.js — the M1.5 room source and the guarded `newBattle` attach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchCombat } from '../../server/match/match/combat.js';
import { createKeelDescriptor, keelDescriptorForContent, loadKeelPlugin, loadKeelPluginMap } from '../../server/keel/room-source.js';
import { resetExtensions } from '../../server/sim/content/extensions.js';
import { wireOptions } from '../../server/match/host/proxy.js';
import { makeMatch } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'test/fixtures/keel-demo');

const manifest = () => ({
  manifest: 3, id: 'demo', name: 'Demo', version: '1.0.0', app: '*',
  api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
  modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read'] }],
  state: { version: 1 },
});
const plugin = () => ({ id: 'demo', manifest: manifest(), modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read'], code: { hooks: {} } }] });
const descriptor = () => ({ plugins: [plugin()] });

class StubBattle {
  constructor(opts) { this.opts = opts; this.time = 0; this.seed = 1; this.units = []; this._hooks = {}; }
  on(name, fn, opts = {}) { (this._hooks[name] ??= []).push({ fn, owner: opts.owner }); return { name, fn }; }
  offOwner(owner) {
    for (const k of Object.keys(this._hooks)) {
      this._hooks[k] = this._hooks[k].filter((h) => h.owner !== owner);
      if (!this._hooks[k].length) delete this._hooks[k];
    }
  }
  fx() {}
}

function fakeMatch(keel = null) {
  return {
    ds: {}, battleContent: 'full', keel,
    log: { warn() {} }, reportError: (...args) => { fakeMatch.errors.push(args); },
    BattleClass: StubBattle,
  };
}
fakeMatch.errors = [];

test('the room source skips a manifest-2 folder and loads a manifest-3 fixture', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-old-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tmp, 'plugin.json'), JSON.stringify({ manifest: 2, id: 'old', name: 'old', version: '1.0.0', app: '*', api: 1, class: 'content', scope: ['room'] }));
  assert.equal(await loadKeelPlugin(tmp), null);
  const loaded = await loadKeelPlugin(FIXTURE);
  assert.equal(loaded.id, 'keel-demo');
  assert.equal(loaded.modules.length, 1);
  assert.equal(loaded.problems.length, 0);
  const d = await createKeelDescriptor([FIXTURE, tmp]);
  assert.equal(d.plugins.length, 1);
  assert.equal(d.plugins[0].manifest.id, 'keel-demo');
});

test('a plugin map picks only the ids a room content set names', async () => {
  const map = await loadKeelPluginMap(path.join(ROOT, 'test/fixtures'), { mode: 'sandbox' });
  assert.equal(map.has('keel-demo'), true);
  const content = { plugins: [{ id: 'keel-demo' }, { id: 'not-installed' }] };
  const d = keelDescriptorForContent(content, map);
  assert.equal(d.plugins.length, 1);
  assert.equal(d.plugins[0].manifest.id, 'keel-demo');
  assert.equal(keelDescriptorForContent({ plugins: [{ id: 'not-installed' }] }, map), null);
  assert.equal(keelDescriptorForContent(null, map), null);
});

test('newBattle attaches with a Keel descriptor', () => {
  const on = MatchCombat.prototype.newBattle.call(fakeMatch(descriptor()), { fieldId: 'n:1' });
  assert.equal(on.keel.length, 1);
  assert.equal(on.keel[0].owner, 'keel:demo');
  on.keel[0].detach();
  assert.equal(Object.keys(on._hooks).length, 0);

  const none = MatchCombat.prototype.newBattle.call(fakeMatch(null), { fieldId: 'n:1' });
  assert.equal(none.keel, undefined);
});

test('a v2 opt-in plugin loads its setup(sp) and Match runs it before a battle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-v2-'));
  const old = { KEEL: process.env.KEEL, KEEL_V2: process.env.KEEL_V2 };
  try {
    fs.mkdirSync(path.join(dir, 'sim'));
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/keel/v2-script.js'), path.join(dir, 'sim/index.js'));
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ manifest: 2, id: 'keel-v2-demo', name: 'v2 demo', version: '1.0.0', app: '*', api: 1, class: 'script', permissions: ['sim.code'], entry: { sim: 'sim/index.js' } }));
    fs.writeFileSync(path.join(dir, 'plugin.keel.json'), JSON.stringify({
      manifest: 3, id: 'keel-v2-demo', name: 'v2 demo', version: '1.0.0', app: '*', api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
      modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
      compat: { v2Script: true },
      legacy: { class: 'script', permissions: ['sim.code'], entry: { sim: 'sim/index.js' } },
    }));
    const loaded = await loadKeelPlugin(dir);
    assert.ok(loaded.v2, 'v2 descriptor');
    assert.equal(loaded.modules.length, 0);
    assert.equal(typeof loaded.v2.setup, 'function');

    process.env.KEEL = '1';
    process.env.KEEL_V2 = '1';
    const h = makeMatch({ keel: { plugins: [loaded] }, humans: 1, seed: 3 });
    assert.ok(h.m.keelV2, 'Match ran the v2 setup');
    assert.equal(h.m.keelV2.registrations.some((r) => r.key === 'kit:char_x_script_demo_guard'), true);
    const denied = makeMatch({
      keel: { plugins: [loaded] }, seed: 4,
      seats: [{ seat: 0, playerId: 'p_0', name: 'P', isBot: false, connected: true, consent: false }],
    });
    assert.equal(denied.m.keelV2, null);
    assert.match(denied.m.keelV2Error?.message ?? '', /PLUGIN_CONSENT/);
  } finally {
    resetExtensions();
    fs.rmSync(dir, { recursive: true, force: true });
    if (old.KEEL === undefined) delete process.env.KEEL; else process.env.KEEL = old.KEEL;
    if (old.KEEL_V2 === undefined) delete process.env.KEEL_V2; else process.env.KEEL_V2 = old.KEEL_V2;
  }
});

test('the match host wire carries only the durable Keel descriptor, never module functions', () => {
  const keel = { plugins: [{
    id: 'keel-demo', dir: 'D:/plugins/keel-demo', manifest: { manifest: 3, id: 'keel-demo' },
    modules: [{ kind: 'sim', code: { setup() {} } }], content: { records: [] }, v2: { setup() {} },
  }] };
  const out = wireOptions({ roomCode: 'TEST', mode: 'coop', keel });
  assert.deepEqual(out.keel, { plugins: [{ id: 'keel-demo', origin: 'folder', dir: 'D:/plugins/keel-demo', manifest: { manifest: 3, id: 'keel-demo' } }] });
  assert.equal('modules' in out.keel.plugins[0], false);
  assert.equal('v2' in out.keel.plugins[0], false);
});

test('a builtin Keel plugin carries serializable content, not a folder', () => {
  const content = { records: [], patches: [{ rel: 'builtin/x.json', ops: [] }], documents: {}, files: {}, hash: 'h', pluginId: 'faction-x' };
  const out = wireOptions({ roomCode: 'TEST', keel: { plugins: [{ id: 'faction-x', manifest: { manifest: 3 }, content }] } });
  assert.deepEqual(out.keel.plugins[0], { id: 'faction-x', origin: 'builtin', manifest: { manifest: 3 }, content: { ...content, permissions: [], dsl: [], i18n: [] } });
});
