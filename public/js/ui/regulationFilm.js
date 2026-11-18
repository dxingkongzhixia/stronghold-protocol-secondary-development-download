// regulationFilm.js — 规程's opening before the hub: the client's own season entry (the mainline's opening chapter; this tree has no such section number).
//
// A 规程 start plays the activity's panel_act3autochess_on_entry with its legacy clip autochess_entry_season_on
// (3.17 s: a black cover lifts off a red "loading" screen — four ID cards, the map with its lines, the percent counter,
// COMPLETE —, then the season emblem breaks out between expanding rings and the season ground zooms in under the
// title art) and the cards' flicker autochess_season_on_entry_loop. The frames come from tools/local-extract/
// season_entry.py's export (data/local-assets.json group `ui/season/act3autochess/entry`: prefabs.json + sprites).
//
// Ported from the mainline's ui/regulationFilm.js, with its own small player instead of their prefab-pack renderer
// (ui/prefab/{layout,anim,player,view}.js, which this fork never took): boxes from RectTransform anchors / pivot /
// sizeDelta / anchoredPosition, curves evaluated as Unity's AnimationCurve (cubic Hermite, an infinite slope holds the
// left key), images drawn as CSS backgrounds. Layout groups, text and 9-slice are not modelled — the opening draws none
// of its beats through them.
import { useEffect, useRef } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { data, localAsset } from '../data.js';

/** The local-client group of 规程's season entry (tools/local-extract/season_entry.py). */
export const REGULATION_ENTRY = 'ui/season/act3autochess/entry';
export const ENTRY_PREFAB = 'panel_act3autochess_on_entry';
export const ENTRY_CLIP = 'autochess_entry_season_on';
const LOOP_CLIP = 'autochess_season_on_entry_loop';
/** The official UI canvas (CanvasScaler reference resolution), expanded to the screen's aspect. */
export const REF_W = 1280;
export const REF_H = 720;
/** Film seconds: the entry clip runs 0 → 3.17 s, then the overlay fades into the hub. */
export const REG_SPAN = Object.freeze({ fadeAt: 3.2, to: 3.6 });

// ---- Unity AnimationCurve (ui/prefab/anim.js) ---------------------------------------------------
const INF = 1e8;

function hermite(v0, m0, v1, m1, dt, u) {
  if (Math.abs(m0) >= INF || Math.abs(m1) >= INF) return v0;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 * dt + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1 * dt;
}

/** A scalar curve at time t. @param {any[]} keys [time, value, inSlope, outSlope] @param {number} t */
function evalKeys(keys, t) {
  const n = keys.length;
  if (!n) return 0;
  if (t <= keys[0][0]) return Number(keys[0][1]);
  if (t >= keys[n - 1][0]) return Number(keys[n - 1][1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid][0] <= t) lo = mid; else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  const dt = b[0] - a[0];
  return hermite(Number(a[1]), Number(a[3]), Number(b[1]), Number(b[2]), dt, dt > 0 ? (t - a[0]) / dt : 0);
}

/** Clip time after its wrap mode (2 loop, 4 ping-pong; else it clamps). */
function clipTime(clip, t) {
  const len = Number(clip?.len) || 0;
  if (len <= 0) return 0;
  if (clip.wrap === 2) return ((t % len) + len) % len;
  if (clip.wrap === 4) {
    const k = ((t % (2 * len)) + 2 * len) % (2 * len);
    return k <= len ? k : 2 * len - k;
  }
  return Math.min(Math.max(t, 0), len);
}

/** The node a clip path names under `from` ('' is `from` itself); each segment the first child of that name. */
function resolvePath(from, path) {
  let cur = from;
  for (const seg of String(path || '').split('/')) {
    if (!seg) continue;
    cur = (cur?.children || []).find((c) => c.name === seg) || null;
    if (!cur) return null;
  }
  return cur;
}

// ---- layout (RectTransform, ui/prefab/layout.js place()) ---------------------------------------
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (v, d) => (Array.isArray(v) && v.length >= 2 ? [num(v[0], d[0]), num(v[1], d[1])] : d.slice());

