// Plugin marketplace storage: separate ordinary and Forge uploads, pending review, active downloads.
// Files live under var/plugin-market/{ordinary,forge}; the JSON index is server-local and git-ignored.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PLUGIN_LIMITS, PLUGIN_COMPAT_APP, PLUGIN_COMPAT_CLASSES, appVersionMatches, isPluginId } from '../shared/plugins/manifest.js';
import { readPluginZip, zipFiles } from './plugins/zip.js';
import { readUntrustedZip, importForge, forgeIdToPluginId } from './plugins/forgeImport.js';
import { installFromFile } from './plugins/install.js';
import { readPluginFolder, readVanillaAssets } from './plugins/registry.js';

const noopLog = { info() {}, warn() {}, error() {} };
const KINDS = new Set(['ordinary', 'forge']);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const safePart = (s, max = 64) => String(s || '').replace(/[^0-9A-Za-z._-]/g, '_').slice(0, max) || 'plugin';
const nameOf = (n) => (typeof n === 'string' ? n : n && (n.zh || n.en)) || '';
const appRangeOf = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
const apiLevelOf = (v) => (Number.isInteger(v) ? v : null);

/**
 * What the marketplace says about a plugin's target game versions. Presentation-only classes also accept the mainline
 * 0.3.x contract (shared/plugins/manifest.js appVersionCompatible); gameplay classes stay strict unless the owner opts in.
 */
function compatibilityOf(kind, cls, app, api) {
  const range = appRangeOf(app);
  const apiLevel = apiLevelOf(api);
  if (kind === 'forge') {
    // A Forge pack is converted and tested on this server; its app range is advice, not a load decision.
    return { app: range, api: apiLevel, ok: null, own: null, mainline: null, auto: false, unrestricted: !range };
  }
  const own = appVersionMatches(range);
  const mainline = appVersionMatches(range, PLUGIN_COMPAT_APP);
  const auto = PLUGIN_COMPAT_CLASSES.has(cls);
  return { app: range, api: apiLevel, own, mainline, auto, unrestricted: !range, ok: !range || own || (auto && mainline) };
}

function readIndex(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && j.version === 1 && Array.isArray(j.entries)) return j;
  } catch { /* absent / broken: empty */ }
  return { version: 1, entries: [] };
}

/** A zip entry map from a plugin zip; rejects a missing root plugin.json or pack.json. */
function rootJson(entries, file) {
  const hit = [...entries].find((e) => e.name === file || (e.name.endsWith(`/${file}`) && e.name.split('/').length === 2));
  if (!hit) throw new Error(`${file} is missing`);
  try { return JSON.parse(Buffer.from(hit.data).toString('utf8')); } catch { throw new Error(`${file} is not JSON`); }
}

/**
 * @param {{ root: string, log?: object }} opts
 */
