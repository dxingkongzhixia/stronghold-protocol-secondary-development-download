// ui/notice.js — the operator notice banner (docs/MATCHMAKING.md §28): a `sys.notice` push from the admin page
// (server/lobby.js `broadcastNotice`, usually a deploy / restart heads-up signed `d星空之下`) shown as a dismissable
// strip at the top centre — over the lobby AND over a running match, so nobody misses it. `store.notice` holds the
// latest one; 知道了 clears it (the next push opens it again). The official-address reminder renders its address as a
// real link plus a copy button. A toast (main.js) announces it on arrival.

import { html, Button, Icon } from './components.js';
import { store, useStore } from '../store.js';
import { useState } from '../../vendor/hooks.module.js';
import { OFFICIAL_ORIGIN } from '../../../shared/origins.js';
import { t } from '../../../shared/i18n.js';

// The browser may be on an insecure address (the very case this reminder is for), so `navigator.clipboard` is not
// always available; fall back to selecting a temporary textarea.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The dismissable notice strip (nothing when there is no notice / before entry, except an address reminder, which is
 * useful on the title screen where the player is about to log in). */
export function NoticeBanner() {
  const notice = useStore((s) => s.notice);
  const entered = useStore((s) => s.session.entered);
  const [copied, setCopied] = useState(false);
  if (!notice || (!entered && notice.origin !== true)) return null;
  // The server names the official origin in the text; render that exact span as an anchor and copy its href.
  const href = notice.link?.href || (notice.origin ? `${OFFICIAL_ORIGIN}/` : null);
  const label = notice.link?.label || href;
  const at = href ? notice.text.indexOf(href) : -1;
  const copy = async () => {
    if (!href) return;
    if (await copyText(href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return html`<div class="notice-banner" role="alert">
    <${Icon} name="info" class="notice-banner__icon" />
    <div class="notice-banner__text">
      <span class="notice-banner__msg">${at >= 0
        ? html`${notice.text.slice(0, at)}<a class="notice-banner__link" href=${href} target="_blank" rel="noopener noreferrer">${href}</a>${notice.text.slice(at + href.length)}`
        : notice.text}</span>
      ${href && at < 0 ? html`<a class="notice-banner__link" href=${href} target="_blank" rel="noopener noreferrer">${label}</a>` : null}
      ${href ? html`<span class="notice-banner__actions">
        <button type="button" class="notice-banner__copy" onClick=${copy}>${copied ? t('已复制') : t('复制')}</button>
      </span>` : null}
      ${notice.sign ? html`<span class="notice-banner__sign">—— ${notice.sign}</span>` : null}
    </div>
    <${Button} size="sm" variant="secondary" onClick=${() => store.set({ notice: null })}>${t('知道了')}<//>
  </div>`;
}
