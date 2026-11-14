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
// is the server's own content and is not a set here, but it is listed (welcome) and its room content is the vanilla one.
//
// API (the lobby, the static server, the match hosts, /healthz):
//   ids / defaultId / nonDefault   enabled ids in registry order, the server's default, the enabled others
//   isEnabled(id), entry(id)       the registry entry of an enabled id, else null
//   available(id)                  enabled and loaded without failure (a failed load is remembered)
//   csOf(id), content(id)          a version's cs and the room content base { cs, vanilla: true, version, plugins: [] }
//   data(id), dataOfCs(cs)         the version's parsed data (lazy), null for a disabled id
//   offered(id, roomMode)          the DIFFICULTIES whose official mode the version has for that room mode
//   welcome()                      welcome.versions, or null when only the default version is enabled
//   get(key), byCs(cs)             a set by version id or by content hash (64 or 16 hex)
//   dataBytes(cs)                  the files of a version for its match host (read from disk at each host start)
//   stats()                        { enabled, default, loaded }

import fs from 'node:fs';
import { computeVanillaContent, contentIndexOf, nodeSha256 } from './plugins/identity.js';
import { versionById, versionSlug, DEFAULT_VERSION } from '../shared/versions.js';
import { getVersionData, versionDataDir } from './data.js';
import { boundsOf } from '../shared/plugins/officialBounds.js';
import { DIFFICULTIES, modeIdFor } from '../shared/constants.js';

/**
 * The manifest of a version's content set: the vanilla index with the version's own data URLs, its id and its bounds
 * entry (GET /cs/<cs16>/index.json). The bounds hash and size are those of the snapshot body the server serves.
 * @param {import('../shared/versions.js').OfficialVersion} entry
 * @param {{ cs: string, data: Record<string, { file: string, sha256: string, bytes: number }> }} content
 * @param {Buffer} boundsBody the official-bounds snapshot as served (JSON bytes)
 */
export function versionIndexOf(entry, content, boundsBody) {
  const slug = versionSlug(entry);
  const index = contentIndexOf(content);
  const data = {};
  for (const [name, f] of Object.entries(content.data)) {
    data[name] = { url: `/data/versions/${slug}/${encodeURIComponent(f.file)}?v=${f.sha256.slice(0, 8)}`, sha256: f.sha256, bytes: f.bytes };
  }
  return { ...index, version: entry.id, data,
    bounds: { official: { url: `/cs/${content.cs.slice(0, 16)}/bounds/official.json`, sha256: nodeSha256(boundsBody), bytes: boundsBody.length } } };
}

/**
 * The enabled non-default versions of this server.
 * @param {{ enabled?: readonly string[], default?: string, maxHosts?: number, simDir: string, sharedDir: string,
 *   shim: string, app?: string, log?: object, vanilla?: { cs: string } | null }} opts
 *   shim: the /data.js stand-in text (server/http/static.js DATA_SHIM_JS); vanilla: the server's own content (welcome /
 *   csOf of the default version); omitted in unit tests that only check the non-default sets
 */
