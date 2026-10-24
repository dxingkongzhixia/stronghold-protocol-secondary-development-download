// Room screen (同盟等待室): 4 seat cards (avatar frame, name, ready state, AI badge, host crown),
// host controls (difficulty picker, add/remove AI and the 「AI 队友最后选择」 switch in co-op, start), invite code with
// copy code / copy link, ready toggle and leave.
//
// Start rule (server/lobby.js): room.start needs every *other* human connected and ready; the
// host's start counts as the host's ready. So 开始模拟 is enabled exactly then and sends room.start
// alone (no separate room.ready round trip that could leave the host "ready" after a failed start).
// Solo rooms show a single seat.
// Spectator seats (community report #26, a remake feature): a co-op room with spectators shows the 观战席 strip under
// the seats — names, offline marks, the host's ✕ (room.removeSpectator) — and a spectator's own view swaps the ready
// button for 观战中 and offers 入座 (room.join of the room) while a player seat is free.
// Plugins (DESIGN §32 P1a): the tag under the title — 「原版」 or 「插件 ×N」 — opens the 插件 panel (ui/pluginPanel.js:
// the host switches the room's plugins, everybody else reads them). With gameplay plugins (§32.6: a content set of its
// own — the tag reads 「非官方」 too) every seat shows whether its page has loaded and checked the room's content
// (seats[].content: 载入中 / 就绪 / 校验失败), 准备就绪 and 开始模拟 wait for it (the server refuses them before:
// CONTENT_NOT_READY), and a plugin mode the host chose shows beside the difficulty.
// Texts go through t() (docs/I18N.md).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, MAX_SEATS, MAX_SPECTATORS, CHAT_BUBBLE_MS } from '../../../shared/constants.js';
import {
  html, Button, Icon, MicroLabel, PingPill, AvatarFrame, DifficultyTag, DifficultyIcon, Tooltip, confirmDialog, doctorNo, RoleTag, useTicker,
} from '../ui/components.js';
import { toast, toastError } from '../ui/toasts.js';
import { copyText } from '../ui/clipboard.js';
import { SettingsButton } from '../ui/settings.js';
import { openStats } from './stats.js';
import { LoadoutButton } from './loadout.js';
import { ChatDock, ChatBubble, activeChatBubbles } from '../ui/chat.js';
import { PluginTag, isModdedRoom } from '../ui/pluginTag.js';
import { rememberScriptConsent } from '../content.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, emptyMatch, isSpectating } from '../store.js';
import { data, useData } from '../data.js';
import { avatarUrl, seatArtUrl } from '../ui/assetUrls.js';
import { ArtPicker } from '../ui/artPicker.js';
import { difficultyInfo } from './lobby.js';
import { t, tc } from '../../../shared/i18n.js';

/**
 * Seats padded to the room's capacity (co-op 4, solo 1), each null or a seat record.
 * @param {any} room room.state payload
 * @returns {(null | {seat:number, playerId:any, name:string, isBot:boolean, ready:boolean, connected:boolean})[]}
 */
export function normalizeSeats(room) {
  const cap = room?.mode === 'solo' ? 1 : MAX_SEATS;
  const src = Array.isArray(room?.seats) ? room.seats : [];
  const out = [];
  for (let i = 0; i < cap; i++) {
    const s = src[i];
    out.push(s && typeof s === 'object' ? { ...s, seat: Number.isInteger(s.seat) ? s.seat : i } : null);
  }
  return out;
}

/**
 * Derived room facts for the local player.
 * @param {any} room
 * @param {any} myId
 */
