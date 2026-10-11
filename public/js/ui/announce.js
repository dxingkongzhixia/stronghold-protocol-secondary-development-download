// ui/announce.js — the TITLE screen's 公告 (announcement) surface, wired to our OWN notice store: the durable
// changelog (server/community.js) whose operator notices are the entries with `source: 'notice'`, read token-free
// from GET /community/api/changelog (newest first, ui/community.js). No second store is invented.
//
// Two pieces, both driven by the same data:
//   · AnnounceBanner — the dismissable strip at the top of the title screen: a 「公告」 tag, the newest notice's text
//     and a 「知道了」 dismiss. The dismissal is remembered per announcement (a `loadPref`/`savePref` "seen id"), so
//     the same notice does not nag; a NEW notice opens the banner again. Nothing to show (no notice / offline) → null.
//   · AnnounceButton / AnnouncementsOverlay — the 公告 entry beside 关于本服务器: it opens the announcement list, which
//     is our changelog overlay (ui/community.js) re-titled 公告.
//
// The operator notice (ui/notice.js, a live `sys.notice` push) is a DIFFERENT, transient surface; chat is unrelated.
// Text goes through t() (docs/I18N.md).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button } from './components.js';
import { ChangelogOverlay } from './community.js';
import { loadPref, savePref } from '../store.js';
import { t } from '../../../shared/i18n.js';

/** The localStorage key of the last-dismissed announcement (store.js loadPref/savePref). */
export const ANNOUNCE_SEEN_PREF = 'noticeSeen';

/**
 * The newest changelog entry pushed as an operator notice, or null when there is none. Entries arrive newest-first
 * (server/community.js listChangelog), so the first `source: 'notice'` wins.
 * @param {any} entries the changelog array (`{ id, version, summary, body, source, released_at }`)
 * @returns {any|null}
 */
export function latestNotice(entries) {
  if (!Array.isArray(entries)) return null;
  for (const e of entries) if (e && e.source === 'notice') return e;
  return null;
}

/**
 * A stable key for one announcement, so a dismissal sticks to THAT notice and a newer one shows again.
 * @param {any} entry a changelog / notice entry
 * @returns {string} '' when there is nothing to key on
 */
export function announcementKey(entry) {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.id != null) return `notice:${entry.id}`;
  if (entry.version != null) return `notice:${entry.version}`;
  const text = String(entry.summary || entry.body || '').trim();
  return text ? `notice:${text}` : '';
}

/**
 * Whether `entry` should still be announced: there is one and this browser has not dismissed THAT key.
 * @param {any} entry
 * @param {string} seenKey the stored seen key
 * @returns {boolean}
 */
export function shouldAnnounce(entry, seenKey) {
  const key = announcementKey(entry);
  return !!key && key !== String(seenKey || '');
}

/** The announcement key this browser dismissed last (loadPref), or ''. */
export function seenAnnouncement() {
  return String(loadPref(ANNOUNCE_SEEN_PREF, '') || '');
}

/** Remember that `entry`'s announcement was dismissed (savePref). */
export function markAnnouncementSeen(entry) {
  savePref(ANNOUNCE_SEEN_PREF, announcementKey(entry));
}

/** The dismissable 公告 strip at the top of the title screen; hidden with nothing to show / offline / already seen. */
export function AnnounceBanner({ onOpen }) {
  const [entries, setEntries] = useState(null);
  const [seen, setSeen] = useState(() => seenAnnouncement());
  useEffect(() => {
    let alive = true;
    fetch('/community/api/changelog', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setEntries(j && Array.isArray(j.changelog) ? j.changelog : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const entry = latestNotice(entries);
  if (!shouldAnnounce(entry, seen)) return null;
  const text = String(entry.summary || entry.body || '').trim();
  const dismiss = () => { markAnnouncementSeen(entry); setSeen(announcementKey(entry)); };
  return html`<aside class="title-announce" role="status" aria-live="polite">
    <span class="title-announce__label">${t('公告')}</span>
    <button type="button" class="title-announce__text" title=${t('公告')} onClick=${() => onOpen?.()}>${text}</button>
    <${Button} size="sm" variant="secondary" onClick=${dismiss}>${t('知道了')}<//>
  </aside>`;
}

/**
 * The title's 公告 entry (beside 关于本服务器): opens the announcement list.
 * @param {{ onClick?: Function, class?: string }} props
 */
export function AnnounceButton({ onClick, class: cls }) {
  return html`<${Button} variant="ghost" size="sm" icon="info" class=${cls}
    aria-haspopup="dialog" onClick=${onClick}>${t('公告')}<//>`;
}

/** The announcement list: our changelog overlay (server/community.js) under the 公告 title. */
export function AnnouncementsOverlay({ onClose }) {
  return html`<${ChangelogOverlay} onClose=${onClose} title=${t('公告')} />`;
}
