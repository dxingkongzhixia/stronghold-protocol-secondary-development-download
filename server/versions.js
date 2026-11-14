// server/versions.js — the official versions this server offers (shared/versions.js): at boot each enabled non-default
// version's content hash `cs`, its modes' data directory and its official-bounds snapshot; a room then plays that
// version's rules in a match host whose data singleton is that version's (server/match/host/).
//
// A version's `cs` is the vanilla formula over the served code (the same /sim/ and /shared/ files) and the sha256 of
// its 16 gameplay files (server/plugins/identity.js versionContentOf), so a page can verify what it loads. Its data is
// loaded once on first use (server/data.js getVersionData) and never fills the default content's bounds cache — its
// snapshot is computed from its own tables (shared/plugins/officialBounds.js boundsOf).
//
// Nothing set enables every version: `versionsFrom` (server/http/config.js) passes the enabled ids; the default version
// is the server's own content and is not a set here.

import fs from 'node:fs';
import { computeVanillaContent, contentIndexOf } from './plugins/identity.js';
import { versionById, versionSlug, DEFAULT_VERSION } from '../shared/versions.js';
import { getVersionData, versionDataDir } from './data.js';
import { boundsOf } from '../shared/plugins/officialBounds.js';

/**
 * The manifest of a version's content set: the vanilla index with the version's own data URLs, its id and its bounds
 * URL (GET /cs/<cs16>/index.json).
 * @param {import('../shared/versions.js').OfficialVersion} entry
 * @param {{ cs: string, data: Record<string, { file: string, sha256: string, bytes: number }> }} content
 */
export function versionIndexOf(entry, content) {
  const slug = versionSlug(entry);
  const index = contentIndexOf(content);
  const data = {};
  for (const [name, f] of Object.entries(content.data)) {
    data[name] = { url: `/data/versions/${slug}/${encodeURIComponent(f.file)}?v=${f.sha256.slice(0, 8)}`, sha256: f.sha256, bytes: f.bytes };
  }
  return { ...index, version: entry.id, data, bounds: { official: { url: `/cs/${content.cs.slice(0, 16)}/bounds/official.json` } } };
}

/**
 * The enabled non-default versions of this server.
 * @param {{ enabled?: readonly string[], default?: string, maxHosts?: number, simDir: string, sharedDir: string,
 *   shim: string, app?: string, log?: object, dataDir?: string }} opts
 *   shim: the /data.js stand-in text (server/http/static.js DATA_SHIM_JS); dataDir: where shared/versions.js dirs live
 */
export function createVersionSets({ enabled = [], default: defaultId = DEFAULT_VERSION, maxHosts = 0, simDir, sharedDir, shim, app, log = console } = {}) {
  /** @type {Map<string, object>} */
  const sets = new Map();
  /** @type {object[]} */
  const list = [];
  for (const id of enabled) {
    const entry = versionById(id);
    if (!entry) continue;
    if (!entry.dir) continue; // the default version is the server's own content, not a set
    const dir = versionDataDir(id);
    if (!dir || !fs.existsSync(dir)) {
      log.warn?.(`[versions] ${id}: no data directory (${dir || 'unregistered'}), disabled`);
      continue;
    }
    let content;
    try {
      content = computeVanillaContent({ simDir, sharedDir, dataDir: dir, shim, app, log });
    } catch (e) {
      log.warn?.(`[versions] ${id}: cannot hash its data (${e?.message || e}), disabled`);
      continue;
    }
    let bounds = null;
    const set = {
      id,
      slug: versionSlug(entry),
      entry,
      dir,
      cs: content.cs,
      content,
      index: versionIndexOf(entry, content),
      /** The version's parsed data (server/data.js getVersionData), loaded once. */
      get data() { return getVersionData(id, { log }); },
      /** The version's official-bounds snapshot, computed from its own tables once. */
      bounds() { if (!bounds) bounds = boundsOf(this.data); return bounds; },
      available: true,
    };
    sets.set(id, set);
    list.push(set);
  }
  return {
    enabled: [...enabled],
    default: defaultId,
    maxHosts,
    sets,
    list,
    /** Is the version enabled (and loaded)? */
    available: (id) => sets.has(id),
    /** The set of a content hash (its full hash or the 16 hex digits of a URL), or null. */
    byCs: (cs) => list.find((s) => s.cs === cs || s.cs.slice(0, 16) === cs) || null,
    /** The set of an id, or null. */
    get: (id) => sets.get(id) || null,
    /** GET /healthz `versions`: only present when a non-default version is enabled. */
    health() {
      return { enabled: [...enabled], default: defaultId, hosts: { workers: list.length ? 0 : 0, matches: 0, transport: 'child' } };
    },
  };
}