export function createVersionSets({ enabled = [], default: defaultId = DEFAULT_VERSION, maxHosts = 0, simDir, sharedDir, shim, app, vanilla = null, log = console } = {}) {
  /** @type {Map<string, object>} */
  const sets = new Map();
  /** @type {object[]} */
  const list = [];
  const ids = Object.freeze([...new Set(enabled.filter((id) => versionById(id)))]);
  for (const id of ids) {
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
    let base = null;
    let index = null;
    const set = {
      id,
      slug: versionSlug(entry),
      entry,
      dir,
      cs: content.cs,
      content,
      /** The manifest served at /cs/<cs16>/index.json; its bounds hash and size are built with the snapshot on first use. */
      get index() {
        if (!index) index = versionIndexOf(entry, content, Buffer.from(JSON.stringify(this.bounds())));
        return index;
      },
      /** The version's parsed data (server/data.js getVersionData), loaded once. */
      get data() { this.loaded = true; return getVersionData(id, { log }); },
      /** Read by stats(): never triggers the lazy load above. */
      loaded: false,
      /** The room content base of this version (frozen; host plugins are never allowed on a version room). */
      get base() {
        return (base ||= Object.freeze({ cs: content.cs, vanilla: true, version: id, plugins: Object.freeze([]) }));
      },
      /** The version's official-bounds snapshot, computed from its own tables once. */
      bounds() { if (!bounds) bounds = boundsOf(this.data); return bounds; },
      available: true,
    };
    sets.set(id, set);
    list.push(set);
  }
  const byCs = (cs) => (typeof cs === 'string' ? list.find((s) => s.cs === cs || s.cs.slice(0, 16) === cs) || null : null);
  return {
    ids,
    defaultId: defaultId,
    nonDefault: Object.freeze(ids.filter((id) => id !== DEFAULT_VERSION && sets.has(id))),
    enabled: ids,
    default: defaultId,
    maxHosts,
    sets,
    list,
    /** Is the version enabled (and loaded)? */
    available: (id) => typeof id === 'string' && ids.includes(id) && (id === DEFAULT_VERSION || sets.has(id)),
    /** @param {unknown} id */
    isEnabled: (id) => typeof id === 'string' && ids.includes(id),
    /** @param {unknown} id */
    entry: (id) => (typeof id === 'string' && ids.includes(id) ? versionById(id) : null),
    /** The set of a content hash (its full hash or the 16 hex digits of a URL), or null. */
    byCs,
    /** A version's cs (the vanilla cs for the default). @param {string} id */
    csOf(id) {
      if (!ids.includes(id)) return null;
      if (id === DEFAULT_VERSION) return vanilla?.cs ?? null;
      return sets.get(id)?.cs ?? null;
    },
    /** The room content base of a version: the default's is the server's own. @param {string} id */
    content(id) {
      if (!ids.includes(id)) return null;
      if (id === DEFAULT_VERSION) return vanilla ? Object.freeze({ cs: vanilla.cs, vanilla: true, plugins: Object.freeze([]) }) : null;
      return sets.get(id)?.base ?? null;
    },
    /** The version's parsed data (the default's is the server's own; not read here). @param {string} id */
    data(id) {
      if (!ids.includes(id) || id === DEFAULT_VERSION) return null;
      return sets.get(id)?.data ?? null;
    },
    /** The data of a content hash, else null. @param {string} cs */
    dataOfCs(cs) {
      const s = byCs(cs);
      return s ? s.data : null;
    },
    /**
     * The difficulties a version offers a room mode (DIFFICULTIES order): those whose official mode is in its config.
     * @param {string} id @param {'solo' | 'coop'} roomMode
     * @returns {string[]}
     */
    offered(id, roomMode) {
      const entry = ids.includes(id) ? versionById(id) : null;
      if (!entry || !entry.roomModes.includes(roomMode)) return [];
      if (id === DEFAULT_VERSION) return [...DIFFICULTIES];
      const modes = sets.get(id)?.data?.config?.modes;
      if (!modes || typeof modes !== 'object') return [...DIFFICULTIES];
      return DIFFICULTIES.filter((d) => modeIdFor(roomMode, d) in modes);
    },
    /**
     * welcome.versions, or null when the server offers the default version alone. A version whose data failed to load
     * is left out; when that is the configured default, the default version (if enabled) is marked instead.
     */
    welcome() {
      const live = ids.filter((id) => id === DEFAULT_VERSION || sets.has(id));
      if (live.length === 1 && live[0] === DEFAULT_VERSION) return null;
      const shownDef = live.includes(defaultId) ? defaultId : live.includes(DEFAULT_VERSION) ? DEFAULT_VERSION : live[0];
      return live.map((id) => {
        const entry = /** @type {import('../shared/versions.js').OfficialVersion} */ (versionById(id));
        return { id, cs: this.csOf(id), family: entry.family, label: entry.label, roomModes: [...entry.roomModes],
          ...(id === shownDef ? { default: true } : {}) };
      });
    },
    /** /healthz `versions`: the enabled ids and the default. */
    health() {
      return { enabled: [...ids], default: defaultId };
    },
    stats: () => ({ enabled: [...ids], default: defaultId, loaded: [...sets.values()].filter((v) => v.loaded).length }),
    /** The set of a version id, or null. */
    byId: (id) => (typeof id === 'string' ? sets.get(id) || null : null),
    /**
     * The match hosts' view of a version (server/match/host/index.js, kind 'version'), else null.
     * @param {string} cs
     */
    get(cs) {
      const set = byCs(cs);
      if (!set) return null;
      const c = set.content;
      return {
        cs: set.cs, name: set.id,
        hashInput: { app: c.app, sim: c.sim, data: Object.fromEntries(Object.entries(c.data).map(([k, f]) => [k, f.sha256])) },
        plugins: [], scripts: [], offers: [], bounds: set.bounds(),
      };
    },
    /**
     * The bytes of every data file of a version, read from disk now (a host checks them against the hash input), else null.
     * @param {string} cs
     * @returns {Record<string, Buffer> | null}
     */
    dataBytes(cs) {
      const set = byCs(cs);
      if (!set) return null;
      const out = {};
      for (const [name, f] of Object.entries(set.content.data)) {
        try { out[name] = fs.readFileSync(`${set.dir}/${f.file}`); } catch (e) { log.warn?.(`[versions] cannot read ${set.id} ${f.file}: ${e?.code || e?.message || e}`); }
      }
      return out;
    },
  };
}