export function createPluginMarket({ root, log = noopLog, registry = null } = {}) {
  if (!root) throw new Error('market root required');
  const base = path.join(root, 'var', 'plugin-market');
  const dirs = { ordinary: path.join(base, 'ordinary'), forge: path.join(base, 'forge') };
  const indexFile = path.join(base, 'index.json');
  const mirrorsFile = path.join(base, 'mirrors.json');
  let mirrors = [];
  try {
    const m = JSON.parse(fs.readFileSync(mirrorsFile, 'utf8'));
    if (Array.isArray(m)) mirrors = m.filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x)).slice(0, 8);
  } catch { /* no mirrors */ }
  for (const dir of [base, ...Object.values(dirs)]) fs.mkdirSync(dir, { recursive: true });

  const index = readIndex(indexFile);
  const save = () => {
    const tmp = `${indexFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`);
    fs.renameSync(tmp, indexFile);
  };
  const keyOf = (kind, id) => `${kind}:${id}`;
  const publicEntry = (e) => {
    const compat = compatibilityOf(e.kind, e.class, e.app, e.api);
    return {
      id: e.id, kind: e.kind, name: e.name, version: e.version, author: e.author || null,
      description: e.description || null, class: e.class || null, status: e.status, bytes: e.bytes, sha256: e.sha256,
      uploadedAt: e.uploadedAt, uploadedBy: e.uploadedBy || null, reviewedAt: e.reviewedAt || null,
      downloads: e.downloads || 0, app: compat.app, api: compat.api, compat,
      download: e.status === 'active' ? `/market/api/download/${e.kind}/${encodeURIComponent(e.id)}` : null,
      sources: mirrors,
      reviewNote: e.reviewNote || null,
    };
  };

  async function inspect(kind, bytes) {
    if (kind === 'ordinary') {
      const entries = readPluginZip(bytes);
      const man = rootJson(entries, 'plugin.json');
      if (!isPluginId(man.id)) throw new Error('plugin.json has no valid id');
      if (!man.version || typeof man.version !== 'string') throw new Error('plugin.json has no version');
      return {
        id: man.id, version: man.version, name: nameOf(man.name), author: nameOf(man.author), description: nameOf(man.description),
        class: man.class || null, app: appRangeOf(man.app), api: apiLevelOf(man.api),
      };
    }
    const files = await readUntrustedZip(bytes);
    const pack = rootJson([...files].map(([name, data]) => ({ name, data })), 'pack.json');
    if (!pack.id) throw new Error('pack.json has no id');
    const raw = String(pack.id);
    const id = forgeIdToPluginId(raw);
    if (!isPluginId(id)) throw new Error('pack.json id cannot become a plugin id');
    return {
      id, version: String(pack.version || '0.0.0'), name: nameOf(pack.name) || raw, author: nameOf(pack.author),
      description: nameOf(pack.description), class: 'forge', app: appRangeOf(pack.app), api: apiLevelOf(pack.api),
    };
  }

  async function upload({ kind, bytes, filename = '', uploadedBy = null }) {
    if (!KINDS.has(kind)) throw new Error('kind must be ordinary or forge');
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('empty zip');
    if (bytes.length > PLUGIN_LIMITS.pluginBytes) throw new Error('zip is over the plugin size limit');
    const meta = await inspect(kind, bytes);
    const key = keyOf(kind, meta.id);
    const existing = index.entries.find((e) => keyOf(e.kind, e.id) === key);
    if (existing && existing.status !== 'rejected') throw new Error(`plugin ${meta.id} is already ${existing.status}`);
    if (existing) {
      try { fs.rmSync(path.join(base, existing.file), { force: true }); } catch { /* ignore */ }
      index.entries = index.entries.filter((e) => e !== existing);
    }
    const file = `${kind}/${safePart(meta.id)}-${safePart(meta.version)}.zip`;
    fs.writeFileSync(path.join(base, file), bytes);
    const entry = {
      kind, id: meta.id, name: meta.name || meta.id, version: meta.version, author: meta.author || null,
      description: meta.description || null, class: meta.class || null, app: meta.app || null, api: meta.api ?? null,
      file, bytes: bytes.length, sha256: sha256(bytes),
      status: 'pending', uploadedAt: Date.now(), uploadedBy: uploadedBy || null, reviewedAt: null, reviewedBy: null,
      reviewNote: null, downloads: 0, filename: String(filename || '').slice(0, 120),
    };
    index.entries.push(entry);
    save();
    log.info?.(`[market] uploaded ${kind}/${meta.id}@${meta.version} (${bytes.length} bytes, pending)`);
    return publicEntry(entry);
  }

  function get(kind, id) {
    return index.entries.find((e) => e.kind === kind && e.id === id) || null;
  }

  async function test(kind, id, log = noopLog) {
    const e = get(kind, id);
    if (!e) throw new Error('plugin not found');
    const zip = path.join(base, e.file);
    if (!fs.existsSync(zip)) throw new Error('stored zip is missing');
    const tmp = fs.mkdtempSync(path.join(root, 'var', 'market-test-'));
    const pluginsDir = path.join(tmp, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    try {
      if (kind === 'ordinary') {
        const file = installFromFile(zip, { pluginsDir, maxBytes: PLUGIN_LIMITS.pluginBytes });
        const plugin = readPluginFolder(path.join(pluginsDir, file.id), {
          where: `market/${file.id}/`, vanilla: readVanillaAssets(path.join(root, 'data')),
          dataDir: path.join(root, 'data'),
        });
        if (!plugin.plugin || plugin.problems.length) throw new Error(plugin.problems.map((p) => p.code || p).join('; ') || 'plugin did not load');
        return { ok: true, id: file.id, class: plugin.plugin.class, warnings: plugin.warnings.length };
      }
      const got = await importForge({ zip: fs.readFileSync(zip) }, {
        pluginsDir, out: path.join(tmp, 'forge'), root, dataDir: path.join(root, 'data'),
        vanilla: readVanillaAssets(path.join(root, 'data')), scripts: true,
      });
      if (!got.ok) throw new Error(got.markdown.split('\n').slice(0, 8).join(' '));
      return { ok: true, id, products: got.report.products || [], warnings: got.report.skipped?.length || 0 };
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async function review(kind, id, action, { reviewer = null, note = '' } = {}) {
    const e = get(kind, id);
    if (!e) throw new Error('plugin not found');
    if (!['test', 'approve', 'reject'].includes(action)) throw new Error('action must be test, approve or reject');
    if (action === 'test') {
      const r = await test(kind, id, log);
      e.reviewedAt = Date.now(); e.reviewedBy = reviewer; e.reviewNote = String(note || '').slice(0, 500);
      save();
      return { ok: true, action, result: r, entry: publicEntry(e) };
    }
    if (action === 'reject') {
      e.status = 'rejected'; e.reviewedAt = Date.now(); e.reviewedBy = reviewer;
      e.reviewNote = String(note || '').slice(0, 500); save();
      return { ok: true, action, entry: publicEntry(e) };
    }
    if (e.status === 'active') return { ok: true, action, entry: publicEntry(e) };
    const result = await test(kind, id, log);
    e.status = 'active'; e.reviewedAt = Date.now(); e.reviewedBy = reviewer;
    e.reviewNote = String(note || '').slice(0, 500); e.test = { at: Date.now(), warnings: result.warnings || 0 };
    save();
    log.info?.(`[market] approved ${kind}/${id}${reviewer ? ` by ${reviewer}` : ''}`);
    return { ok: true, action, result, entry: publicEntry(e) };
  }

  function list({ status = 'active', admin = false } = {}) {
    const rows = index.entries.filter((e) => admin || e.status === status);
    return rows.map(publicEntry).sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }

  /** Loaded plugins in the live plugins/ folder (not store entries). */
  function installed() {
    const list = registry && typeof registry.plugins === 'function' ? registry.plugins() : [];
    return list.filter((p) => p && p.source === 'plugins' && p.class !== 'lang').map((p) => {
      const compat = compatibilityOf('installed', p.class, p.manifest?.app, p.manifest?.api);
      return {
        id: p.id, kind: 'installed', name: (typeof p.manifest?.name === 'string' ? p.manifest.name : (p.manifest?.name?.zh || p.manifest?.name?.en)) || p.id,
        version: p.manifest?.version || null, class: p.class, status: 'installed', bytes: p.bytes || null,
        app: compat.app, api: compat.api, compat,
        description: 'Installed locally; not published to the store', sources: [], installed: true,
        download: p.status === 'loaded' ? `/market/api/installed/${encodeURIComponent(p.id)}/download` : null,
      };
    });
  }

  /** Zip an installed plugin folder on demand (the marketplace's download for a live plugins/<id>). */
  function downloadInstalled(id) {
    const p = (registry && typeof registry.plugin === 'function' ? registry.plugin(id) : null)
      || (registry && typeof registry.plugins === 'function' ? registry.plugins().find((x) => x.id === id) : null);
    if (!p || p.source !== 'plugins' || p.class === 'lang' || p.status !== 'loaded' || !p.where) return null;
    const dir = path.isAbsolute(p.where) ? p.where : path.join(root, p.where);
    const out = [];
    const walk = (abs, rel = '') => {
      let names;
      try { names = fs.readdirSync(abs); } catch { return; }
      for (const name of names) {
        if (name.startsWith('.')) continue;
        const at = path.join(abs, name);
        const next = rel ? `${rel}/${name}` : name;
        let st;
        try { st = fs.lstatSync(at); } catch { continue; }
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) walk(at, next);
        else if (st.isFile()) out.push({ name: next, data: fs.readFileSync(at) });
      }
    };
    walk(dir);
    if (!out.length) return null;
    return { entry: { id: p.id, version: p.manifest?.version || '1.0.0' }, bytes: zipFiles(out), filename: `${p.id}-${p.manifest?.version || '1.0.0'}.zip` };
  }

  function download(kind, id) {
    const e = get(kind, id);
    if (!e || e.status !== 'active') return null;
    const file = path.join(base, e.file);
    if (!fs.existsSync(file)) return null;
    e.downloads = (e.downloads || 0) + 1;
    save();
    return { entry: e, bytes: fs.readFileSync(file), filename: `${e.id}-${e.version}.zip` };
  }

  return { base, upload, test, review, list, installed, download, downloadInstalled, get, indexFile };
}
