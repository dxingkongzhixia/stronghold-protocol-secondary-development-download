// shared/keel/legacy.js — manifest 3 → the manifest-2-shaped object the existing loaders still read.
//
// Keel is the source of truth for a plugin that carries `plugin.keel.json`. The registry, the content compiler, the
// visual sets and the FX reader were written against the manifest-2 shape, so this projection keeps their contracts
// while the declaration comes from Keel. It is a compatibility view, not a second plugin format: nothing writes it to
// disk and a plugin without `plugin.keel.json` keeps its own `plugin.json`.

import { PLUGIN_CLASSES, appVersionCompatible } from '../plugins/manifest.js';

/** Keel capability → the v2 permission the old loaders check. */
const V2_PERMISSION_OF = Object.freeze({
  'content.define': 'data.add',
  'content.patch': 'data.patch',
  'content.override': 'data.patch',
  'content.reference': 'data.add',
  'content.dsl': 'dsl',
  'content.offers': 'offers',
  'asset.add': 'assets.add',
  'asset.override': 'assets.override',
  'asset.theme': 'theme',
  'sim.code': 'sim.code',
  'match.code': 'meta.code',
  'ui.frame': 'ui.frame',
  'ui.native': 'trusted.page',
  'native.execute': 'trusted.server',
});

/** Infer the v2 class when a native manifest 3 does not carry `legacy.class`. */
export function classOfKeel(manifest) {
  const kinds = new Set((manifest?.modules ?? []).map((m) => m.kind));
  if (kinds.has('lang') && kinds.size === 1) return 'lang';
  if (kinds.has('ui') && kinds.size === 1) return 'ui';
  if (kinds.has('sim') || kinds.has('match')) return manifest?.trust === 'native' ? 'trusted' : 'script';
  if (kinds.has('content')) return 'content';
  if (kinds.has('asset')) return 'cosmetic';
  return 'content';
}

/** A name object or string → the v2 `names` map and its source-language string. */
function namesOf(name, sourceLang) {
  if (typeof name === 'string') return { names: { [sourceLang]: name }, name };
  const names = name && typeof name === 'object' ? { ...name } : {};
  return { names, name: names[sourceLang] ?? Object.values(names)[0] ?? '' };
}

/** The v2 permissions a Keel manifest implies when it keeps no `legacy.permissions`. */
function permissionsOf(manifest) {
  const out = new Set(manifest?.legacy?.permissions ?? []);
  for (const mod of manifest?.modules ?? []) for (const p of mod.permissions ?? []) {
    const v2 = V2_PERMISSION_OF[p];
    if (v2) out.add(v2);
  }
  return [...out];
}

/**
 * The content parts (`data`, `operators`, …) a Keel content module declares. `legacy.parts` is a byte-exact snapshot
 * kept by `keel import`/test fixtures for parts the module fields do not carry (theme, an asset file list, langs).
 */
function partsOf(manifest) {
  const parts = {};
  const legacyParts = manifest?.legacy?.parts;
  if (legacyParts && typeof legacyParts === 'object' && !Array.isArray(legacyParts)) {
    for (const [name, part] of Object.entries(legacyParts)) {
      if (!part || typeof part !== 'object') continue;
      parts[name] = {
        ...(Array.isArray(part.files) ? { files: [...part.files] } : { files: [] }),
        ...(part.inline && typeof part.inline === 'object' ? { inline: part.inline } : {}),
        ...(part.langs && typeof part.langs === 'object' ? { langs: { ...part.langs } } : {}),
        ...(part.themeVars && typeof part.themeVars === 'object' ? { themeVars: part.themeVars } : {}),
      };
    }
  }
  const content = (manifest?.modules ?? []).find((m) => m.kind === 'content');
  const fromModule = content?.parts && typeof content.parts === 'object' ? content.parts : null;
  const fromLegacy = manifest?.legacy?.partFiles && typeof manifest.legacy.partFiles === 'object' ? manifest.legacy.partFiles : null;
  const source = fromModule ?? fromLegacy ?? {};
  for (const [name, files] of Object.entries(source)) {
    if (!Array.isArray(files) || !files.length) continue;
    if (name === 'i18n') {
      const langs = {};
      for (const file of files) {
        const lang = String(file).split('/').pop().replace(/\.json$/i, '');
        if (lang) langs[lang] = file;
      }
      parts.i18n = { files: [...files], langs };
      continue;
    }
    parts[name] = { ...(parts[name] ?? {}), files: [...files] };
  }
  const asset = (manifest?.modules ?? []).find((m) => m.kind === 'asset');
  if (asset?.assets && typeof asset.assets === 'object' && Object.keys(asset.assets).length) {
    parts.assets = { files: [], ...(parts.assets ?? {}), inline: asset.assets };
  }
  return parts;
}

