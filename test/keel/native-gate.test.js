// test/keel/native-gate.test.js — native Keel code (sim / match / policy) runs only when the owner's trust gate allows
// it, and its module is not even imported before that decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readKeelManifest } from '../../shared/keel/index.js';
import { loadKeelPlugin, loadKeelPluginMap } from '../../server/keel/room-source.js';
import { packPlugin } from '../../server/plugins/pack.js';
import { makeMatch } from '../match/harness.js';
import { PHASE } from '../../shared/constants.js';

function nativePlugin(t, suffix = '') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-native-gate-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = `native-gate${suffix}`;
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  const marker = `__KEEL_NATIVE_${id.replace(/[^a-z0-9]/gi, '_')}__`;
  fs.writeFileSync(path.join(dir, 'sim/index.js'), [
    `globalThis.${marker} = (globalThis.${marker} || 0) + 1;`,
    'export default { setup() {}, hooks: {} };',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id, name: { zh: '原生门示例', en: 'Native gate demo' }, version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
  }, null, 2));
  return { tmp, dir, id, marker };
}

function metaPlugin(t, suffix = '') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-meta-gate-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = `meta-gate${suffix}`;
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, 'policy'), { recursive: true });
  const marker = `__KEEL_META_${id.replace(/[^a-z0-9]/gi, '_')}__`;
  fs.writeFileSync(path.join(dir, 'policy/index.js'), [
    `globalThis.${marker} = (globalThis.${marker} || 0) + 1;`,
    'export default { setup() {}, hooks: {} };',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id, name: { zh: 'Meta 门示例', en: 'Meta gate demo' }, version: '1.0.0', app: '*',
    api: { policy: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'policy', entry: 'policy/index.js', permissions: ['policy.observe'] }],
  }, null, 2));
  return { tmp, dir, id, marker };
}

test('a code module under data trust is refused by the manifest', () => {
  const checked = readKeelManifest({
    manifest: 3, id: 'data-code', name: 'Data code', version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'data',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
  }, { id: 'data-code' });
  assert.equal(checked.manifest, null);
  assert.ok((checked.issues ?? []).some((i) => i.code === 'KEEL_TRUST_CODE'), JSON.stringify(checked.problems));
});

test('the room map never imports native code; a direct loader runs it', async (t) => {
  const { tmp, dir, id, marker } = nativePlugin(t);
  const locked = packPlugin(dir, { dataDir: path.join(process.cwd(), 'data') });
  assert.equal(locked.wrote, true, JSON.stringify(locked.build?.issues ?? []));

  // no SP_PLUGIN_SCRIPTS mode: the plugin is not in the room map and its module never runs
  const denied = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: '' });
  assert.equal(denied.has(id), false);
  assert.equal(globalThis[marker], undefined, 'top-level code did not run');

  // sandbox mode + the lock the packer wrote: the plugin is in the room map, but the server does not import it (D10)
  const allowed = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  const entry = allowed.get(id);
  assert.ok(entry, 'the plugin is in the room map');
  assert.equal(entry.modules.length, 0, 'the room map carries no native functions');
  assert.equal(entry.native.execution, 'sandbox');
  assert.equal(globalThis[marker], undefined, 'the room map did not run the module');

  // only a direct loader (keel run, tools/tests) imports the module
  const direct = await loadKeelPlugin(dir);
  assert.equal(direct.modules.length, 1);
  assert.equal(globalThis[marker], 1, 'the direct loader ran the module once');

  // a direct load can defer the import too
  delete globalThis[marker];
  const deferred = await loadKeelPlugin(dir, { code: false });
  assert.deepEqual(deferred.problems, []);
  assert.equal(deferred.modules.length, 0);
  assert.deepEqual(deferred.native.entries, ['sim/index.js']);
  assert.equal(globalThis[marker], undefined);
});

test('a stale lock keeps native code out of the room map', async (t) => {
  const { tmp, dir, id, marker } = nativePlugin(t, '-stale');
  const locked = packPlugin(dir, { dataDir: path.join(process.cwd(), 'data') });
  assert.equal(locked.wrote, true, JSON.stringify(locked.build?.issues ?? []));
  fs.appendFileSync(path.join(dir, 'sim/index.js'), '\n// changed after the lock\n');
  const map = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  assert.equal(map.has(id), false);
  assert.equal(globalThis[marker], undefined);
});

test('a native sim-code room turns result verification off; the server never runs sim', async (t) => {
  const { dir, id } = nativePlugin(t, '-match');
  const loaded = await loadKeelPlugin(dir, { code: false });
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    keel: { plugins: [{ id, dir, manifest: loaded.manifest, modules: [] }] },
    humans: 1, seed: 1, clientCombat: false, verify: 'all', fake: true,
  });
  assert.equal(h.m.nativeCode, true);
  assert.equal(h.m.simCode, true);
  assert.equal(h.m.metaCode, false);
  assert.equal(h.m.clientCombat, false, 'an explicit legacy mode is not silently overridden');
  assert.equal(h.m.verifyMode, 'off', 'native rooms are not re-simulated on the server');
});

