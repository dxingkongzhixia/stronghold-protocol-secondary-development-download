import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createPluginMarket } from '../server/market.js';
import { zipFiles } from '../server/plugins/zip.js';

const ROOT = path.resolve('.');
function entriesOf(dir, rel = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const next = rel ? `${rel}/${name}` : name;
    if (fs.statSync(abs).isDirectory()) out.push(...entriesOf(abs, next));
    else out.push({ name: next, data: fs.readFileSync(abs) });
  }
  return out;
}
const zipDir = (dir) => zipFiles(entriesOf(dir));

test('market: upload pending, review/test/approve, active download, duplicate and reject', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = { info() {}, warn() {}, error() {} };
  const market = createPluginMarket({ root, log });
  const ordinary = zipDir(path.join(ROOT, 'plugins/_template/content'));
  const uploaded = await market.upload({ kind: 'ordinary', bytes: ordinary, filename: 'data-demo.zip', uploadedBy: 'tester' });
  assert.equal(uploaded.status, 'pending');
  assert.equal(uploaded.kind, 'ordinary');
  assert.equal(market.list({ status: 'active' }).length, 0);
  assert.equal(market.list({ admin: true }).length, 1);
  const replaced = await market.upload({ kind: 'ordinary', bytes: ordinary });
  assert.equal(replaced.status, 'pending', 'a pending entry can be replaced before approval');
  const tested = await market.review('ordinary', 'data-demo', 'test', { reviewer: 'admin' });
  assert.equal(tested.ok, true);
  const approved = await market.review('ordinary', 'data-demo', 'approve', { reviewer: 'admin' });
  assert.equal(approved.entry.status, 'active');
  const active = market.list({ status: 'active' });
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'data-demo');
  const dl = market.download('ordinary', 'data-demo');
  assert.ok(dl && dl.bytes.length === ordinary.length);
  assert.equal(market.list({ status: 'active' })[0].downloads, 1);
  const hidden = market.edit('ordinary', 'data-demo', { description: 'edited', author: 'owner', app: '>=0.4.0 <0.5.0', api: 2, listed: false }, { reviewer: 'admin' });
  assert.deepEqual([hidden.description, hidden.author, hidden.app, hidden.api, hidden.listed, hidden.download], ['edited', 'owner', '>=0.4.0 <0.5.0', 2, false, null]);
  assert.equal(market.list({ status: 'active' }).length, 0, 'an unlisted entry leaves the public list');
  assert.equal(market.download('ordinary', 'data-demo'), null);
  const listed = market.edit('ordinary', 'data-demo', { listed: true }, { reviewer: 'admin' });
  assert.equal(listed.needsReview, true, 'changing app/API asks for a new review');
  assert.equal(listed.download, null);
  await market.review('ordinary', 'data-demo', 'test', { reviewer: 'admin' });
  const restored = await market.review('ordinary', 'data-demo', 'approve', { reviewer: 'admin' });
  assert.equal(restored.entry.download, '/market/api/download/ordinary/data-demo');
  assert.equal(market.download('ordinary', 'data-demo').bytes.length, ordinary.length);
  assert.throws(() => market.edit('ordinary', 'data-demo', { app: 'not a range' }), /version range/);
  assert.equal(market.download('ordinary', 'missing'), null);
  const forge = zipDir(path.join(ROOT, 'test/fixtures/forge/numbers-pack'));
  const forged = await market.upload({ kind: 'forge', bytes: forge, uploadedBy: 'tester' });
  assert.equal(forged.kind, 'forge');
  assert.equal(forged.status, 'pending');
  assert.equal(market.list({ status: 'active' }).length, 1, 'pending Forge is not public');
  const rejected = await market.review('forge', forged.id, 'reject', { reviewer: 'admin', note: 'test only' });
  assert.equal(rejected.entry.status, 'rejected');
  assert.equal(market.download('forge', forged.id), null);
});

