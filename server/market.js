// Plugin marketplace storage: separate ordinary and Forge uploads, pending review, active downloads.
// Files live under var/plugin-market/{ordinary,forge}; the JSON index is server-local and git-ignored.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, verify, createPublicKey } from 'node:crypto';
import { PLUGIN_LIMITS, PLUGIN_COMPAT_APP, PLUGIN_COMPAT_CLASSES, appVersionMatches, isPluginId, isVersionRange } from '../shared/plugins/manifest.js';
import { pluginCategory, parsePluginCategory } from '../shared/plugins/category.js';
import { readPluginZip, zipFiles } from './plugins/zip.js';
import { readUntrustedZip, importForge, forgeIdToPluginId } from './plugins/forgeImport.js';
import { installFromFile } from './plugins/install.js';
import { readPluginFolder, readVanillaAssets } from './plugins/registry.js';

const noopLog = { info() {}, warn() {}, error() {} };
const KINDS = new Set(['ordinary', 'forge']);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const safePart = (s, max = 64) => String(s || '').replace(/[^0-9A-Za-z._-]/g, '_').slice(0, max) || 'plugin';
const nameOf = (n) => (typeof n === 'string' ? n : n && (n.zh || n.en)) || '';
const depMap = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v)
    .filter(([k, val]) => typeof k === 'string' && isPluginId(k) && typeof val === 'string')
    .slice(0, 32));
};
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
  const keysFile = path.join(base, 'keys.json');
  let signingKeys = [];
  let requiredSigned = new Set();
  const loadKeys = () => {
    try {
      const k = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
      signingKeys = (Array.isArray(k) ? k : k.keys || []).filter((x) => x && typeof x.id === 'string' && typeof x.publicKey === 'string').slice(0, 64);
      requiredSigned = new Set(Array.isArray(k.requireSigned) ? k.requireSigned.filter((x) => typeof x === 'string') : []);
    } catch { signingKeys = []; requiredSigned = new Set(); }
  };
  loadKeys();
  const saveKeys = () => {
    fs.mkdirSync(base, { recursive: true });
    const tmp = `${keysFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ keys: signingKeys, requireSigned: [...requiredSigned] }, null, 2)}\n`);
    fs.renameSync(tmp, keysFile);
  };
  const publicKeys = () => ({
    keys: signingKeys.map((k) => ({
      id: k.id, label: k.label || null, algorithm: k.algorithm || 'ed25519',
      addedAt: k.addedAt || null, revokedAt: k.revokedAt || null, publicKey: k.publicKey,
    })),
    requireSigned: [...requiredSigned],
  });
  const addSigningKey = ({ id, publicKey, label = '' }) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(String(id || ''))) throw new Error('key id must be 1..80 letters, digits, dot, dash or underscore');
    if (typeof publicKey !== 'string' || publicKey.length < 40) throw new Error('publicKey must be a PEM public key');
    try { createPublicKey(publicKey); } catch { throw new Error('publicKey is not a valid PEM key'); }
    signingKeys = signingKeys.filter((k) => k.id !== id);
    signingKeys.push({ id, publicKey, label: String(label || '').slice(0, 120), algorithm: 'ed25519', addedAt: new Date().toISOString(), revokedAt: null });
    saveKeys();
    return publicKeys();
  };
  const revokeSigningKey = (id, revoked = true) => {
    const key = signingKeys.find((k) => k.id === id);
    if (!key) throw new Error('key not found');
    key.revokedAt = revoked ? new Date().toISOString() : null;
    saveKeys();
    return publicKeys();
  };
  const setSignaturePolicy = (classes) => {
    const allowed = new Set(['lang', 'cosmetic', 'content', 'ui', 'script', 'trusted', 'forge']);
    if (!Array.isArray(classes) || classes.some((x) => !allowed.has(x))) throw new Error('requireSigned must be a list of plugin classes');
    requiredSigned = new Set(classes);
    saveKeys();
    return publicKeys();
  };
  const verifySignature = (bytes, signature) => {
    if (!signature || typeof signature !== 'object' || !signature.keyId || !signature.value) return null;
    const key = signingKeys.find((x) => x.id === signature.keyId && !x.revokedAt);
    if (!key) throw new Error('unknown or revoked signing key');
    let ok = false;
    try { ok = verify(null, Buffer.from(bytes), key.publicKey, Buffer.from(String(signature.value), 'base64')); } catch { ok = false; }
    if (!ok) throw new Error('plugin signature does not verify');
    return { keyId: key.id, verified: true, algorithm: 'ed25519', label: key.label || null };
  };
  let mirrors = [];
  try {
    const m = JSON.parse(fs.readFileSync(mirrorsFile, 'utf8'));
    if (Array.isArray(m)) mirrors = m.filter((x) => typeof x === 'string' && /^https?:\/\//i.test(x)).slice(0, 8);
  } catch { /* no mirrors */ }
  for (const dir of [base, ...Object.values(dirs)]) fs.mkdirSync(dir, { recursive: true });

  const index = readIndex(indexFile);
  const installedMetaFile = path.join(base, 'installed-meta.json');
  let installedMeta = {};
  try {
    const m = JSON.parse(fs.readFileSync(installedMetaFile, 'utf8'));
    if (m && typeof m === 'object' && !Array.isArray(m)) installedMeta = m;
  } catch { /* absent or broken: no overrides */ }
  const saveInstalledMeta = () => {
    const tmp = `${installedMetaFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(installedMeta, null, 2)}\n`);
    fs.renameSync(tmp, installedMetaFile);
  };
  const save = () => {
    const tmp = `${indexFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`);
    fs.renameSync(tmp, indexFile);
  };
  const keyOf = (kind, id) => `${kind}:${id}`;
  const audit = (action, detail) => {
    try {
      fs.mkdirSync(path.join(root, 'var'), { recursive: true });
      fs.appendFileSync(path.join(root, 'var', 'admin-audit.log'), `${JSON.stringify({ at: new Date().toISOString(), action, ...detail })}\n`);
    } catch { /* audit must not break the operation */ }
  };
  const relatedOf = (ids) => (Array.isArray(ids) ? ids : []).slice(0, 16).map((id) => {
    const m = index.entries.find((x) => x.id === id);
    if (m) return { id, name: m.name || id, kind: m.kind, class: m.class || null, status: m.status };
    const p = registry && typeof registry.plugins === 'function' ? registry.plugins().find((x) => x.id === id) : null;
    if (p) {
      const name = (typeof p.manifest?.name === 'string' ? p.manifest.name : (p.manifest?.name?.zh || p.manifest?.name?.en)) || p.id;
      return { id, name, kind: 'installed', class: p.class || null, status: 'installed' };
    }
    return { id, name: id, kind: null, class: null, status: null };
  });
  const pluginRecord = (id) => {
    const m = index.entries.find((x) => x.id === id && x.status === 'active' && x.listed !== false);
    if (m) return { id, version: m.version, requires: m.requires || {}, optional: m.optional || {}, conflicts: m.conflicts || {}, kind: m.kind };
    const p = registry && typeof registry.plugins === 'function' ? registry.plugins().find((x) => x.id === id) : null;
    if (p) return { id, version: p.manifest?.version || '0.0.0', requires: p.manifest?.requires || {}, optional: p.manifest?.optional || {}, conflicts: p.manifest?.conflicts || {}, kind: 'installed' };
    return null;
  };
  const dependencyCheckOf = (root) => {
    const missing = new Map();
    const mismatched = new Map();
    const conflicts = new Map();
    const optionalMissing = new Map();
    const cycles = new Map();
    const resolved = new Set();
    const visit = (node, depth, stack) => {
      if (depth > 8) return;
      const reqs = node.requires && typeof node.requires === 'object' ? node.requires : {};
      for (const [id, range] of Object.entries(reqs)) {
        const hit = pluginRecord(id);
        if (!hit) { missing.set(id, { id, range, by: node.id }); continue; }
        if (range && !appVersionMatches(range, hit.version)) { mismatched.set(id, { id, range, version: hit.version, by: node.id }); continue; }
        resolved.add(id);
        if (stack.has(id)) { cycles.set(id, { id, by: node.id }); continue; }
        visit(hit, depth + 1, new Set([...stack, id]));
      }
      const opts = node.optional && typeof node.optional === 'object' ? node.optional : {};
      for (const [id, range] of Object.entries(opts)) {
        const hit = pluginRecord(id);
        if (!hit) optionalMissing.set(id, { id, range, by: node.id });
        else if (range && !appVersionMatches(range, hit.version)) optionalMissing.set(id, { id, range, version: hit.version, by: node.id });
        else resolved.add(id);
      }
      const conf = node.conflicts && typeof node.conflicts === 'object' ? node.conflicts : {};
      for (const [id, range] of Object.entries(conf)) {
        const hit = pluginRecord(id);
        if (hit && (!range || appVersionMatches(range, hit.version))) conflicts.set(id, { id, range, version: hit.version, by: node.id });
      }
    };
    visit(root, 0, new Set([root.id]));
    return {
      ok: missing.size === 0 && mismatched.size === 0 && conflicts.size === 0 && cycles.size === 0,
      missing: [...missing.values()], mismatched: [...mismatched.values()], conflicts: [...conflicts.values()],
      optionalMissing: [...optionalMissing.values()], cycles: [...cycles.values()], resolved: [...resolved],
    };
  };
  const publicEntry = (e) => {
    const compat = compatibilityOf(e.kind, e.class, e.app, e.api);
    const dependencies = {
      requires: e.requires || {}, optional: e.optional || {}, conflicts: e.conflicts || {},
    };
    const dependencyCheck = dependencyCheckOf({ id: e.id, version: e.version, ...dependencies });
    const mirrorBase = mirrors.length ? mirrors[0].replace(/\/$/, '') : '';
    const mirror = mirrorBase && e.status === 'active' && e.listed !== false && e.needsReview !== true && e.file
      ? `${mirrorBase}/${e.file.replace(/\\/g, '/')}` : null;
    return {
      id: e.id, kind: e.kind, name: e.name, version: e.version, author: e.author || null,
      description: e.description || null, class: e.class || null, status: e.status, bytes: e.bytes, sha256: e.sha256,
      // the five-section category the game lists it under (shared/plugins/category.js): the manifest's own, else the class
      category: pluginCategory({ category: e.category, class: e.class }), declaredCategory: parsePluginCategory(e.category),
      license: e.license || null, homepage: e.homepage || null,
      uploadedAt: e.uploadedAt, uploadedBy: e.uploadedBy || null, reviewedAt: e.reviewedAt || null,
      downloads: e.downloads || 0, app: compat.app, api: compat.api, compat, listed: e.listed !== false,
      order: Number.isFinite(e.order) ? e.order : 0, needsReview: e.needsReview === true,
      signature: e.signature || null, mirror,
      dependencies, dependencyCheck,
      pendingUpdate: e.pending ? {
        version: e.pending.version, bytes: e.pending.bytes, sha256: e.pending.sha256,
        uploadedAt: e.pending.uploadedAt, uploadedBy: e.pending.uploadedBy || null, filename: e.pending.filename || null,
        signature: e.pending.signature || null,
      } : null,
      history: (Array.isArray(e.history) ? e.history : []).slice(-10).map((h) => ({
        version: h.version, bytes: h.bytes, sha256: h.sha256, uploadedAt: h.uploadedAt,
      })),
      related: Array.isArray(e.related) ? [...e.related] : [], relatedPlugins: relatedOf(e.related),
      relatedBy: index.entries.filter((x) => x.id !== e.id && Array.isArray(x.related) && x.related.includes(e.id))
        .map((x) => ({ id: x.id, name: x.name || x.id, kind: x.kind, class: x.class || null })),
      download: e.status === 'active' && e.listed !== false && e.needsReview !== true ? `/market/api/download/${e.kind}/${encodeURIComponent(e.id)}` : null,
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
        class: man.class || null, category: parsePluginCategory(man.category), app: appRangeOf(man.app), api: apiLevelOf(man.api),
        license: typeof man.license === 'string' ? man.license.slice(0, 120) : null,
        homepage: typeof man.homepage === 'string' ? man.homepage.slice(0, 300) : null,
        requires: depMap(man.requires), optional: depMap(man.optional), conflicts: depMap(man.conflicts),
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
      license: typeof pack.license === 'string' ? pack.license.slice(0, 120) : null,
      homepage: typeof pack.homepage === 'string' ? pack.homepage.slice(0, 300) : null,
      requires: depMap(pack.dependencies), optional: {}, conflicts: depMap(pack.conflicts),
    };
  }

  async function upload({ kind, bytes, filename = '', uploadedBy = null, signature = null }) {
    if (!KINDS.has(kind)) throw new Error('kind must be ordinary or forge');
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('empty zip');
    if (bytes.length > PLUGIN_LIMITS.pluginBytes) throw new Error('zip is over the plugin size limit');
    const verifiedSignature = verifySignature(bytes, signature);
    const meta = await inspect(kind, bytes);
    if (requiredSigned.has(meta.class) && !verifiedSignature) throw new Error(`a verified signature is required for ${meta.class} plugins`);
    const key = keyOf(kind, meta.id);
    const existing = index.entries.find((e) => keyOf(e.kind, e.id) === key);
    const now = Date.now();
    const file = `${kind}/${safePart(meta.id)}-${safePart(meta.version)}.zip`;
    const incoming = {
      version: meta.version, file, bytes: bytes.length, sha256: sha256(bytes),
      filename: String(filename || '').slice(0, 120), uploadedAt: now, uploadedBy: uploadedBy || null,
      signature: verifiedSignature,
      name: meta.name || meta.id, author: meta.author || null, description: meta.description || null,
      class: meta.class || null, category: meta.category || null, app: meta.app || null, api: meta.api ?? null,
      license: meta.license || null, homepage: meta.homepage || null,
      requires: meta.requires || {}, optional: meta.optional || {}, conflicts: meta.conflicts || {},
    };
    if (existing && existing.status === 'active') {
      if (meta.version === existing.version) throw new Error(`plugin ${meta.id}@${meta.version} is already active`);
      fs.writeFileSync(path.join(base, file), bytes);
      existing.pending = incoming;
      existing.updatedAt = now;
      existing.updatedBy = uploadedBy || null;
      save();
      audit('market-stage-update', { kind, id: meta.id, version: meta.version, by: uploadedBy || null });
      log.info?.(`[market] staged update ${kind}/${meta.id}@${meta.version} (pending; active ${existing.version} kept)`);
      return publicEntry(existing);
    }
    if (existing && existing.status === 'pending') {
      try { fs.rmSync(path.join(base, existing.file), { force: true }); } catch { /* ignore */ }
      fs.writeFileSync(path.join(base, file), bytes);
      Object.assign(existing, incoming, { status: 'pending', pending: null, needsReview: false });
      save();
      log.info?.(`[market] replaced pending ${kind}/${meta.id}@${meta.version}`);
      return publicEntry(existing);
    }
    if (existing) {
      try { fs.rmSync(path.join(base, existing.file), { force: true }); } catch { /* ignore */ }
      index.entries = index.entries.filter((e) => e !== existing);
    }
    fs.writeFileSync(path.join(base, file), bytes);
    const entry = {
      ...incoming,
      kind, id: meta.id, status: 'pending', listed: true,
      order: Math.max(0, ...index.entries.map((x) => Number(x.order) || 0)) + 1,
      related: [], reviewedAt: null, reviewedBy: null, reviewNote: null, downloads: 0,
      pending: null, history: [], needsReview: false,
    };
    index.entries.push(entry);
    save();
    audit('market-upload', { kind, id: meta.id, version: meta.version, by: uploadedBy || null });
    log.info?.(`[market] uploaded ${kind}/${meta.id}@${meta.version} (${bytes.length} bytes, pending)`);
    return publicEntry(entry);
  }

  function get(kind, id) {
    return index.entries.find((e) => e.kind === kind && e.id === id) || null;
  }

  async function test(kind, id, log = noopLog) {
    const e = get(kind, id);
    if (!e) throw new Error('plugin not found');
    const zip = path.join(base, (e.pending && e.pending.file) || e.file);
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

  /** Edit the safe marketplace metadata. Never touches the stored zip or plugin code. */
  function edit(kind, id, fields, { reviewer = null } = {}) {
    if (!KINDS.has(kind)) throw new Error('kind must be ordinary or forge');
    const e = get(kind, id);
    if (!e) throw new Error('plugin not found');
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields object required');
    const next = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'description')) {
      if (fields.description != null && typeof fields.description !== 'string') throw new Error('description must be a string or null');
      next.description = fields.description == null ? null : fields.description.slice(0, 1000);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'author')) {
      if (fields.author != null && typeof fields.author !== 'string') throw new Error('author must be a string or null');
      next.author = fields.author == null ? null : fields.author.slice(0, 120);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'app')) {
      if (fields.app != null && typeof fields.app !== 'string') throw new Error('app must be a version range string or null');
      next.app = fields.app == null || !String(fields.app).trim() ? null : String(fields.app).trim().slice(0, 120);
      if (next.app && !isVersionRange(next.app)) throw new Error('app must be a version range such as >=0.4.0 <0.5.0');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'api')) {
      if (fields.api != null && (!Number.isInteger(fields.api) || fields.api < 1 || fields.api > 99)) throw new Error('api must be an integer 1..99 or null');
      next.api = fields.api ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'listed')) {
      if (typeof fields.listed !== 'boolean') throw new Error('listed must be true or false');
      next.listed = fields.listed;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'category')) {
      if (fields.category != null && !parsePluginCategory(fields.category)) throw new Error('category must be null or one of appearance, faction, strategy, enemy, gameplay');
      next.category = fields.category == null ? null : parsePluginCategory(fields.category);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'related')) {
      if (!Array.isArray(fields.related) || fields.related.length > 16
        || fields.related.some((x) => typeof x !== 'string' || !isPluginId(x) || x === id)) {
        throw new Error('related must be a list of other plugin ids (max 16)');
      }
      const known = new Set(index.entries.map((x) => x.id));
      if (registry && typeof registry.plugins === 'function') for (const p of registry.plugins()) known.add(p.id);
      const missing = fields.related.filter((x) => !known.has(x));
      if (missing.length) throw new Error(`related plugin not found: ${missing.join(', ')}`);
      next.related = [...new Set(fields.related)];
    }
    if (!Object.keys(next).length) throw new Error('no editable field supplied');
    const beforeApp = e.app ?? null;
    const beforeApi = e.api ?? null;
    Object.assign(e, next);
    if (e.status === 'active' && (beforeApp !== (e.app ?? null) || beforeApi !== (e.api ?? null))) e.needsReview = true;
    e.updatedAt = Date.now();
    e.updatedBy = reviewer || null;
    save();
    audit('market-edit', { kind, id, fields: Object.keys(next), by: reviewer || null, needsReview: e.needsReview === true });
    log.info?.(`[market] edited ${kind}/${id}: ${Object.keys(next).join(', ')}`);
    return publicEntry(e);
  }

  /** Reorder all entries of one kind from an ordered id list (drag/drop). */
  function reorder(kind, ids) {
    if (!KINDS.has(kind)) throw new Error('kind must be ordinary or forge');
    if (!Array.isArray(ids) || !ids.length) throw new Error('ids required');
    const rows = index.entries.filter((e) => e.kind === kind);
    const wanted = new Set(ids);
    if (wanted.size !== ids.length || rows.some((e) => !wanted.has(e.id)) || ids.some((id) => !rows.some((e) => e.id === id))) {
      throw new Error('ids must list every plugin of this kind once');
    }
    ids.forEach((id, i) => { const e = get(kind, id); if (e) e.order = i + 1; });
    save();
    audit('market-reorder', { kind, ids });
    return list({ admin: true });
  }

  /** Move an entry within its kind (up/down) by swapping the persisted order. */
  function move(kind, id, direction) {
    if (!KINDS.has(kind)) throw new Error('kind must be ordinary or forge');
    if (direction !== 'up' && direction !== 'down') throw new Error('direction must be up or down');
    const rows = index.entries.filter((e) => e.kind === kind)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || (b.uploadedAt || 0) - (a.uploadedAt || 0));
    const i = rows.findIndex((e) => e.id === id);
    if (i < 0) throw new Error('plugin not found');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return { ok: true, moved: false, entry: publicEntry(rows[i]) };
    rows.forEach((e, k) => { e.order = k + 1; });
    const tmp = rows[i].order;
    rows[i].order = rows[j].order;
    rows[j].order = tmp;
    save();
    audit('market-move', { kind, id, direction });
    return { ok: true, moved: true, entry: publicEntry(rows[i]) };
  }

  async function review(kind, id, action, { reviewer = null, note = '' } = {}) {
    const e = get(kind, id);
    if (!e) throw new Error('plugin not found');
    if (!['test', 'approve', 'reject'].includes(action)) throw new Error('action must be test, approve or reject');
    if (action === 'test') {
      const r = await test(kind, id, log);
      const dependencyCheck = dependencyCheckOf({ id: e.id, version: e.version, requires: e.requires || {}, optional: e.optional || {}, conflicts: e.conflicts || {} });
      e.reviewedAt = Date.now(); e.reviewedBy = reviewer; e.reviewNote = String(note || '').slice(0, 500);
      save();
      audit('market-test', { kind, id, by: reviewer || null });
      return { ok: true, action, result: r, dependencyCheck, entry: publicEntry(e) };
    }
    if (action === 'reject') {
      if (e.pending) {
        e.pending = null;
        e.reviewedAt = Date.now(); e.reviewedBy = reviewer;
        e.reviewNote = String(note || '').slice(0, 500); save();
        audit('market-reject-update', { kind, id, by: reviewer || null });
        return { ok: true, action, entry: publicEntry(e) };
      }
      e.status = 'rejected'; e.reviewedAt = Date.now(); e.reviewedBy = reviewer;
      e.reviewNote = String(note || '').slice(0, 500); save();
      audit('market-reject', { kind, id, by: reviewer || null });
      return { ok: true, action, entry: publicEntry(e) };
    }
    if (e.status === 'active' && !e.pending && e.needsReview !== true) return { ok: true, action, entry: publicEntry(e) };
    const dep = e.pending || e;
    const dependencyCheck = dependencyCheckOf({ id: e.id, version: dep.version, requires: dep.requires || {}, optional: dep.optional || {}, conflicts: dep.conflicts || {} });
    if (!dependencyCheck.ok) {
      const detail = [...dependencyCheck.missing, ...dependencyCheck.mismatched, ...dependencyCheck.conflicts, ...dependencyCheck.cycles]
        .map((x) => x.id).join(', ');
      throw new Error(`dependency check failed: ${detail}`);
    }
    const result = await test(kind, id, log);
    if (e.pending) {
      const current = {
        version: e.version, file: e.file, bytes: e.bytes, sha256: e.sha256, uploadedAt: e.uploadedAt,
        name: e.name, author: e.author, description: e.description, class: e.class, app: e.app, api: e.api,
        requires: e.requires || {}, optional: e.optional || {}, conflicts: e.conflicts || {},
        signature: e.signature || null,
        license: e.license || null, homepage: e.homepage || null,
      };
      e.history = [...(Array.isArray(e.history) ? e.history : []), current].slice(-10);
      const next = e.pending;
      e.version = next.version; e.file = next.file; e.bytes = next.bytes; e.sha256 = next.sha256;
      e.uploadedAt = next.uploadedAt; e.uploadedBy = next.uploadedBy || null;
      e.name = next.name || e.name; e.author = next.author || e.author;
      e.description = next.description || e.description; e.class = next.class || e.class;
      e.app = next.app || null; e.api = next.api ?? null;
      e.requires = next.requires || {}; e.optional = next.optional || {}; e.conflicts = next.conflicts || {};
      e.signature = next.signature || null;
      e.license = next.license || null; e.homepage = next.homepage || null;
      e.pending = null;
    }
    e.status = 'active'; e.needsReview = false;
    e.reviewedAt = Date.now(); e.reviewedBy = reviewer;
    e.reviewNote = String(note || '').slice(0, 500); e.test = { at: Date.now(), warnings: result.warnings || 0 };
    save();
    audit('market-approve', { kind, id, version: e.version, by: reviewer || null });
    log.info?.(`[market] approved ${kind}/${id}${reviewer ? ` by ${reviewer}` : ''}`);
    return { ok: true, action, result, entry: publicEntry(e) };
  }

  /** Restore an archived active version and archive the current one (the archived version was reviewed before). */
  async function rollback(kind, id, version, { reviewer = null } = {}) {
    const e = get(kind, id);
    if (!e || e.status !== 'active') throw new Error('active plugin not found');
    const history = Array.isArray(e.history) ? e.history : [];
    const target = history.find((h) => h.version === version);
    if (!target) throw new Error('version not found in history');
    const zip = path.join(base, target.file);
    if (!fs.existsSync(zip)) throw new Error('archived zip is missing');
    const previous = {
      version: e.version, file: e.file, bytes: e.bytes, sha256: e.sha256, uploadedAt: e.uploadedAt,
      name: e.name, author: e.author, description: e.description, class: e.class, app: e.app, api: e.api,
      requires: e.requires || {}, optional: e.optional || {}, conflicts: e.conflicts || {},
      signature: e.signature || null,
    };
    e.version = target.version; e.file = target.file; e.bytes = target.bytes; e.sha256 = target.sha256;
    e.uploadedAt = target.uploadedAt; e.name = target.name || e.name; e.author = target.author || e.author;
    e.description = target.description || e.description; e.class = target.class || e.class;
    e.app = target.app || null; e.api = target.api ?? null;
    e.requires = target.requires || {}; e.optional = target.optional || {}; e.conflicts = target.conflicts || {};
    e.signature = target.signature || null;
    e.history = [...history.filter((h) => h !== target), previous].slice(-10);
    e.pending = null; e.needsReview = false; e.status = 'active';
    e.reviewedAt = Date.now(); e.reviewedBy = reviewer;
    save();
    audit('market-rollback', { kind, id, version, by: reviewer || null });
    log.info?.(`[market] rolled back ${kind}/${id} to ${version}${reviewer ? ` by ${reviewer}` : ''}`);
    return { ok: true, entry: publicEntry(e) };
  }

  /** Delete stored zips no longer referenced by an entry/pending/history, and clear installed download caches. */
  function gc() {
    const keep = new Set();
    for (const e of index.entries) {
      if (e.file) keep.add(e.file);
      if (e.pending && e.pending.file) keep.add(e.pending.file);
      for (const h of (Array.isArray(e.history) ? e.history : [])) if (h.file) keep.add(h.file);
    }
    let removed = 0;
    for (const kind of ['ordinary', 'forge']) {
      const dir = dirs[kind];
      let names = [];
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const name of names) {
        const rel = `${kind}/${name}`;
        if (keep.has(rel)) continue;
        try { fs.rmSync(path.join(dir, name), { force: true }); removed++; } catch { /* ignore */ }
      }
    }
    const cacheDir = path.join(base, 'installed');
    let cached = 0;
    try {
      for (const name of fs.readdirSync(cacheDir)) {
        try { fs.rmSync(path.join(cacheDir, name), { force: true }); cached++; } catch { /* ignore */ }
      }
    } catch { /* no cache */ }
    audit('market-gc', { removed, cached });
    return { ok: true, removed, cached };
  }

  function list({ status = 'active', admin = false } = {}) {
    const rows = index.entries.filter((e) => admin || (e.status === status && e.listed !== false && e.needsReview !== true));
    return rows.map(publicEntry).sort((a, b) => (a.order || 0) - (b.order || 0) || (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }

  /** Paged/filtered listing for API clients; `list()` remains the unpaged compatibility form. */
  function listPage({ status = 'active', admin = false, q = '', kind = '', cls = '', page = 1, limit = 20 } = {}) {
    const query = String(q || '').trim().toLowerCase();
    const rows = index.entries.filter((e) => {
      if (!admin && (e.status !== status || e.listed === false || e.needsReview === true)) return false;
      if (kind && e.kind !== kind) return false;
      if (cls && e.class !== cls) return false;
      if (!query) return true;
      return [e.id, e.name, e.author, e.description, e.class, e.kind]
        .some((x) => String(x || '').toLowerCase().includes(query));
    }).map(publicEntry).sort((a, b) => (a.order || 0) - (b.order || 0) || (b.uploadedAt || 0) - (a.uploadedAt || 0));
    const size = Math.min(100, Math.max(1, Number(limit) || 20));
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const at = Math.min(pages, Math.max(1, Number(page) || 1));
    const counts = { ordinary: 0, forge: 0, installed: 0 };
    for (const e of index.entries) if (e.status === 'active' && e.listed !== false && e.needsReview !== true && e.kind in counts) counts[e.kind]++;
    counts.installed = installed().length;
    return { items: rows.slice((at - 1) * size, at * size), total: rows.length, page: at, pages, limit: size, counts };
  }

  /** Edit display-only metadata for an installed plugin (never touches the files in plugins/). */
  function editInstalled(id, fields, { reviewer = null } = {}) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields object required');
    const p = (registry && typeof registry.plugin === 'function' ? registry.plugin(id) : null)
      || (registry && typeof registry.plugins === 'function' ? registry.plugins().find((x) => x.id === id) : null);
    if (!p || p.source !== 'plugins' || !p.where || p.class === 'lang') throw new Error('installed plugin not found');
    const next = { ...(installedMeta[id] && typeof installedMeta[id] === 'object' ? installedMeta[id] : {}) };
    if (Object.prototype.hasOwnProperty.call(fields, 'description')) {
      if (fields.description != null && typeof fields.description !== 'string') throw new Error('description must be a string or null');
      next.description = fields.description == null ? null : fields.description.slice(0, 1000);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'author')) {
      if (fields.author != null && typeof fields.author !== 'string') throw new Error('author must be a string or null');
      next.author = fields.author == null ? null : fields.author.slice(0, 120);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'app')) {
      if (fields.app != null && typeof fields.app !== 'string') throw new Error('app must be a version range string or null');
      next.app = fields.app == null || !String(fields.app).trim() ? null : String(fields.app).trim().slice(0, 120);
      if (next.app && !isVersionRange(next.app)) throw new Error('app must be a version range such as >=0.4.0 <0.5.0');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'api')) {
      if (fields.api != null && (!Number.isInteger(fields.api) || fields.api < 1 || fields.api > 99)) throw new Error('api must be an integer 1..99 or null');
      next.api = fields.api ?? null;
    }
    if (!Object.keys(next).length) throw new Error('no editable field supplied');
    installedMeta[id] = { ...next, updatedAt: Date.now(), updatedBy: reviewer || null };
    saveInstalledMeta();
    audit('installed-meta-edit', { id, fields: Object.keys(next), by: reviewer || null });
    log.info?.(`[market] edited installed/${id}: ${Object.keys(next).join(', ')}`);
    return installed().find((x) => x.id === id) || null;
  }

  /**
   * Loaded plugins the installation has: the live `plugins/` folders and the project's built-in content plugins
   * (`server/plugins/builtin.js`, no folder). The store's 本机已安装 tab lists both, so a built-in faction boost is not
   * missing from the page that lists everything the server can offer; a built-in has no zip to download and its
   * metadata comes from its manifest (there is no installed-meta override for it).
   */
  function installed() {
    const list = registry && typeof registry.plugins === 'function' ? registry.plugins() : [];
    return list.filter((p) => p && (p.source === 'plugins' || p.source === 'builtin') && p.class !== 'lang').map((p) => {
      const builtin = p.source === 'builtin';
      const meta = installedMeta[p.id] && typeof installedMeta[p.id] === 'object' ? installedMeta[p.id] : {};
      const app = Object.prototype.hasOwnProperty.call(meta, 'app') ? meta.app : p.manifest?.app;
      const api = Object.prototype.hasOwnProperty.call(meta, 'api') ? meta.api : p.manifest?.api;
      const compat = compatibilityOf('installed', p.class, app, api);
      const version = p.manifest?.version || '1.0.0';
      const cacheName = `${safePart(p.id)}-${safePart(version)}-${p.bytes || 0}.zip`;
      const cached = path.join(base, 'installed', cacheName);
      const mirrorBase = mirrors.length ? mirrors[0].replace(/\/$/, '') : '';
      const manifestDescription = typeof p.manifest?.description === 'string'
        ? p.manifest.description
        : (p.manifest?.description?.zh || p.manifest?.description?.en || null);
      return {
        id: p.id, kind: 'installed', name: (typeof p.manifest?.name === 'string' ? p.manifest.name : (p.manifest?.name?.zh || p.manifest?.name?.en)) || p.id,
        version: p.manifest?.version || null, class: p.class, status: 'installed', bytes: p.bytes || null,
        category: pluginCategory({ category: p.manifest?.category, class: p.class }),
        app: compat.app, api: compat.api, compat,
        description: builtin ? manifestDescription : (typeof meta.description === 'string' ? meta.description : null),
        author: builtin ? (Array.isArray(p.manifest?.authors) && p.manifest.authors.length ? p.manifest.authors.join(', ') : null) : (typeof meta.author === 'string' ? meta.author : null),
        sources: [], installed: true, builtin, overridden: !builtin && Object.keys(meta).length > 0,
        mirror: !builtin && mirrorBase && fs.existsSync(cached) ? `${mirrorBase}/installed/${encodeURIComponent(cacheName)}` : null,
        download: !builtin && p.status === 'loaded' ? `/market/api/installed/${encodeURIComponent(p.id)}/download` : null,
      };
    });
  }

  function installedFiles(id) {
    const p = (registry && typeof registry.plugin === 'function' ? registry.plugin(id) : null)
      || (registry && typeof registry.plugins === 'function' ? registry.plugins().find((x) => x.id === id) : null);
    if (!p || p.source !== 'plugins' || p.class === 'lang' || p.status !== 'loaded' || !p.where) return null;
    const dir = path.isAbsolute(p.where) ? p.where : path.join(root, p.where);
    const entries = [];
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
        else if (st.isFile()) entries.push({ name: next, data: fs.readFileSync(at) });
      }
    };
    walk(dir);
    return entries.length ? { p, entries } : null;
  }

  /** Zip an installed plugin folder on demand; reuse a cached archive for the same version/byte count. */
  function downloadInstalled(id) {
    const got = installedFiles(id);
    if (!got) return null;
    const version = got.p.manifest?.version || '1.0.0';
    const cacheDir = path.join(base, 'installed');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, `${safePart(id)}-${safePart(version)}-${got.p.bytes || 0}.zip`);
    try {
      const st = fs.statSync(cacheFile);
      if (st.isFile() && st.size > 0) {
        return { entry: { id: got.p.id, version }, path: cacheFile, size: st.size, filename: `${got.p.id}-${version}.zip` };
      }
    } catch { /* build it */ }
    const bytes = zipFiles(got.entries);
    try { fs.writeFileSync(cacheFile, bytes); } catch { /* serve from memory if the cache is read-only */ }
    return {
      entry: { id: got.p.id, version }, bytes, size: bytes.length, path: cacheFile,
      filename: `${got.p.id}-${version}.zip`,
    };
  }

  /** Package an installed plugin as a pending marketplace entry (the admin then tests / approves it). */
  async function publishInstalled(id, { reviewer = 'admin' } = {}) {
    const got = installedFiles(id);
    if (!got) throw new Error('installed plugin not found');
    const version = got.p.manifest?.version || '1.0.0';
    // Registry ids come from the folder name; an installed manifest may omit `id` (templates do). The marketplace
    // zip needs it, so repair only that field in the packaged copy — the installed folder is never touched.
    const entries = got.entries.map((e) => {
      if (e.name !== 'plugin.json') return e;
      try {
        const man = JSON.parse(Buffer.from(e.data).toString('utf8'));
        if (man && typeof man === 'object' && !Array.isArray(man)) {
          man.id = got.p.id;
          return { name: e.name, data: Buffer.from(`${JSON.stringify(man, null, 2)}\n`) };
        }
      } catch { /* upload() below reports the bad manifest */ }
      return e;
    });
    return upload({
      kind: 'ordinary',
      bytes: zipFiles(entries),
      filename: `${got.p.id}-${version}.zip`,
      uploadedBy: reviewer || 'admin',
    });
  }

  function download(kind, id) {
    const e = get(kind, id);
    if (!e || e.status !== 'active' || e.listed === false || e.needsReview === true) return null;
    const file = path.join(base, e.file);
    if (!fs.existsSync(file)) return null;
    e.downloads = (e.downloads || 0) + 1;
    save();
    return { entry: e, bytes: fs.readFileSync(file), filename: `${e.id}-${e.version}.zip` };
  }

  return { base, upload, test, review, edit, editInstalled, move, reorder, rollback, gc, list, listPage, installed, download, downloadInstalled, publishInstalled, get, indexFile, publicKeys, addSigningKey, revokeSigningKey, setSignaturePolicy };
}
