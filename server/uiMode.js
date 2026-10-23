// The main-interface switch (docs/UI-HUB.md): the classic lobby or the Hub skin. Stored outside data/ and the code
// tree, so a deploy never overwrites the operator's choice; read per request (the file is tiny) and served to the
// browser as /ui-config.js. Both interfaces stay in the repository — this only selects which one main.js imports.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The accepted values, in the order the admin page shows them. */
export const UI_MODES = Object.freeze(['hub', 'classic']);
/** A fresh install shows the new Hub interface; the admin page can switch back at any time. */
export const DEFAULT_UI_MODE = 'hub';

/**
 * The stored mode, or null when the file is absent / unreadable / invalid (callers fall back to DEFAULT_UI_MODE).
 * @param {string} root repository root
 * @param {string} [file] override for tests
 * @returns {'hub'|'classic'|null}
 */
export function readStoredUiMode(root, file = join(root, 'var', 'ui.json')) {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parseUiMode(parsed?.main);
  } catch {
    return null;
  }
}

/** The effective mode: the stored one, else the default. @param {string} root */
export function readUiMode(root) {
  return readStoredUiMode(root) || DEFAULT_UI_MODE;
}

/** A mode identifier, or null for anything else. @param {unknown} value */
export function parseUiMode(value) {
  return value === 'hub' || value === 'classic' ? value : null;
}

/**
 * Persist the operator's choice atomically (write a temp file, then rename). Never throws for a bad mode: the caller
 * validates first and gets null back.
 * @param {string} root @param {unknown} mode @param {string} [file]
 * @returns {'hub'|'classic'|null} the saved mode
 */
export function writeUiMode(root, mode, file = join(root, 'var', 'ui.json')) {
  const clean = parseUiMode(mode);
  if (!clean) return null;
  mkdirSync(join(root, 'var'), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ main: clean }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  return clean;
}

/**
 * The body of GET /ui-config.js: a tiny classic script, evaluated before main.js, that tells the client which main
 * interface to import. `no-store` at the HTTP layer, so a change reaches the next page load without a restart.
 * @param {'hub'|'classic'} mode
 */
export function uiConfigScript(mode) {
  return `window.__SP_UI__ = ${JSON.stringify({ main: parseUiMode(mode) || DEFAULT_UI_MODE })};\n`;
}
