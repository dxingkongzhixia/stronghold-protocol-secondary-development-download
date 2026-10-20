import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  await assert.rejects(() => market.upload({ kind: 'ordinary', bytes: ordinary }), /already pending/);
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

test('market lists live installed plugins separately from store entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-market-installed-'));
  try {
    const pluginDir = path.join(root, 'plugins', 'local-skin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), '{}');
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
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
