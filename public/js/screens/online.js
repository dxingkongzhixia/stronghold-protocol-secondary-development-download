// The in-game 在线玩家 overlay and its pure helpers, shared by the classic lobby (screens/lobby.js) and the Hub UI
// (screens/hub/lobby.js). Data comes from the token-free /online/api; a registered player's row opens their public
// records (screens/stats.js) and returns here on close.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel, TextField, AvatarFrame, RoleTag } from '../ui/components.js';
import { useStore, setOnlineOpen, setOnlineStatsReturn, setOnlineFilter } from '../store.js';
import { openPlayerStats } from './stats.js';
import { data as dataset, useData } from '../data.js';
import { avatarUrl } from '../ui/assetUrls.js';
import { t, N_ } from '../../../shared/i18n.js';

/** Status key → label + tone (distinct hues, all from the theme tokens; mirrors server/admin.js STATUS). */
const ONLINE_STATUS = {
  online: { label: N_('在线'), c: 'mint' }, room: { label: N_('组队中'), c: 'ice' }, queue: { label: N_('野排排队'), c: 'gold' },
  mmplay: { label: N_('野排游玩'), c: 'amber' }, alliance: { label: N_('同盟游玩'), c: 'violet' }, solo: { label: N_('单人游玩'), c: 'green' },
  offline: { label: N_('离线'), c: 'dim' },
};

/**
 * The public stats target of an /online/api online row: a registered player's callsign, else null. Guests have no
 * account-bound identity others can key on (server/stats.js `stats.view` resolves by public callsign), so their row
 * stays a plain row — and so does a nameless entry.
 * @param {any} p an /online/api `online[]` entry
 * @returns {string|null}
 */
export function onlineStatsTarget(p) {
  return p && !p.guest && typeof p.name === 'string' && p.name.length > 0 ? p.name : null;
}

/**
 * Filter the online list by a free-text query: a case-insensitive substring of the callsign, the room code, or the
 * status (its key like `queue`, or its translated label like 野排排队), so any of those find a row. An empty / blank
 * query keeps the list as it is (the same array reference — no needless re-render).
 * @param {any[]} list /online/api `online[]`
 * @param {string} query the search field's text
 * @returns {any[]}
 */
export function filterOnlinePlayers(list, query) {
  const arr = Array.isArray(list) ? list : [];
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return arr;
  return arr.filter((p) => {
    const status = ONLINE_STATUS[p?.status];
    const hay = [p?.name, p?.roomCode, p?.status, status ? t(status.label) : '', p?.guest ? t('游客') : t('已登录')];
    return hay.some((s) => typeof s === 'string' && s.toLowerCase().includes(q));
  });
}

/**
 * A 在线玩家 row click on a viewable player: hide the list and open their public records, remembering the online-list
 * origin so closing the stats pops back here with the search still in place (ui.onlineStatsReturn, one-shot). Split
 * out so the row → stats wiring is testable without a browser; `deps.open` defaults to the real `openPlayerStats`.
 * @param {any} p an /online/api `online[]` entry
 * @param {{ open?: (name: string) => void }} [deps]
 * @returns {boolean} whether a viewable row opened the stats
 */
export function openOnlineStats(p, deps = {}) {
  const name = onlineStatsTarget(p);
  if (!name) return false;
  setOnlineStatsReturn(true);
  setOnlineOpen(false);
  (deps.open || openPlayerStats)(name);
  return true;
}

/**
 * The in-game online-players overlay: server data via /online/api (token-free), refreshed every 4 s. Opened from the
 * 在线 badge — no separate page. Rows list 名字 / 是否登录 / 状态 / 房间; a registered player's row (the `>` chevron)
 * opens their public records (server/stats.js stats.view) and returns here on close. A search box filters the list by
 * callsign / room code / status. Styled with the game's own components (docs/MATCHMAKING.md §8).
 */
export function OnlineOverlay({ onClose }) {
  useData('assets');
  const [data, setData] = useState(null);
  const query = useStore((s) => s.ui.onlineFilter);
  const list = (data && data.online) || [];
  const shown = filterOnlinePlayers(list, query);
  const st = (s) => ONLINE_STATUS[s] || { label: s, c: 'dim' };
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/online/api', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setData(j);
      } catch { /* keep the last snapshot */ }
    };
    tick();
    const h = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(h); };
  }, []);
  // Esc closes the overlay — but a confirm dialog on top takes the Esc. The stats viewer this overlay opens consumes
  // the first Esc (popping back here); this listener is mounted only then, so the second Esc closes the list.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.modal')) return;
      e.preventDefault(); e.stopPropagation();
      closeRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return html`<div class="online-modal" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="online-modal__card brackets">
      <div class="online-modal__head">
        <div class="online-modal__title"><${MicroLabel} tone="mint">ONLINE DOCTORS<//>
          <h2>${t('在线玩家')}<span class="num">${data ? data.counts.online : '—'}</span></h2></div>
        <button type="button" class="online-modal__close" onClick=${onClose} aria-label=${t('关闭')}><${Icon} name="close" /><//>
      </div>
      <div class="online-modal__meta"><span><i class="online-dot"></i>${t('实时')}</span><span>${t('游客')} ${data ? data.counts.guests : '—'}</span><span>${t('每 4 秒刷新')}</span></div>
      <div class="online-modal__search">
        <${TextField} size="sm" icon="search" value=${query} placeholder=${t('搜索玩家代号 / 房间号')}
          onInput=${setOnlineFilter} class="online-modal__search-field" />
        <span class="online-modal__count num" title=${t('显示 {shown} / {total}', { shown: shown.length, total: list.length })}>
          <b>${shown.length}</b><span>/${list.length}</span></span>
        ${query ? html`<button type="button" class="online-modal__clear" aria-label=${t('清除搜索')} title=${t('清除搜索')}
          onClick=${() => setOnlineFilter('')}><${Icon} name="close" /><//>` : null}
      </div>
      <div class="online-modal__list">
        ${shown.length ? shown.map((p, i) => {
          // a registered player's row opens their public match records (server/stats.js stats.view) and returns here;
          // guests have no account-bound identity others can key on, so their row stays a plain row
          const target = onlineStatsTarget(p);
          const open = target ? () => openOnlineStats(p) : undefined;
          return html`<div class=${`online-row${target ? ' is-viewable' : ''}`} key=${`${p.name}-${i}`}
            role=${target ? 'button' : undefined} tabIndex=${target ? 0 : undefined}
            title=${target ? t('查看其对局记录') : undefined}
            onClick=${target ? open : undefined}
            onKeyDown=${target ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}>
          <${AvatarFrame} size="sm" src=${avatarUrl(p.avatar, dataset.get('assets'))} name=${p.name} seat=${i} offline=${p.status === 'offline'} />
          <span class="online-row__name">${p.name}<${RoleTag} role=${p.role} /></span>
          ${p.guest ? html`<span class="online-row__tag">${t('游客')}</span>` : html`<span class="online-row__tag is-acc">${t('已登录')}</span>`}
          <span class=${`online-row__status is-${st(p.status).c}`}>${t(st(p.status).label)}</span>
          <span class="online-row__room num">${p.roomCode || '—'}</span>
          ${target ? html`<span class="online-row__go" aria-hidden="true"><${Icon} name="chevronRight" /></span>` : null}
        </div>`;
        }) : html`<div class="online-modal__empty">${!data ? t('加载中…') : list.length ? t('没有匹配的玩家') : t('暂无在线玩家')}</div>`}
      </div>
    </div>
  </div>`;
}
