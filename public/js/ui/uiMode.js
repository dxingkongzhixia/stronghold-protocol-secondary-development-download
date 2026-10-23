// Which main interface this page loads. The server's choice arrives as window.__SP_UI__ from /ui-config.js (written by
// the admin page, no restart needed); `?ui=hub` / `?ui=classic` previews a variant in this tab only, so the operator can
// compare both interfaces without moving everyone else. The game, room and match screens are identical either way.

/** @typedef {'hub'|'classic'} UiMode */
export const UI_MODES = Object.freeze(['hub', 'classic']);
export const DEFAULT_UI_MODE = /** @type {UiMode} */ ('hub');

/** A valid mode, or null. @param {unknown} value @returns {UiMode|null} */
export function parseUiMode(value) {
  return value === 'hub' || value === 'classic' ? value : null;
}

/** The server's persisted choice. @returns {UiMode} */
export function serverUiMode() {
  try {
    return parseUiMode(globalThis.__SP_UI__?.main) || DEFAULT_UI_MODE;
  } catch {
    return DEFAULT_UI_MODE;
  }
}

/** The one-shot `?ui=` preview of this page load (never persisted). @param {string} [search] @returns {UiMode|null} */
export function previewUiMode(search = globalThis.location?.search || '') {
  try {
    return parseUiMode(new URLSearchParams(search).get('ui'));
  } catch {
    return null;
  }
}

/** What main.js should import: the preview wins, else the server's choice. @returns {UiMode} */
export function effectiveUiMode() {
  return previewUiMode() || serverUiMode();
}
