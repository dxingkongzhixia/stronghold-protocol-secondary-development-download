// ui/notice.js — the operator notice banner (docs/MATCHMAKING.md §28): a `sys.notice` push from the admin page
// (server/lobby.js `broadcastNotice`, usually a deploy / restart heads-up signed `d星空之下`) shown as a dismissable
// strip at the top centre — over the lobby AND over a running match, so nobody misses it. `store.notice` holds the
// latest one; 知道了 clears it (the next push opens it again). A toast (main.js) announces it on arrival.

import { html, Button, Icon } from './components.js';
import { store, useStore } from '../store.js';

/** The dismissable notice strip (nothing when there is no notice / before entry). */
export function NoticeBanner() {
  const notice = useStore((s) => s.notice);
  const entered = useStore((s) => s.session.entered);
  if (!notice || !entered) return null;
  return html`<div class="notice-banner" role="alert">
    <${Icon} name="info" class="notice-banner__icon" />
    <div class="notice-banner__text">
      <span class="notice-banner__msg">${notice.text}</span>
      ${notice.sign ? html`<span class="notice-banner__sign">—— ${notice.sign}</span>` : null}
    </div>
    <${Button} size="sm" variant="secondary" onClick=${() => store.patch('notice', null)}>知道了<//>
  </div>`;
}