test('meta-only Keel modules load in the server (code:"meta"), never as sim; verification stays', async (t) => {
  const { dir, id, marker } = metaPlugin(t);
  const none = await loadKeelPlugin(dir, { code: false });
  assert.equal(none.modules.length, 0);
  assert.equal(globalThis[marker], undefined);
  const meta = await loadKeelPlugin(dir, { code: 'meta' });
  assert.equal(meta.modules.length, 1);
  assert.equal(meta.modules[0].kind, 'policy');
  assert.equal(globalThis[marker], 1, 'the meta loader ran the policy module');
  delete globalThis[marker];
  const all = await loadKeelPlugin(dir);
  assert.equal(all.modules.length, 1, 'the default loader also carries the policy module');
  // Node caches the module URL: its top-level body does not run a second time.

  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    keel: { plugins: [{ id, dir, manifest: meta.manifest,
      modules: [{ kind: 'policy', entry: 'policy/index.js', code: { setup() {}, hooks: {} } }] }] },
    humans: 1, seed: 1, verify: 'all', fake: true,
  });
  assert.equal(h.m.simCode, false, 'a policy-only plugin does not force client-side combat');
  assert.equal(h.m.metaCode, true);
  assert.equal(h.m.verifyMode, 'all', 'meta code does not prevent battle-result verification');
  assert.ok(h.m.keelMatch, 'the match meta runtime carries the policy module');
});

test('a native entry that does not parse is reported and never served', async (t) => {
  const { tmp, dir, id } = nativePlugin(t, '-parse');
  fs.writeFileSync(path.join(dir, 'sim/index.js'), 'export default { setup( {\n');
  const loaded = await loadKeelPlugin(dir, { code: false });
  assert.ok(loaded.problems.some((p) => p.includes('KEEL_PARSE')), loaded.problems.join('\n'));
  const locked = packPlugin(dir, { dataDir: path.join(process.cwd(), 'data') });
  assert.equal(locked.wrote, true, JSON.stringify(locked.build?.issues ?? []));
  const map = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  assert.equal(map.has(id), false, 'a broken entry never reaches a browser');
});

test('a native sim room delegates a bot field to the host as a background start', async (t) => {
  const { dir, id } = nativePlugin(t, '-delegate');
  const loaded = await loadKeelPlugin(dir, { code: false });
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 5, fake: true, clientCombat: true,
    keel: { plugins: [{ id, dir, manifest: loaded.manifest, modules: [] }] },
  });
  t.after(() => h.m.dispose());
  h.autoHumans();
  h.m.start();
  h.runToPhase(PHASE.COMBAT, 1);
  const bg = h.sent.find(([pid, m]) => pid === 'p_0' && m.t === 'b.start' && m.background === true);
  assert.ok(bg, 'the host got a background b.start');
  assert.equal(bg[1].fieldId, 'n:ai_0', 'the bot field is the delegated one');
  assert.equal(bg[1].authoritative, true);
  assert.equal(bg[1].watch, false);
});

test('a disconnected authority hands its field to another browser first, then the server', async (t) => {
  const { dir, id } = nativePlugin(t, '-lost');
  const loaded = await loadKeelPlugin(dir, { code: false });
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    mode: 'coop', difficulty: 'NORMAL', humans: 2, bots: 1, seed: 11, fake: true, clientCombat: true, clients: false,
    hostId: 'p_0', keel: { plugins: [{ id, dir, manifest: loaded.manifest, modules: [] }] },
  });
  t.after(() => h.m.dispose());
  h.autoHumans();
  h.m.start();
  h.runToPhase(PHASE.COMBAT, 1);
  const m = h.m;
  const field = m.fields.find((f) => f.fieldId === 'n:p_0');
  assert.ok(field && field.authority === 'p_0');
  m.onDisconnect('p_0');
  assert.equal(field.mode, 'client', 'another browser runs it, not the server');
  assert.equal(field.authority, 'p_1');
  assert.equal(field.background, true);
  const bg = h.allTo('p_1', 'b.start').find((x) => x.fieldId === 'n:p_0');
  assert.ok(bg, 'the remaining browser got the field');
  assert.equal(bg.background, true);
  assert.equal(bg.authoritative, true);
  // no connected human is left: the server runs it (a real room would be disposed by the lobby)
  m.onDisconnect('p_1');
  assert.equal(field.mode, 'server');
  assert.ok(field.battle, 'the server built the content-only battle');
});

