// shared/keel/manifest.js — Keel manifest 3 (docs/keel/MANIFEST-V3.md).
//
// Keel is the plugin system this fork is growing out of the manifest-2 plugin system: a plugin is a set of modules
// (content / sim / match / policy / ui / asset / lang), each with its own contract, permissions and trust level.
// Manifest 2 stays the input format; this file reads the native format (`"manifest": 3`) and adapts v2 in
// shared/keel/adapt.js. Nothing here runs a plugin: it only reads what a plugin declares.
//
// No Node builtin: the CLI (tools/keel.mjs), the browser-side graph view and the server can share it.

import { isPackPath, isPluginId, isSemver, isVersionRange, UI_SLOT_IDS } from '../plugins/manifest.js';

/** The manifest format this file reads. */
export const KEEL_MANIFEST_VERSION = 3;
/** The version of the module/API contract family. */
export const KEEL_API_VERSION = 1;

/** The module kinds a Keel plugin may carry. */
export const KEEL_MODULE_KINDS = Object.freeze(['content', 'sim', 'match', 'policy', 'ui', 'asset', 'lang']);

/** The API domains a module kind needs. lang has no contract yet, so it maps to itself. */
export const KEEL_API_DOMAIN_OF = Object.freeze({
  content: 'content',
  sim: 'sim',
  match: 'match',
  policy: 'policy',
  ui: 'ui',
  asset: 'asset',
  lang: 'lang',
});

/** The trust levels (docs/keel/README.md §trust). */
export const KEEL_TRUST = Object.freeze(['data', 'sandbox', 'native']);

/** The scopes a plugin may be enabled in (same meaning as manifest 2). */
export const KEEL_SCOPES = Object.freeze(['room', 'personal', 'server']);

/**
 * Every capability a Keel module may ask for, with the module kinds that may hold it.
 * A capability is a promise about what a module can touch — not a file extension and not a class.
 */
export const KEEL_PERMISSIONS = Object.freeze({
  'content.define': ['content'],
  'content.patch': ['content'],
  'content.override': ['content'],
  'content.reference': ['content'],
  'content.dsl': ['content'],
  'content.offers': ['content'],
  'sim.read': ['sim'],
  'sim.damage.write': ['sim'],
  'sim.heal.write': ['sim'],
  'sim.buff.write': ['sim'],
  'sim.bond.read': ['sim'],
  'sim.bond.write': ['sim'],
  'sim.spawn': ['sim'],
  'sim.rng': ['sim'],
  'sim.fx': ['sim'],
  'sim.code': ['sim'],
  'match.read': ['match'],
  'match.economy.write': ['match'],
  'match.rng': ['match'],
  'match.code': ['match'],
  'policy.observe': ['policy'],
  'policy.act': ['policy'],
  'ui.frame': ['ui'],
  'ui.theme': ['ui'],
  'ui.native': ['ui'],
  'asset.add': ['asset'],
  'asset.override': ['asset'],
  'asset.theme': ['asset'],
  'native.execute': ['sim', 'match', 'ui'],
});

/** Fields a manifest 3 may carry. Anything else is a warning. */
const KEEL_FIELDS = new Set([
  '$schema', 'manifest', 'id', 'name', 'englishName', 'description', 'version', 'app', 'api', 'scope', 'trust',
  'modules', 'provides', 'consumes', 'state', 'requires', 'optional', 'conflicts', 'loadAfter', 'loadBefore', 'priority',
  'settings', 'compat', 'integrity', 'authors', 'credits', 'license', 'homepage', 'sourceLang', 'category', 'legacy',
]);

