// public/js/render/app/host.js — asset lookup, data lookup and GL teardown for one field view.

import { createAssets, assets as defaultAssets } from '../../assets.js';
import { standInRecord } from '../../../../shared/standIn.js';
import { diyRecordOf } from '../../../../shared/diy.js';

/** Wait for optional assets, or stop waiting when this view is cancelled. Shared loads keep running. */
function withTimeout(p, ms, signal) {
  let timer;
  let onAbort;
  const stopped = new Promise((resolve, reject) => {
    if (ms != null) timer = setTimeout(resolve, ms);
    if (signal) {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
  return Promise.race([p, stopped]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}

/** Wrap whatever the caller passed as `assets` into the store API of public/js/assets.js. */
function resolveAssets(a) {
  if (a && typeof a === 'object' && typeof a.ready === 'function' && typeof a.spineEntry === 'function') return a;
  if (a && typeof a === 'object' && (a.chars || a.enemies || a.version)) return createAssets({ manifest: a });
  return defaultAssets;
}

function makeData(src) {
  const look = (file, id) => {
    if (id == null || id === '') return null;
    try {
      if (src && typeof src.lookup === 'function') return src.lookup(file, id) || null;
      const m = src && src[file];
      if (m instanceof Map) return m.get(id) || null;
      if (m && typeof m === 'object' && Object.hasOwn(m, id)) return m[id] || null;
    } catch { /* ignore */ }
    return null;
  };
  // 0.2.0 补位: the composed stand-in record of a chess (shared/standIn.js over data/backups.json), cached per chess
  const standIns = new Map();
  const backups = () => {
    try { return (src && typeof src.get === 'function' ? src.get('backups') : src && src.backups) || null; } catch { return null; }
  };
  const standIn = (id) => {
    const c = look('chess', id);
    const b = backups();
    if (!c || !b) return null;
    if (standIns.has(c)) return standIns.get(c);
    let rec;
    try { rec = standInRecord(c, b); } catch { rec = null; }
    standIns.set(c, rec);
    return rec;
  };
  // 0.2.0 自选编队: the composed 自选 record of a DIY slot filled with a pick (shared/diy.js over chess.json + backups.json)
  const diys = new Map();
  const chessMap = () => {
    try { return (src && typeof src.get === 'function' ? src.get('chess') : src && src.chess) || null; } catch { return null; }
  };
  const diy = (id, pick) => {
    const c = look('chess', id);
    const b = backups();
    if (!c || !c.isDiy || !b || !pick || typeof pick.charId !== 'string') return null;
    const key = `${id}|${pick.charId}|${pick.skillIndex ?? ''}|${pick.uniEquipId ?? ''}`;
    if (diys.has(key)) return diys.get(key);
    let rec;
    try { rec = diyRecordOf(c, pick, { chess: chessMap(), backups: b }); } catch { rec = null; }
    diys.set(key, rec);
    return rec;
  };
  return {
    // (a 自选 operator's summons are data/backups.json tokens, 0.2.0)
    chess: (id) => look('chess', id), token: (id) => look('tokens', id) || (backups()?.tokens && Object.hasOwn(backups().tokens, id) ? backups().tokens[id] : null), item: (id) => look('items', id),
    enemy: (id) => look('enemies', id), stage: (id) => look('stages', id), bond: (id) => look('bonds', id),
    standIn, diy,
  };
}

const QUALITY_RES = { high: 2, medium: 1.5, low: 1 };

/** Pixel-ratio cap of the 3D board canvas per quality (its fill cost is the PBR board, not the sprites). */
const BOARD_RES = { high: 2, medium: 1.25, low: 1 };

/**
 * Pixel-ratio cap of the sprite canvas (render/app.js `dpr()`). A desktop keeps the quality table; a **coarse pointer**
 * phone / tablet at high quality keeps its own DPR (3–4) so the operators are not upscaled from a 2× buffer — the
 * "blurry operators" the owner reported. Absurd DPRs are still capped at 4.
 */
export function qualityResolution(quality, coarse = false, devicePixelRatio = 1) {
  if (coarse && quality === 'high') return Math.max(3, Math.min(Math.max(1, Number(devicePixelRatio) || 1), 4));
  return QUALITY_RES[quality] || 2;
}

/**
 * Adaptive render-scale factor by load level (0–3). Desktops may drop to 0.55 to hold the frame rate; a coarse pointer
 * stops at 0.8, where a phone's own DPR still leaves the units legible (0.55 × 3 = 1.65 read as blurred).
 */
export function loadRenderScale(level, coarse = false) {
  const table = coarse ? [1, 0.9, 0.82, 0.8] : [1, 0.82, 0.68, 0.55];
  return table[level] || 1;
}

/**
 * Before a renderer is destroyed: free its GL copies of every texture / buffer / geometry / framebuffer it
 * uploaded. Module-level textures (FX atlas, tier chips, backdrop, diamonds, Spine pages, PIXI.Texture.WHITE…)
 * outlive the view; PIXI 7 leaves their per-context GL entries and 'dispose' listeners pointing at the dead
 * renderer, which kept every unmounted view's renderer, canvas and WebGL context reachable.
 */
export function releaseGl(renderer) {
  const ts = renderer && renderer.texture;
  if (ts && Array.isArray(ts.managedTextures) && typeof ts.destroyTexture === 'function') {
    for (const bt of ts.managedTextures.slice()) { try { ts.destroyTexture(bt, true); } catch { /* ignore */ } }
    ts.managedTextures.length = 0;
  }
  for (const sys of [renderer?.geometry, renderer?.buffer, renderer?.framebuffer]) {
    try { if (sys && typeof sys.disposeAll === 'function') sys.disposeAll(false); } catch { /* ignore */ }
  }
  // shader programs are cached globally by source (PIXI.utils.ProgramCache) with one GLProgram per context
  const uid = renderer?.CONTEXT_UID, gl = renderer?.gl;
  const programs = globalThis.PIXI?.utils?.ProgramCache;
  if (uid != null && programs && typeof programs === 'object') {
    for (const prog of Object.values(programs)) {
      const g = prog && prog.glPrograms && prog.glPrograms[uid];
      if (!g) continue;
      try { if (gl && g.program) gl.deleteProgram(g.program); } catch { /* ignore */ }
      delete prog.glPrograms[uid];
    }
  }
}

export { withTimeout, resolveAssets, makeData, QUALITY_RES, BOARD_RES };