export function roomFacts(room, myId) {
  const seats = normalizeSeats(room);
  const occupied = seats.filter(Boolean);
  const humans = occupied.filter((s) => !s.isBot);
  const mine = occupied.find((s) => s.playerId === myId) || null;
  const isHost = room?.hostId != null && room.hostId === myId;
  const others = humans.filter((s) => s.playerId !== myId);
  // The host never readies: starting the match is the host's ready (server rule), so the count
  // treats the host as ready — "已就绪 0/1" next to "准许进入模拟" would contradict itself.
  const isReady = (s) => !!s.ready || s.playerId === room?.hostId;
  const readyHumans = humans.filter(isReady).length;
  const othersReady = others.every((s) => s.ready && s.connected !== false);
  // a room with gameplay plugins (DESIGN §32.6): every player's page has loaded and checked its content (the host's too)
  const modded = isModdedRoom(room);
  const contentReady = !modded || humans.every((s) => s.content === 'ready');
  return {
    seats, occupied, humans, mine, isHost, readyHumans, isReady,
    emptySeats: seats.filter((s) => !s).length,
    canStart: isHost && othersReady && !!mine && contentReady,
    othersReady,
    modded,
    contentReady,
    myContent: modded ? (mine?.content || 'loading') : 'ready',
    // spectator seats (never players: not in `humans`, never counted for ready / start)
    spectators: Array.isArray(room?.spectators) ? room.spectators.filter((s) => s && typeof s === 'object') : [],
    spectating: isSpectating(room, myId),
  };
}

/**
 * The co-op room option 「AI 队友最后选择」 (GitHub #338; room.setAiPicksLast, room.state.aiPicksLast): in the strategy and
 * 机变 drafts every human picks before the AI teammates. null in a solo room (no AI teammates); otherwise its state (off
 * when the server sends none) and whether this player may switch it — the host only, the others see it read-only.
 * @param {any} room room.state payload
 * @param {any} myId
 * @returns {{ on: boolean, editable: boolean } | null}
 */
export function aiLastOption(room, myId) {
  if (!room || room.mode === 'solo') return null;
  return { on: room.aiPicksLast === true, editable: room.hostId != null && room.hostId === myId };
}

/** Invite link for a room code (current page URL with ?room=CODE). */
export function inviteLink(code) {
  const loc = globalThis.location;
  const base = loc ? `${loc.origin}${loc.pathname}` : '';
  return `${base}?room=${encodeURIComponent(code)}`;
}

/**
 * Copy text to the clipboard (async API with a textarea fallback for insecure contexts). Moved to ui/clipboard.js so
 * 干员调配 can use it without importing this screen (which imports loadout.js): re-exported here for existing callers.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export { copyText };

/**
 * The trusted-plugin consent gate (DESIGN §32.13). Each seat accepts only for itself and only for the current
 * `cs`; the server keeps the decision on the seat across a reconnect. Nothing trusted runs until the page has
 * remembered the choice and sent `room.consent`.
 */
