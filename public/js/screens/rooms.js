// 公开房间 directory (docs/MATCHMAKING.md §36): a full screen, not a modal — its own top bar with a 返回 button and a
// scrollable bracket-framed body, opened from the lobby's 公开房间 button. It lists the public co-op rooms from
// GET /online/api (token-free), polled every 4 s: 组队中 (openRooms — a hand-made lobby, not-full first; 加入 when a
// seat is free, 观战 when the lobby is full) and 对局中 (playRooms — the match is already running, the action is
// 观战). Each room is one wide amber bar carrying the
// difficulty, its code, mode / rounds / occupancy, its MAX_SEATS co-op seats as square cells (the player's initial,
// the host crown, the guest and AI markers; empty seats dashed), a status tag and the single action button.
//
// The screen is swapped in by screens/lobby.js in place of the lobby body (same LobbyScreen, same routing), so the
// lobby's join / spectate handlers are reused as they are and the room-restore / `?room=` deep-link flows are
// untouched. 组队中 is not-full first: a full lobby room (no free seat) still lists here, but its action is 观战 like a
// running match. Text goes through t(); module-level tables hold msgids (N_).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, DifficultyIcon, AvatarFrame, RoleTag, Spinner } from '../ui/components.js';
import { t, tc } from '../../../shared/i18n.js';
import { MAX_SEATS, DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, modeIdFor } from '../../../shared/constants.js';
import { getMode } from '../data.js';

const REFRESH_MS = 4000;

/**
 * A room's co-op seats normalised for the directory: always MAX_SEATS entries, null = empty (a seat the server sent as
 * null, or one whose player has left), else the public identity. Pure: the mapper the unit test exercises.
 * @param {any} room an /online/api openRooms / playRooms entry
 * @returns {(null | { name: string, initial: string, role: string|null, guest: boolean, isBot: boolean, isHost: boolean })[]}
 */
export function roomSeats(room) {
  const src = Array.isArray(room?.seats) ? room.seats : [];
  return Array.from({ length: MAX_SEATS }, (_, i) => {
    const s = src[i];
    if (!s || typeof s !== 'object') return null;
    const name = typeof s.name === 'string' ? s.name : '';
    return {
      name,
      initial: [...name.trim()][0] || '?',
      role: typeof s.role === 'string' ? s.role : null,
      guest: !!s.guest,
      isBot: !!s.isBot,
      isHost: !!s.isHost,
    };
  });
}

/**
 * Whether a room's lobby has no free seat: the server's `full` flag (`buildPublicSnapshot`) when present, else a
 * `freeSeats` count, else the seat cells themselves (all MAX_SEATS occupied). A full 组队中 room is still listed but
 * its action is 观战.
 * @param {any} room an /online/api openRooms / playRooms entry
 */
export function roomIsFull(room) {
  if (typeof room?.full === 'boolean') return room.full;
  if (Number.isFinite(room?.freeSeats)) return room.freeSeats <= 0;
  return roomSeats(room).every(Boolean);
}

/**
 * Split an /online/api snapshot into the two lists the screen groups (组队中 first). The 组队中 list is sorted so
 * not-full rooms come first (within each group, humans desc) — a full lobby room sinks below the joinable ones.
 */
export function splitRooms(data) {
  const open = Array.isArray(data?.openRooms) ? data.openRooms : [];
  const play = Array.isArray(data?.playRooms) ? data.playRooms : [];
  const humans = (r) => (Number.isFinite(r?.humans) ? r.humans : 0);
  return {
    open: [...open].sort((a, b) => (roomIsFull(a) ? 1 : 0) - (roomIsFull(b) ? 1 : 0) || humans(b) - humans(a)),
    play,
  };
}

/** The round count of a co-op difficulty (data/config.json, else the remake default of 14). */
function roundsOf(difficulty) {
  const m = DIFFICULTIES.includes(difficulty) ? getMode(modeIdFor('coop', difficulty)) : null;
  return Number.isFinite(m?.lastRound) ? m.lastRound : 14;
}

/** One seat square: the player's initial (host crown / AI tag from AvatarFrame), a guest marker, the name; empty = dashed. */
function SeatCell({ seat, index }) {
  if (!seat) {
    return html`<span class="rooms-seat is-empty" title=${t('空席位')} aria-label=${t('空席位')}>
      <${AvatarFrame} size="md" seat=${index} empty=${true} />
      <span class="rooms-seat__name t-dim">${t('空席位')}</span>
    </span>`;
  }
  return html`<span class="rooms-seat" title=${seat.name || t('空席位')}>
    <${AvatarFrame} size="md" seat=${index} name=${seat.name} host=${seat.isHost} bot=${seat.isBot} />
    ${seat.guest && !seat.isBot ? html`<span class="rooms-seat__guest">${t('游客')}</span>` : null}
    <span class="rooms-seat__name">${seat.name || t('博士')}${seat.role ? html`<${RoleTag} role=${seat.role} size="sm" />` : null}</span>
  </span>`;
}

