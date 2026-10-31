// server/keel/content-sets.js — serve a Keel room's content set through the shared content compiler.
//
// This is the P1.5 bridge: plugin declarations and files come from Keel (`loadKeelPlugin`), while the compiler that
// produces `cs`, data, i18n, offers and dsl stays the one implementation the rest of the game already uses. No
// `plugin.json` is read for a Keel plugin.
//
// A v2 script plugin (`compat.v2Script`) is described to the compiler as the legacy loader describes it, so the browser
// receives `/cs/<cs>/scripts/<id>/<entry>` and runs `setup(sp)` there too — the server-side registry alone is not enough
// (battles simulate in the page).

import { createContentSets } from '../plugins/contentSets.js';
import { keelToV2 } from '../../shared/keel/legacy.js';
import { manifestTextWithoutNotices } from '../../shared/plugins/notices.js';
import { canonicalJson } from '../../shared/plugins/identity.js';
import { nodeSha256 } from '../plugins/identity.js';

/**
 * The legacy `script` descriptor of a Keel v2 plugin: the projected manifest text, the entry sources and their hashes.
 * Mirrors `readScripts` (server/plugins/trusted.js) plus the `manifestSource` the content compiler expects.
 * @param {any} p the Keel plugin
 * @param {any} manifest its v2 projection (`keelToV2`)
 * @param {Map<string, string> | Record<string, string>} [documents]
 */
function scriptDescriptor(p, manifest) {
  const v2 = p?.v2;
  if (!v2?.script || v2.disabled) return null;
  const manifestSource = manifestTextWithoutNotices(manifest) ?? canonicalJson(manifest);
  if (typeof manifestSource !== 'string') return null;
  return {
    // applyTrust (server/plugins/trusted.js) puts the decision on v2.script.execution; without it, fail closed to sandbox.
    execution: v2.script.execution ?? (manifest.trust === 'native' ? 'trusted' : 'sandbox'),
    sources: v2.script.sources ?? {},
    manifestSource,
    lockHash: v2.script.lockHash ?? null,
    files: { ...(v2.script.files ?? {}), 'plugin.json': nodeSha256(Buffer.from(manifestSource)) },
  };
}

/**
 * @param {{ plugins: Map<string, any> | any[], legacy?: any, vanillaData: any, log?: any, maxSets?: () => number }} opts
 */
export function createKeelContentSets({ plugins, legacy = null, vanillaData, log = { info() {}, warn() {}, error() {} }, maxSets = () => 32 } = {}) {
  const map = new Map();
  const list = plugins instanceof Map ? [...plugins.values()] : (plugins ?? []);
  for (const p of list) {
    if (!p?.id || !p.manifest || !p.content) continue;
    if (Array.isArray(p.problems) && p.problems.length) continue;
    const manifest = p.manifest.manifest === 3 ? keelToV2(p.manifest, { id: p.id }) : p.manifest;
    const script = scriptDescriptor(p, manifest);
    // Native sim modules travel to the browser; native match/policy modules run only in the server's meta runtime (D11),
    // so they are not served to the page and need no browser consent.
    const nativeModules = p.native?.entries?.length
      ? p.manifest.modules.filter((m) => m && m.entry && m.kind === 'sim' && typeof p.native.sources[m.entry] === 'string')
        .map((m) => ({ kind: m.kind, entry: m.entry, sha256: p.native.files[m.entry], source: p.native.sources[m.entry],
          permissions: Array.isArray(m.permissions) ? m.permissions : [], ...(m.state ? { state: m.state } : {}) }))
      : [];
    map.set(p.id, {
      id: p.id,
      class: manifest.class,
      status: 'loaded',
      supported: true,
      builtin: p.builtin === true,
      manifest,
      // A script needs its entry hashes and the manifest text in the same `files` table the compiler checks against.
      content: script
        ? {
          ...p.content,
          files: { ...(p.content.files ?? {}), ...script.files },
          documents: { ...(p.content.documents ?? {}), 'plugin.json': manifest },
        }
        : p.content,
      offers: p.offers ?? null,
      visual: p.visual ?? null,
      ...(script ? {
        script: { execution: script.execution, sources: script.sources, manifestSource: script.manifestSource, lockHash: script.lockHash },
      } : {}),
      ...(nativeModules.length ? { keel: { execution: p.native.execution ?? 'sandbox', modules: nativeModules } } : {}),
    });
  }
  // Manifest-2 plugins the registry still serves pass through unchanged, so a mixed room uses this same compiler (and a
  // Keel native plugin's code reaches the page). A Keel plugin missing from `map` was refused by the trust gate: never
  // fall back to the old loader for it.
  if (legacy && typeof legacy.plugins === 'function') for (const p of legacy.plugins()) {
    if (!p || !p.id || map.has(p.id) || p.keel || !p.content) continue;
    if (p.status !== 'loaded' || !['content', 'script', 'trusted'].includes(p.class)) continue;
    map.set(p.id, p);
  }
  const registry = {
    plugin: (id) => map.get(id) ?? null,
    contentDirs: {},
    // A rescan invalidates the compiled sets the same way the old content set heard it (hot reload).
    ...(legacy && typeof legacy.onScan === 'function' ? { onScan: (fn) => legacy.onScan(fn) } : {}),
  };
  const contents = createContentSets({ registry, vanillaData, log, maxSets });
  return {
    has: (id) => map.has(id),
    ids: () => [...map.keys()],
    resolve: (ids, opts) => contents.resolve(ids, opts),
    get: (cs) => contents.get(cs),
    dataBytes: (cs) => contents.dataBytes(cs),
    dataOf: (cs) => contents.dataOf(cs),
    kittedOf: (cs) => contents.kittedOf(cs),
    modesOf: (cs) => contents.modesOf(cs),
    file: (cs16, rel) => contents.file(cs16, rel),
    holdContent: (cs) => contents.holdContent(cs),
    releaseContent: (cs) => contents.releaseContent(cs),
    onStale: (fn) => contents.onStale(fn),
    contentInUse: () => contents.contentInUse(),
    stats: () => contents.stats(),
  };
}
