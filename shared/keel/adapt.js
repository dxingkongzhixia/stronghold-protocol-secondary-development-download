// shared/keel/adapt.js — manifest 2 → Keel (manifest 3) module graph.
//
// This is the compatibility half of Keel: an old plugin keeps its plugin.json and its files; the adapter only
// describes what it already is in Keel's terms. It never rewrites the plugin and never changes what the current
// loader does. `keel migrate` prints or writes the result as plugin.keel.json.

import { PLUGIN_COMPAT_APP, appVersionMatches } from '../plugins/manifest.js';

/** v2 permissions → the Keel capabilities they mean. */
export const V2_PERMISSION_MAP = Object.freeze({
  'assets.override': 'asset.override',
  'assets.add': 'asset.add',
  theme: 'asset.theme',
  'data.patch': 'content.patch',
  'data.add': 'content.define',
  dsl: 'content.dsl',
  offers: 'content.offers',
  'sim.code': 'sim.code',
  'meta.code': 'match.code',
  'mode.code': 'match.code',
  'ui.frame': 'ui.frame',
  'trusted.page': 'ui.native',
  'trusted.server': 'native.execute',
});

/** The v2 parts that become a content module. */
const CONTENT_PARTS = Object.freeze(['data', 'operators', 'enemies', 'modes', 'stages', 'dsl', 'offers', 'i18n']);

/** The trust level a v2 class runs at. */
export function trustOfClass(cls) {
  if (cls === 'trusted') return 'native';
  if (cls === 'script' || cls === 'ui') return 'sandbox';
  return 'data';
}

