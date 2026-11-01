// server/plugins/contentSets.js — the content sets of this server (DESIGN §32.6, P1c; the design study's §6.2–§6.4): a
// set of content plugins (gameplay: data patches, new records, modes), closed over their requirements and in load order,
// merged with the vanilla data into one immutable content set named by its own content hash `cs`
// (shared/plugins/identity.js) — what a room with gameplay plugins plays, what every member's page downloads and checks
// and what the room's match host runs (server/match/host/).
//
//   resolve(ids, { settings, replacing })  the set of these content plugins (built by C1, kept by cs16 — the same
//                                          plugins in the same state with the same settings, as the builder reads them
//                                          (normalizeSettings: undeclared keys dropped), are not built again): refused
//                                          with PLUGIN_BUSY — before anything is built — when it would be one set more
//                                          than `limits.maxSets` rooms hold at once (a set a room already holds is free;
//                                          `replacing`: the set the asking room holds now, freed by the change)
//                                          [ASSUMED default 4]
//   hold(cs) / release(cs)                 a room uses the set (never dropped while held)
//   file(cs16, rel)                        what /cs/<cs16>/… serves: index.json (the set's manifest) and its data and
//                                          translation files — a held set's, or one of the last MAX_KEPT [ASSUMED 8]
//   dataOf(cs) / kittedOf(cs) / modesOf(cs) the merged data (the lobby checks a member's loadout and 自选 picks against
//                                          it), the operators a 自选 slot may field, the modes its plugins add
//   dataBytes(cs)                          the served bytes of every data file of the set — exactly the bytes the
//                                          builder hashed — which a match host checks against the set's hash
//                                          input and parses (server/match/host/entry.js)
// The builder is C1 (server/plugins/contentSet.js buildContentSet / contentSetFiles, DESIGN §32.5); this file
// adapts its set to what P1c reads: `hashInput` (the contentHashOf input a browser and a worker recompute `cs` from — out
// of the set's index: its data files', and its translation files', hashes; checked to be the builder's cs), `modes` (only the config.modes entries the vanilla data lacks, as { id, name, roomMode,
// difficulty }), `warnings` in room.state's `{ code, params }` shape, `dataBytes` (what the members download beyond the
// vanilla files).

import { ERR, DIFFICULTIES } from '../../shared/constants.js';
import { contentHashOf, csUrlPart, isContentHash } from '../../shared/plugins/identity.js';
import { normalizeSettings } from '../../shared/plugins/patch.js';
import { buildContentSet, contentSetFiles, releaseContentSet, registerContentSetFiles, vanillaIdentityOf, vanillaFileBodies } from './contentSet.js';
import { fork } from 'node:child_process';
import { createContentSetCache } from './contentSetCache.js';
import { ROOT } from '../data.js';

const noopLog = { info() {}, warn() {}, error() {}, debug() {} };
/** Content sets kept that no room holds (their /cs/ files stay servable a while). [ASSUMED]
 *  Memory, not gameplay: one kept set holds its whole patched data set as served Buffers (≈16 MB — data/ is 19 MB),
 *  so this is the count a server pays for every plugin combination that was ever played this session. The 2026-10-27
 *  measurement (docs/PLUGINS.md §11) had the box at 1.03 GB after 21 distinct combinations in two hours with 12
 *  kept; 6 halves that share and only costs a rebuild when a closed room's files are asked for again. */
export const MAX_KEPT = 6;
/** Concurrent content sets with gameplay plugins rooms may hold (plugins/config.json limits.maxSets).
 *  History: 4 (original) → 12 on 2026-10-26 noon → 32 the same evening: the cap counts every set a room HOLDS across the
 *  server, not per room, so a busy evening (7+ rooms, several plugin combos) hit it. A set is the patched data a room
 *  plays (a few MB — data/ is 19 MB in total), so 32 holds are far cheaper than they look; the expensive thing is a
 *  running match's worker, which this does not cap. The owner can retune it live in plugins/config.json (0–128). */