/** A node's rect with the frame's overrides. */
function rectOf(node, pose) {
  const r = node.rect || {};
  const p = pose.get(node) || {};
  return {
    min: vec(r.anchors?.min, [0.5, 0.5]),
    max: vec(r.anchors?.max, [0.5, 0.5]),
    pivot: vec(r.pivot, [0.5, 0.5]),
    size: [p.sw ?? num((r.sizeDelta || [])[0]), p.sh ?? num((r.sizeDelta || [])[1])],
    pos: [p.ax ?? num((r.anchoredPosition || [])[0]), p.ay ?? num((r.anchoredPosition || [])[1])],
  };
}

/**
 * Lay the tree out for one frame: Unity boxes (y up, bottom-left) → top-left boxes per parent, each node's style.
 * @param {any} node @param {{x:number,y:number,w:number,h:number}} rect @param {Map<any, any>} pose
 * @param {number} px @param {number} py @param {any[]} out
 */
function place(node, rect, pose, px, py, out, parentAlpha) {
  const p = pose.get(node) || {};
  const r = rectOf(node, pose);
  if (p.active === false) return;
  const alpha = parentAlpha * (p.alpha ?? (Number.isFinite(Number(node.alpha)) ? Number(node.alpha) : 1));
  out.push({ node, left: rect.x - px, top: py - (rect.y + rect.h), w: rect.w, h: rect.h, pivot: r.pivot, alpha, imgA: p.ia ?? 1 });
  const top = rect.y + rect.h;
  for (const child of node.children || []) {
    const c = rectOf(child, pose);
    const size = [0, 1].map((axis) => (c.max[axis] - c.min[axis]) * (axis === 0 ? rect.w : rect.h) + c.size[axis]);
    const at = [0, 1].map((axis) => {
      const lo = (axis === 0 ? rect.x : rect.y) + c.min[axis] * (axis === 0 ? rect.w : rect.h);
      const hi = (axis === 0 ? rect.x : rect.y) + c.max[axis] * (axis === 0 ? rect.w : rect.h);
      return lo + (hi - lo) * c.pivot[axis] + c.pos[axis];
    });
    place(child, { x: at[0] - c.pivot[0] * size[0], y: at[1] - c.pivot[1] * size[1], w: size[0], h: size[1] }, pose, rect.x, top, out, alpha);
  }
}

/** The frame's overrides from both clips, keyed by node. */
function poseAt(doc, t) {
  const root = doc.prefabs[ENTRY_PREFAB];
  const pose = new Map();
  const set = (n, k, v) => { const e = pose.get(n) || {}; e[k] = v; pose.set(n, e); };
  const run = (clip, time) => {
    for (const [path, prop, keys] of clip?.curves || []) {
      const n = resolvePath(root, path);
      if (!n) continue;
      const v = evalKeys(keys, clipTime(clip, time));
      if (prop === 'img.a') set(n, 'ia', v);
      else if (prop === 'alpha') set(n, 'alpha', v);
      else if (prop === 'ax') set(n, 'ax', v);
      else if (prop === 'ay') set(n, 'ay', v);
      else if (prop === 'sw') set(n, 'sw', v);
      else if (prop === 'sh') set(n, 'sh', v);
      else if (prop === 'scale') set(n, 'scale', v);
      else if (prop === 'rot') set(n, 'rot', v);
      else if (prop === 'active') set(n, 'active', v > 0.5);
    }
  };
  run(doc.clips[ENTRY_CLIP], t);
  run(doc.clips[LOOP_CLIP], t);
  return pose;
}

// ---- the pack -----------------------------------------------------------------------------------
let packLoad = null;

/**
 * The opening's pack (prefabs.json plus its sprite URLs), or null when the group is not extracted.
 * @returns {Promise<{ doc: any, urls: Map<string, string> } | null>}
 */
export function loadRegulationPack() {
  if (packLoad) return packLoad;
  packLoad = (async () => {
    try { await data.load('local'); } catch { return null; }
    const url = localAsset(REGULATION_ENTRY, 'prefabs.json');
    if (!url) return null;
    try {
      const res = await fetch(url);
      const doc = res.ok ? await res.json() : null;
      if (!doc || doc.spPrefabs !== 1 || !doc.prefabs?.[ENTRY_PREFAB] || !doc.clips?.[ENTRY_CLIP]) return null;
      const urls = new Map();
      const walk = (n) => {
        const f = n.image?.file;
        if (f) { const u = localAsset(REGULATION_ENTRY, f); if (u) urls.set(f, u); }
        for (const c of n.children || []) walk(c);
      };
      walk(doc.prefabs[ENTRY_PREFAB]);
      await Promise.all([...urls.values()].map((u) => new Promise((done) => { const img = new Image(); img.onload = img.onerror = done; img.src = u; })));
      return { doc, urls };
    } catch { return null; }
  })();
  return packLoad;
}

