// N2 studio C: a Keel plugin (manifest 3 / plugin.keel.json) is editable in the studio. The manifest goes through the
// validated PUT /manifest (manifest rules + module graph) and is written to the folder's own descriptor only; other
// files (module sources, content) are ordinary files. A manifest 2 plugin stays on the legacy path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginFiles } from '../../server/studio/files.js';
import { startServer } from '../../server/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'plugins/_template/keel-survival');

const code = (want) => (e) => e.code === want;

/** A plugins folder in a temp directory holding one copy of a folder. */
function withFolder(t, name, copy) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-studio-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, name);
  copy(dir);
  return { tmp, files: createPluginFiles(tmp), id: name, dir };
}

test('a manifest-3 plugin is Keel and its descriptor is written only through the validated endpoint', (t) => {
  const { files, id, dir } = withFolder(t, 'keel-survival', (d) => fs.cpSync(TEMPLATE, d, { recursive: true }));
  assert.equal(files.keel(id), true);
  assert.equal(files.manifestFile(id), 'plugin.json', 'this template carries manifest 3 in plugin.json');
  assert.throws(() => files.write(id, 'plugin.json', Buffer.from('{"manifest":2}\n')), code('PLUGIN_STUDIO_KEEL_MANIFEST'));
  // a module source is an ordinary file now
  const before = fs.readFileSync(path.join(dir, 'sim/index.js'), 'utf8');
  files.write(id, 'sim/index.js', Buffer.from(`${before}\n// edited in the studio\n`));
  assert.match(fs.readFileSync(path.join(dir, 'sim/index.js'), 'utf8'), /edited in the studio/);
  files.writeSidecar(id, '.studio.json', Buffer.from('{"v":1}\n'));
  assert.equal(fs.existsSync(path.join(dir, '.studio.json')), true);
  // the other descriptor never appears
  assert.equal(fs.existsSync(path.join(dir, 'plugin.keel.json')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).manifest, 3);
});

test('a plugin.keel.json folder writes back to plugin.keel.json and never creates plugin.json', (t) => {
  const { files, id, dir } = withFolder(t, 'keel-only', (d) => {
    fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(path.join(TEMPLATE, 'plugin.json'), path.join(d, 'plugin.keel.json'));
  });
  assert.equal(files.keel(id), true);
  assert.equal(files.manifestFile(id), 'plugin.keel.json');
  assert.throws(() => files.write(id, 'plugin.json', Buffer.from('{"manifest":2}\n')), code('PLUGIN_STUDIO_KEEL_MANIFEST'));
  assert.equal(fs.existsSync(path.join(dir, 'plugin.json')), false);
});

test('a manifest 2 folder stays writable', (t) => {
  const { files, id, dir } = withFolder(t, 'legacy-demo', (d) => {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'plugin.json'), JSON.stringify({ manifest: 2, id: 'legacy-demo', name: 'demo', version: '0.1.0', class: 'content' }, null, 2));
  });
  assert.equal(files.keel(id), false);
  files.write(id, 'data/extra.json', Buffer.from('{}\n'));
  assert.equal(fs.existsSync(path.join(dir, 'data/extra.json')), true);
});

test('the studio API creates a native manifest 3 plugin from a Keel template', { timeout: 30000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-studio-new-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const plugins = path.join(tmp, 'plugins');
  fs.mkdirSync(plugins);
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: plugins, assetIndex: false });
  t.after(async () => { await srv.close(); });
  const base = srv.url.replace(/\/$/, '');
  const list = await (await fetch(`${base}/studio/api/plugins`)).json();
  const key = fs.readFileSync(path.join(plugins, '.studio-key'), 'utf8').trim();
  const post = (body) => fetch(`${base}/studio/api/plugins`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-sp-studio': key }, body: JSON.stringify(body),
  });

  const info = await (await fetch(`${base}/studio/api/info`)).json();
  assert.ok(info.templates.some((x) => x.id === 'keel-reference' && x.keel === true), 'the create dialog lists the native templates');
  assert.ok(list.plugins.every((p) => !p.keel), 'the folder starts empty');

  const made = await post({ template: 'keel-content', id: 'studio-keel', name: 'Studio 龙骨' });
  assert.equal(made.status, 201);
  const dir = path.join(plugins, 'studio-keel');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  assert.equal(manifest.manifest, 3);
  assert.equal(manifest.id, 'studio-keel');
  assert.equal(manifest.name.zh, 'Studio 龙骨');
  assert.match(fs.readFileSync(path.join(dir, 'content/enemies.json'), 'utf8'), /enemy_x_studio_keel_demo/);
  assert.equal(fs.existsSync(path.join(dir, 'plugin.keel.json')), false, 'the template keeps its own descriptor');

  const ref = await post({ template: 'keel-reference', id: 'studio-ref' });
  assert.equal(ref.status, 201, await ref.text());
  const refManifest = JSON.parse(fs.readFileSync(path.join(plugins, 'studio-ref/plugin.json'), 'utf8'));
  assert.equal(refManifest.id, 'studio-ref');
  assert.ok(fs.existsSync(path.join(plugins, 'studio-ref/plugin.lock.json')), 'a native template gets a fresh lock');
  const refState = await (await fetch(`${base}/studio/api/plugins/studio-ref`)).json();
  assert.equal(refState.keel, true);
  assert.equal(refState.check.problems, 0, JSON.stringify(refState.check.issues.filter((i) => i.level === 'problem')));

  const again = await post({ template: 'keel-content', id: 'studio-keel' });
  assert.equal(again.status, 400, 'an existing id is refused');
});

