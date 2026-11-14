// test/ui/versions.test.js — the browser side of an official version (public/js/versions.js and content.js
// loadVersionSet): welcome.versions is sanitized to registry ids, the lobby preference falls back to the server's
// default, and a room's version set is downloaded from /data/versions/<slug>/ and /cs/<cs16>/ and checked — its
// manifest must be `vanilla: true` for the expected id, its data files must hash and size to their entries, its
// composition must hash to `cs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeVersions, lobbyVersion, serverDefaultVersion, roomVersion, versionSlug, DEFAULT_VERSION, versionById } from '../../public/js/versions.js';
import { loadVersionSet, installContentSet, contentSet, pageVersion } from '../../public/js/content.js';
import { createDataStore } from '../../public/js/data.js';
import { createStore, initialState } from '../../public/js/store.js';
import { contentHashOf } from '../../shared/plugins/identity.js';
import { versionSlug as slugOf } from '../../shared/versions.js';
import { sha256Hex } from '../../shared/sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ACT3 = 'act3autochess@V3_1';
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const DEFAULT_CS = 'a'.repeat(64);
const noWait = () => Promise.resolve();
const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (pred, what) => { for (let i = 0; i < 400; i++) { if (pred()) return; await tick(); } assert.fail(`timed out: ${what}`); };
const BOUNDS = Buffer.from(JSON.stringify({ v: 1 }));

/** The real act3 files as a version manifest (the same shape the server builds: every file's sha256 and bytes). */
function manifest({ version = ACT3, vanilla = true, edit = null } = {}) {
  const data = {};
  let app = '0.4.0';
  let sim = 'b'.repeat(64);
  for (const name of fs.readdirSync(DIR).sort()) {
    if (!name.endsWith('.json')) continue;
    const buf = fs.readFileSync(path.join(DIR, name));
    const key = name.slice(0, -'.json'.length);
    data[key] = { url: `/data/versions/${slugOf(versionById(ACT3))}/${name}?v=${sha256Hex(new Uint8Array(buf)).slice(0, 8)}`,
      sha256: sha256Hex(new Uint8Array(buf)), bytes: buf.length };
  }
  const cs = contentHashOf({ app, sim, data: Object.fromEntries(Object.entries(data).map(([k, f]) => [k, f.sha256])) });
  const index = { v: 1, cs, app, vanilla, sim, simFiles: {}, data, plugins: [], settings: {}, version,
    bounds: { official: { url: `/cs/${cs.slice(0, 16)}/bounds/official.json`, sha256: sha256Hex(new Uint8Array(BOUNDS)), bytes: BOUNDS.length } } };
  if (edit) edit(index, cs);
  return { index, cs };
}

function serverFetch({ index, cs, editBytes = null } = {}) {
  const seen = [];
  const fn = async (url) => {
    seen.push(url);
    const u = new URL(url, 'http://x');
    let buf = null;
    if (u.pathname === `/cs/${cs.slice(0, 16)}/index.json`) buf = Buffer.from(JSON.stringify(index));
    else if (u.pathname === `/cs/${cs.slice(0, 16)}/bounds/official.json`) buf = Buffer.from(BOUNDS);
    else if (u.pathname.startsWith(`/data/versions/${slugOf(versionById(ACT3))}/`)) {
      try { buf = fs.readFileSync(path.join(DIR, decodeURIComponent(u.pathname.split('/').pop()))); } catch { buf = null; }
    }
    if (!buf) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    if (editBytes) buf = editBytes(u.pathname, Buffer.from(buf));
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  };
  fn.seen = seen;
  return fn;
}

test('sanitizeVersions keeps registry ids with a cs; unknown ids and a bad cs are dropped', () => {
  const good = { id: ACT3, cs: 'd'.repeat(64), family: 'x', label: 'x', roomModes: ['solo', 'coop', 'bogus'] };
  const list = sanitizeVersions([good, { ...good, id: 'nope' }, { ...good, cs: 'short' }, { ...good, id: DEFAULT_VERSION, cs: DEFAULT_CS, default: true }]);
  assert.deepEqual(list.map((v) => v.id), [ACT3, DEFAULT_VERSION]);
  assert.equal(list[0].family, 'regulation');
  assert.equal(list[0].label, versionById(ACT3).label);
  assert.deepEqual(list[0].roomModes, ['solo', 'coop']);
  assert.equal(list[1].default, true);
  assert.equal(sanitizeVersions(null), null);
  assert.equal(sanitizeVersions([]), null);
  assert.equal(sanitizeVersions([{ id: 'nope', cs: 'd'.repeat(64) }]), null);
});

test('lobbyVersion: the preference when the server lists it, else its default, else the code default', () => {
  const list = sanitizeVersions([
    { id: DEFAULT_VERSION, cs: DEFAULT_CS, default: true },
    { id: ACT3, cs: 'd'.repeat(64) },
  ]);
  assert.equal(serverDefaultVersion(list), DEFAULT_VERSION);
  assert.equal(lobbyVersion(list, ACT3), ACT3);
  assert.equal(lobbyVersion(list, 'nope'), DEFAULT_VERSION);
  assert.equal(lobbyVersion(list, null), DEFAULT_VERSION);
  assert.equal(lobbyVersion(null, ACT3), DEFAULT_VERSION);
  assert.equal(roomVersion({ version: ACT3 }), ACT3);
  assert.equal(roomVersion({}), DEFAULT_VERSION);
  assert.equal(versionSlug(versionById(ACT3)), 'act3autochess-v3_1');
});