test('market: compatibility says whether mainline 0.3.x / this 0.4.x build can use a plugin', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-compat-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const market = createPluginMarket({ root });
  const make = (id, cls, app, api = 1) => zipFiles([{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify({ manifest: 2, id, name: id, version: '1.0.0', class: cls, app, api })),
  }]);
  const cosmetic = await market.upload({ kind: 'ordinary', bytes: make('mainline-skin', 'cosmetic', '>=0.3.0 <0.4.0') });
  assert.deepEqual(
    [cosmetic.compat.own, cosmetic.compat.mainline, cosmetic.compat.auto, cosmetic.compat.ok],
    [false, true, true, true],
    'a mainline 0.3.x cosmetic plugin is auto-compatible',
  );
  const content = await market.upload({ kind: 'ordinary', bytes: make('mainline-content', 'content', '>=0.3.0 <0.4.0') });
  assert.deepEqual(
    [content.compat.own, content.compat.mainline, content.compat.auto, content.compat.ok],
    [false, true, false, false],
    'a mainline 0.3.x content plugin is strict by default',
  );
  const current = await market.upload({ kind: 'ordinary', bytes: make('current-content', 'content', '>=0.4.0 <0.5.0') });
  assert.deepEqual([current.compat.own, current.compat.ok], [true, true]);
  const unrestricted = await market.upload({ kind: 'ordinary', bytes: make('no-range', 'ui', '') });
  assert.deepEqual([unrestricted.compat.unrestricted, unrestricted.compat.ok], [true, true]);
  const forged = await market.upload({ kind: 'forge', bytes: zipDir(path.join(ROOT, 'test/fixtures/forge/numbers-pack')) });
  assert.equal(forged.compat.ok, null, 'a Forge pack is accepted only after its import test');
});

test('market: active plugins can stage a new version, approve it and roll back', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const market = createPluginMarket({ root });
  const dir = path.join(ROOT, 'plugins/_template/cosmetic');
  const versionZip = (version) => zipFiles(entriesOf(dir).map((e) => {
    if (e.name !== 'plugin.json') return e;
    const man = JSON.parse(Buffer.from(e.data).toString('utf8'));
    man.id = 'demo-update';
    man.version = version;
    man.app = '>=0.4.0 <0.5.0';
    return { name: e.name, data: Buffer.from(JSON.stringify(man, null, 2)) };
  }));
  await market.upload({ kind: 'ordinary', bytes: versionZip('1.0.0') });
  await market.review('ordinary', 'demo-update', 'approve', { reviewer: 'admin' });
  const staged = await market.upload({ kind: 'ordinary', bytes: versionZip('2.0.0') });
  assert.equal(staged.version, '1.0.0', 'the active version stays live');
  assert.equal(staged.pendingUpdate.version, '2.0.0');
  assert.equal(market.download('ordinary', 'demo-update').entry.version, '1.0.0');
  const approved = await market.review('ordinary', 'demo-update', 'approve', { reviewer: 'admin' });
  assert.equal(approved.entry.version, '2.0.0');
  assert.equal(approved.entry.history[0].version, '1.0.0');
  const back = await market.rollback('ordinary', 'demo-update', '1.0.0', { reviewer: 'admin' });
  assert.equal(back.entry.version, '1.0.0');
  assert.equal(back.entry.history[0].version, '2.0.0');
  fs.writeFileSync(path.join(root, 'var/plugin-market/ordinary/orphan.zip'), 'x');
  const cleaned = market.gc();
  assert.ok(cleaned.removed >= 1);
  assert.equal(fs.existsSync(path.join(root, 'var/plugin-market/ordinary/orphan.zip')), false);
});