/** One room as a wide bar: difficulty + code + mode/rounds meta · the 4 seat squares · status tag + action. */
function RoomBar({ room, kind, onAct }) {
  const running = kind === 'play';
  const watch = running || roomIsFull(room); // 观战: a running match, or a 组队中 lobby with no free seat left
  const seats = roomSeats(room);
  const diff = DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : (room.difficultyName || room.difficulty || '');
  const rounds = roundsOf(room.difficulty);
  return html`<article class="rooms-bar brackets" style=${`--d-color:${DIFFICULTY_COLORS[room.difficulty] || 'var(--amber)'}`}>
    <div class="rooms-bar__id">
      <${DifficultyIcon} difficulty=${room.difficulty} class="rooms-bar__glyph" />
      <div class="rooms-bar__text">
        <div class="rooms-bar__line">
          <span class="rooms-bar__diff">${diff}</span>
          <b class="rooms-bar__code num">${room.code}</b>
        </div>
        <div class="rooms-bar__meta">
          <${MicroLabel}>${running ? 'MATCH IN PROGRESS' : 'ALLIANCE LOBBY'}<//>
          <span class="rooms-bar__mode">${t('同盟模拟')}</span>
          <span class="t-dim">·</span>
          <span><b class="num">${room.humans ?? 0}</b><span class="t-dim">/${MAX_SEATS}</span></span>
          ${running && room.bots ? html`<span class="rooms-bar__bots"><b class="num">+${room.bots}</b> AI</span>` : null}
          <span class="t-dim">·</span>
          <span><b class="num">${rounds}</b> ${tc('rounds', '回合')}</span>
        </div>
      </div>
    </div>
    <div class="rooms-seats" role="list" aria-label=${t('席位')}>
      ${seats.map((s, i) => html`<${SeatCell} key=${i} seat=${s} index=${i} />`)}
    </div>
    <div class="rooms-bar__side">
      <span class=${`rooms-tag ${running ? 'is-play' : 'is-open'}`}>${running ? t('对局中') : t('组队中')}</span>
      <${Button} variant=${watch ? 'secondary' : 'primary'} size="lg" icon=${watch ? 'eye' : 'users'}
        onClick=${() => onAct(room.code)}>${watch ? t('观战') : t('加入')}<//>
    </div>
  </article>`;
}

/**
 * The 公开房间 screen.
 * @param {{ onBack: () => void, onJoin: (code: string) => void, onSpectate: (code: string) => void }} props
 */
export function PublicRoomsScreen({ onBack, onJoin, onSpectate }) {
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
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
    const h = setInterval(tick, REFRESH_MS);
    return () => { alive = false; clearInterval(h); };
  }, [nonce]);
  const { open, play } = splitRooms(data);
  const empty = !open.length && !play.length;
  return html`<header class="topbar">
      <div class="topbar__left">
        <${Button} variant="ghost" size="sm" icon="chevronLeft" onClick=${onBack} title=${t('返回')}>${t('返回')}<//>
      </div>
      <div class="topbar__center">
        <${MicroLabel} tone="mint">PUBLIC ROOMS<//>
        <h1 class="topbar__title">${t('公开房间')}</h1>
      </div>
      <div class="topbar__right">
        <span class="rooms-live"><i class="online-dot"></i>${t('实时')}<span class="t-dim">· ${t('每 {n} 秒刷新', { n: REFRESH_MS / 1000 })}</span></span>
        <${Button} variant="secondary" size="sm" icon="refresh" onClick=${() => setNonce((n) => n + 1)}>${t('刷新')}<//>
      </div>
    </header>
    <div class="screen__scroll rooms-body">
      ${open.length ? html`<section class="rooms-section is-open">
        <div class="section-label"><span class="section-label__idx num">01</span>${t('组队中')}<${MicroLabel}>JOINABLE<//></div>
        <div class="rooms-list">${open.map((r) => html`<${RoomBar} key=${r.code} room=${r} kind="open" onAct=${roomIsFull(r) ? onSpectate : onJoin} />`)}</div>
      </section>` : null}
      ${play.length ? html`<section class="rooms-section is-play">
        <div class="section-label"><span class="section-label__idx num">02</span>${t('对局中')}<${MicroLabel}>IN PROGRESS<//></div>
        <div class="rooms-list">${play.map((r) => html`<${RoomBar} key=${r.code} room=${r} kind="play" onAct=${onSpectate} />`)}</div>
      </section>` : null}
      ${empty ? html`<div class="rooms-empty">
        ${data ? html`<${Icon} name="users" /><span>${t('暂无公开房间')}</span>` : html`<${Spinner} size="md" label="LOADING" />`}
      </div>` : null}
    </div>`;
}
