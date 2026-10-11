// ui/install.js — the「添加到桌面」PWA install button on the title screen, built on the browser's own install prompt:
//   beforeinstallprompt → prompt(). Nothing is faked: the service below only exposes the button while the browser has
//   actually offered an install (which requires an installable app — a linked manifest + icons; a service worker was
//   required on older Chromium, but Chrome 108/112+ dropped that and this build ships none, like upstream); when the
//   app is already installed / running standalone, when the event never fires, or when the browser cannot prompt, the
//   button stays hidden (graceful no-op). On a platform whose browser has NO prompt event but a manual install
//   affordance (iOS / iPadOS Safari) a short hint is shown instead.
//
// `createPwaInstall(win)` takes the window (defaults to globalThis) so the whole thing is unit-testable with a fake
// EventTarget (test/ui/title-surfaces.test.js) — no DOM needed here. The UI is InstallButton below.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button } from './components.js';
import { t, N_ } from '../../../shared/i18n.js';

/**
 * Whether an install offer should surface the button: the browser offered one, the app is not already installed, and
 * it is not running standalone. Pure.
 * @param {{ hasOffer?: boolean, installed?: boolean, standalone?: boolean }} s
 * @returns {boolean}
 */
export function installVisible({ hasOffer = false, installed = false, standalone = false } = {}) {
  return !!hasOffer && !installed && !standalone;
}

/** iOS / iPadOS (Safari's manual 添加到主屏幕 has no beforeinstallprompt). */
export function isIos(win = globalThis) {
  const ua = String(win?.navigator?.userAgent || '');
  return /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports a desktop UA for compatibility; the touch + MacIntel signature catches it.
    || (win?.navigator?.platform === 'MacIntel' && Number(win?.navigator?.maxTouchPoints) > 1);
}

/**
 * The short hint to show when the browser cannot prompt but the player can still install manually, else null.
 * @param {{ hasOffer?: boolean, installed?: boolean, standalone?: boolean, ios?: boolean }} s
 * @returns {string|null} a msgid
 */
export function installHintMessage({ hasOffer = false, installed = false, standalone = false, ios = false } = {}) {
  if (installVisible({ hasOffer, installed, standalone })) return null;
  if (installed || standalone) return null;
  return ios ? N_('请在浏览器菜单中选择「添加到主屏幕」') : null;
}

/**
 * The install-prompt service. Tracks `beforeinstallprompt` / `appinstalled` and the standalone display mode, and
 * exposes the defered prompt once (a dismissal or a rejected prompt consumes it, like the browser does).
 * @param {any} [win] the window to observe (defaults to globalThis)
 */
export function createPwaInstall(win = globalThis) {
  let deferred = null;
  let installed = false;
  const listeners = new Set();
  let display = null;
  try { display = win?.matchMedia?.('(display-mode: standalone)') || null; } catch { display = null; }
  const standalone = () => !!display?.matches || !!win?.navigator?.standalone;
  const available = () => installVisible({ hasOffer: !!deferred && typeof deferred.prompt === 'function', installed, standalone: standalone() });
  const notify = () => { for (const fn of [...listeners]) { try { fn(available()); } catch { /* ignore */ } } };
  const onBeforeInstall = (e) => {
    if (installed || standalone()) return;
    if (!e || typeof e.prompt !== 'function') return;
    e.preventDefault?.();
    deferred = e;
    notify();
  };
  const onAppInstalled = () => { installed = true; deferred = null; notify(); };
  const onDisplayChange = () => notify();
  win?.addEventListener?.('beforeinstallprompt', onBeforeInstall);
  win?.addEventListener?.('appinstalled', onAppInstalled);
  display?.addEventListener?.('change', onDisplayChange);
  return {
    /** Is the button to be shown right now? */
    available,
    /** Subscribe to availability changes (immediately called with the current value); returns the unsubscribe. */
    subscribe(fn) { listeners.add(fn); fn(available()); return () => listeners.delete(fn); },
    /** Prompt once; resolves whether the player accepted. A consumed/thrown prompt resolves false. */
    async request() {
      if (!available()) return false;
      const offer = deferred;
      deferred = null;
      notify();
      try {
        const result = await offer.prompt();
        const choice = offer.userChoice ? await offer.userChoice : result;
        return choice?.outcome === 'accepted';
      } catch { return false; }
    },
    /** Remove every listener (tests). */
    dispose() {
      win?.removeEventListener?.('beforeinstallprompt', onBeforeInstall);
      win?.removeEventListener?.('appinstalled', onAppInstalled);
      display?.removeEventListener?.('change', onDisplayChange);
      deferred = null;
      listeners.clear();
    },
  };
}

/** The page-wide install service (created once; the component below reads it). */
export const installer = createPwaInstall(globalThis.window ?? globalThis);

/** The 「添加到桌面」 button; renders the manual-install hint on iOS and nothing when there is no offer. */
export function InstallButton({ class: cls }) {
  const [available, setAvailable] = useState(() => installer.available());
  useEffect(() => installer.subscribe(setAvailable), []);
  if (available) {
    return html`<${Button} variant="secondary" size="sm" icon="homePlus" class=${cls}
      data-testid="pwa-install" title=${t('添加到桌面')} onClick=${() => installer.request()}>${t('添加到桌面')}<//>`;
  }
  const hint = installHintMessage({ ios: isIos() });
  if (!hint) return null;
  return html`<div class=${`title-install__hint${cls ? ` ${cls}` : ''}`}>${t(hint)}</div>`;
}