test('market: signed zips verify against the owner key registry', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-sign-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const base = path.join(root, 'var', 'plugin-market');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'keys.json'), JSON.stringify({
    keys: [{ id: 'owner-test', publicKey: publicKey.export({ type: 'spki', format: 'pem' }), label: 'test' }],
  }));
  const market = createPluginMarket({ root });
  const bytes = zipFiles([{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify({ manifest: 2, id: 'signed-demo', name: 'Signed', version: '1.0.0', class: 'cosmetic', app: '>=0.4.0 <0.5.0', api: 1 })),
  }]);
  const signature = { keyId: 'owner-test', value: sign(null, bytes, privateKey).toString('base64') };
  const signed = await market.upload({ kind: 'ordinary', bytes, signature });
  assert.deepEqual([signed.signature.keyId, signed.signature.verified], ['owner-test', true]);
  await assert.rejects(
    () => market.upload({ kind: 'ordinary', bytes: zipFiles([{ name: 'plugin.json', data: Buffer.from('{"manifest":2,"id":"bad","version":"1.0.0","class":"cosmetic"}') }]), signature }),
    /signature/,
  );
});

test('market: required dependencies block approval until present', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-deps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const market = createPluginMarket({ root });
  const make = (id, requires = {}) => zipFiles([{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify({ manifest: 2, id, name: id, version: '1.0.0', class: 'cosmetic', app: '>=0.4.0 <0.5.0', api: 1, requires })),
  }]);
  const alpha = await market.upload({ kind: 'ordinary', bytes: make('alpha', { beta: '*' }) });
  assert.equal(alpha.dependencyCheck.ok, false);
  assert.deepEqual(alpha.dependencyCheck.missing.map((x) => x.id), ['beta']);
  await assert.rejects(() => market.review('ordinary', 'alpha', 'approve', { reviewer: 'admin' }), /dependency/);
  await market.upload({ kind: 'ordinary', bytes: make('beta') });
  await market.review('ordinary', 'beta', 'approve', { reviewer: 'admin' });
  const approved = await market.review('ordinary', 'alpha', 'approve', { reviewer: 'admin' });
  assert.equal(approved.entry.dependencyCheck.ok, true);
});

test('market: order, move and related plugin bindings', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-order-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const market = createPluginMarket({ root });
  const make = (id) => zipFiles([{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify({ manifest: 2, id, name: id, version: '1.0.0', class: 'ui', app: '>=0.4.0 <0.5.0', api: 1 })),
  }]);
  await market.upload({ kind: 'ordinary', bytes: make('alpha') });
  await market.upload({ kind: 'ordinary', bytes: make('beta') });
  assert.deepEqual(market.list({ status: 'pending', admin: true }).map((x) => x.id), ['alpha', 'beta']);
  market.move('ordinary', 'beta', 'up');
  assert.deepEqual(market.list({ status: 'pending', admin: true }).map((x) => x.id), ['beta', 'alpha']);
  market.reorder('ordinary', ['alpha', 'beta']);
  assert.deepEqual(market.list({ status: 'pending', admin: true }).map((x) => x.id), ['alpha', 'beta']);
  const page = market.listPage({ status: 'pending', admin: true, page: 1, limit: 1 });
  assert.deepEqual([page.total, page.pages, page.items.length, page.items[0].id], [2, 2, 1, 'alpha']);
  const edited = market.edit('ordinary', 'alpha', { related: ['beta'] });
  assert.deepEqual(edited.related, ['beta']);
  assert.deepEqual(edited.relatedPlugins.map((x) => [x.id, x.name]), [['beta', 'beta']]);
  assert.throws(() => market.edit('ordinary', 'alpha', { related: ['alpha'] }), /related/);
  assert.throws(() => market.edit('ordinary', 'alpha', { related: ['bad id'] }), /related/);
});

