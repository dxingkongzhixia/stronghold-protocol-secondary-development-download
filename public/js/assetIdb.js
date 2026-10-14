// public/js/assetIdb.js — the IndexedDB asset layer: the local cache for the files the Service Worker cannot cover on
// a plain-HTTP site (docs/OUR-FEATURES.md §4).
//
// Why: the local asset cache (js/assetCache.js + public/sw.js) is the good one — it intercepts at the network layer,
// so every consumer (images, audio, Spine, the scene bundles) is covered. A Service Worker needs a secure context,
// and the deployed site is `http://<ip>:<port>`, so it never registers there. IndexedDB works on plain HTTP, but a
// page cannot intercept a request without a worker, so this layer only covers what the game fetches through its own
// code and can therefore serve from a `blob:` URL:
//
//   * the audio (js/audio.js fetches the bytes itself and decodes them with Web Audio), and
//   * the battlefield scene bundles (render/board3d/load.js fetches scene.json + scene.bin by URL).
//
// Those two are also the files a download manager likes to steal: `/media/…` exists so the audio never ends in an
// extension on the wire, and a local blob never touches the network at all.
//
// A `blob:` URL cannot carry a Spine atlas (the atlas names its pages relatively), so the Spine models and anything
// else resolved relative to its own URL stay on the server / the CDN mirror (js/assetMirror.js) — this is a cache of
// whole files fetched by explicit URL, not a request interceptor.
//
// Priority: the Service Worker first (it covers everything). This layer is dormant whenever the SW is available —
// `idbActive()` is what the callers check.

/**
 * IndexedDB database / object store of the local blobs. Distinct from the SW's Cache Storage name (`sp-assets`).
 *
 * v2 (2026-10-14): v1 stored its `text` entries JSON-quoted (render/board3d/load.js `fetchScene`) and read them back
 * verbatim, so the gate meshes — the `.obj` files the board fetches as text — came back as `"v 0 …"` with quotes and
 * escaped newlines, parsed to nothing, and the 红门/蓝门 vanished on every visit after the first (the owner's report).
 * load.js writes text verbatim now; opening at 2 drops the store so the entries v1 wrote cannot keep the bug alive.
 */
export const IDB_NAME = 'sp-asset-blobs';
export const IDB_STORE = 'files';
export const IDB_VERSION = 2;

let enabled = false;
let dbPromise = null;
const urlCache = new Map();   // url → blob: URL (the game re-uses the same few thousand)

/** Is IndexedDB usable at all here? (A private-mode browser may report it and still fail on open.) */
export function idbSupported(scope = globalThis) {
  return !!(scope && scope.indexedDB && typeof scope.URL?.createObjectURL === 'function');
}

/**
 * Is this layer the active one? The Service Worker wins: when it can register, its pre-cache (js/assetCache.js)
 * covers every consumer and this store would only duplicate it. The caller sets the flag once at boot.
 * @param {boolean} on
 */
export function setIdbEnabled(on) { enabled = !!on; if (!enabled) dbPromise = null; }
/** @returns {boolean} */
export function idbEnabled() { return enabled; }

/** The open database (lazily, once). Resolves null when IndexedDB is unusable. */
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = globalThis.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // an upgrade drops the store: v1's text entries are the ones this version exists to retire
        if (db.objectStoreNames.contains(IDB_STORE)) db.deleteObjectStore(IDB_STORE);
        db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

/** One request in one transaction. Resolves `{ ok, value }`; any failure is `{ ok:false }` (a cache never throws). */
async function tx(mode, run) {
  const db = await openDb();
  if (!db) return { ok: false, value: null };
  return new Promise((resolve) => {
    try {
      const t = db.transaction(IDB_STORE, mode);
      const store = t.objectStore(IDB_STORE);
      let value = null;
      run(store, (v) => { value = v; });
      t.oncomplete = () => resolve({ ok: true, value });
      t.onerror = () => resolve({ ok: false, value: null });
      t.onabort = () => resolve({ ok: false, value: null });
    } catch { resolve({ ok: false, value: null }); }
  });
}

/**
 * The stored blob of `url`, or null.
 * @param {string} url the URL the game asked for (the manifest's, not the mirror's)
 * @returns {Promise<Blob | null>}
 */
export async function idbGet(url) {
  if (!url) return null;
  const { value } = await tx('readonly', (store, set) => {
    const r = store.get(url);
    r.onsuccess = () => set(r.result || null);
  });
  return value && value.blob instanceof Blob ? value.blob : null;
}

/**
 * Store `blob` under `url` (with its size, for the panel's readout). Best-effort: a quota error resolves false.
 * @param {string} url
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
export async function idbPut(url, blob) {
  if (!url || !(blob instanceof Blob)) return false;
  const { ok } = await tx('readwrite', (store) => { store.put({ blob, size: blob.size, at: Date.now() }, url); });
  return ok;
}

/** A stable `blob:` URL for a stored file, or null. The mapping is memoised (the same URL is asked for again). */
export async function idbBlobUrl(url) {
  const hit = urlCache.get(url);
  if (hit) return hit;
  const blob = await idbGet(url);
  if (!blob) return null;
  try { const u = URL.createObjectURL(blob); urlCache.set(url, u); return u; } catch { return null; }
}

/** What the store holds: { files, bytes }. */
export async function idbInfo() {
  const { value } = await tx('readonly', (store, set) => {
    let files = 0; let bytes = 0;
    const cur = store.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) { set({ files, bytes }); return; }
      files += 1; bytes += Number(c.value?.size) || 0;
      c.continue();
    };
  });
  return value || { files: 0, bytes: 0 };
}

/** Drop everything (the panel's 清除 button). */
export async function idbClear() {
  for (const u of urlCache.values()) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }
  urlCache.clear();
  const { ok } = await tx('readwrite', (store) => { store.clear(); });
  return ok;
}
