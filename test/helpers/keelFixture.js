// test/helpers/keelFixture.js — turn a manifest-2-shaped test fixture into the manifest 3 the loader now requires.
//
// The game no longer reads manifest 2. The tests still describe plugins in the short v2 shape (a class, part paths,
// permissions); this helper normalizes that shape with the same schema reader the author tools use and writes the
// equivalent manifest 3, keeping the old normalized view under `legacy` for the projection the content compiler reads.
import { readFxManifest } from '../../server/plugins/fxAssets.js';

const CAP_OF = Object.freeze({
  'data.add': 'content.define',
  'data.patch': 'content.patch',
  'dsl': 'content.dsl',
  'offers': 'content.offers',
  'assets.add': 'asset.add',
  'assets.override': 'asset.override',
  'theme': 'asset.theme',
  'sim.code': 'sim.code',
  'meta.code': 'match.code',
  'ui.frame': 'ui.frame',
});

const caps = (permissions, kinds) => [...new Set((permissions ?? []).map((p) => CAP_OF[p]).filter((p) => p && kinds.some((k) => p.startsWith(`${k}.`))))];

/**
 * @param {any} raw a manifest-2-shaped object
 * @param {string} id the folder name
 * @returns {any | null} a manifest 3, or null when the v2 shape itself is invalid (a negative fixture stays raw)
 */
export function keelManifestOf(raw, id) {
  // readFxManifest is readPluginManifest plus the v2 `assets.fx` split (its bind/flipbook strings are not files).
  const read = readFxManifest(raw, { id });
  if (!read.manifest || read.problems.length) return null;
  const m = read.manifest;
  if (m.class === 'trusted') return null;
  const modules = [];
  const parts = m.parts ?? {};
  const contentParts = {};
  for (const [name, part] of Object.entries(parts)) {
    if (name === 'assets' || name === 'theme') continue;
    if (part?.files?.length) contentParts[name] = [...part.files];
  }
  if (m.class === 'content' || m.class === 'script') {
    const files = [...new Set(Object.values(contentParts).flat())];
    if (files.length) modules.push({ kind: 'content', files, parts: contentParts, permissions: caps(m.permissions, ['content']) });
  }
  if (parts.assets) {
    modules.push({ kind: 'asset', ...(parts.assets.inline && Object.keys(parts.assets.inline).length ? { assets: parts.assets.inline } : {}),
      files: parts.assets.files?.length ? [...parts.assets.files] : ['plugin.keel.json'], permissions: caps(m.permissions, ['asset']) });
  }
  if (m.class === 'cosmetic' && !modules.length) {
    modules.push({ kind: 'asset', files: parts.assets?.files?.length ? [...parts.assets.files] : ['plugin.keel.json'], permissions: caps(m.permissions, ['asset']) });
  }
  if (m.class === 'ui') {
    modules.push({ kind: 'ui', ...(m.entry?.client ? { entry: m.entry.client } : {}), ...(m.slots?.length ? { slots: m.slots } : {}), permissions: caps(m.permissions, ['ui']) });
  }
  if (m.class === 'lang') {
    modules.push({ kind: 'lang', ...(m.files?.ui ? { entry: m.files.ui } : { files: [] }), permissions: caps(m.permissions, ['lang']) });
  }
  if (m.entry?.sim) modules.push({ kind: 'sim', entry: m.entry.sim, permissions: caps(m.permissions, ['sim']) });
  if (m.entry?.meta) modules.push({ kind: 'match', entry: m.entry.meta, permissions: caps(m.permissions, ['match']) });
  if (!modules.length) {
    // notices/rules-only or an empty-but-valid v2 plugin: one content module over the descriptor itself keeps the
    // manifest 3 valid without inventing a gameplay part.
    modules.push({ kind: 'content', files: ['plugin.keel.json'], parts: {}, permissions: caps(m.permissions, ['content']) });
  }
  const api = {};
  for (const mod of modules) api[mod.kind === 'match' ? 'match' : mod.kind] = 1;
  const names = m.names && Object.keys(m.names).length ? m.names : m.name;
  return {
    manifest: 3,
    id,
    name: names || id,
    englishName: m.englishName,
    description: m.description,
    version: m.version,
    app: m.app || '*',
    api,
    scope: m.scope,
    trust: 'sandbox',
    ...(m.category ? { category: m.category } : {}),
    authors: m.authors,
    credits: m.credits,
    license: m.license,
    homepage: m.homepage,
    sourceLang: m.sourceLang,
    requires: m.requires,
    optional: m.optional,
    conflicts: m.conflicts,
    loadAfter: m.loadAfter,
    loadBefore: m.loadBefore,
    priority: m.priority,
    settings: m.settings,
    modules,
    legacy: {
      class: m.class,
      type: m.type,
      ...(m.lang ? { lang: m.lang } : {}),
      api: m.api,
      permissions: m.permissions,
      partFiles: Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, part.files])),
      parts,
      entry: m.entry,
      files: m.files,
      slots: m.slots,
      overrides: m.overrides,
      themeVars: m.themeVars,
      notices: m.notices,
      rules: m.rules,
      manifestFile: 'plugin.keel.json',
    },
  };
}