export const DEFAULT_MAX_SETS = 32;
/** Builds remembered by what they were built from (resolve). */
const MEMO_MAX = 32;

/**
 * @typedef {{ cs: string, plugins: { id: string, version: string, hash: string }[], modes: object[], data: Record<string, any>,
 *   hashInput: { app: string, sim: string, data: Record<string, string>, plugins: object[], settings: object,
 *     i18n?: Record<string, string> },
 *   kitted: string[] | null, warnings: { code: string, params: object }[],
 *   served: Map<string, { body: Buffer, sha256: string, bytes: number }>, dataBytes: number }} ContentSet
 */

/** A C1 problem ({ code, path, message } or a string) as one line. */
const problemText = (p) => (p && typeof p === 'object' ? `${p.code || 'PLUGIN'}${p.plugin ? ` ${p.plugin}` : ''} ${p.path ?? ''}: ${p.message ?? ''}`.trim() : String(p));

/**
 * The modes a set's plugins add: its config.modes entries the vanilla data lacks — what room.setMode may choose
 * (room.state.content.modes): `{ id, name, roomMode: 'solo' | 'coop', difficulty }`.
 * @param {any[]} modes the set's config.modes records @param {Readonly<Record<string, any>>} vanillaData
 */
export function pluginModes(modes, vanillaData) {
  const official = vanillaData?.config?.modes && typeof vanillaData.config.modes === 'object' ? vanillaData.config.modes : {};
  return (Array.isArray(modes) ? modes : [])
    .filter((m) => m && typeof m.modeId === 'string' && !Object.hasOwn(official, m.modeId))
    .map((m) => ({
      id: m.modeId,
      name: typeof m.name === 'string' ? m.name.slice(0, 40) : m.modeId,
      roomMode: m.type === 'SINGLE' ? 'solo' : 'coop',
      difficulty: DIFFICULTIES.includes(m.difficulty) ? m.difficulty : null,
    }));
}

/**
 * The content sets of one server.
 * @param {{ registry: { plugin: (id: string) => any, onScan?: (fn: () => void) => (() => void) }, vanillaData: Readonly<Record<string, any>>, log?: object,
 *   maxSets?: () => number, build?: typeof buildContentSet, filesOf?: typeof contentSetFiles, release?: (set: any) => void, maxKept?: number }} opts
 *   maxSets: the limit now (the server owner's policy may change it); build / filesOf / release: the C1 builder (tests
 *   inject one); release frees the builder's own copy once this server holds the set's files (server/plugins/contentSet.js)
 */
