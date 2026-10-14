// shared/scene.js — the extension-less route of a battlefield scene bundle (/scene/<stageId>/bin, …/meta).
//
// The same trick as the audio's /media/ route (shared/media.js): the scene bundle's `scene.bin` is a 2-6 MB
// `application/octet-stream`, exactly what a download manager (IDM / 迅雷 / FDM …) hijacks out of XHR/fetch — with the
// file stolen the 3D board silently falls back to the procedural tiles. A path with no extension matches none of the
// download types such a manager reacts to, so the client asks through /scene/…
//
// Both sides import this module: the browser to build the URL (public/js/render/board3d/load.js, which keeps the
// /assets/… URL as its fallback), the server to resolve it (server/http/scene.js). A second copy of the mapping on one
// side would let them drift apart silently.

/** Prefix of the extension-less scene route served by `server/http/scene.js`. */
export const SCENE_PREFIX = '/scene/';

/** Part name → the file it resolves to under `public/assets/local/scene/<stageId>/`. */
export const SCENE_PARTS = Object.freeze({ meta: 'scene.json', bin: 'scene.bin' });

/** The reverse of SCENE_PARTS: file name → part. */
export const SCENE_FILE_PARTS = Object.freeze({ 'scene.json': 'meta', 'scene.bin': 'bin' });

/**
 * A stage's scene file through the extension-less route: ('act2autochess_m04', 'bin') → '/scene/act2autochess_m04/bin'.
 * @param {string} stageId
 * @param {'meta'|'bin'} part
 * @returns {string}
 */
export function sceneRouteUrl(stageId, part) {
  return `${SCENE_PREFIX}${encodeURIComponent(String(stageId))}/${part}`;
}

/**
 * The file a `/scene/<stageId>/<part>` request names, or null when the request is not one of ours.
 * @param {string} part
 * @returns {string | null}
 */
export function scenePartFile(part) {
  return Object.prototype.hasOwnProperty.call(SCENE_PARTS, part) ? SCENE_PARTS[part] : null;
}