/** Fields a module may carry. */
const MODULE_FIELDS = new Set(['kind', 'entry', 'files', 'provides', 'consumes', 'permissions', 'slots', 'state', 'notes', 'assets', 'parts']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const short = (v) => {
  try { return String(JSON.stringify(typeof v === 'string' && v.length > 40 ? v.slice(0, 40) : v)).slice(0, 60); } catch { return Array.isArray(v) ? '[…]' : v && typeof v === 'object' ? '{…}' : typeof v; }
};

/** A local issue list: the same problems/warnings shape the manifest-2 reader returns, plus coded issues. */
function issueList() {
  const problems = [];
  const warnings = [];
  const issues = [];
  const add = (level, code, text, extra = {}) => {
    const issue = { level, code, text, ...extra };
    issues.push(issue);
    (level === 'problem' ? problems : warnings).push(text);
  };
  return {
    problems,
    warnings,
    issues,
    problem: (code, text, extra) => add('problem', code, text, extra),
    warning: (code, text, extra) => add('warning', code, text, extra),
  };
}

/**
 * Read a manifest 3.
 * @param {unknown} raw the parsed plugin.json
 * @param {{ id?: string }} [ctx] `id`: the folder name, when the manifest has none
 * @returns {{ manifest: any, problems: string[], warnings: string[], issues: any[] }}
 */
export function readKeelManifest(raw, ctx = {}) {
  const list = issueList();
  const done = (manifest) => ({ manifest, problems: list.problems, warnings: list.warnings, issues: list.issues });
  if (!isObj(raw)) { list.problem('KEEL_MANIFEST_SHAPE', 'the manifest is not a JSON object'); return done(null); }
  const m = /** @type {any} */ (raw);
  if (m.manifest !== KEEL_MANIFEST_VERSION) {
    list.problem('KEEL_MANIFEST_VERSION', `"manifest": ${short(m.manifest)} is not ${KEEL_MANIFEST_VERSION}`, { at: ['manifest'] });
    return done(null);
  }
  for (const key of Object.keys(m)) if (!KEEL_FIELDS.has(key)) list.warning('KEEL_FIELD_UNKNOWN', `"${key}" is not a field of manifest 3 (ignored)`, { at: [key] });

  const id = str(m.id, 32) || str(ctx.id, 32);
  if (!isPluginId(id)) list.problem('KEEL_ID', `"${id || m.id}" is not a plugin id (2–32 lower-case letters, digits and -)`, { at: ['id'] });
  else if (m.id !== undefined && m.id !== id) list.warning('KEEL_ID_MISMATCH', `"id": ${short(m.id)} is not "${id}" (the folder name decides)`, { at: ['id'] });

  const name = m.name;
  if (!(typeof name === 'string' && name.trim()) && !(isObj(name) && Object.values(name).every((v) => typeof v === 'string' && v.trim()))) {
    list.problem('KEEL_NAME', '"name" is a text or { "<lang>": "<text>" }', { at: ['name'] });
  }
  const version = str(m.version, 64);
  if (!isSemver(version)) list.problem('KEEL_VERSION', '"version" is not a semantic version', { at: ['version'] });
  if (m.app !== undefined && !isVersionRange(str(m.app, 60))) list.problem('KEEL_APP', '"app" is not a version range', { at: ['app'] });
  if (m.app === undefined) list.problem('KEEL_APP', 'no "app" (the game versions it is made for)', { at: ['app'] });

  const trust = str(m.trust, 16);
  if (!KEEL_TRUST.includes(trust)) {
    list.problem('KEEL_TRUST', `"trust": ${short(m.trust)} is not one of ${KEEL_TRUST.join(', ')}`, { at: ['trust'] });
  }

  const api = m.api;
  const apiDomains = new Set();
  if (!isObj(api) || !Object.keys(api).length) {
    list.problem('KEEL_API', '"api" is { "<domain>": <version> } and needs at least one domain', { at: ['api'] });
  } else {
    for (const [domain, level] of Object.entries(api)) {
      if (!KEEL_MODULE_KINDS.includes(domain)) list.problem('KEEL_API_DOMAIN', `"api.${domain}" is not a Keel domain (${KEEL_MODULE_KINDS.join(', ')})`, { at: ['api', domain] });
      else if (!Number.isInteger(level) || level < 1 || level > 99) list.problem('KEEL_API_LEVEL', `"api.${domain}": ${short(level)} is not an integer 1–99`, { at: ['api', domain] });
      else apiDomains.add(domain);
    }
  }

  const scope = m.scope === undefined ? ['room'] : (Array.isArray(m.scope) ? m.scope : [m.scope]);
  if (!scope.length || new Set(scope).size !== scope.length || scope.some((s) => !KEEL_SCOPES.includes(s))) {
    list.problem('KEEL_SCOPE', `"scope": ${short(m.scope)} — one or more of ${KEEL_SCOPES.join(', ')}`, { at: ['scope'] });
  }

  const modules = [];
  if (!Array.isArray(m.modules) || !m.modules.length) {
    list.problem('KEEL_MODULES', '"modules" is a non-empty list', { at: ['modules'] });
  } else if (m.modules.length > 64) {
    list.problem('KEEL_MODULES', 'more than 64 modules', { at: ['modules'] });
  } else {
    const seen = new Set();
    m.modules.forEach((mod, i) => {
      const at = ['modules', String(i)];
      if (!isObj(mod)) { list.problem('KEEL_MODULE_SHAPE', 'a module is an object', { at }); return; }
      const kind = str(mod.kind, 16);
      if (!KEEL_MODULE_KINDS.includes(kind)) { list.problem('KEEL_MODULE_KIND', `"kind": ${short(mod.kind)} is not one of ${KEEL_MODULE_KINDS.join(', ')}`, { at: [...at, 'kind'] }); return; }
      for (const key of Object.keys(mod)) if (!MODULE_FIELDS.has(key)) list.warning('KEEL_MODULE_FIELD', `"${key}" is not a module field (ignored)`, { at: [...at, key] });
      const entry = mod.entry === undefined ? '' : str(mod.entry, 200);
      const files = mod.files === undefined ? [] : (Array.isArray(mod.files) ? mod.files : [mod.files]);
      if (entry && !isPackPath(entry)) list.problem('KEEL_MODULE_ENTRY', `"entry": ${short(mod.entry)} is not a path inside the plugin folder`, { at: [...at, 'entry'] });
      if (!entry && !files.length) list.problem('KEEL_MODULE_EMPTY', 'a module needs an "entry" or "files"', { at });
      for (const f of files) if (!isPackPath(f)) list.problem('KEEL_MODULE_FILE', `"files": ${short(f)} is not a path inside the plugin folder`, { at: [...at, 'files'] });
      const key = entry || files[0] || '';
      if (key) {
        const sig = `${kind}:${key}`;
        if (seen.has(sig)) list.problem('KEEL_MODULE_DUPLICATE', `two ${kind} modules both start at "${key}"`, { at });
        seen.add(sig);
      }
      const perms = mod.permissions === undefined ? [] : (Array.isArray(mod.permissions) ? mod.permissions : [mod.permissions]);
      for (const p of perms) {
        if (typeof p !== 'string' || !has(KEEL_PERMISSIONS, p)) list.problem('KEEL_PERMISSION', `unknown capability ${short(p)} (known: ${Object.keys(KEEL_PERMISSIONS).join(', ')})`, { at: [...at, 'permissions'] });
        else if (!KEEL_PERMISSIONS[p].includes(kind)) list.problem('KEEL_PERMISSION_KIND', `"${p}" is not a capability a ${kind} module may hold`, { at: [...at, 'permissions'], permission: p });
      }
      for (const p of ['provides', 'consumes']) {
        const v = mod[p];
        if (v === undefined) continue;
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !/^[a-z][a-z0-9-]*:[A-Za-z0-9_*:./-]{1,160}$/.test(x))) {
          list.problem('KEEL_MODULE_REFS', `"${p}" is a list of "<kind>:<id>" strings`, { at: [...at, p] });
        }
      }
      if (kind === 'ui' && mod.slots !== undefined) {
        const slots = Array.isArray(mod.slots) ? mod.slots : [mod.slots];
        if (!slots.length || new Set(slots).size !== slots.length || slots.some((s) => !UI_SLOT_IDS.includes(s))) {
          list.problem('KEEL_UI_SLOTS', `"slots" is a list of ${UI_SLOT_IDS.join(', ')}`, { at: [...at, 'slots'] });
        }
      }
      if (mod.assets !== undefined && !isObj(mod.assets)) list.problem('KEEL_MODULE_ASSETS', '"assets" is the asset overlay object', { at: [...at, 'assets'] });
      if (mod.parts !== undefined && (!isObj(mod.parts) || Object.values(mod.parts).some((v) => !Array.isArray(v) || v.some((f) => !isPackPath(f))))) {
        list.problem('KEEL_MODULE_PARTS', '"parts" maps a content part to its files', { at: [...at, 'parts'] });
      }
      const domain = KEEL_API_DOMAIN_OF[kind];
      if (domain && isObj(api) && !apiDomains.has(domain)) list.warning('KEEL_API_MISSING', `a ${kind} module is present but "api.${domain}" is not declared`, { at: ['api', domain] });
      modules.push({
        kind,
        ...(entry ? { entry } : {}),
        ...(files.length ? { files } : {}),
        permissions: perms.filter((p) => typeof p === 'string' && has(KEEL_PERMISSIONS, p)),
        ...(Array.isArray(mod.provides) ? { provides: [...new Set(mod.provides)] } : {}),
        ...(Array.isArray(mod.consumes) ? { consumes: [...new Set(mod.consumes)] } : {}),
        ...(Array.isArray(mod.slots) ? { slots: [...new Set(mod.slots)] } : {}),
        ...(isObj(mod.assets) ? { assets: mod.assets } : {}),
        ...(isObj(mod.parts) ? { parts: Object.fromEntries(Object.entries(mod.parts).map(([k, v]) => [k, [...v]])) } : {}),
        ...(mod.state !== undefined ? { state: mod.state } : {}),
        ...(mod.notes !== undefined ? { notes: str(mod.notes, 500) } : {}),
      });
    });
  }

  // A sim / match / policy module runs code: data trust cannot carry it (the host would execute it).
  if (modules.some((mod) => mod.kind === 'sim' || mod.kind === 'match' || mod.kind === 'policy') && trust === 'data') {
    list.problem('KEEL_TRUST_CODE', 'a sim, match or policy module runs code: "trust" must be "sandbox" or "native"', { at: ['trust'] });
  }

  for (const p of ['provides', 'consumes']) {
    const v = m[p];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !/^[a-z][a-z0-9-]*:[A-Za-z0-9_*:./-]{1,160}$/.test(x))) {
      list.problem('KEEL_REFS', `"${p}" is a list of "<kind>:<id>" strings`, { at: [p] });
    }
  }

  for (const p of ['requires', 'optional', 'conflicts']) {
    const v = m[p];
    if (v === undefined) continue;
    if (!isObj(v)) { list.problem('KEEL_DEPS', `"${p}" is { "<plugin id>": "<version range>" }`, { at: [p] }); continue; }
    for (const [dep, range] of Object.entries(v)) {
      if (!isPluginId(dep)) list.problem('KEEL_DEPS', `"${p}.${dep}" is not a plugin id`, { at: [p, dep] });
      if (!isVersionRange(str(range, 60))) list.problem('KEEL_DEPS', `"${p}.${dep}": ${short(range)} is not a version range`, { at: [p, dep] });
    }
  }
  for (const p of ['loadAfter', 'loadBefore']) {
    const v = m[p];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => !isPluginId(x)) || new Set(v).size !== v.length) {
      list.problem('KEEL_ORDER', `"${p}" is a list of plugin ids`, { at: [p] });
    }
  }
  if (m.priority !== undefined && (!Number.isInteger(m.priority) || Math.abs(m.priority) > 1000)) {
    list.problem('KEEL_ORDER', '"priority" is an integer within ±1000', { at: ['priority'] });
  }

  if (m.state !== undefined) {
    if (!isObj(m.state)) list.problem('KEEL_STATE', '"state" is { "schema": "<file>", "version": <int> }', { at: ['state'] });
    else {
      if (m.state.schema !== undefined && !isPackPath(m.state.schema)) list.problem('KEEL_STATE', '"state.schema" is a path inside the plugin folder', { at: ['state', 'schema'] });
      if (m.state.version !== undefined && (!Number.isInteger(m.state.version) || m.state.version < 1)) list.problem('KEEL_STATE', '"state.version" is an integer ≥ 1', { at: ['state', 'version'] });
    }
  }
  if (m.compat !== undefined) {
    if (!isObj(m.compat)) list.problem('KEEL_COMPAT', '"compat" is an object', { at: ['compat'] });
    else {
      if (m.compat.mainline !== undefined && m.compat.mainline !== false && !isVersionRange(str(m.compat.mainline, 60))) {
        list.problem('KEEL_COMPAT', '"compat.mainline" is a version range or false', { at: ['compat', 'mainline'] });
      }
      if (m.compat.manifest2 !== undefined && typeof m.compat.manifest2 !== 'boolean') list.problem('KEEL_COMPAT', '"compat.manifest2" is a boolean', { at: ['compat', 'manifest2'] });
    }
  }
  if (m.integrity !== undefined) {
    if (!isObj(m.integrity)) list.problem('KEEL_INTEGRITY', '"integrity" is an object', { at: ['integrity'] });
    else {
      if (m.integrity.algo !== undefined && m.integrity.algo !== 'sha256') list.problem('KEEL_INTEGRITY', '"integrity.algo" is "sha256"', { at: ['integrity', 'algo'] });
      if (m.integrity.lock !== undefined && !isPackPath(m.integrity.lock)) list.problem('KEEL_INTEGRITY', '"integrity.lock" is a path inside the plugin folder', { at: ['integrity', 'lock'] });
    }
  }

  if (list.problems.length) return done(null);
  return done({
    manifest: KEEL_MANIFEST_VERSION,
    id,
    name,
    englishName: str(m.englishName, 60),
    description: m.description,
    version,
    app: str(m.app, 60) || '*',
    api: { ...api },
    scope: KEEL_SCOPES.filter((s) => scope.includes(s)),
    trust,
    modules,
    ...(Array.isArray(m.provides) ? { provides: [...new Set(m.provides)] } : {}),
    ...(Array.isArray(m.consumes) ? { consumes: [...new Set(m.consumes)] } : {}),
    ...(m.state !== undefined ? { state: m.state } : {}),
    requires: m.requires ?? {},
    optional: m.optional ?? {},
    conflicts: m.conflicts ?? {},
    loadAfter: Array.isArray(m.loadAfter) ? m.loadAfter : [],
    loadBefore: Array.isArray(m.loadBefore) ? m.loadBefore : [],
    priority: Number.isInteger(m.priority) ? m.priority : 0,
    settings: isObj(m.settings) ? m.settings : {},
    ...(m.compat !== undefined ? { compat: m.compat } : {}),
    ...(m.integrity !== undefined ? { integrity: m.integrity } : {}),
    authors: m.authors,
    credits: m.credits,
    license: m.license,
    homepage: m.homepage,
    sourceLang: str(m.sourceLang, 8) || 'zh',
    ...(m.category !== undefined ? { category: m.category } : {}),
    ...(m.legacy !== undefined ? { legacy: m.legacy } : {}),
  });
}

/** True when a value is a manifest 3 (the version field only; validation is readKeelManifest). */
export const isKeelManifest = (raw) => isObj(raw) && raw.manifest === KEEL_MANIFEST_VERSION;