test('a boss field whose pair has no connected human goes to another browser, then the server', async (t) => {
  const { dir, id } = nativePlugin(t, '-boss');
  const loaded = await loadKeelPlugin(dir, { code: false });
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    mode: 'coop', difficulty: 'HARD', humans: 3, bots: 0, seed: 12, fake: true, clientCombat: true, instant: false,
    hostId: 'p_0', keel: { plugins: [{ id, dir, manifest: loaded.manifest, modules: [] }] },
  });
  t.after(() => h.m.dispose());
  h.autoHumans();
  h.m.start();
  h.drive(() => h.m.phase === PHASE.FINAL_ASSAULT);
  const m = h.m;
  const boss = m.fields.find((f) => (f.kind === 'boss' || f.kind === 'hidden') && f.players.length === 2);
  assert.ok(boss, 'a pair boss field exists');
  assert.ok(boss.authority, 'a browser runs it at first');
  for (const pid of boss.players) m.onDisconnect(pid);
  assert.equal(boss.mode, 'client', 'another browser takes the pair field');
  assert.equal(boss.background, true);
  assert.ok(!boss.players.includes(boss.authority), 'the authority is not one of the disconnected pair');
  const bg = h.allTo(boss.authority, 'b.start').find((x) => x.fieldId === boss.fieldId);
  assert.ok(bg && bg.background && bg.authoritative, 'the third browser got a background start');
  m.onDisconnect(boss.authority);
  assert.equal(boss.mode, 'server', 'with no connected human left the server runs it');
});

test('a 4-human + 4-bot native room keeps every field on a browser, the host first, at most 8 each', async (t) => {
  const { dir, id } = nativePlugin(t, '-room4');
  const loaded = await loadKeelPlugin(dir, { code: false });
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    mode: 'coop', difficulty: 'NORMAL', humans: 4, bots: 4, seed: 7, fake: true, clientCombat: true, clients: false,
    hostId: 'p_0', keel: { plugins: [{ id, dir, manifest: loaded.manifest, modules: [] }] },
  });
  t.after(() => h.m.dispose());
  h.autoHumans();
  h.m.start();
  h.runToPhase(PHASE.COMBAT, 1);
  const m = h.m;
  assert.equal(m.fields.length, 8, 'four humans + four bots');
  assert.ok(m.fields.every((f) => f.mode === 'client'), 'no field falls back to the server');
  for (let i = 0; i < 4; i++) {
    const own = m.fields.find((f) => f.fieldId === `n:p_${i}`);
    assert.ok(own, `human field n:p_${i}`);
    assert.equal(own.authority, `p_${i}`, 'a human runs its own field');
    assert.ok(!own.background, 'its own field is the view');
  }
  const botFields = m.fields.filter((f) => String(f.fieldId).startsWith('n:ai_'));
  assert.equal(botFields.length, 4);
  for (const f of botFields) {
    assert.equal(f.background, true, `${f.fieldId} is a background field`);
    assert.equal(f.executor, f.authority, 'the executor is recorded');
    const start = h.allTo(f.authority, 'b.start').find((x) => x.fieldId === f.fieldId);
    assert.ok(start, `${f.fieldId} got a b.start`);
    assert.equal(start.background, true);
    assert.equal(start.authoritative, true);
    assert.equal(start.watch, false);
  }
  assert.equal(new Set(botFields.map((f) => f.authority)).size, 4, 'the bots spread over the four browsers');
  assert.equal(botFields[0].authority, 'p_0', 'the room host takes the first free field');
  for (let i = 0; i < 4; i++) assert.ok(m._loadFor(`p_${i}`) <= 8, `p_${i} stays within the cap`);
});

test('a native room with no connected browser runs its fields on the server (content only, no sim code)', async (t) => {
  const { dir, id } = nativePlugin(t, '-fallback');
  const loaded = await loadKeelPlugin(dir, { code: false });
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });
  const h = makeMatch({
    mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 9, fake: true, clientCombat: true, clients: false,
    keel: { plugins: [{ id, dir, manifest: loaded.manifest, modules: [] }] },
  });
  t.after(() => h.m.dispose());
  h.autoHumans();
  // nobody can take a field: the sole human's socket is gone before the combat launch
  h.m.players.get('p_0').connected = false;
  h.m.start();
  h.runToPhase(PHASE.COMBAT, 1);
  const m = h.m;
  assert.equal(m.fields.length, 2);
  assert.ok(m.fields.every((f) => f.mode === 'server'), 'every field falls back to the server');
  assert.ok(m.fields.every((f) => !f.background && f.authority == null));
  assert.equal(h.sent.filter(([, msg]) => msg.t === 'b.start').length, 0, 'no browser start is sent');
  assert.ok(m.fields.every((f) => f.battle), 'the server built the battle from the content set');
});