test('the studio API edits a Keel manifest 3: validation, meta, modules, module files', { timeout: 30000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-studio-api-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const plugins = path.join(tmp, 'plugins');
  fs.mkdirSync(plugins);
  const dir = path.join(plugins, 'keel-survival');
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: plugins, assetIndex: false });
  t.after(async () => { await srv.close(); });
  const base = srv.url.replace(/\/$/, '');
  const call = (p, opt = {}) => fetch(`${base}${p}`, { ...opt, headers: { 'x-sp-studio': key, ...(opt.headers || {}) } });

  const list = await (await fetch(`${base}/studio/api/plugins`)).json();
  const key = fs.readFileSync(path.join(plugins, '.studio-key'), 'utf8').trim();
  const row = list.plugins.find((p) => p.id === 'keel-survival');
  assert.ok(row, 'the Keel plugin is listed');
  assert.equal(row.keel, true);

  const detail = await (await fetch(`${base}/studio/api/plugins/keel-survival`)).json();
  assert.equal(detail.keel, true);
  assert.equal(detail.manifest.manifest, 3, 'the manifest 3 object is shown to the editor');
  assert.equal(detail.manifestFile, 'plugin.json');
  assert.equal(typeof detail.text, 'string', 'its own descriptor text is shown');
  assert.equal(detail.class, 'script', 'the class comes from the module kinds');

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));

  // an invalid manifest 3 is refused with the findings, and nothing is written
  const bad = await call('/studio/api/plugins/keel-survival/manifest', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...manifest, modules: [] }),
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'PLUGIN_STUDIO_KEEL_MANIFEST');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).modules.map((m) => m.kind), manifest.modules.map((m) => m.kind));

  // a valid save writes the same descriptor
  const good = await call('/studio/api/plugins/keel-survival/manifest', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...manifest, version: '0.1.1' }),
  });
  assert.equal(good.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).version, '0.1.1');
  assert.equal(fs.existsSync(path.join(dir, 'plugin.keel.json')), false);

  // basic fields on the info tab
  const meta = await call('/studio/api/plugins/keel-survival/meta', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { name: '龙骨生存 API', description: 'edited' }, lang: 'zh' }),
  });
  assert.equal(meta.status, 200);
  const afterMeta = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  assert.equal(afterMeta.name.zh, '龙骨生存 API');
  assert.equal(afterMeta.name.en, 'Keel survival example', 'the other language is kept');

  // the module list: reorder (the graph and the manifest rules still pass)
  const modules = [...afterMeta.modules].reverse();
  const mods = await call('/studio/api/plugins/keel-survival/modules', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules }),
  });
  assert.equal(mods.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).modules.map((m) => m.kind), modules.map((m) => m.kind));

  // the per-kind fields the module editor posts: content parts / provides / consumes
  const current = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
  const rich = current.modules.map((m) => (m.kind === 'content'
    ? { ...m, parts: { data: ['content/enemies.json'] }, provides: ['enemy:enemy_x_keel_survival_refractor'], consumes: [] }
    : m));
  const richRes = await call('/studio/api/plugins/keel-survival/modules', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules: rich }),
  });
  assert.equal(richRes.status, 200);
  const savedContent = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).modules.find((m) => m.kind === 'content');
  assert.deepEqual(savedContent.parts, { data: ['content/enemies.json'] });
  assert.deepEqual(savedContent.provides, ['enemy:enemy_x_keel_survival_refractor']);
  const badParts = await call('/studio/api/plugins/keel-survival/modules', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modules: rich.map((m) => (m.kind === 'content' ? { ...m, parts: { data: ['../escape.json'] } } : m)) }),
  });
  assert.equal(badParts.status, 400, 'a part outside the folder is refused');

  // a module source is editable; the descriptor is not a raw file write
  const src = await call('/studio/api/plugins/keel-survival/files/sim/index.js', { method: 'PUT', body: 'export default { setup() {}, hooks: {} };\n' });
  assert.equal(src.status, 200);
  assert.match(fs.readFileSync(path.join(dir, 'sim/index.js'), 'utf8'), /export default/);
  const raw = await call('/studio/api/plugins/keel-survival/files/plugin.json', { method: 'PUT', body: '{"manifest":2}' });
  assert.equal(raw.status, 409);
  assert.equal((await raw.json()).error, 'PLUGIN_STUDIO_KEEL_MANIFEST');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).manifest, 3);
});