export function createContentSets({ registry, vanillaData, log = noopLog, maxSets = () => DEFAULT_MAX_SETS,
  build = buildContentSet, filesOf = contentSetFiles, release = releaseContentSet, maxKept = MAX_KEPT }) {
  /** @type {Map<string, ContentSet>} by cs16, most recently used last */
  const sets = new Map();
  /** @type {Map<string, number>} cs16 → rooms holding it */
  const held = new Map();
  const stale = new Set();
  const staleListeners = new Set();
  const offScan = registry.onScan?.(() => {
    for (const [key, set] of sets) {
      if (!held.has(key) || stale.has(key)) continue;
      const changed = set.plugins.filter(p => {
        const now = registry.plugin(p.id);
        return !now || now.status !== 'loaded' || now.content?.hash !== p.hash;
      }).map(p => p.id);
      if (!changed.length) continue;
      stale.add(key);
      for (const fn of [...staleListeners]) { try { fn(set.cs, changed); } catch (e) { log.error?.('[plugins] content stale listener failed', e); } }
    }
  });

  /** cs16 by what a set was built from (memoKey), most recent last — written once the set is kept */
  const memo = new Map();

  // A built set is also kept on disk (SP_CONTENT_CACHE, on by default with the child builder): opening a room whose
  // combination this server built before — even before a restart — loads its bytes instead of building them again.
  const cacheEnabled = String(process.env.SP_CONTENT_CACHE ?? (String(process.env.SP_CONTENT_BUILDER || '') === '1' ? '1' : '0')) === '1';
  const cache = cacheEnabled
    ? createContentSetCache({ dir: process.env.SP_CONTENT_CACHE_DIR || `${ROOT}/.cache/content-sets`, log })
    : null;
  const cacheIdentity = () => { try { return vanillaIdentityOf(registry); } catch { return null; } };
  /** Adopt a set the cache stored: its bodies go in through registerContentSetFiles, exactly like the child's reply. */
  const adoptCached = (hit) => {
    if (!hit) return null;
    try {
      const built = { cs: hit.cs, index: hit.index, ...hit.extra };
      const bodies = new Map(hit.bodies);
      // The unchanged tables are not stored (they are the server's own vanilla bytes): borrow them, so the set serves
      // exactly what a fresh build served.
      try { for (const [rel, body] of vanillaFileBodies(registry)) if (!bodies.has(rel)) bodies.set(rel, body); } catch { /* base unavailable: the set still serves its own files */ }
      registerContentSetFiles(built, [...bodies]);
      const set = adopt(built);
      if (set) cacheHits++;
      return set;
    } catch { return null; }
  };
  /** build() calls so far (stats: a burst of requests for one set builds it once) */
  let builds = 0;
  let requests = 0;
  let memoHits = 0;
  let cacheHits = 0;
  let refused = 0;
  let lastBuildMs = 0;
  let maxBuildMs = 0;
  /**
   * Each plugin's settings as the builder reads them (shared/plugins/patch.js normalizeSettings over its manifest's
   * declared settings — an undeclared key dropped, a bad value its default): what a set is made of, so what the memo
   * keys on and what the builder is given. A key a plugin does not declare never costs a build.
   * @param {string[]} ids @param {Record<string, Record<string, unknown>>} settings
   * @returns {Record<string, Record<string, unknown>>}
   */
  const normalized = (ids, settings) => {
    const out = {};
    for (const id of ids) {
      const defs = registry.plugin(id)?.manifest?.settings;
      const s = normalizeSettings(defs && typeof defs === 'object' ? defs : {}, settings && typeof settings === 'object' ? settings[id] : undefined);
      if (Object.keys(s).length) out[id] = s;
    }
    return out;
  };
  /**
   * What decides a build besides the server's vanilla data (fixed while it runs): each plugin's manifest and the hash of
   * its content files (server/plugins/contentData.js: a changed file is a new hash), in order, with its normalized
   * settings; null when a plugin has no content snapshot (the builder decides then).
   * @param {string[]} ids @param {Record<string, Record<string, unknown>>} norm (normalized)
   */
  const memoKey = (ids, norm, allowIncompatible = false) => {
    const parts = [];
    for (const id of ids) {
      const p = registry.plugin(id);
      if (!p || !p.content || typeof p.content.hash !== 'string') return null;
      const manifest = p.manifest ? { ...p.manifest } : null;
      if (manifest) delete manifest.notices; // Catalogue data cannot invalidate a room's gameplay memo.
      parts.push([id, p.content.hash, p.script?.execution ?? null, p.status, manifest, norm[id] ?? null]);
    }
    if (allowIncompatible !== false && allowIncompatible != null) parts.push(['allowIncompatible', allowIncompatible]);
    try { return JSON.stringify(parts); } catch { return null; }
  };
  /** Remember a kept set by what it was built from; the oldest entries of sets no room holds go first. */
  const remember = (mk, key) => {
    memo.delete(mk);
    memo.set(mk, key);
    for (const [k, v] of memo) {
      if (memo.size <= MEMO_MAX) break;
      if (!held.has(v) || !sets.has(v)) memo.delete(k);
    }
  };

  const keep = (key, set) => {
    sets.delete(key);
    sets.set(key, set);
    let free = 0;
    for (const k of sets.keys()) if (!held.has(k)) free++;
    for (const k of [...sets.keys()]) {
      if (free <= maxKept) break;
      if (k === key || held.has(k)) continue;
      sets.delete(k);
      stale.delete(k);
      free--;
    }
  };

  /** Persist a freshly built C1 set under this combination's memo key (its bodies and index). */
  const storeCached = (mk, built, args) => {
    if (!cache) return;
    try {
      cache.store(mk, cacheIdentity(), {
        cs: built.cs,
        index: built.index,
        files: filesOf(built),
        extra: {
          plugins: built.plugins ?? [], modes: built.modes ?? [], kitted: built.kitted ?? null, warnings: built.warnings ?? [],
          bounds: built.bounds ?? null, offers: built.offers ?? [], scripts: built.scripts ?? [], execution: built.execution ?? null,
          rules: built.rules ?? null, ...(args ? { args } : {}),
        },
      });
    } catch (e) { log.warn?.(`[plugins] content-set cache store failed: ${e?.code || e?.message || e}`); }
  };

  /** A built C1 set → a ContentSet (see the header); null when its manifest does not hash to its cs. */
  function adopt(built) {
    const index = built.index || {};
    const served = filesOf(built);
    const data = {};
    let dataBytes = 0;
    for (const [name, f] of Object.entries(index.data || {})) {
      data[name] = f.sha256;
      if (typeof f.url === 'string' && f.url.startsWith('/cs/')) dataBytes += Number(f.bytes) || 0;
    }
    // a content set's cs covers its translation files too (every language its manifest lists)
    const i18n = {};
    for (const [lang, f] of Object.entries(index.i18n || {})) {
      if (typeof f?.sha256 === 'string') i18n[lang] = f.sha256;
      if (typeof f?.url === 'string' && f.url.startsWith('/cs/')) dataBytes += Number(f.bytes) || 0;
    }
    const hashInput = { app: index.app, sim: index.sim, data, plugins: index.plugins || [], settings: index.settings || {}, ...(Object.keys(i18n).length ? { i18n } : {}), ...(index.rules && typeof index.rules === 'object' && !Array.isArray(index.rules) ? { rules: index.rules } : {}) };
    // what a browser and a match host recompute from the manifest must be the builder's cs (else no page could check it)
    if (contentHashOf(hashInput) !== built.cs) return null;
    // this server holds the files now (filesOf copies them): the builder keeps no second copy, so a server whose rooms
    // switch plugin combinations often does not grow by one whole data set per combination (server/plugins/contentSet.js)
    release(built);
    return {
      cs: built.cs, plugins: built.plugins || [], data: built.data,
      hashInput,
      modes: pluginModes(built.modes, vanillaData),
      kitted: Array.isArray(built.kitted) ? built.kitted : null,
      warnings: (Array.isArray(built.warnings) ? built.warnings : []).map((w) => (w && w.code === 'PLUGIN_PATCH_OVERRIDE'
        ? { code: 'override', params: { path: `data:${w.path}`, plugins: Array.isArray(w.plugins) ? w.plugins : [] } }
        : { code: String(w?.code || 'warning'), params: { ...(w || {}) } })),
      served, dataBytes,
      ...(built.scripts?.length ? {execution:built.execution, scripts:built.scripts} : {}),
      ...(built.rules ? { rules: built.rules } : {}),
      // the official-bounds snapshot (DESIGN §32.5) its match host installs — the one its pages install too
      bounds: built.bounds && built.bounds.v === 1 ? built.bounds : null,
      // PLUGIN API v2: the set's interaction windows (docs/PLUGINS.md §10b), handed to its match host and to the
      // rooms' views; [] when the set declares none
      offers: Array.isArray(built.offers) ? built.offers : [],
    };
  }

  /**
   * The content set of the content plugins `ids` (closed and in load order — server/plugins/roomSets.js), built or
   * remembered (see the header).
   * @param {string[]} ids
   * @param {{ settings?: Record<string, Record<string, unknown>>, replacing?: string | null }} [opts]
   * @returns {{ ok: true, set: ContentSet } | { error: string, detail: string }}
   */
  function resolve(ids, { settings = {}, replacing = null, allowIncompatible = false } = {}) {
    requests++;
    // the same plugins, in the same state, with the same (normalized) settings: the set built before (a build takes a few
    // hundred ms of this process — every rooms: fixed room, every 「重新应用」 and every cosmetic switch beside them asks again)
    const norm = normalized(ids, settings);
    const mk = memoKey(ids, norm, allowIncompatible);
    const remembered = mk && memo.has(mk) ? sets.get(memo.get(mk)) || null : null;
    if (remembered) memoHits++;
    // the limit: one set more than the rooms hold now (a set already held, or the one the asking room gives up, is free)
    const limit = Math.max(0, Number(maxSets()) || 0);
    const freed = replacing && isContentHash(replacing) && held.get(csUrlPart(replacing)) === 1 ? 1 : 0;
    const full = held.size - freed >= limit;
    const busy = () => ({ error: ERR.PLUGIN_BUSY, detail: `${held.size} content sets in use (limit ${limit})` });
    let set = remembered;
    if (!set) {
      // refused before anything is built while the limit is reached: a set some room holds is remembered (its entry is
      // never the one dropped), so what is not remembered would be one set more [ASSUMED: a held set whose plugin's
      // manifest changed on disk since — same files, same cs — is refused here rather than built to find out]
      if (full) { refused++; return busy(); }
      // A combination this server built before (even before a restart): its bytes are on disk, so nothing is built.
      if (cache && mk) set = adoptCached(cache.load(mk, cacheIdentity()));
      if (!set) {
        let built;
        const started = Date.now();
        try {
          builds++;
          built = build({ registry, ids: ids.map((id) => (norm[id] ? { id, settings: norm[id] } : id)), allowIncompatible });
        } catch (e) {
          refused++;
          log.error?.('[plugins] content set failed to build', e);
          return { error: ERR.INTERNAL, detail: 'the content set failed to build' };
        }
        if (!built || !isContentHash(built.cs) || (Array.isArray(built.problems) && built.problems.length)) {
          const list = Array.isArray(built?.problems) ? built.problems : [];
          const why = list.length ? list.slice(0, 4).map(problemText).join('; ') : 'no content set';
          log.warn?.(`[plugins] content set of ${ids.join(', ')} refused: ${why}`);
          // a load-order problem keeps its own code (PLUGIN_DEPENDENCY / PLUGIN_CONFLICT); any other problem of the data is
          // a set this server cannot make
          const code = list.find((p) => p && Object.hasOwn(ERR, p.code))?.code;
          refused++;
          return { error: code || ERR.PLUGIN_BLOCKED, detail: why.slice(0, 200) };
        }
        if (cache && mk) storeCached(mk, built, { ids, settings: norm, allowIncompatible });
        const k = csUrlPart(built.cs);
        set = sets.get(k) || null;
        if (!set || set.cs !== built.cs) set = adopt(built);
        if (!set) {
          refused++;
          log.error?.(`[plugins] content set ${built.cs.slice(0, 8)}: its manifest does not hash to its cs`);
          return { error: ERR.INTERNAL, detail: 'the content set\'s manifest does not hash to its cs' };
        }
        lastBuildMs = Date.now() - started;
        maxBuildMs = Math.max(maxBuildMs, lastBuildMs);
      }
    }
    const key = csUrlPart(set.cs);
    if (!held.has(key) && full) { refused++; return busy(); }
    keep(key, set);
    // remembered only once kept (a refused set is not)
    if (mk && !remembered) remember(mk, key);
    return { ok: true, set };
  }

  const byCs = (cs) => { const s = isContentHash(cs) ? sets.get(csUrlPart(cs)) : null; return s && s.cs === cs ? s : null; };

  // ---- the off-loop builder (SP_CONTENT_BUILDER=1) ----------------------------------------------------------------
  // A child process scans the installed plugins once and builds a requested set with the same builder; the main thread
  // only adopts the result. A burst of room-plugin changes therefore never blocks the lobby's event loop.
  let builder = null;
  let buildSeq = 0;
  const waiting = new Map();
  const inflight = new Map();
  const builderChild = () => {
    if (String(process.env.SP_CONTENT_BUILDER || '') !== '1') return null;
    if (builder) return builder;
    try {
      builder = fork(new URL('./contentBuilderChild.js', import.meta.url), [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      builder.unref?.();
      builder.stderr?.on('data', (d) => log.warn?.(`[plugins] content builder: ${String(d).trim()}`));
      builder.on('message', (m) => {
        const p = m && waiting.get(m.id);
        if (!p) return;
        waiting.delete(m.id);
        if (m.type !== 'built') { log.warn?.('[plugins] content builder failed', m.error); p.resolve(null); return; }
        try { registerContentSetFiles(m.set, m.files); p.resolve(m.set); } catch (e) { log.warn?.('[plugins] content builder adopt failed', e); p.resolve(null); }
      });
      builder.on('exit', () => {
        builder = null;
        for (const p of waiting.values()) p.resolve(null);
        waiting.clear();
      });
    } catch (e) {
      log.warn?.('[plugins] content builder child failed to start', e);
      builder = null;
    }
    return builder;
  };
  /**
   * Build a content set off the event loop and remember it, so the following `resolve` is a memo hit (the lobby's
   * plugin change path). Returns null when the builder is off/unavailable or the set is refused — the caller then falls
   * back to the synchronous build.
   */
  function prebuild(ids, { settings = {}, allowIncompatible = false, replacing = null } = {}) {
    const child = builderChild();
    if (!child) return Promise.resolve(null);
    const norm = normalized(ids, settings);
    const mk = memoKey(ids, norm, allowIncompatible);
    if (mk && memo.has(mk) && sets.has(memo.get(mk))) return Promise.resolve({ ok: true });
    // A combination this server built before (even before a restart): its bytes are on disk, so nothing is built.
    if (cache && mk) {
      const cached = adoptCached(cache.load(mk, cacheIdentity()));
      if (cached) {
        const key = csUrlPart(cached.cs);
        if (!sets.has(key)) keep(key, cached);
        remember(mk, key);
        return Promise.resolve({ ok: true, set: cached });
      }
    }
    // One build per set at a time: the debounce's warm request and the apply that follows it ask for the same set, and
    // the second must wait for the first instead of starting a duplicate build in the child.
    if (mk && inflight.has(mk)) return inflight.get(mk);
    const limit = Math.max(0, Number(maxSets()) || 0);
    const freed = replacing && isContentHash(replacing) && held.get(csUrlPart(replacing)) === 1 ? 1 : 0;
    if (held.size - freed >= limit) return Promise.resolve(null);
    const id = ++buildSeq;
    const job = new Promise((resolve) => {
      const timer = setTimeout(() => { if (waiting.delete(id)) resolve(null); }, 30_000);
      timer.unref?.();
      waiting.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); } });
      try {
        child.send({ type: 'build', id, ids: ids.map((x) => (norm[x] ? { id: x, settings: norm[x] } : x)), settings: norm, allowIncompatible });
      } catch { waiting.delete(id); clearTimeout(timer); resolve(null); }
    }).then((built) => {
      if (!built || !isContentHash(built.cs)) return null;
      if (mk) storeCached(mk, built, { ids, settings: norm, allowIncompatible });
      const set = adopt(built);
      if (!set) return null;
      const key = csUrlPart(set.cs);
      // `keep` also bounds the map: a host toggling many combinations warms sets no room holds yet.
      if (!sets.has(key)) keep(key, set);
      if (mk) remember(mk, key);
      return { ok: true, set };
    });
    if (mk) inflight.set(mk, job.then((v) => { inflight.delete(mk); return v; }, (e) => { inflight.delete(mk); throw e; }));
    return mk ? inflight.get(mk) : job;
  }

  // Start the builder at boot when it is enabled: its one-time plugin scan (~1 s) then belongs to startup, not to the
  // first room's first toggle.
  if (String(process.env.SP_CONTENT_BUILDER || '') === '1') { try { builderChild(); } catch { /* spawned again on the first build */ } }
  // …and load the few combinations this server used last time back into memory, so opening such a room costs a read.
  if (cache) {
    const warm = setTimeout(() => {
      for (const a of cache.recent(4)) {
        if (!Array.isArray(a.ids) || !a.ids.length) continue;
        prebuild(a.ids, { settings: a.settings ?? {}, allowIncompatible: a.allowIncompatible ?? false }).catch(() => {});
      }
    }, 3000);
    warm.unref?.();
  }

  return {
    resolve,
    prebuild,
    /** True when builds go to the child (SP_CONTENT_BUILDER=1): the caller may then defer its apply to a build. */
    prebuildEnabled: () => String(process.env.SP_CONTENT_BUILDER || '') === '1',
    onStale(fn) { staleListeners.add(fn); return () => staleListeners.delete(fn); },
    close() { offScan?.(); staleListeners.clear(); inflight.clear(); if (builder) { try { builder.kill(); } catch { /* gone */ } builder = null; } },
    /** A room uses the set of `cs`: never dropped until every holder released it. @param {string} cs */
    hold(cs) { if (!isContentHash(cs)) return; const k = csUrlPart(cs); held.set(k, (held.get(k) || 0) + 1); },
    /** A room no longer uses the set of `cs`. @param {string} cs */
    release(cs) {
      if (!isContentHash(cs)) return;
      const k = csUrlPart(cs);
      const n = (held.get(k) || 0) - 1;
      if (n > 0) held.set(k, n);
      else { held.delete(k); stale.delete(k); }
    },
    /** The set of `cs`, while it is kept. @param {string} cs @returns {ContentSet | null} */
    get: byCs,
    /** Its merged data (the lobby's checks), or null. @param {string} cs */
    dataOf: (cs) => byCs(cs)?.data || null,
    /** The operators a 自选 slot may field in it (null = the vanilla list). @param {string} cs */
    kittedOf: (cs) => byCs(cs)?.kitted || null,
    /** The modes its plugins add. @param {string} cs */
    modesOf: (cs) => byCs(cs)?.modes || [],
    /**
     * A file of a kept set as /cs/<cs16>/<rel> serves it (index.json, data/<table>.json, i18n/<lang>.json), or null.
     * @param {string} cs16 @param {string} rel
     * @returns {{ body: Buffer, sha256: string | null, type: string } | null}
     */
    file(cs16, rel) {
      const set = sets.get(cs16);
      // C1 puts only verified sim/meta/client entry bytes in this exact-path table; never reopen files on disk.
      const f = set ? set.served.get(rel) : null;
      const type = /^(?:scripts|keel)\/[^/]+\//.test(rel) ? 'text/javascript; charset=utf-8' : 'application/json; charset=utf-8';
      return f ? { body: f.body, sha256: rel === 'index.json' ? null : f.sha256, type } : null;
    },
    /**
     * The served bytes of every data file of the set of `cs`, by table name (the names of its hash input) — null for a set
     * not kept; a table the builder served no body for is left out (the worker then refuses the set).
     * @param {string} cs
     * @returns {Record<string, Buffer> | null}
     */
    dataBytes(cs) {
      const set = byCs(cs);
      if (!set) return null;
      const out = {};
      for (const name of Object.keys(set.hashInput.data)) {
        const f = set.served.get(`data/${name}.json`);
        if (f) out[name] = f.body;
        else log.warn?.(`[plugins] content set ${cs.slice(0, 8)} serves no data/${name}.json`);
      }
      return out;
    },
    /** Content sets rooms hold now (/healthz content.sets). */
    inUse: () => held.size,
    stats: () => ({ sets: sets.size, held: held.size, builds, requests, memoHits, cacheHits, refused, lastBuildMs, maxBuildMs, dataBytes: [...sets.values()].reduce((n, s) => n + (Number(s.dataBytes) || 0), 0) }),
  };
}
