// public/js/ui/uiSfx.js — the UI's own sounds (data/assets.json `audio.sfx.ui`, 60+ official clips).
//
// The Godot build does this with one helper (`ui_layout.gd` `click_sound(button, event)` + the four constants
// ON_DEFAULT_BTN_CLICK / ON_CANCEL_BTN_CLICK / ON_CONFIRM_BTN_CLICK / ON_CHECKBOX_CLICK); we mirror that shape: the
// shared Button plays `sfx` (default `click`) on press, and any element carrying `data-sfx="<name>"` plays that name
// when clicked — one document listener instead of wiring every card. Unknown names are ignored by `audio.sfx()`.
import { audio } from '../audio.js';

/**
 * Play one UI sound by its `audio.sfx.ui` key. Best effort: a missing clip or a suspended AudioContext is not an error.
 * @param {string|null|undefined} name
 */
export function playUiSfx(name) {
  if (!name) return;
  try { audio.sfx(name); } catch { /* audio is best effort */ }
}

/**
 * Install the single delegated listener for `[data-sfx]` elements. Elements inside a `.btn` are skipped: the Button
 * already played its own sound, and one press must not double up.
 * @param {Document} [doc]
 */
export function installUiSfx(doc = globalThis.document) {
  if (!doc || /** @type {any} */ (doc).__spUiSfx) return;
  /** @type {any} */ (doc).__spUiSfx = true;
  doc.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const el = target?.closest?.('[data-sfx]');
    if (!el) return;
    if (el.closest('.btn')) return;
    if (el.getAttribute('aria-disabled') === 'true' || /** @type {any} */ (el).disabled) return;
    playUiSfx(/** @type {HTMLElement} */ (el).dataset.sfx);
  }, true);
}
