// server/plugins/contentSetCache.js — keep built content sets on disk, so opening a room whose plugin combination this
// server built before does not build it again (not even after a restart).
//
// A directory per combination: meta.json (the memo key it answers, its cs, how adopt() reconstructs the set), the
// manifest index.json, and the set's own bodies under bodies/<rel>. `load` re-checks the manifest against its cs and
// every body against the manifest before handing anything out; a broken entry is deleted and the caller builds instead.
import fs from 'node:fs';
import path from 'node:path';
import { nodeSha256 } from './identity.js';
import { contentHashOf, csUrlPart } from '../../shared/plugins/identity.js';

const VERSION = 1;

/** @param {{ dir: string, maxEntries?: number, maxBytes?: number, log?: any }} opts */
export function createContentSetCache({ dir, maxEntries = 48, maxBytes = 256 * 1024 * 1024, log = null }) {
  const keyOf = (memoKey, identity) => nodeSha256(Buffer.from(`${memoKey}\0${identity?.app ?? ''}\0${identity?.sim ?? ''}\0${JSON.stringify(identity?.data ?? {})}`)).slice(0, 32);
  const entryOf = (key) => path.join(dir, key);
  const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

  /** Every `/cs/…` URL the manifest serves → its sha256, so a body is checked against the manifest that names it. */
  const urlHashes = (index, cs16) => {
    const out = new Map();
    const add = (table) => {
      for (const f of Object.values(table ?? {})) {
        if (!f || typeof f.url !== 'string' || typeof f.sha256 !== 'string') continue;
        if (f.url.startsWith(`/cs/${cs16}/`)) out.set(f.url.slice(`/cs/${cs16}/`.length), f.sha256);
      }
    };
    add(index.data);
    add(index.i18n);
    add(index.bounds);
    add(index.scripts);
    for (const m of index.keel?.plugins ?? []) for (const mod of m.modules ?? []) {
      if (typeof mod?.entry === 'string' && typeof mod.sha256 === 'string') out.set(`keel/${m.id}/${mod.entry}`, mod.sha256);
    }
    return out;
  };

  /**
   * The stored set of this combination, or null. Everything is verified: the manifest must hash to its cs, and every
   * body must be the bytes that manifest names.
   * @param {string} memoKey @param {any} identity (the vanilla content identity: app / sim / data)
   */
  function load(memoKey, identity) {
    if (!memoKey) return null;
    const key = keyOf(memoKey, identity);
    const entry = entryOf(key);
    const meta = readJson(path.join(entry, 'meta.json'));
    if (!meta || meta.v !== VERSION || typeof meta.cs !== 'string') return null;
    const index = readJson(path.join(entry, 'index.json'));
    if (!index) return null;
    const cs16 = csUrlPart(meta.cs);
    try { if (contentHashOf({ app: index.app, sim: index.sim, data: Object.fromEntries(Object.entries(index.data ?? {}).map(([k, f]) => [k, f?.sha256])),
      plugins: index.plugins ?? [], settings: index.settings ?? {}, ...(Object.keys(index.i18n ?? {}).length ? { i18n: Object.fromEntries(Object.entries(index.i18n).map(([k, f]) => [k, f?.sha256])) } : {}),
      ...(index.rules && typeof index.rules === 'object' && !Array.isArray(index.rules) ? { rules: index.rules } : {}) }) !== meta.cs) return null; }
    catch { return null; }
    const want = urlHashes(index, cs16);
    const bodies = new Map();
    // The manifest itself is served from the set's own files (`/cs/<cs16>/index.json`): regenerate the exact bytes the
    // builder wrote (it stores `JSON.stringify(index)` as that body).
    bodies.set('index.json', Buffer.from(JSON.stringify(index)));
    for (const [rel, sha] of want) {
      let body;
      try { body = fs.readFileSync(path.join(entry, 'bodies', rel)); } catch { bodies.clear(); break; }
      if (nodeSha256(body) !== sha) { bodies.clear(); break; }
      bodies.set(rel, body);
    }
    // A stored body that the manifest does not name means the entry was written for another set: refuse the whole entry.
    if (!bodies.size && want.size) { return null; }
    return { cs: meta.cs, index, bodies, extra: meta.extra ?? {} };
  }

  /**
   * Store a built set. @param {string} memoKey @param {any} identity
   * @param {{ cs: string, index: any, files: Map<string, { body: Buffer }>, extra: any }} built
   */
  function store(memoKey, identity, { cs, index, files, extra }) {
    if (!memoKey || !cs || !index) return;
    const key = keyOf(memoKey, identity);
    const entry = entryOf(key);
    const tmp = path.join(dir, `.tmp-${process.pid}-${Date.now().toString(36)}`);
    try {
      fs.mkdirSync(path.join(tmp, 'bodies'), { recursive: true });
      const cs16 = csUrlPart(cs);
      // Only the bodies this set serves itself (`/cs/…`): the unchanged tables are the server's vanilla bytes, and the
      // manifest is regenerated from index.json on load. A 16 MB set therefore costs its changed files, a few MB.
      const own = urlHashes(index, cs16);
      for (const [rel, f] of files) {
        const body = f?.body;
        if (!body || !body.length || rel === 'index.json' || !own.has(rel)) continue;
        const target = path.join(tmp, 'bodies', rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, body);
      }
      fs.writeFileSync(path.join(tmp, 'index.json'), JSON.stringify(index));
      fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify({ v: VERSION, cs, cs16, savedAt: Date.now(), extra: extra ?? {} }));
      fs.rmSync(entry, { recursive: true, force: true });
      fs.renameSync(tmp, entry);
      prune();
    } catch (e) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
      log?.warn?.(`[plugins] content-set cache write failed: ${e?.code || e?.message || e}`);
    }
  }

  /** Keep the newest `maxEntries` entries, and all of them within `maxBytes`. */
  function prune() {
    let names;
    try { names = fs.readdirSync(dir); } catch { return; }
    const entries = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const entry = path.join(dir, name);
      try {
        const st = fs.statSync(entry);
        if (!st.isDirectory()) continue;
        entries.push({ name, at: st.mtimeMs, bytes: dirBytes(entry) });
      } catch { /* gone */ }
    }
    entries.sort((a, b) => b.at - a.at);
    let bytes = 0;
    for (const [i, e] of entries.entries()) {
      bytes += e.bytes;
      if (i < maxEntries && bytes <= maxBytes) continue;
      try { fs.rmSync(path.join(dir, e.name), { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  function dirBytes(root) {
    let n = 0;
    const stack = [root];
    while (stack.length) {
      const p = stack.pop();
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) { try { for (const c of fs.readdirSync(p)) stack.push(path.join(p, c)); } catch { /* gone */ } }
      else n += st.size;
    }
    return n;
  }

  /** The combinations stored, newest first (for a boot pre-warm). */
  function recent(limit = 4) {
    let names;
    try { names = fs.readdirSync(dir); } catch { return []; }
    const out = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const meta = readJson(path.join(dir, name, 'meta.json'));
      if (meta?.v !== VERSION || !meta.extra?.args) continue;
      out.push({ at: meta.savedAt ?? 0, ...meta.extra.args });
    }
    out.sort((a, b) => b.at - a.at);
    return out.slice(0, limit);
  }

  return { dir, load, store, prune, recent, keyOf };
}
