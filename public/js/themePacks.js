// public/js/themePacks.js — local interface theme packs (spTheme/1): import from a folder, keep in IndexedDB, apply on
// this browser only. A pack is a theme.json + pictures, validated by shared/themePack.js; nothing is uploaded, no pack
// file is ever parsed as CSS / HTML / a script, and a picture is served to the page as a blob URL after the extension
// and size checks. The active pack is `sp.pref.theme-pack` (an id); a private window without IndexedDB keeps it for the
// session and says so.
//
// Settings uses listThemePacks / installThemePack / activateThemePack / removeThemePack; main.js calls restoreThemePack.

import { loadPref, savePref } from './store.js';
import {
  acceptAudioPath, acceptDataPath, acceptPackPath, THEME_PACK_LIMITS, themePackVariables, validateThemePack,
} from '../../shared/themePack.js';
import { mountThemeCharacter, unmountThemeCharacter } from './ui/themeCharacter.js';

const DB_NAME = 'sp-theme-packs';
const DB_STORE = 'packs';
const PREF = 'theme-pack';
const MIME = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', skel: 'application/octet-stream', atlas: 'text/plain', json: 'application/json',
});
const AUDIO_RE = /\.(ogg|mp3)$/i;
const AUDIO_MAX = 4 * 1024 * 1024;
const DATA_MAX = 8 * 1024 * 1024;

const extOf = (p) => {
  const dot = p.lastIndexOf('.');
  return dot < 0 ? '' : p.slice(dot + 1).toLowerCase();
};

/** Session fallback when IndexedDB is unavailable (private windows). */
const memory = new Map();
let db = null;
let dbFailed = false;

function openDb() {
  if (db) return Promise.resolve(db);
  if (dbFailed || !globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch { dbFailed = true; resolve(null); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => { dbFailed = true; resolve(null); };
    setTimeout(() => { if (!db) { dbFailed = true; resolve(null); } }, 3000);
  });
}

function idb(mode, fn) {
  return openDb().then((d) => new Promise((resolve) => {
    if (!d) { resolve({ fallback: true }); return; }
    let tx;
    try { tx = d.transaction(DB_STORE, mode); } catch { resolve({ fallback: true }); return; }
    const store = tx.objectStore(DB_STORE);
    const out = fn(store);
    tx.oncomplete = () => resolve(out?.result !== undefined ? { value: out.result } : { ok: true });
    tx.onerror = () => resolve({ fallback: true });
    tx.onabort = () => resolve({ fallback: true });
  }));
}