test('market lists live installed plugins separately from store entries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-installed-'));
  try {
    const pluginDir = path.join(root, 'plugins', 'local-skin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ manifest: 2, name: '本机外观', version: '1.0.0', class: 'cosmetic', app: '>=0.3.0 <0.4.0', api: 1 }));
    fs.writeFileSync(path.join(pluginDir, 'x.png'), Buffer.from([1, 2, 3]));
    const registry = { plugins: () => [
      { id: 'local-skin', source: 'plugins', class: 'cosmetic', status: 'loaded', bytes: 123, where: pluginDir, manifest: { name: { zh: '本机外观' }, version: '1.0.0', app: '>=0.3.0 <0.4.0', api: 1 } },
      { id: 'en', source: 'i18n', class: 'lang', status: 'loaded', manifest: { version: '0.2.0' } },
    ] };
    const market = createPluginMarket({ root, registry });
    assert.deepEqual(market.installed().map((p) => [p.id, p.status, p.download]), [['local-skin', 'installed', '/market/api/installed/local-skin/download']]);
    assert.deepEqual(market.installed()[0].name, '本机外观');
    assert.deepEqual(
      [market.installed()[0].compat.own, market.installed()[0].compat.mainline, market.installed()[0].compat.auto],
      [false, true, true],
      'the installed list carries the same mainline compatibility answer',
    );
    const zip = market.downloadInstalled('local-skin');
    assert.ok(zip && zip.bytes.length > 0);
    const cached = market.downloadInstalled('local-skin');
    assert.ok(cached && cached.path && !cached.bytes && cached.size === zip.size);
    const edited = market.editInstalled('local-skin', { description: '本机说明', author: 'owner', app: '>=0.4.0 <0.5.0', api: 2 }, { reviewer: 'admin' });
    assert.deepEqual([edited.description, edited.author, edited.app, edited.api, edited.compat.own], ['本机说明', 'owner', '>=0.4.0 <0.5.0', 2, true]);
    const published = await market.publishInstalled('local-skin', { reviewer: 'admin' });
    assert.deepEqual([published.kind, published.status, published.id, published.compat.ok], ['ordinary', 'pending', 'local-skin', true]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('market: a plugin.json category is carried into the store and stays editable', async (t) => {  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-category-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const market = createPluginMarket({ root });
  const manifest = (id, category) => zipFiles([{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify({ manifest: 2, id, name: id, version: '1.0.0', class: 'content', app: '>=0.4.0 <0.5.0', api: 1, ...(category ? { category } : {}) })),
  }]);
  const enemy = await market.upload({ kind: 'ordinary', bytes: manifest('prts-like', 'enemy') });
  assert.deepEqual([enemy.category, enemy.declaredCategory], ['enemy', 'enemy']);
  // no declared category: the class decides, exactly as the in-game panel groups (content → 新增玩法)
  const plain = await market.upload({ kind: 'ordinary', bytes: manifest('plain-demo', null) });
  assert.deepEqual([plain.category, plain.declaredCategory], ['gameplay', null]);
  // an owner may regroup an entry; an unknown id is refused
  const moved = market.edit('ordinary', 'prts-like', { category: 'strategy' }, { reviewer: 'admin' });
  assert.deepEqual([moved.category, moved.declaredCategory], ['strategy', 'strategy']);
  const cleared = market.edit('ordinary', 'prts-like', { category: null }, { reviewer: 'admin' });
  assert.deepEqual([cleared.category, cleared.declaredCategory], ['gameplay', null], 'null falls back to the class');
  assert.throws(() => market.edit('ordinary', 'plain-demo', { category: 'nope' }), /category must be/);
});

test('market: built-in plugins are listed under 本机已安装, marked and without a download', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-builtin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registry = { plugins: () => [
    { id: 'faction-yan', source: 'builtin', builtin: true, class: 'content', status: 'loaded',
      manifest: { name: { zh: '阵营加强：炎' }, description: { zh: '内置阵营加强' }, version: '0.4.0', category: 'faction', authors: ['Stronghold Protocol'] } },
    { id: 'local-skin', source: 'plugins', class: 'cosmetic', status: 'loaded', where: root, bytes: 12,
      manifest: { name: '皮肤', version: '1.0.0' } },
  ] };
  const market = createPluginMarket({ root, registry });
  const rows = market.installed();
  assert.deepEqual(rows.map((p) => p.id), ['faction-yan', 'local-skin']);
  const faction = rows[0];
  assert.deepEqual([faction.builtin, faction.category, faction.description, faction.download, faction.mirror],
    [true, 'faction', '内置阵营加强', null, null], 'no folder, no zip, still listed');
  assert.deepEqual([rows[1].builtin, rows[1].category], [false, 'appearance'], 'a folder plugin is unchanged');
  assert.equal(market.downloadInstalled('faction-yan'), null);
});
