// shared/clip.js — the extension-less route of the client's own video clips (/clip/<name>).
//
// The same download-manager trick as /media/ (audio, shared/media.js) and /scene/ (the battlefield bundles,
// shared/scene.js): `/assets/loading/boot.mp4` is a 12 MB video, and a manager that hijacks a fetch whose URL ends in
// a media extension leaves the boot screen without its background clip. A path with no extension matches none of the
// download types such a manager reacts to.
//
// Both sides import this module: the browser to build the URL (public/js/preload.js), the server to resolve it
// (server/http/clip.js).

/** Prefix of the extension-less clip route served by `server/http/clip.js`. */
export const CLIP_PREFIX = '/clip/';

/** Clip name → the file it resolves to under `public/assets/`. */
export const CLIP_PARTS = Object.freeze({ boot: 'loading/boot.mp4' });

/**
 * A clip through the extension-less route, versioned with the `?v=` the file's cache-busting uses:
 * `clipUrl('boot', 2)` → '/clip/boot?v=2'.
 * @param {string} name
 * @param {number|string} [v]
 * @returns {string}
 */
export function clipUrl(name, v) {
  return `${CLIP_PREFIX}${encodeURIComponent(String(name))}${v == null ? '' : `?v=${encodeURIComponent(String(v))}`}`;
}

/**
 * The file a `/clip/<name>` request names, or null when the name is not one of ours.
 * @param {string} name
 * @returns {string | null}
 */
export function clipFile(name) {
  return Object.prototype.hasOwnProperty.call(CLIP_PARTS, name) ? CLIP_PARTS[name] : null;
}