/** @returns {Promise<{id:string,name:string,author:string,description:string,version:number,images:number,colors:number}[]>} */
export async function listThemePacks() {
  const rows = [];
  const res = await idb('readonly', (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      const v = c.value;
      if (v && v.pack) rows.push(v.pack);
      c.continue();
    };
    return req;
  });
  if (res.fallback || !rows.length) for (const v of memory.values()) if (v?.pack) rows.push(v.pack);
  const seen = new Set();
  return rows.filter((p) => p && !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({
      id: p.id, name: p.name, author: p.author || '', description: p.description || '', version: p.version || 1,
      images: Object.keys(p.images || {}).length, colors: Object.keys(p.colors || {}).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read a folder input's files into a pack. `files` is a FileList / array of File, each with `webkitRelativePath` (a
 * folder input) or a bare `name`.
 * @param {FileList|File[]} files
 */
export async function readThemePack(files) {
  const list = Array.from(files || []);
  if (!list.length) return { ok: false, errors: [{ code: 'THEME_EMPTY', path: '', message: 'no files' }], warnings: [] };
  const byPath = new Map();
  let packPath = null;
  for (const f of list) {
    const rel = String(f.webkitRelativePath || f.name || '').replace(/\\/g, '/');
    if (!rel || !(acceptPackPath(rel) || acceptAudioPath(rel) || acceptDataPath(rel))) continue;
    if (rel.split('/').some((x) => x === '..' || x === '')) continue;
    const base = rel.split('/').pop();
    if (base === 'theme.json' && (!packPath || rel.length < packPath.length)) packPath = rel;
    byPath.set(rel, f);
  }
  if (!packPath) return { ok: false, errors: [{ code: 'THEME_MANIFEST', path: 'theme.json', message: 'theme.json not found' }], warnings: [] };
  const root = packPath.includes('/') ? packPath.slice(0, packPath.lastIndexOf('/') + 1) : '';
  let doc;
  try { doc = JSON.parse(await byPath.get(packPath).text()); }
  catch { return { ok: false, errors: [{ code: 'THEME_JSON', path: packPath, message: 'theme.json is not JSON' }], warnings: [] }; }
  const filesInPack = new Set();
  for (const rel of byPath.keys()) {
    if (!root || !rel.startsWith(root)) continue;
    const p = rel.slice(root.length);
    if (!p || p === 'theme.json') continue;
    if (acceptPackPath(p) || acceptAudioPath(p) || acceptDataPath(p)) filesInPack.add(p);
  }
  const check = validateThemePack(doc, filesInPack);
  if (!check.ok) return { ok: false, pack: null, errors: check.errors, warnings: check.warnings };
  const pack = check.pack;
  let total = 0;
  const blobs = {};
  const wanted = [
    ...Object.values(pack.images),
    ...(pack.voice ? [pack.voice] : []),
    ...(pack.character ? [pack.character.skel, pack.character.atlas].filter(Boolean) : []),
    // the atlas's page pictures and any other file of the folder (a Spine model names its pages in the atlas text)
    ...filesInPack,
  ];
  for (const p of new Set(wanted)) {
    const f = byPath.get(root + p);
    const audio = AUDIO_RE.test(p);
    const image = /\.(png|jpe?g|webp)$/i.test(p);
    const cap = image ? THEME_PACK_LIMITS.image : audio ? AUDIO_MAX : DATA_MAX;
    if (!f || f.size > cap) {
      return { ok: false, errors: [{ code: 'THEME_FILE_SIZE', path: p, message: `missing or larger than ${Math.round(cap / 1048576)} MB` }], warnings: check.warnings };
    }
    total += f.size;
    if (total > THEME_PACK_LIMITS.pack) return { ok: false, errors: [{ code: 'THEME_PACK_SIZE', path: p, message: 'pack larger than 32 MB' }], warnings: check.warnings };
    blobs[p] = { blob: f, mime: MIME[extOf(p)] || 'application/octet-stream' };
  }
  return { ok: true, pack, blobs, errors: [], warnings: check.warnings };
}

/** Install a folder: validate, store, and make it the active pack. */
export async function installThemePack(files) {
  const read = await readThemePack(files);
  if (!read.ok) return read;
  const record = { pack: read.pack, blobs: read.blobs };
  const res = await idb('readwrite', (store) => store.put(record, read.pack.id));
  if (res.fallback || res.ok === undefined) memory.set(read.pack.id, record);
  await activateThemePack(read.pack.id);
  return { ok: true, pack: read.pack, warnings: read.warnings };
}

let active = null;
let activeUrls = [];
let written = [];
let voice = null;
let voiceHandler = null;

/** Stop the pack's voice line (if any) and drop its pending first-tap handler. */
function stopVoice() {
  if (voiceHandler) document.removeEventListener('pointerdown', voiceHandler);
  voiceHandler = null;
  if (voice) { try { voice.pause(); } catch { /* ignore */ } }
  voice = null;
}

/** Play the pack's voice once on the first pointer interaction (browser autoplay rules). */
function armVoice(url) {
  stopVoice();
  if (!url) return;
  try {
    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = 0.7;
    voice = a;
    voiceHandler = () => { try { a.play().catch(() => {}); } catch { /* ignore */ } };
    document.addEventListener('pointerdown', voiceHandler, { once: true });
  } catch { voice = null; voiceHandler = null; }
}

function clearVars() {
  const root = document.documentElement;
  for (const name of written) root.style.removeProperty(name);
  written = [];
  delete root.dataset.themePack;
}

function revokeUrls() {
  for (const u of activeUrls) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }
  activeUrls = [];
}

/** Make `id` the active pack on this page (`''` clears it). Unknown id clears. */
export async function activateThemePack(id) {
  const root = document.documentElement;
  stopVoice();
  unmountThemeCharacter();
  revokeUrls();
  active = null;
  if (!id) {
    clearVars();
    savePref(PREF, '');
    return { ok: true };
  }
  let rec = null;
  await idb('readonly', (store) => {
    const req = store.get(id);
    req.onsuccess = () => { rec = req.result; };
    return req;
  });
  if (!rec) rec = memory.get(id) || null;
  if (!rec?.pack) { clearVars(); savePref(PREF, ''); return { ok: false, error: 'THEME_NOT_FOUND' }; }
  const urls = new Map();
  for (const [p, v] of Object.entries(rec.blobs || {})) {
    try {
      const u = URL.createObjectURL(v.blob);
      urls.set(p, u);
      activeUrls.push(u);
    } catch { /* a bad blob drops its slot alone */ }
  }
  const vars = themePackVariables(rec.pack, (p) => urls.get(p));
  written = Object.keys(vars);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.dataset.themePack = rec.pack.id;
  active = rec.pack;
  if (rec.pack.voice) armVoice(urls.get(rec.pack.voice));
  if (rec.pack.character) {
    const slotImages = new Set(Object.values(rec.pack.images || {}));
    const pages = Object.keys(rec.blobs || {})
      .filter((p) => /\.(png|jpe?g|webp)$/i.test(p) && !slotImages.has(p))
      .map((p) => ({ name: p.split('/').pop(), url: urls.get(p) }));
    void mountThemeCharacter({
      skel: urls.get(rec.pack.character.skel),
      atlas: urls.get(rec.pack.character.atlas),
      idle: rec.pack.character.idle,
      pages,
    });
  }
  savePref(PREF, rec.pack.id);
  return { ok: true, pack: rec.pack };
}

/** Remove a pack; the active one is cleared first. */
export async function removeThemePack(id) {
  if (active?.id === id) await activateThemePack('');
  const res = await idb('readwrite', (store) => store.delete(id));
  if (res.fallback) memory.delete(id);
  return { ok: true };
}

/** The active pack's id, from the preference (the applied pack may still be loading). */
export function activeThemePackId() {
  const id = loadPref(PREF, '');
  return typeof id === 'string' ? id : '';
}

/** Apply the saved pack on page load. Safe to call once; failures leave the default look. */
export async function restoreThemePack() {
  const id = activeThemePackId();
  if (!id) return { ok: true };
  return activateThemePack(id);
}