/** All files of the named v2 parts, in declaration order, without duplicates. */
export function partFiles(v2, names = CONTENT_PARTS) {
  const out = [];
  for (const name of names) {
    for (const f of v2?.parts?.[name]?.files ?? []) if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** The capabilities of a v2 permission list, grouped by the module kind that receives them. */
export function mapPermissions(permissions = []) {
  const out = { content: [], sim: [], match: [], policy: [], ui: [], asset: [], lang: [] };
  const unknown = [];
  for (const p of permissions) {
    const k = V2_PERMISSION_MAP[p];
    if (!k) { unknown.push(p); continue; }
    const kind = k.startsWith('content.') ? 'content'
      : k.startsWith('sim.') ? 'sim'
        : k.startsWith('match.') ? 'match'
          : k.startsWith('policy.') ? 'policy'
            : k.startsWith('ui.') ? 'ui'
              : k.startsWith('asset.') ? 'asset'
                : k === 'native.execute' ? 'match' : 'content';
    if (!out[kind].includes(k)) out[kind].push(k);
  }
  return { byKind: out, unknown };
}

/** The files of each content part a Keel content module keeps, for a loader that needs the role of a file. */
export function contentParts(v2) {
  const out = {};
  for (const name of CONTENT_PARTS) {
    const files = v2?.parts?.[name]?.files ?? [];
    if (files.length) out[name] = [...files];
  }
  return out;
}

/** The structured asset overlay a v2 manifest carries, or null when it carries none. */
export function assetEntries(v2) {
  const assets = v2?.assets ?? v2?.parts?.assets?.inline;
  return assets && typeof assets === 'object' && Object.keys(assets).length ? JSON.parse(JSON.stringify(assets)) : null;
}

/**
 * Adapt a validated manifest-2 object (readPluginManifest's `manifest`) to manifest 3.
 * @param {any} v2
 * @param {{ mainline?: string }} [_opts]
 * @returns {{ manifest: any, warnings: string[], legacy: any }}
 */
export function adaptV2(v2, _opts = {}) {
  const warnings = [];
  const { byKind, unknown } = mapPermissions(v2.permissions ?? []);
  for (const p of unknown) warnings.push(`v2 permission "${p}" has no Keel capability yet (kept in legacy.permissions)`);

  const modules = [];
  const cls = v2.class;
  const contentFiles = partFiles(v2);

  if (cls === 'lang') {
    const entry = v2.files?.ui ?? v2.files?.data ?? '';
    modules.push({ kind: 'lang', ...(entry ? { entry } : { files: ['plugin.keel.json'] }), permissions: [] });
    if (!entry) warnings.push('a lang plugin has no files.ui or files.data; the lang module has no entry');
  }

  if (cls === 'cosmetic') {
    const files = [...(v2.parts?.assets?.files ?? []), ...(v2.parts?.theme?.files ?? [])];
    const assets = assetEntries(v2);
    modules.push({ kind: 'asset', files: files.length ? files : ['plugin.keel.json'], permissions: byKind.asset.length ? byKind.asset : ['asset.override'], ...(assets ? { assets } : {}) });
    if (v2.parts?.theme) warnings.push('theme is carried by the asset module; the v2 theme variables stay in legacy.themeVars');
  }

  if (cls === 'content') {
    const parts = contentParts(v2);
    modules.push({
      kind: 'content',
      files: contentFiles.length ? contentFiles : ['plugin.keel.json'],
      ...(Object.keys(parts).length ? { parts } : {}),
      permissions: byKind.content,
    });
    if (byKind.asset.length || v2.parts?.assets) {
      const assets = assetEntries(v2);
      modules.push({ kind: 'asset', files: [...(v2.parts?.assets?.files ?? ['plugin.keel.json'])], permissions: byKind.asset.length ? byKind.asset : ['asset.add'], ...(assets ? { assets } : {}) });
    }
  }

  if (cls === 'script' || cls === 'trusted') {
    const parts = contentParts(v2);
    if (contentFiles.length) modules.push({ kind: 'content', files: contentFiles, ...(Object.keys(parts).length ? { parts } : {}), permissions: byKind.content });
    if (byKind.asset.length || v2.parts?.assets) {
      const assets = assetEntries(v2);
      modules.push({ kind: 'asset', files: [...(v2.parts?.assets?.files ?? [])], permissions: byKind.asset.length ? byKind.asset : ['asset.add'], ...(assets ? { assets } : {}) });
    }
    if (v2.entry?.sim) modules.push({ kind: 'sim', entry: v2.entry.sim, permissions: [...new Set([...byKind.sim, 'sim.code'])] });
    if (v2.entry?.meta) modules.push({ kind: 'match', entry: v2.entry.meta, permissions: [...new Set([...byKind.match, 'match.code'])] });
    if (v2.entry?.server) modules.push({ kind: 'match', entry: v2.entry.server, permissions: [...new Set([...byKind.match, 'native.execute'])] });
    if (v2.entry?.client) modules.push({ kind: 'ui', entry: v2.entry.client, permissions: [...new Set([...byKind.ui, 'ui.native'])] });
    if (cls === 'trusted') warnings.push('trusted (native) modules keep the v2 pin + consent + review gate; Keel does not relax it');
    if (cls === 'trusted' && (v2.entry?.server || v2.entry?.client)) {
      warnings.push('a trusted server/page entry does not run on the Keel path (only entry.sim / entry.meta do); keep this plugin on the legacy loader');
    }
  }

  if (cls === 'ui') {
    if (v2.entry?.client) {
      modules.push({
        kind: 'ui',
        entry: v2.entry.client,
        permissions: byKind.ui.length ? byKind.ui : ['ui.frame'],
        ...(v2.slots?.length ? { slots: v2.slots } : {}),
      });
    } else warnings.push('a ui plugin has no entry.client; the ui module has no entry');
  }

  if (!modules.length) {
    // Notices/rules-only and other data plugins still need one module; the descriptor itself is a valid file.
    modules.push({ kind: 'content', files: ['plugin.keel.json'], permissions: [] });
    warnings.push(`nothing in this ${cls} plugin maps to a Keel module`);
  }

  const api = {};
  for (const mod of modules) api[mod.kind] = 1;
  const trust = trustOfClass(cls);
  const order = {
    ...(v2.loadAfter?.length ? { loadAfter: v2.loadAfter } : {}),
    ...(v2.loadBefore?.length ? { loadBefore: v2.loadBefore } : {}),
    ...(v2.priority ? { priority: v2.priority } : {}),
  };

  const manifest = {
    manifest: 3,
    id: v2.id,
    name: v2.names ?? v2.name,
    ...(v2.englishName ? { englishName: v2.englishName } : {}),
    ...(v2.description ? { description: v2.description } : {}),
    version: v2.version,
    app: v2.app || '*',
    api,
    scope: v2.scope ?? ['room'],
    trust,
    modules,
    ...(v2.provides ? { provides: v2.provides } : {}),
    ...(v2.consumes ? { consumes: v2.consumes } : {}),
    requires: v2.requires ?? {},
    optional: v2.optional ?? {},
    conflicts: v2.conflicts ?? {},
    ...order,
    ...(Object.keys(v2.settings ?? {}).length ? { settings: v2.settings } : {}),
    compat: {
      ...(appVersionMatches(v2.app ?? '', PLUGIN_COMPAT_APP) || v2.class === 'lang' ? { mainline: '0.3.x' } : { mainline: false }),
      manifest2: true,
      ...((cls === 'script' || cls === 'trusted') && (v2.entry?.sim || v2.entry?.meta) ? { v2Script: true } : {}),
    },
    ...(v2.authors ? { authors: v2.authors } : {}),
    ...(v2.credits ? { credits: v2.credits } : {}),
    ...(v2.license ? { license: v2.license } : {}),
    ...(v2.homepage ? { homepage: v2.homepage } : {}),
    sourceLang: v2.sourceLang ?? 'zh',
    ...(v2.category ? { category: v2.category } : {}),
    legacy: {
      class: cls,
      ...(v2.type ? { type: v2.type } : {}),
      ...(v2.lang ? { lang: v2.lang } : {}),
      ...(v2.files ? { files: { ...v2.files } } : {}),
      ...(v2.api !== undefined ? { api: v2.api } : {}),
      permissions: [...(v2.permissions ?? [])],
      ...(v2.overrides?.length ? { overrides: [...v2.overrides] } : {}),
      // The normalized part objects (files/inline/langs), so the projection can still read an external asset/theme file.
      parts: JSON.parse(JSON.stringify(v2.parts ?? {})),
      entry: { ...(v2.entry ?? {}) },
      ...(v2.slots?.length ? { slots: [...v2.slots] } : {}),
      ...(v2.themeVars ? { themeVars: v2.themeVars } : {}),
    },
  };

  if (['content', 'script', 'trusted'].includes(cls) && !modules.some((m) => m.kind === 'content')) {
    warnings.push('no content module: content records stay in the v2 loader until a content graph is built');
  }
  return { manifest, warnings, legacy: manifest.legacy };
}

/** True when a manifest is a manifest 2 (the version field only). */
export const isV2Manifest = (raw) => !!raw && typeof raw === 'object' && !Array.isArray(raw) && /** @type {any} */ (raw).manifest === 2;
