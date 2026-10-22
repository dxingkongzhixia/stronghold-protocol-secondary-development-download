// Validated, hash-pinned visual-set effects. All runtime keys are private to one plugin.
import { fxNamespace, fxPath, fxId, fxObject, ownsFxUnit, pluginFxProblems, PLUGIN_FX_LIMITS as CAP } from './pluginFormat.js';
import { boundedFxJson, validateFxPrefab } from './pluginValidate.js';

// The loader pins its checked dependency owners in the effects payload. Legacy payloads own only their provider's
// namespace; deriving ownership from bind/index keys would let the payload authorize itself.
function validPluginFx(id, e) {
  try {
    if (!fxId(id) || !fxObject(e)) return false;
    const owners = e.owners ?? [id];
    if (!Array.isArray(owners) || !owners.includes(id) || !owners.every(fxId) || pluginFxProblems(e.config, owners).length) return false;
    if (e.index) {
      boundedFxJson(e.index);
      if (!fxObject(e.index.units) || Object.keys(e.index.units).length > CAP.units ||
        Object.keys(e.index.units).some(key => !ownsFxUnit(key, owners))) return false;
    }
    const prefabs = e.prefabs ?? {};
    if (!fxObject(prefabs) || Object.keys(prefabs).length > CAP.effects) return false;
    for (const [key, d] of Object.entries(prefabs)) {
      if (!fxId(key) || key !== d?.key) return false;
      validateFxPrefab(d, e.textures || {}, { official: !!e.config.official, meshes: e.meshes || {} });
    }
    return true;
  } catch { return false; }
}

/** Extend a checked visual document's prepared writes without changing the legacy visual protocol. */
export function preparePluginFx(doc, visual) {
  const writes = (doc?.writes || []).flatMap(w => (w.ops || []).filter(op => op.effects).map(op => ({ id: w.id, op })));
  if (!writes.length || visual.checkVisualDoc(doc, doc.visual?.vs)) return [];
  const out = [];
  for (const { id, op } of writes) {
    if (op.at?.length !== 2 || op.at[0] !== 'fx' || op.at[1] !== id) continue;
    const files = doc.visual.overlays.find(o => o.id === id)?.files || {};
    const e = op.effects;
    // Hash validation proves which payload arrived; ownership and prefab budgets must still hold in the browser.
    if (!validPluginFx(id, e) || !e.images) continue;
    const urls = [], images = {}, meshes = {};
    let bad = false;
    for (const rel of Object.keys(e.images)) {
      const hash = files[rel];
      if (!fxPath(rel) || !/^[a-f0-9]{64}$/.test(hash)) { bad = true; break; }
      const url = `/p/${id}/${hash.slice(0, 8)}/${rel}`;
      images[rel] = { ...e.images[rel], url }; urls.push(url);
    }
    for (const [key, m] of Object.entries(e.meshes || {})) {
      const hash = files[m.path];
      if (!fxPath(m.path) || !/^[a-f0-9]{64}$/.test(hash)) { bad = true; break; }
      const url = `/p/${id}/${hash.slice(0, 8)}/${m.path}`;
      meshes[key] = { ...m, url }; urls.push(url);
    }
    if (!bad) out.push({ at: ['fx', id], value: { ...e, id, images, meshes }, urls });
  }
  return out;
}

/** A power-of-two-ish shelf keeps plugin textures on one GPU texture when they fit; null keeps them separate. */
const ATLAS_MAX = 2048;
const ATLAS_PAD = 2;
export function planPluginAtlas(ns, effects) {
  const parts = [];
  for (const [key, t] of Object.entries(effects?.textures || {})) {
    const img = effects.images?.[t.path];
    const w = Number(img?.w), h = Number(img?.h);
    if (!img?.url || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > ATLAS_MAX || h > ATLAS_MAX) return null;
    parts.push({ key: ns + key, url: img.url, w, h });
  }
  if (parts.length < 2) return null;
  parts.sort((a, b) => b.h - a.h || b.w - a.w || a.key.localeCompare(b.key));
  let x = ATLAS_PAD, y = ATLAS_PAD, row = 0, width = 0, height = 0;
  for (const part of parts) {
    if (x + part.w + ATLAS_PAD > ATLAS_MAX) { x = ATLAS_PAD; y += row + ATLAS_PAD; row = 0; }
    if (y + part.h + ATLAS_PAD > ATLAS_MAX) return null;
    part.x = x; part.y = y;
    x += part.w + ATLAS_PAD; row = Math.max(row, part.h); width = Math.max(width, x); height = Math.max(height, y + part.h + ATLAS_PAD);
  }
  return { key: ns + '__atlas', w: Math.max(1, width), h: Math.max(1, height), parts };
}