/** Forget the loaded pack (tests; a page keeps its first look). */
export function clearRegulationPack() { packLoad = null; }

// ---- the player ----------------------------------------------------------------------------------
/**
 * 规程's opening as an overlay: plays once (3.17 s) and calls `onDone` after the fade.
 * @param {{ pack: { doc: any, urls: Map<string, string> }, onDone: () => void }} props
 */
export function RegulationFilm({ pack, onDone }) {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    if (!el || !pack) return undefined;
    const { doc, urls } = pack;
    const rootNode = doc.prefabs[ENTRY_PREFAB];
    const stage = document.createElement('div');
    stage.className = 'reg-film__stage';
    el.appendChild(stage);
    // one DOM node per prefab node, in tree order
    const dom = new Map();
    const build = (n, parent) => {
      const d = document.createElement('div');
      d.className = 'reg-film__node';
      const im = n.image;
      if (im?.file && urls.get(im.file)) {
        d.style.backgroundImage = `url("${urls.get(im.file)}")`;
        d.style.backgroundSize = im.type === 'tiled' ? 'auto' : '100% 100%';
        d.style.backgroundRepeat = im.type === 'tiled' ? 'repeat' : 'no-repeat';
        if (im.color && im.color !== '#FFFFFF') d.style.backgroundColor = im.color;
      } else if (im?.color) {
        d.style.backgroundColor = im.color;
      }
      if (n.mask) d.style.overflow = 'hidden';
      if (n.fx) d.style.display = 'none';
      dom.set(n, d);
      parent.appendChild(d);
      for (const c of n.children || []) build(c, d);
    };
    build(rootNode, stage);
    for (const n of dom.keys()) {
      const d = dom.get(n);
      d.style.position = 'absolute';
      d.style.transformOrigin = '50% 50%';
    }
    let raf = 0;
    const start = performance.now();
    const fit = () => {
      const s = Math.max(el.clientWidth / REF_W, el.clientHeight / REF_H);
      stage.style.transform = `scale(${s})`;
    };
    fit();
    const tick = (now) => {
      const t = (now - start) / 1000;
      const pose = poseAt(doc, Math.min(t, 3.1667 + 1));
      const out = [];
      place(rootNode, { x: 0, y: 0, w: REF_W, h: REF_H }, pose, 0, REF_H, out, 1);
      for (const b of out) {
        const d = dom.get(b.node);
        if (!d) continue;
        const p = pose.get(b.node) || {};
        d.style.display = b.alpha <= 0.001 ? 'none' : '';
        d.style.left = `${b.left}px`;
        d.style.top = `${b.top}px`;
        d.style.width = `${Math.max(0, b.w)}px`;
        d.style.height = `${Math.max(0, b.h)}px`;
        d.style.opacity = String(Math.max(0, Math.min(1, b.alpha * b.imgA)));
        const sc = p.scale != null ? p.scale : (Array.isArray(b.node.scale) ? b.node.scale[0] : 1);
        const rot = p.rot != null ? p.rot : (num(b.node.rot) || 0);
        d.style.transform = `${sc !== 1 ? `scale(${sc}) ` : ''}${rot ? `rotate(${-rot}deg)` : ''}`.trim();
        d.style.transformOrigin = `${b.pivot[0] * 100}% ${(1 - b.pivot[1]) * 100}%`;
      }
      if (t < REG_SPAN.fadeAt) raf = requestAnimationFrame(tick);
      else if (t < REG_SPAN.to) { el.style.opacity = String(Math.max(0, 1 - (t - REG_SPAN.fadeAt) / (REG_SPAN.to - REG_SPAN.fadeAt))); raf = requestAnimationFrame(tick); }
      else { onDone?.(); }
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => fit();
    addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); stage.remove(); };
  }, [pack, onDone]);
  return html`<div class="reg-film" ref=${host} aria-hidden="true"></div>`;
}
