// public/js/ui/themeCharacter.js — mount a theme pack's Spine character (spTheme P3b). The pack's skeleton / atlas /
// page pictures are blob URLs (themePacks.js); this module loads PIXI + pixi-spine on demand (render/app/pixi.js),
// builds the skeleton with the atlas pages already decoded, and plays its idle clip on a transparent canvas behind the
// title's DOM. Any failure mounts nothing: the static `character.image` stays as the fallback.
//
// No pack file is fetched from anywhere but its own blob URL. The canvas is pointer-events:none; a theme switch or a
// screen unmount destroys the renderer and its textures.

import { ensurePixi } from '../render/app/pixi.js';

let mounted = null;

const base = (p) => String(p || '').split('/').pop().toLowerCase();

/** Load one image into a PIXI texture, or null. */
function loadTexture(P, url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { try { resolve(P.Texture.from(img)); } catch { resolve(null); } };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Mount a Spine character over `host` (default `.title-bg`).
 * @param {{ skel?: string, atlas?: string, idle?: string, pages?: { name: string, url: string }[], host?: Element|null }} opts
 * @returns {Promise<object|null>} the mount record, or null
 */
export async function mountThemeCharacter(opts = {}) {
  unmountThemeCharacter();
  if (typeof document === 'undefined' || !opts.skel || !opts.atlas) return null;
  // the pack may be applied at boot, before the title screen exists: wait for its backdrop briefly
  const host = opts.host || await new Promise((resolve) => {
    const found = document.querySelector('.title-bg');
    if (found) { resolve(found); return; }
    if (!document.body) { resolve(null); return; }
    const ob = new MutationObserver(() => {
      const h = document.querySelector('.title-bg');
      if (h) { ob.disconnect(); resolve(h); }
    });
    ob.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { ob.disconnect(); resolve(null); }, 15000);
  });
  if (!host) return null;
  try {
    const P = await ensurePixi();
    const atlasText = await (await fetch(opts.atlas)).text();
    const pages = Array.isArray(opts.pages) ? opts.pages : [];
    const textures = new Map();
    await Promise.all(pages.map(async (pg) => {
      const tex = await loadTexture(P, pg.url);
      if (tex) {
        textures.set(String(pg.name || '').toLowerCase(), tex);
        textures.set(base(pg.name), tex);
      }
    }));
    // the atlas page name is its first line (after the optional blank lines) — resolve it to the decoded texture
    const atlas = new P.spine.TextureAtlas(atlasText, (name, cb) => {
      cb(textures.get(String(name || '').toLowerCase()) || textures.get(base(name)) || null);
    });
    if (!atlas.pages.length) throw new Error('atlas has no pages');
    const json = /\.json$/i.test(opts.skel);
    let data;
    if (json) data = new P.spine.SkeletonJson(atlas).readSkeletonData(await (await fetch(opts.skel)).json());
    else data = new P.spine.SkeletonBinary(atlas).readSkeletonData(new Uint8Array(await (await fetch(opts.skel)).arrayBuffer()));
    const spine = new P.spine.Spine(data);
    const app = new P.Application({ backgroundAlpha: 0, antialias: true, autoDensity: true, resizeTo: host, resolution: Math.min(2, globalThis.devicePixelRatio || 1) });
    app.view.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
    host.appendChild(app.view);
    app.stage.addChild(spine);
    // fit the skeleton into the right part of the title, feet on the bottom edge
    const box = spine.getLocalBounds();
    const w = Math.max(1, box.width), h = Math.max(1, box.height);
    const scale = Math.min((host.clientWidth || 1280) * 0.4 / w, (host.clientHeight || 720) * 0.92 / h);
    spine.scale.set(scale);
    spine.x = (host.clientWidth || 1280) * 0.8;
    spine.y = (host.clientHeight || 720) * 0.98;
    const anim = spine.spineData.findAnimation(opts.idle || 'Idle') ? (opts.idle || 'Idle') : (spine.spineData.animations[0]?.name ?? null);
    if (anim) spine.state.setAnimation(0, anim, true);
    mounted = { app, spine, view: app.view };
    document.documentElement.dataset.themeCharacter = 'spine';
    return mounted;
  } catch {
    unmountThemeCharacter();
    return null;
  }
}

/** Remove the mounted character and free its renderer. Safe when nothing is mounted. */
export function unmountThemeCharacter() {
  if (typeof document !== 'undefined') delete document.documentElement.dataset.themeCharacter;
  if (!mounted) return;
  const { app, spine } = mounted;
  mounted = null;
  try { spine?.destroy?.({ children: true }); } catch { /* ignore */ }
  try { app?.destroy?.(true, { children: true, texture: false, baseTexture: false }); } catch { /* ignore */ }
  try { app?.view?.remove(); } catch { /* ignore */ }
}
