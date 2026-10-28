// Dynamic-illustration backdrop (official L2D outfits, 动态皮肤).
//
// The art is machine-local: `tools/local-extract/dynillust.py` unpacks one outfit's Spine set from the official
// client into `public/assets/dynillust/<slug>/` and writes the `index.json` this module reads. Nothing here ships
// art, and a server without the folder simply has no entries (the picker hides the tile).
//
// The hub draws one skeleton on a PIXI canvas sized to cover the viewport: its `Idle` loop (or the longest clip when
// the model names it something else). `pref.motion` off → a still frame; `prefers-reduced-motion` is the same.

const ROOT = '/assets/dynillust';
const INDEX_URL = `${ROOT}/index.json`;
const ID_RE = /^[A-Za-z0-9_@#.\/-]{1,96}$/;
const PATH_RE = /^[A-Za-z0-9_@#.\/-]{1,160}$/;

let indexPromise = null;

/** A stored skin id is only kept when it is a plain path/id (never a URL). */
export function sanitizeDynId(raw) {
  return typeof raw === 'string' && ID_RE.test(raw) ? raw : null;
}

/** The main illustration part of an index entry (`_Start` entrances are extra parts). */
export function dynEntryPart(entry) {
  const parts = Array.isArray(entry?.parts) ? entry.parts : [];
  return parts.find((p) => p && p.part === 'main') || parts[0] || null;
}

/** Whether an index record can be mounted (paths must stay inside /assets/dynillust). */
export function validDynEntry(entry) {
  if (!entry || typeof entry !== 'object' || !sanitizeDynId(entry.id)) return false;
  const part = dynEntryPart(entry);
  if (!part) return false;
  const fields = [part.skel, part.atlas, ...(Array.isArray(part.textures) ? part.textures : [])];
  return fields.length > 0 && fields.every((f) => typeof f === 'string' && PATH_RE.test(f) && !f.startsWith('/')
    && f.split('/').every((seg) => seg && seg !== '.' && seg !== '..'));
}

/** Absolute URL of one file of a part. */
export function dynAssetUrl(path) {
  return `${ROOT}/${String(path).replace(/^\/+/, '')}`;
}

/**
 * Pick the ambient loop: an exact `Idle`, then any idle/default/loop name, then the longest clip.
 * @param {Array<{ name?: string, duration?: number }>} animations
 * @returns {{ name?: string, duration?: number } | null}
 */
export function pickIdle(animations) {
  const list = (Array.isArray(animations) ? animations : []).filter((a) => a && typeof a.name === 'string');
  if (!list.length) return null;
  return list.find((a) => /^idle$/i.test(a.name))
    || list.find((a) => /idle|default|loop/i.test(a.name))
    || list.reduce((best, a) => ((Number(a.duration) || 0) > (Number(best.duration) || 0) ? a : best), list[0]);
}

/**
 * Scale/offset that make a skeleton's local bounds cover a viewport (crop the overflow, never letterbox).
 * @returns {{ scale: number, x: number, y: number }}
 */
export function coverTransform(bounds, width, height, zoom = 1) {
  const bw = Math.max(1, Number(bounds?.width) || 0);
  const bh = Math.max(1, Number(bounds?.height) || 0);
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  const scale = Math.max(w / bw, h / bh) * (Number(zoom) || 1);
  return {
    scale,
    x: w / 2 - ((Number(bounds?.x) || 0) + bw / 2) * scale,
    y: h / 2 - ((Number(bounds?.y) || 0) + bh / 2) * scale,
  };
}

/**
 * The installed dynamic-illustration index (reads `index.json`; revalidates so a fresh extraction shows up).
 * Never rejects: a missing folder is an empty list.
 * @param {{ fetchFn?: typeof fetch }} [o]
 * @returns {Promise<Array<object>>}
 */
export function loadDynIndex({ fetchFn = globalThis.fetch } = {}) {
  if (!indexPromise) {
    indexPromise = Promise.resolve()
      .then(() => fetchFn(INDEX_URL, { cache: 'no-cache' }))
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data) => (Array.isArray(data?.entries) ? data.entries.filter(validDynEntry) : []))
      .catch(() => []);
  }
  return indexPromise;
}

/** Test seam: forget the cached index. */
export function resetDynIndex() { indexPromise = null; }

/**
 * Mount one dynamic illustration into `host` (an empty positioned element). Returns a handle at once; the skeleton
 * loads in the background and the host gains `is-ready` when it draws (or `is-failed`).
 * @param {HTMLElement} host
 * @param {object} entry an index record
 * @param {{ motion?: boolean, onError?: (err: any) => void }} [opts]
 * @returns {{ destroy: () => void }}
 */
export function mountDynIllust(host, entry, { motion = true, onError } = {}) {
  let dead = false, app = null, spine = null, ro = null, onVis = null;
  const part = dynEntryPart(entry);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate = motion && !still;

  const load = async () => {
    if (!host || !part) throw new Error('no dynamic illustration part');
    const { ensurePixi } = await import('../../render/app/pixi.js');
    const PIXI = await ensurePixi();
    if (dead) return;
    app = new PIXI.Application({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, Number(globalThis.devicePixelRatio) || 1),
    });
    host.appendChild(app.view);
    app.ticker.maxFPS = 30; // a backdrop, not a match: half the frames, half the GPU
    const res = await PIXI.Assets.load(dynAssetUrl(part.skel));
    if (dead) return;
    const data = res && (res.spineData || res);
    if (!data || !Array.isArray(data.animations)) throw new Error(`bad spine data: ${part.skel}`);
    spine = new PIXI.spine.Spine(data);
    spine.autoUpdate = false; // one clock: the app ticker below (so a still frame can stop it)
    const idle = pickIdle(data.animations);
    if (idle?.name) { spine.state.setAnimation(0, idle.name, true); spine.state.update(0); }
    app.stage.addChild(spine);

    const fit = () => {
      if (!app || !spine) return;
      const { scale, x, y } = coverTransform(spine.getLocalBounds(), host.clientWidth, host.clientHeight);
      spine.scale.set(scale);
      spine.position.set(x, y);
    };
    app.renderer.resize(host.clientWidth || 1, host.clientHeight || 1);
    fit();
    if (animate) {
      app.ticker.add(() => { if (spine) spine.update(app.ticker.deltaMS / 1000); });
    } else {
      spine.update(0);
      app.ticker.stop();
      app.renderer.render(app.stage);
    }
    ro = new ResizeObserver(() => {
      if (!app) return;
      app.renderer.resize(host.clientWidth || 1, host.clientHeight || 1);
      fit();
      if (!animate) app.renderer.render(app.stage);
    });
    ro.observe(host);
    if (animate) {
      onVis = () => { if (!app) return; if (document.hidden) app.ticker.stop(); else app.ticker.start(); };
      document.addEventListener('visibilitychange', onVis);
    }
    host.classList.add('is-ready');
  };

  load().catch((err) => {
    host?.classList.add('is-failed');
    if (typeof onError === 'function') onError(err);
    else console.warn('[hub] dynamic illustration failed', err);
  });

  return {
    destroy() {
      dead = true;
      if (ro) ro.disconnect();
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      try { if (app) app.destroy(true, { children: true, texture: false, baseTexture: false }); } catch { /* ignore */ }
      app = null; spine = null; ro = null;
      host?.classList.remove('is-ready');
    },
  };
}