/** Point a prefab's material slots at the atlas and combine each slot's own ST with the atlas rectangle. */
function useAtlas(d, atlas) {
  const parts = new Map(atlas.parts.map(p => [p.key, p]));
  if (Array.isArray(d.textures) && d.textures.some(k => !parts.has(k))) return false;
  for (const m of d.materials || []) {
    for (const t of Object.values(m.textures || {})) {
      if (!t || typeof t.tex !== 'string') continue;
      const p = parts.get(t.tex);
      if (!p) continue;
      const st = Array.isArray(t.st) && t.st.length === 4 && t.st.every(Number.isFinite) ? t.st : [1, 1, 0, 0];
      t.tex = atlas.key;
      t.st = [st[0] * p.w / atlas.w, st[1] * p.h / atlas.h,
        (p.x + st[2] * p.w) / atlas.w, (atlas.h - p.y - p.h + st[3] * p.h) / atlas.h];
    }
  }
  d.textures = [atlas.key];
  return true;
}

/** Merge a fragment without mutating the official index, or replacing any official key. */
export function mergePluginFx(index, effects) {
  const idx = { ...(index || { format: 'fx-index', version: 3 }), units: { ...index?.units }, skills: { ...index?.skills },
    prefabs: { ...index?.prefabs }, skins: { ...index?.skins }, projectiles: { ...index?.projectiles }, pluginUnits: {} };
  const descriptors = new Map(), textures = {}, meshes = {}, books = new Map(), bindings = {}, silent = new Set(), atlases = {};
  for (const [id, e] of Object.entries(effects || {})) {
    if (!validPluginFx(id, e)) continue;
    const ns = fxNamespace(id), ix = e.index;
    const names = new Set([...Object.keys(ix?.prefabs || {}), ...Object.keys(ix?.skills || {}), ...Object.keys(e.textures || {}), ...Object.keys(e.meshes || {})]);
    const rewrite = (v, key = '') => {
      if (typeof v === 'string') return names.has(v) && !['name', 'class', 'role', 'kind', 'from', 'ability', 'rootClass'].includes(key) ? ns + v : v;
      if (Array.isArray(v)) return v.map(x => rewrite(x, key));
      if (!v || typeof v !== 'object') return v;
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [key === 'skills' ? ns + k : k, rewrite(x, k)]));
    };
    for (const [key, u] of Object.entries(ix?.units || {})) { idx.units[ns + key] = rewrite(u); idx.pluginUnits[key] = ns + key; }
    for (const [key, s] of Object.entries(ix?.skills || {})) idx.skills[ns + key] = rewrite(s);
    for (const [key, p] of Object.entries(ix?.prefabs || {})) idx.prefabs[ns + key] = { ...p };
    const planned = e.config.atlas ? planPluginAtlas(ns, e) : null;
    // Only use the page when every prefab names textures it contains; an unexpected key keeps the individual files.
    const atlasKeys = new Set((planned?.parts || []).map(p => p.key));
    const atlas = planned && Object.values(e.prefabs || {}).every(d => (d.textures || []).every(k => atlasKeys.has(ns + k))) ? planned : null;
    if (atlas) atlases[atlas.key] = atlas;
    for (const [key, d] of Object.entries(e.prefabs || {})) {
      const def = rewrite(d);
      if (atlas) useAtlas(def, atlas);
      descriptors.set(ns + key, def);
    }
    if (!atlas) for (const [key, t] of Object.entries(e.textures || {})) {
      const img = e.images[t.path];
      if (img) textures[ns + key] = { path: img.url, w: img.w, h: img.h };
    }
    for (const [key, m] of Object.entries(e.meshes || {})) if (m.url) meshes[ns + key] = m.url;
    for (const [key, b] of Object.entries(e.config.flipbooks || {})) if (e.images[b.image]) books.set(ns + key, { ...b, ...e.images[b.image] });
    for (const [unit, skills] of Object.entries(e.config.bind || {})) {
      bindings[unit] = Object.fromEntries(Object.entries(skills).map(([s, phases]) => [s, Object.fromEntries(Object.entries(phases).map(([phase, key]) => [phase, ns + key]))]));
    }
    for (const phase of e.config.silentPhases || []) silent.add(phase);
  }
  return { index: idx, descriptors, textures, meshes, books, bindings, silent, atlases };
}