/** The v2 `entry` map from the code modules (a migrated plugin also keeps `legacy.entry`). */
function entryOf(manifest) {
  const entry = { ...(manifest?.legacy?.entry ?? {}) };
  for (const mod of manifest?.modules ?? []) {
    if (!mod.entry) continue;
    if (mod.kind === 'sim') entry.sim = mod.entry;
    else if (mod.kind === 'match') entry[mod.permissions?.includes('native.execute') ? 'server' : 'meta'] = mod.entry;
    else if (mod.kind === 'ui') entry.client = mod.entry;
  }
  return entry;
}

/**
 * Project a validated manifest 3 onto the manifest-2 shape the registry/content/visual readers use.
 * @param {any} manifest a `readKeelManifest` result
 * @param {{ app?: string, id?: string }} [ctx]
 */
export function keelToV2(manifest, ctx = {}) {
  const legacy = manifest?.legacy ?? {};
  const id = manifest?.id ?? ctx.id ?? '';
  const cls = typeof legacy.class === 'string' && PLUGIN_CLASSES[legacy.class] ? legacy.class : classOfKeel(manifest);
  const sourceLang = manifest?.sourceLang ?? 'zh';
  const { names, name } = namesOf(manifest?.name, sourceLang);
  const description = typeof manifest?.description === 'string'
    ? manifest.description
    : manifest?.description?.[sourceLang] ?? Object.values(manifest?.description ?? {})[0] ?? '';
  const app = manifest?.app ?? '*';
  const slots = Array.isArray(legacy.slots) && legacy.slots.length ? [...legacy.slots] : (manifest?.modules ?? []).find((m) => m.kind === 'ui' && m.slots)?.slots;
  const langEntry = (manifest?.modules ?? []).find((m) => m.kind === 'lang' && m.entry)?.entry;
  const files = { ...(legacy.files ?? {}) };
  if (cls === 'lang' && langEntry && !files.ui) files.ui = langEntry;
  // The registry groups language plugins by this code (a manifest-2 lang field; no Keel module field replaces it).
  const lang = typeof legacy.lang === 'string' ? legacy.lang : (manifest?.lang ?? undefined);
  return {
    manifest: 2,
    id,
    class: cls,
    type: legacy.type ?? PLUGIN_CLASSES[cls]?.packType,
    name: name || id,
    englishName: manifest?.englishName || names.en || name || id,
    names,
    description,
    version: manifest?.version,
    app,
    compatible: appVersionCompatible(app, ctx.app, cls),
    api: Number.isInteger(legacy.api) ? legacy.api : 2,
    scope: Array.isArray(manifest?.scope) ? [...manifest.scope] : ['room'],
    ...(manifest?.category ? { category: manifest.category } : {}),
    authors: manifest?.authors ?? [],
    credits: manifest?.credits ?? '',
    license: manifest?.license ?? '',
    homepage: manifest?.homepage ?? '',
    sourceLang,
    ...(lang ? { lang } : {}),
    requires: { ...(manifest?.requires ?? {}) },
    optional: { ...(manifest?.optional ?? {}) },
    conflicts: { ...(manifest?.conflicts ?? {}) },
    loadAfter: [...(manifest?.loadAfter ?? [])],
    loadBefore: [...(manifest?.loadBefore ?? [])],
    priority: manifest?.priority ?? 0,
    settings: { ...(manifest?.settings ?? {}) },
    permissions: permissionsOf(manifest),
    parts: partsOf(manifest),
    entry: entryOf(manifest),
    ...(slots?.length ? { slots: [...slots] } : {}),
    files,
    ...(legacy.overrides ? { overrides: [...legacy.overrides] } : {}),
    ...(legacy.themeVars ? { themeVars: legacy.themeVars } : {}),
    ...(legacy.notices ? { notices: legacy.notices } : {}),
    ...(legacy.rules ? { rules: legacy.rules } : {}),
    // The registry hashes this file, not plugin.json, when a plugin is declared by Keel.
    manifestFile: manifest?.legacy?.manifestFile ?? 'plugin.keel.json',
  };
}