function TrustedConsentBar({ room, mine }) {
  const [busy, setBusy] = useState(null);
  const [declined, setDeclined] = useState(false);
  const trusted = room?.content?.trusted;
  const cs = room?.content?.cs;
  if (!trusted || !Array.isArray(trusted.plugins) || !trusted.plugins.length || !mine || !cs) return null;
  if (trusted.consent?.[mine.seat]) return null;
  const decide = async (accept) => {
    setBusy(accept ? 'accept' : 'reject');
    rememberScriptConsent(cs, accept);
    try {
      await net.request('room.consent', { cs, accept });
      setDeclined(!accept);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };
  const perms = [...new Set(trusted.plugins.flatMap((p) => Array.isArray(p.permissions) ? p.permissions : []))];
  return html`<section class="trusted-consent" data-testid="trusted-consent" role="alert">
    <div class="trusted-consent__title"><${Icon} name="shield" /><b>${t('受信任插件')}</b><${MicroLabel}>TRUSTED PLUGINS<//></div>
    <p>${t('本房间启用了受信任插件。它可以完全控制你的游戏页面。只有在你信任插件作者和服务器时才同意。')}</p>
    <ul>
      ${trusted.plugins.map((p) => html`<li key=${p.id}><b>${p.id}</b>${p.version ? html` <span class="num t-dim">v${p.version}</span>` : null}
        ${Array.isArray(p.permissions) && p.permissions.length ? html`<span class="t-dim"> · ${p.permissions.join(', ')}</span>` : null}</li>`)}
    </ul>
    ${perms.length ? html`<p class="trusted-consent__perms">${t('权限')}：${perms.join(', ')}</p>` : null}
    ${declined ? html`<p class="trusted-consent__declined" data-testid="trusted-declined">${t('已拒绝。开始模拟前仍需要你的同意。')}</p>` : null}
    <div class="trusted-consent__actions">
      <${Button} variant="secondary" size="sm" data-testid="trusted-reject" loading=${busy === 'reject'} onClick=${() => decide(false)}>${t('拒绝')}<//>
      <${Button} variant="primary" size="sm" data-testid="trusted-accept" loading=${busy === 'accept'} onClick=${() => decide(true)}>${t('同意并继续')}<//>
    </div>
  </section>`;
}

function SeatCard({ seat, index, room, facts, myId, busy, bubble, onAddBot, onRemoveBot, onKick, onPickArt }) {
  useData('assets');
  const coop = room.mode !== 'solo';
  if (!seat) {
    const canAdd = coop && facts.isHost;
    return html`<article class="seat seat--empty" style=${`--seat-i:${index}`}>
      <header class="seat__head"><span class="seat__grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="seat__no num">P${index + 1}</span></header>
      <div class="seat__art seat__art--empty">
        <span class="seat__plus" aria-hidden="true">+</span>
        <b class="seat__invite">${t('邀请')}</b>
        <span class="seat__wait">${canAdd ? t('复制同盟密钥以邀请队友') : t('等待博士加入')}</span>
      </div>
      <footer class="seat__foot">
        ${canAdd
          ? html`<${Button} variant="secondary" size="sm" icon="robot" block=${true} loading=${busy === `add`} onClick=${onAddBot}>${t('添加 AI 队友')}<//>`
          : html`<span class="seat__state t-dim">${t('空位')}</span>`}
      </footer>
    </article>`;
  }
  const isMe = seat.playerId === myId;
  const isHostSeat = seat.playerId === room.hostId;
  const offline = seat.connected === false && !seat.isBot;
  // The host never needs to toggle ready: starting the match readies them (server rule).
  const state = offline ? 'offline' : seat.ready || seat.isBot ? 'ready' : isHostSeat ? 'host' : 'waiting';
  // the player's profile (schema v6, server/lobby.js): their chosen 立绘 (charId or charId@skin) and uploaded avatar file
  const art = !seat.isBot ? seatArtUrl(data.get('assets'), seat.art) : null;
  const avatar = !seat.isBot ? avatarUrl(seat.avatar) : null;
  const stateText = state === 'ready' ? t('已就绪') : state === 'offline' ? t('连接中断') : state === 'host' ? t('待命中') : t('准备中');
  return html`<article class=${`seat brackets${isMe ? ' is-me' : ''}${isHostSeat ? ' is-host' : ''}${seat.isBot ? ' is-bot' : ''} is-${state}`}
      style=${`--seat-i:${index}`}>
    ${bubble ? html`<div class="seat__chat"><${ChatBubble} key=${bubble.seq} name=${bubble.name} text=${bubble.text} own=${isMe} at=${bubble.at} ttl=${CHAT_BUBBLE_MS} /></div>` : null}
    <header class="seat__head">
      <span class="seat__grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="seat__no num">P${index + 1}</span>
    </header>
    <div class=${`seat__art${art ? ' has-art' : ''}`}>
      ${art ? html`<img class="seat__art-img" src=${art} alt="" draggable=${false} />` : html`<div class="seat__artwho">
        <${AvatarFrame} size="xl" src=${avatar} name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} ready=${state === 'ready'} offline=${offline} />
      </div>`}
      <div class="seat__artshade" aria-hidden="true"></div>
      ${isHostSeat ? html`<span class="seat__host"><${Icon} name="crown" />${t('创建者')}</span>` : null}
      ${!seat.isBot ? html`<button type="button" class="seat__artbtn" onClick=${() => onPickArt?.(index)}>
        <${Icon} name="edit" />${t('更换立绘')}</button>` : null}
      ${seat.isBot ? html`<span class="seat__bot-label"><${Icon} name="robot" />${t('AI 队友')}</span>` : null}
      <div class=${`seat__statebox is-${state}`}>
        <span class="seat__stateicon">${state === 'ready' ? html`<${Icon} name="check" />` : state === 'offline' ? html`<${Icon} name="wifiOff" />` : state === 'host' ? html`<${Icon} name="check" />` : html`<${Icon} name="hourglass" />`}</span>
        <b>${stateText}</b>
      </div>
    </div>
    <footer class="seat__foot">
      <div class="seat__id">
        <${AvatarFrame} size="sm" src=${avatar} name=${seat.name} seat=${index} bot=${seat.isBot} self=${isMe} ready=${state === 'ready'} offline=${offline} />
        <div class="seat__idtext">
          <span class="seat__name">${seat.name || t('博士')}<${RoleTag} role=${seat.role} />${isMe ? html`<span class="seat__you">${t('你')}</span>` : null}</span>
          <${MicroLabel}>${seat.isBot ? 'AUTONOMOUS UNIT' : `DOCTOR #${doctorNo(seat.playerId)}`}<//>
        </div>
      </div>
      <div class="seat__footact">
        ${facts.modded && !seat.isBot ? html`<span class=${`seat__content is-${seat.content || 'loading'}`} data-testid="seat-content">
          ${seat.content === 'ready' ? t('插件内容就绪') : seat.content === 'failed' ? t('插件内容校验失败') : t('插件内容载入中')}
        </span>` : null}
        ${seat.isBot && facts.isHost ? html`<${Tooltip} text=${t('移除该 AI 队友')}>
          <${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rm${index}`} onClick=${() => onRemoveBot(index)} aria-label=${t('移除 AI 队友')} />
        <//>` : null}
        ${!seat.isBot && !isMe && facts.isHost ? html`<${Tooltip} text=${t('将该博士移出同盟')}>
          <${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `kick${index}`} onClick=${() => onKick(index, seat.name, seat.playerId)} aria-label=${t('移出该博士')} />
        <//>` : null}
      </div>
    </footer>
  </article>`;
}

/**
 * 观战席 (remake feature; room.spectate / room.removeSpectator, plus 夺舍): a compact dropdown, not a strip — the seats'
 * names (the host's ✕ frees one), 入座 for a spectator while a player seat is free, and 夺舍 AI 队友 for a spectator
 * (room.takeOver: the AI's board, gold and loadout become theirs — players stay ≤ MAX_SEATS).
 */
function SpectatorDock({ facts, myId, busy, bubbles, onRemove, onSit, onTakeOver, onRelease }) {
  const ais = facts.seats.filter((s) => s && s.isBot);
  const mine = facts.seats.find((s) => s && s.playerId === myId);
  const mineFromAi = !!(mine && mine.fromAi);        // we took an AI over → we may hand it back (room.releaseSeat)
  if (!facts.spectators.length && !facts.spectating && !mineFromAi) return null;
  return html`<details class="specdock">
    <summary class="specdock__sum"><${Icon} name="eye" />${t('观战席')} <b class="num">${facts.spectators.length}</b><span class="num t-dim">/${MAX_SPECTATORS}</span></summary>
    <div class="specdock__body">
      ${facts.spectators.length
        ? facts.spectators.map((s) => html`<div class="specdock__row" key=${s.playerId}>
            <span class=${`specdock__who${s.playerId === myId ? ' is-me' : ''}${s.connected === false ? ' is-offline' : ''}`}>
              ${s.connected === false ? html`<${Icon} name="wifiOff" />` : null}${s.name || t('博士')}<${RoleTag} role=${s.role} />${s.playerId === myId ? html`<span class="seat__you">${t('你')}</span>` : null}
            </span>
            ${facts.isHost ? html`<${Button} variant="ghost" size="sm" square=${true} icon="close" loading=${busy === `rs${s.playerId}`}
              onClick=${() => onRemove(s.playerId)} aria-label=${t('移出观战者 {0}', { 0: s.name || '' })} title=${t('移出该观战者')} />` : null}
            ${bubbles?.get(s.playerId) ? html`<div class="specdock__chat"><${ChatBubble} key=${bubbles.get(s.playerId).seq}
              name=${bubbles.get(s.playerId).name} text=${bubbles.get(s.playerId).text} own=${s.playerId === myId}
              at=${bubbles.get(s.playerId).at} ttl=${CHAT_BUBBLE_MS} /></div>` : null}
          </div>`)
        : html`<div class="specdock__empty t-dim">${t('暂无观战者')}</div>`}
      ${facts.spectating && facts.emptySeats > 0 ? html`<div class="specdock__act">
        <${Button} size="sm" icon="user" loading=${busy === 'sit'} onClick=${onSit}>${t('入座（空位）')}<//>
      </div>` : null}
      ${facts.spectating && ais.length ? html`<div class="specdock__act">
        <span class="t-lo">${t('夺舍 AI 队友')}</span>
        <div class="specdock__ais">
          ${ais.map((s) => html`<${Button} key=${s.seat} size="sm" variant="secondary" icon="robot" loading=${busy === `to${s.seat}`}
            onClick=${() => onTakeOver(s.seat)}>P${s.seat + 1}<//>`)}
        </div>
      </div>` : null}
      ${mineFromAi ? html`<div class="specdock__act">
        <${Button} size="sm" variant="secondary" icon="eye" loading=${busy === 'release'}
          onClick=${onRelease}>${t('退出夺舍（回到观战席）')}<//>
      </div>` : null}
    </div>
  </details>`;
}

function InviteBox({ code, public: isPublic, name, difficulty }) {
  const copy = async (what) => {
    // the copied link carries an invitation line (#103): 「{name}邀请你加入卫戍协议：盟约【{difficulty}】」
    const invite = t('{name}邀请你加入卫戍协议：盟约【{difficulty}】', { name: name ?? '', difficulty: DIFFICULTY_NAMES[difficulty] ? t(DIFFICULTY_NAMES[difficulty]) : '' });
    const ok = await copyText(what === 'code' ? code : `${inviteLink(code)} ${invite}`);
    if (ok) toast(what === 'code' ? t('已复制同盟密钥 {code}', { code }) : t('已复制邀请链接'), 'success');
    else toast(t('复制失败，请手动复制'), 'warn');
  };
  const pub = isPublic !== false;
  return html`<div class="invite brackets">
    <div class="invite__label"><${Icon} name="key" /><span>${t('同盟密钥')}</span><${MicroLabel}>ALLIANCE KEY<//>
      <span class=${`invite__vis${pub ? ' is-public' : ''}`}
        title=${pub ? t('其他博士可在大厅「公开同盟」直接加入') : t('不会出现在公开列表，仅凭密钥加入')}>${pub ? t('公开') : t('仅密钥')}</span></div>
    <div class="invite__code num selectable" aria-label=${t('同盟密钥 {code}', { code })}>${[...String(code)].map((ch, i) => html`<span key=${i}>${ch}</span>`)}</div>
    <div class="invite__btns">
      <${Button} size="sm" icon="copy" onClick=${() => copy('code')}>${t('复制密钥')}<//>
      <${Button} size="sm" icon="link" onClick=${() => copy('link')}>${t('复制链接')}<//>
    </div>
  </div>`;
}

function DifficultyPicker({ room, isHost, busy, onPick }) {
  if (!isHost) {
    return html`<div class="dpick dpick--ro">
      <${DifficultyTag} difficulty=${room.difficulty} size="lg" code=${difficultyInfo(room.mode, room.difficulty).code} />
      <span class="t-dim">${t('由创建者选择')}</span>
    </div>`;
  }
  return html`<div class="dpick" role="radiogroup" aria-label=${t('模拟难度')}>
    ${DIFFICULTIES.map((d) => html`<button key=${d} type="button" role="radio" aria-checked=${room.difficulty === d ? 'true' : 'false'}
        class=${`dpick__opt${room.difficulty === d ? ' is-active' : ''}`} style=${`--d-color:${DIFFICULTY_COLORS[d]}`}
        disabled=${!!busy} onClick=${() => room.difficulty !== d && onPick(d)}>
      <${DifficultyIcon} difficulty=${d} />${t(DIFFICULTY_NAMES[d].replace('模拟', ''))}
    </button>`)}
  </div>`;
}

/** The 「AI 队友最后选择」 switch (co-op): the host toggles it, everybody else sees its state. */
function AiLastToggle({ option, busy, onToggle }) {
  if (!option) return null;
  return html`<div class="ailast">
    <${Tooltip} text=${t('策略与机变轮选时，所有博士先于 AI 队友选择')}>
      <button type="button" role="switch" aria-checked=${option.on ? 'true' : 'false'}
          class=${`dpick__opt ailast__opt${option.on ? ' is-active' : ''}`} disabled=${!option.editable || !!busy}
          onClick=${() => option.editable && onToggle(!option.on)}>
        <${Icon} name="check" class=${option.on ? 'is-on' : ''} />${t('AI 队友最后选择')}
      </button>
    <//>
    ${option.editable ? null : html`<span class="t-dim">${t('由创建者设置')}</span>`}
  </div>`;
}

/** Room screen component. */
export function RoomScreen() {
  const room = useStore((s) => s.room);
  const me = useStore((s) => s.me, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const chat = useStore((s) => s.chat);
  const bubbles = activeChatBubbles(chat, Date.now(), CHAT_BUBBLE_MS);
  useTicker(bubbles.size ? 500 : 0); // re-render only while a bubble is showing (to expire it)
  const [busy, setBusy] = useState(null);
  const [artSeat, setArtSeat] = useState(null);
  const [saveDefault, setSaveDefault] = useState(true);
  const auth = useStore((s) => s.auth, shallowEqual);
  const alive = useRef(true);
  const inFlight = useRef(false); // synchronous guard against double clicks (state updates are async)
  useEffect(() => () => { alive.current = false; }, []);

  if (!room) return null;
  const online = conn.status === 'online';
  const coop = room.mode !== 'solo';
  const facts = roomFacts(room, me.playerId);
  const myReady = !!facts.mine?.ready;
  const info = difficultyInfo(room.mode, room.difficulty);

  const run = async (kind, fn) => {
    if (inFlight.current) return;
    if (!online) { toast(t('连接中断，请稍候重试'), 'warn'); return; }
    inFlight.current = true;
    setBusy(kind);
    try { await fn(); } catch (err) { toastError(err); } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const toggleReady = () => run('ready', () => net.request('room.ready', { ready: !myReady }));
  const start = () => run('start', () => net.request('room.start', {}));
  const addBot = () => run('add', () => net.request('room.addBot', {}));
  const removeBot = (seat) => run(`rm${seat}`, () => net.request('room.removeBot', { seat }));
  // seat-card 立绘 (owner 2026-10-24): the picker's choice rides room.setArt; a bound account may also keep it as the
  // default for every later room (server-side accounts.art, applied when a seat is created / the account binds).
  const pickArt = (art) => {
    const seat = artSeat != null ? facts.seats[artSeat] : null;
    setArtSeat(null);
    if (!seat || seat.playerId !== me.playerId) return;
    const save = !!auth?.account && saveDefault;
    run('art', () => net.request('room.setArt', { art, save }));
  };
  // the host removes a human before the match (community report #17): asked first; the player may join again. The
  // confirmed player's id goes along: if they left and someone else took the seat meanwhile, the server refuses it.
  const kick = async (seat, name, playerId) => {
    if (inFlight.current) return;
    const ok = await confirmDialog({ title: t('移出同盟'), text: t('确定将「{name}」移出同盟吗？对方可以凭同盟密钥重新加入。', { name: name || t('博士') }), okText: t('移出'), danger: true });
    if (ok) run(`kick${seat}`, () => net.request('room.kick', { seat, playerId }));
  };
  const setDifficulty = (difficulty) => run('diff', () => net.request('room.setDifficulty', { difficulty }));
  // 夺舍 AI (room.takeOver): a spectator takes over a bot's seat — its board, gold and loadout become ours
  const takeOver = (seat) => run(`to${seat}`, () => net.request('room.takeOver', { seat }));
  // ...and back out of it (room.releaseSeat): the seat becomes a fresh AI, we return to the spectator seats
  const releaseSeat = () => run('release', () => net.request('room.releaseSeat', {}));
  const setAiLast = (on) => run('ailast', () => net.request('room.setAiPicksLast', { on }));
  // spectator seats: the host frees one; a spectator takes a free player seat with room.join of this room
  const removeSpectator = (playerId) => run(`rs${playerId}`, () => net.request('room.removeSpectator', { playerId }));
  const sit = () => run('sit', () => net.request('room.join', { code: room.code, ...(room.test ? { testAck: true } : {}) }));
  const leave = async () => {
    if (inFlight.current) return;
    const othersHere = facts.humans.some((s) => s.playerId !== me.playerId);
    if (facts.isHost && othersHere) {
      const ok = await confirmDialog({ title: t('离开同盟'), text: t('你是同盟的创建者，离开后创建者身份将移交或同盟解散。确定离开吗？'), okText: t('离开'), danger: true });
      if (!ok) return;
    }
    inFlight.current = true;
    setBusy('leave');
    try {
      await net.request('room.leave', {});
    } catch (err) {
      if (err?.code !== 'NOT_IN_ROOM') toastError(err);
    } finally {
      // Leaving locally is always safe: the server either confirmed or no longer has us in the room.
      store.set({ room: null, match: emptyMatch() });
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const statusLine = !online
    ? html`<span class="t-orange"><${Icon} name="wifiOff" />${t('连接中断，正在重连…')}</span>`
    : facts.spectating
      ? html`<span class="t-lo"><${Icon} name="eye" />${t('观战中 · 不占博士席位，模拟开始后可切换观看各位博士')}</span>`
    : !coop
      ? html`<span class="t-mint">${t('*模拟协议已就绪，准许进入模拟')}</span>`
    : facts.modded && !facts.contentReady
      ? html`<span class="t-lo">${t('等待所有博士载入房间的插件内容')}</span>`
    : facts.isHost
      ? facts.canStart
        ? html`<span class="t-mint">${t('*同盟人数达标，准许进入模拟')}</span>`
        : html`<span class="t-lo">${t('等待所有博士准备就绪')}</span>`
      : myReady
        ? html`<span class="t-mint">${t('已就绪 · 等待创建者开始模拟')}</span>`
        : html`<span class="t-lo">${t('准备就绪后，创建者即可开始模拟')}</span>`;

  return html`<div class="screen room-screen">
    <header class="topbar">
      <div class="topbar__left">
        <${Tooltip} text=${t('离开同盟')} placement="bottom">
          <${Button} variant="danger" size="lg" square=${true} icon="exit" loading=${busy === 'leave'} onClick=${leave} aria-label=${t('离开同盟')} />
        <//>
        <div class="room-ping">
          <${PingPill} ms=${conn.ping} online=${online} />
          <${MicroLabel}>${t('当前延迟')}<//>
        </div>
        <${Button} variant="secondary" size="sm" icon="chart" class="stats-entry" onClick=${openStats} title=${t('统计数据')} aria-label=${t('统计数据')}>${t('统计')}<//>
      </div>
      <div class="topbar__center">
        <${MicroLabel} tone="mint">${coop ? (room.auto ? 'ALLIANCE MATCH' : 'ALLIANCE LOBBY') : 'SOLO SIMULATION'}<//>
        <h1 class="topbar__title">${coop ? (room.auto ? t('野排模拟') : t('同盟模拟')) : t('独立模拟')}<span class="topbar__sep"></span><${DifficultyTag} difficulty=${room.difficulty} size="lg" /></h1>
        <${PluginTag} room=${room} myId=${me.playerId} />
      </div>
      <div class="topbar__right">
        <${SettingsButton} class="room-settings" variant="secondary" label=${t('设置')} />
        ${!coop ? html`<div class="solo-note"><${MicroLabel}>SINGLE OPERATOR<//><span>${t('仅限 1 名博士')}</span></div>`
          : room.auto ? html`<div class="solo-note mm-note"><${MicroLabel} tone="mint">MATCHED TEAM<//><span>${t('野排队伍 · 对局结束后自动解散')}</span></div>`
          : html`<${InviteBox} code=${room.code} public=${room.public} name=${me.name} difficulty=${room.difficulty} />`}
      </div>
    </header>

    <${TrustedConsentBar} room=${room} mine=${facts.mine} />

    <main class=${`seats${coop ? '' : ' seats--solo'}`}>
      ${facts.seats.map((s, i) => html`<${SeatCard} key=${s ? `p${s.playerId}` : `e${i}`} seat=${s} index=${i} room=${room} facts=${facts}
        myId=${me.playerId} busy=${busy} bubble=${s ? bubbles.get(s.playerId) : undefined} onAddBot=${addBot} onRemoveBot=${removeBot} onKick=${kick}
        onPickArt=${setArtSeat} />`)}
      ${coop ? null : html`<aside class="solo-brief brackets">
        <${MicroLabel} tone="mint">BRIEFING<//>
        <h2>${DIFFICULTY_NAMES[room.difficulty] ? t(DIFFICULTY_NAMES[room.difficulty]) : ''}<span class="num t-dim"> ${info.code}</span></h2>
        <p>${info.desc}</p>
        <ul>
          ${info.effects.map((e) => html`<li key=${e}>${e}</li>`)}
          <li>${t('共')} <b class="num">${info.rounds}</b> ${tc('rounds', '回合')}${info.hidden ? t('，满足条件时进入隐秘核心') : ''}</li>
          <li>${t('独立模拟中休整期与机变阶段不限时')}</li>
        </ul>
      </aside>`}
    </main>
    <${SpectatorDock} facts=${facts} myId=${me.playerId} busy=${busy} bubbles=${bubbles} onRemove=${removeSpectator} onSit=${sit} onTakeOver=${takeOver} onRelease=${releaseSeat} />
    <${ChatDock} class="room-chat" disabled=${!online} />

    <footer class="room-bar">
      <div class="room-bar__left">
        <span class="room-bar__label">${t('模拟难度')}<${MicroLabel}>DIFFICULTY<//></span>
        <div class="room-bar__opts">
          <${DifficultyPicker} room=${room} isHost=${facts.isHost} busy=${busy} onPick=${setDifficulty} />
          <${AiLastToggle} option=${aiLastOption(room, me.playerId)} busy=${busy} onToggle=${setAiLast} />
        </div>
      </div>
      <div class="room-bar__center">
        <div class="ready-count" hidden=${!coop}>
          <span class="t-lo">${t('已就绪')}</span>
          <b class="num">${facts.readyHumans}</b><span class="num t-dim">/${facts.humans.length}</span>
          <span class="ready-count__icons" aria-hidden="true">
            ${facts.humans.map((s) => html`<${Icon} key=${s.playerId} name="user" class=${facts.isReady(s) ? 'is-on' : ''} />`)}
          </span>
        </div>
        <div class="room-bar__status">${statusLine}</div>
      </div>
      <div class="room-bar__right">
        <${LoadoutButton} from="room" size="lg" class="room-loadout" label=${t('干员调配')} />
        ${facts.isHost
          ? html`<${Tooltip} text=${facts.canStart ? null : !facts.contentReady ? t('仍有博士未载入房间的插件内容') : t('仍有博士未准备就绪')}>
              <${Button} variant="primary" size="xl" icon="play" data-testid="room-start" loading=${busy === 'start'} disabled=${!facts.canStart || !online} onClick=${start}>${t('开始模拟')}<//>
            <//>`
          : facts.spectating
            ? html`<${Button} variant="secondary" size="xl" icon="eye" disabled=${true}>${t('观战中')}<//>`
          : html`<${Tooltip} text=${!myReady && facts.myContent !== 'ready' ? t('房间的插件内容载入并通过校验后才能准备') : null}>
              <${Button} variant=${myReady ? 'primary' : 'secondary'} size="xl" icon=${myReady ? 'check' : 'hourglass'} active=${myReady}
              loading=${busy === 'ready'} disabled=${!online || !facts.mine || (!myReady && facts.myContent !== 'ready')} onClick=${toggleReady}>${myReady ? t('已就绪') : t('准备就绪')}<//>
            <//>`}
      </div>
    </footer>
    <${ArtPicker} open=${artSeat != null} current=${artSeat != null ? (facts.seats[artSeat]?.art ?? null) : null}
      canSaveDefault=${!!auth?.account} saveDefault=${saveDefault} onSaveDefaultChange=${setSaveDefault}
      onPick=${pickArt} onClose=${() => setArtSeat(null)} busy=${busy === 'art'} />
  </div>`;
}