test('loadVersionSet: the version\'s files are fetched from its own directory and bounds, all checked', async () => {
  const { index, cs } = manifest();
  const doFetch = serverFetch({ index, cs });
  const set = await loadVersionSet(cs, ACT3, { fetch: doFetch, wait: noWait });
  assert.equal(set.cs, cs);
  assert.equal(set.kind, 'version');
  assert.equal(set.version, ACT3);
  assert.equal(set.canSim, true);
  assert.equal(set.values.get('config').season, 'act3autochess');
  assert.ok([...set.values.keys()].length >= 15);
  // bounds are checked by bytes too (the snapshot the runner installs)
  assert.ok(doFetch.seen.some((u) => u.endsWith('/bounds/official.json')));
});

test('loadVersionSet refuses a manifest of another shape or cs, and bytes that do not match', async () => {
  // a plugin content set's manifest (`vanilla: false`) is not a version
  const plugin = manifest({ vanilla: false });
  await assert.rejects(loadVersionSet(plugin.cs, ACT3, { fetch: serverFetch({ index: plugin.index, cs: plugin.cs }), wait: noWait }), /vanilla|that version/);
  // another version's id
  const other = manifest({ version: DEFAULT_VERSION });
  await assert.rejects(loadVersionSet(other.cs, ACT3, { fetch: serverFetch({ index: other.index, cs: other.cs }), wait: noWait }), /that version/);
  // a manifest that names another cs
  const wrong = manifest();
  await assert.rejects(loadVersionSet('e'.repeat(64), ACT3, { fetch: serverFetch({ index: wrong.index, cs: 'e'.repeat(64) }), wait: noWait }), /does not hash|that version/);
  // a changed data byte
  const edited = manifest();
  await assert.rejects(
    loadVersionSet(edited.cs, ACT3, { fetch: serverFetch({ index: edited.index, cs: edited.cs, editBytes: (u, b) => (u.endsWith('config.json') ? Buffer.concat([b, Buffer.from(' ')]) : b) }), wait: noWait }),
    /bytes|size/,
  );
  // a data URL outside the version's directory
  const outside = manifest();
  outside.index.data.config.url = '/data/config.json';
  outside.index.data.config.sha256 = sha256Hex(new Uint8Array(fs.readFileSync(path.join(ROOT, 'data', 'config.json'))));
  outside.index.data.config.bytes = fs.statSync(path.join(ROOT, 'data', 'config.json')).size;
  await assert.rejects(loadVersionSet(outside.cs, ACT3, { fetch: serverFetch({ index: outside.index, cs: outside.cs }), wait: noWait }), /outside|hash/);
});

test('installContentSet: a room of another version loads that version\'s data and leaving restores the server\'s', async () => {
  const { index, cs } = manifest();
  const data = createDataStore();
  const room = { version: ACT3, content: { cs, vanilla: true, plugins: [] }, seats: [{ playerId: 'p1', content: null }], spectators: [] };
  const store = createStore({ ...initialState, me: { playerId: 'p1', name: 'P', token: 't' }, room });
  const toasts = [];
  const un = installContentSet({ store, data, net: { request: async () => ({ t: 'ok' }) }, fetch: serverFetch({ index, cs }), toast: (text) => toasts.push(text) });
  try {
    await until(() => contentSet.get().status === 'ready', 'the version set loads');
    assert.equal(contentSet.get().kind, 'version');
    assert.equal(contentSet.get().version, ACT3);
    assert.equal(pageVersion(), ACT3);
    assert.equal(data.contentId(), cs);
    assert.equal(data.get('config').season, 'act3autochess');
    // the room gone: the server's files again
    store.set({ room: null });
    await until(() => contentSet.get().status === 'idle', 'the version set drops');
    assert.equal(pageVersion(), DEFAULT_VERSION);
    assert.equal(data.contentId(), null);
    assert.deepEqual(toasts, []);
  } finally { un(); }
});

test('installContentSet: a version set that does not check is refused once and leaves no operators behind', async () => {
  const { index, cs } = manifest();
  const data = createDataStore();
  const room = { version: ACT3, content: { cs, vanilla: true, plugins: [] }, seats: [], spectators: [] };
  const store = createStore({ ...initialState, me: { playerId: 'p1', name: 'P', token: 't' }, room });
  const toasts = [];
  const un = installContentSet({ store, data, net: { request: async () => ({ t: 'ok' }) },
    fetch: serverFetch({ index, cs, editBytes: (u, b) => (u.endsWith('config.json') ? Buffer.concat([b, Buffer.from(' ')]) : b) }),
    toast: (text) => toasts.push(text) });
  try {
    await until(() => contentSet.get().status === 'failed', 'the bad set fails');
    assert.equal(data.contentId(), null);
    assert.equal(toasts.length, 1);
    store.set({ room: { ...room } });
    await tick();
    assert.equal(toasts.length, 1, 'said once');
  } finally { un(); }
});
