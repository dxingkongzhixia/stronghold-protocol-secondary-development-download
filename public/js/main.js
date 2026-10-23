// Client entry: boot (fonts, identity, socket), net → store wiring, router, global overlays.
//
// Router (derived from the store, no URL routes):
//   not entered            → Title
//   m.public.phase ≠ LOBBY → Game (screens/game.js: briefing / band draft / match / result by phase)
//   room.inMatch           → Game (match starting, m.public on its way)
//   in a room              → Room
//   otherwise              → Lobby
// Deep link `?room=CODE`: remembered at boot, auto-joined once the player has entered and the
// session is online (after a short grace period in case the server restores a room on resume).
// Reloading a tab that already passed the title re-enters automatically (sessionStorage flag) and
// resumes the server session with the saved token; stale room/match state is dropped if the
// server does not re-push it within RESTORE_GRACE_MS after `welcome`. Boot waits for
// `identity.init()` (which token this tab may use without stealing another live tab's session)
// before the first connect; a page restored from the back/forward cache reloads.
// A `welcome` with a NEW playerId (the server restarted / the session expired) while a room or match was on screen:
// toast 「服务器会话已重置，上一局模拟已结束」 (store.js sessionResetNotice) and return to the lobby with nothing stale.
//
// Shared modules are imported relatively ('../../shared/…' resolves to /shared/… in the browser).
// Multi-device support (ui/device.js + css/devices.css): feature classes on <html>, no page zoom, safe areas, rotation
// re-layout; ui/compat.js polyfills are imported before anything else.
// 干员调配 (DESIGN §16): an overlay over any route (<LoadoutHost/>, opened from lobby / room / briefing); its loadout is
// kept in sync with the server by installLoadoutSync (room.loadout after every welcome and edit), its 干员持有 tab's
// not-owned list (0.2.0 补位) by installOwnershipSync (room.ownership, likewise), the 自选编队 picks (0.2.0 DIY) by
// installDiySync (room.diy, likewise; it also keeps welcome.diyKitted for the picker).
// Game data: every text of the game is static data (/data/*.json) downloaded once per page; the in-match files are
// warmed in the background as soon as the player is in a room (warmGameData), before the match needs them.
// Language (ui/lang.js, docs/I18N.md): chosen before the first render (initLang); App re-renders on a switch (useLang).
// Server texts are translated on arrival: m.toast / m.ticker frames (msgid + params, or the text as a msgid; a
// config.broadcasts line from its id + args), error codes (ui/toasts.js describeError) and room.closed reasons.
// Cosmetic plugins (DESIGN §32 P1a): installContent (content.js) lays the room's visual set and the player's personal
// plugins over the art manifest every screen reads. Gameplay plugins (§32.6): installContentSet (content.js) downloads and
// checks a room's content set and makes it the data every screen and the battle runner read.

// Polyfills first (older Safari / Firefox ESR): every module evaluated after this one sees them.
import './ui/compat.js';
import { render } from '../vendor/preact.module.js';
import { useErrorBoundary } from '../vendor/hooks.module.js';
import { html, UiHosts, Button, MicroLabel, closeAllDialogs } from './ui/components.js';
import { ConnectionBanner } from './ui/connBanner.js';
import { NoticeBanner } from './ui/notice.js';
import { ToastHost, toast, toastError, describeError } from './ui/toasts.js';
import { net, identity, NetError } from './net.js';
import { store, useStore, emptyMatch, selectRoute, sessionResetNotice, loadPref, savePref, isSpectating } from './store.js';
import { BOOT_VIDEO, collectArtUrls, preloadImages, artProgressReporter } from './preload.js';
import { effectiveAssetMode, assetCacheSupported, fetchAssetIndex, ensureAssets } from './assetCache.js';
import { localSourceEnabled, probeLocalBase } from './assetSource.js';
import { data } from './data.js';
import { GAME_FILES } from './ui/gameComponents.js';
import { TitleScreen, sanitizeName } from './screens/title.js';
import { LobbyScreen, parseRoomParam } from './screens/lobby.js';
import { RoomScreen } from './screens/room.js';
import { GameScreen } from './screens/game.js?v=a59eef1db';
import { chatMessage } from './ui/chat.js';
import { audio, installAudio } from './audio.js';
import { settingsStore } from './ui/settings.js';
import { GuideHost } from './ui/guide.js';
import { CodexHost } from './ui/codex.js';
import { BugReportHost } from './ui/community.js';
import { installDeviceSupport } from './ui/device.js';
import { LoadoutHost } from './screens/loadout.js';
import { StatsHost } from './screens/stats.js';
import { AssetModePrompt } from './ui/assetMode.js';
import { recordResult, installStatsRecorder, setStatsUploader } from './ui/stats.js';
import { installStatsSync } from './ui/statsSync.js';
import { installRehearsal } from './battle/rehearsal.js';
import { installLoadoutSync, installOwnershipSync, installDiySync, installSkinsSync } from './ui/loadoutSync.js';
import { startBuildGuard } from './ui/buildGuard.js';
import { ensureManifestLink } from './ui/ensureManifest.js';
import { initLang, useLang, tickerText } from './ui/lang.js';
import { t, N_, translateWire } from '../../shared/i18n.js';
import { recordError, installTrafficMeter } from './diag.js';
import { initAssetMirror, installImageFallback, mirrorRouteUrl, mirrorCandidates } from './assetMirror.js';
import { idbSupported, setIdbEnabled } from './assetIdb.js';
import { installContent, installContentSet } from './content.js';
import { cosmetics } from './cosmetics.js';

const RESTORE_GRACE_MS = 1500;

/**
 * How long the boot preload may hold the title back, in ms. The preload warms the browser's cache for the small UI image
 * set; it is not a correctness gate, and with the art coming from a CDN mirror the wall clock is the mirror's per-image
 * latency (measured 2026-10-14: gh-proxy ~6 images/s, so the full 2461 images is ~6 min). Past the deadline the title
 * renders and the remaining art loads on demand. `0` = no deadline (the old "everything before the title" behaviour).
 */
const PRELOAD_DEADLINE_MS = 60_000;
const JOIN_DELAY_MS = 350;
const TICKER_KEEP = 20;
const EMOTE_KEEP = 20;
const CHAT_KEEP = 20;

const SCREENS = { title: TitleScreen, lobby: LobbyScreen, room: RoomScreen, game: GameScreen };

/** Copy of a server message without transport fields. */
function payload(msg) {
  const { t, rid, ...rest } = msg; // eslint-disable-line no-unused-vars
  return rest;
}

function clearRoomParam() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    history.replaceState(history.state, '', url.pathname + (url.search || '') + url.hash);
  } catch { /* ignore */ }
}

// ---- net → store wiring ---------------------------------------------------------------------------

let seq = 0;
let welcomeAt = 0;
let roomStateAt = 0;
let matchAt = 0;
let restoreTimer = null;
let joinTimer = null;
let joinInFlight = false;
/** Boot art preload gate state, pushed by the server (bootgate.js): `granted` when our download slot is free. */
const bootGate = { granted: false, position: 0, supported: true };
/** The rehearsal installer (battle/rehearsal.js): its tasks follow the match on screen (see wireNet's store hook). */
let rehearsal = null;

function clearPendingJoin() {
  store.patch('ui', { pendingJoin: null });
  clearRoomParam();
}

/** Auto-join the deep-linked room once entered + online (idempotent). */
function schedulePendingJoin() {
  clearTimeout(joinTimer);
  joinTimer = setTimeout(async () => {
    const s = store.get();
    const code = s.ui.pendingJoin;
    if (!code || joinInFlight || !s.session.entered || net.status !== 'online') return;
    if (s.room) {
      if (s.room.code !== code) toast(t('你已在其他同盟中，请先离开当前同盟'), 'warn');
      clearPendingJoin();
      return;
    }
    joinInFlight = true;
    try {
      await net.request('room.join', { code });
    } catch (err) {
      toastError(err);
    } finally {
      joinInFlight = false;
      clearPendingJoin();
    }
  }, JOIN_DELAY_MS);
}

/** End the post-resume "syncing" state early once the server re-pushed what we were showing. */
function maybeFinishRestore() {
  const s = store.get();
  if (!s.ui.restoring) return;
  const roomOk = !s.room || roomStateAt >= welcomeAt;
  const matchOk = !s.match.public || matchAt >= welcomeAt || !s.room?.inMatch;
  if (roomOk && matchOk) {
    clearTimeout(restoreTimer);
    store.patch('ui', { restoring: false });
  }
}

/**
 * Leave whatever room / match was on screen for the lobby with nothing stale left behind: open imperative dialogs,
 * the post-resume restore timer, ticker lines and emote bubbles of the old match (the battle runner and the 暂离 flag
 * follow the store themselves).
 */
function backToLobby() {
  identity.rememberMatch(null);
  clearTimeout(restoreTimer);
  const s = store.get();
  if (s.room || s.match.public) closeAllDialogs();
  store.set({ room: null, match: emptyMatch(), ticker: [], emotes: [], chat: [] });
  // also drops a 公开房间 return intent and the 在线玩家 overlay / its stats-return intent: a closed / kicked /
  // session-reset room is not an intentional 离开同盟.
  store.patch('ui', { restoring: false, roomsReturn: false, onlineOpen: false, onlineFilter: '', onlineStatsReturn: false });
}

/** The unofficial plugins a server counts in welcome / /healthz `content.plugins` (absent: none — DESIGN §32 P1a). */
const pluginCount = (content) => (content && Number.isInteger(content.plugins) && content.plugins > 0 ? content.plugins : 0);

function onWelcome(msg) {
  identity.saveToken(msg.token);
  identity.rememberMatch(null);
  const prev = store.get();
  const prevId = prev.me.playerId;
  const name = typeof msg.name === 'string' && msg.name ? msg.name : prev.me.name;
  identity.saveName(name);
  store.set({
    me: { playerId: msg.playerId ?? null, name, token: typeof msg.token === 'string' ? msg.token : null },
    // the server's content identity (DESIGN §32): the diagnostics name it (diag.js contentLine)
    content: msg.content && typeof msg.content.vanilla === 'string'
      ? { vanilla: msg.content.vanilla, ...(typeof msg.content.defaultVs === 'string' ? { defaultVs: msg.content.defaultVs } : {}) }
      : null,
    // how many unofficial plugins it has (P1a — absent: none; content.js fetches the catalogue only when there are some)
    installedPlugins: pluginCount(msg.content),
    testMode: msg.testMode === true,
  });
  welcomeAt = Date.now();

  // A reconnect (`resumed`) or a brand-new server session means the 野排 queue slot is gone server-side
  // (onDisconnect → Matchmaker.leave): clear a stale "搜寻队友" overlay instead of leaving it stuck forever.
  if (msg.resumed === true || (prevId != null && prevId !== msg.playerId)) {
    store.patch('mm', { queued: false, difficulty: null, waiting: 0, elapsedMs: 0, deadlineMs: 0 });
  }

  if (prevId != null && prevId !== msg.playerId) {
    // A brand-new server session (the server restarted — crashed / killed, so no room.closed arrived — or this session
    // expired on it): whatever we showed before is gone — back to the lobby cleanly and say why.
    const notice = sessionResetNotice(prev, msg.playerId);
    backToLobby();
    if (notice) toast(t(notice), 'warn', { ttl: 7000 });
  } else if (prev.room || prev.match.public) {
    // Resumed session: the server re-pushes room/match state; drop whatever it doesn't.
    store.patch('ui', { restoring: true });
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      const s = store.get();
      const patch = {};
      if (s.room && roomStateAt < welcomeAt) patch.room = null;
      if (s.match.public && matchAt < welcomeAt) patch.match = emptyMatch();
      store.set(patch);
      store.patch('ui', { restoring: false });
    }, RESTORE_GRACE_MS);
  }
  schedulePendingJoin();
}

function onRoomState(msg) {
  const room = payload(msg);
  roomStateAt = Date.now();
  // A room.state means a room/match took over: leave the 野排 queue UI (a matched group gets one at once).
  if (store.get().mm?.queued) store.patch('mm', { queued: false, difficulty: null });
  const myId = store.get().me.playerId;
  const seats = Array.isArray(room.seats) ? room.seats : [];
  if (myId != null && seats.length && !seats.some((s) => s && s.playerId === myId) && !isSpectating(room, myId)) {
    // We are no longer seated (kicked / left elsewhere) — neither in a player seat nor a spectator seat.
    if (store.get().room) toast(t('你已不在该同盟中'), 'warn');
    store.set({ room: null, match: emptyMatch(), chat: [] });
    // kicked / removed elsewhere — NOT an intentional 离开同盟: never force the 公开房间 view. The 在线玩家 overlay
    // and its stats-return intent go too.
    store.patch('ui', { roomsReturn: false, onlineOpen: false, onlineFilter: '', onlineStatsReturn: false });
    return;
  }
  const prevRoom = store.get().room;
  // A (new) match starts: forget the previous match's state so stale results never show.
  if (room.inMatch && !(prevRoom && prevRoom.inMatch && prevRoom.code === room.code)) store.set({ match: emptyMatch() });
  // A different room: drop the old chat (its history follows as room.chat { messages }); a same-room state update keeps it.
  store.set(!prevRoom || prevRoom.code !== room.code ? { room, chat: [] } : { room });
  identity.rememberMatch(room.inMatch && seats.some((seat) => seat?.playerId === myId)
    ? { name: store.get().me.name, code: room.code || '' } : null);
  maybeFinishRestore();
}

const CLOSE_REASON = {
  // 'timeout' = this player was removed after staying disconnected past the lobby grace (server/lobby.js)
  host_left: N_('创建者已离开，同盟已解散'), timeout: N_('由于长时间断开连接，你已离开同盟'), empty: N_('同盟已解散'),
  kicked: N_('你已被移出同盟'), ended: N_('模拟已结束'), expired: N_('同盟已过期'), shutdown: N_('服务器维护中，同盟已关闭'),
};

function wireNet() {
  net.on('status', (snap) => {
    const cur = store.get().connection;
    store.set({
      connection: {
        status: snap.status, ping: snap.ping, attempt: snap.attempt, retryAt: snap.retryAt,
        lastError: snap.lastError, everOnline: cur.everOnline || snap.status === 'online',
      },
    });
  });
  net.on('clock', (c) => store.set({ clock: { offset: c.offset, rtt: c.rtt, synced: c.synced } }));
  net.on('welcome', onWelcome);
  net.on('helloError', (err) => {
    if (err.code === 'SESSION_IN_USE') identity.rejectToken();
    toastError(err);
  });
  net.on('replaced', () => {
    // This tab/socket was kicked (another tab, or the account logged in on another device): drop the stale badge.
    // The shared localStorage authToken is left alone — the replacing tab may legitimately own it.
    store.patch('auth', { account: null });
    toast(t('该身份已在其他页面登录，本页已断开'), 'warn', { ttl: 6000 });
  });
  net.on('unhandledError', (err) => toastError(err));
  // accounts (docs/MATCHMAKING.md): auth.ok binds the account and persists the session token for the next hello
  net.on('auth.ok', (msg) => {
    if (typeof msg.token === 'string' && msg.token) savePref('authToken', msg.token);
    const acc = msg.account;
    if (acc && Number.isFinite(acc.id)) {
      // role: shared/constants.js ROLES (null = ordinary) — a 管理员 / 开发者 tag rides next to the name everywhere
      store.patch('auth', { account: { id: acc.id, name: String(acc.name || ''), role: typeof acc.role === 'string' ? acc.role : null }, error: null });
      // 博士代号 = the account name: the server renamed the session, so follow it locally too.
      if (acc.name) store.patch('me', { name: String(acc.name) });
    }
  });
  net.on('auth.error', (msg) => {
    const code = typeof msg.code === 'string' ? msg.code : 'INTERNAL';
    if (code === 'SESSION_EXPIRED') { savePref('authToken', null); net.setAccountToken(null); }
    store.patch('auth', { account: null, error: code });
  });
  // 野排 queue progress (mm.state ~1 Hz; queued:false on cancel)
  net.on('mm.state', (msg) => store.patch('mm', {
    queued: !!msg.queued, difficulty: msg.difficulty ?? null, waiting: Number(msg.waiting) || 0,
    need: Number(msg.need) || 4, elapsedMs: Number(msg.elapsedMs) || 0, deadlineMs: Number(msg.deadlineMs) || 0,
  }));
  // boot art preload gate (server/bootgate.js): the answer to boot.claim — granted, or the place in the queue
  net.on('boot.state', (msg) => { bootGate.granted = !!msg.granted; bootGate.position = Number(msg.position) || 0; });
  // operator notice (the admin page's 通知; server/lobby.js broadcastNotice): ONE dismissable strip (ui/notice.js). Usually a
  // deploy / restart heads-up signed `d星空之下`. Presented once: a toast on top of the banner showed the same notice twice,
  // and the same push delivered twice to one page (two live sessions) must not re-announce it either.
  net.on('sys.notice', (msg) => {
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!text) return;
    const sign = typeof msg.sign === 'string' && msg.sign ? msg.sign : null;
    const id = msg.id ?? null;
    const cur = store.get().notice;
    if (id && cur && cur.id === id) return;   // the same notice, already on screen
    store.patch('notice', { id, text, sign, at: Number(msg.at) || Date.now() });
  });
  net.on('room.state', onRoomState);
  net.on('room.closed', (msg) => {
    if (msg.reason === 'matched-end') {
      // 野排: the auto party disbands when the match ends. Drop the room but keep the result on screen — the route
      // stays on the game's settle view, whose button then reads 返回大厅 (no room).
      store.set({ room: null });
      // 野排 disbanded by the server, not an intentional leave — and no 在线玩家 overlay / stats-return intent outlives it
      store.patch('ui', { roomsReturn: false, onlineOpen: false, onlineFilter: '', onlineStatsReturn: false });
      toast(t('野排对局结束，队伍已解散'), 'info');
      return;
    }
    backToLobby();
    const known = Object.hasOwn(CLOSE_REASON, String(msg.reason)) ? CLOSE_REASON[msg.reason] : null;
    toast(known ? t(known) : typeof msg.reason === 'string' && msg.reason.length < 60 ? t('同盟已关闭：{reason}', { reason: msg.reason }) : t('同盟已关闭'), 'warn');
  });
  net.on('m.public', (msg) => { matchAt = Date.now(); store.patch('match', { public: payload(msg) }); maybeFinishRestore(); });
  net.on('m.private', (msg) => { matchAt = Date.now(); store.patch('match', { private: payload(msg) }); });
  net.on('m.layer', (msg) => {
    const s = store.get();
    if (selectRoute(s) === 'game' && msg.playerId === s.me?.playerId) audio.layerGain(msg.bondId, msg.add);
  });
  net.on('m.field', (msg) => store.patch('match', { field: payload(msg) }));
  net.on('m.result', (msg) => {
    const res = payload(msg);
    store.patch('match', { result: res });
    // 本机统计 (PR #323): every arrival, including the lobby's result replay after a reconnect / reload —
    // replays dedupe by content id inside recordResult (spectator seats' copies build no record at all)
    // (`vs`: the room's cosmetic plugins, recorded — such a match still counts as the original game: ui/stats.js)
    // (`content`: the room's content set when it played gameplay plugins — such a match is unofficial: ui/stats.js)
    recordResult(res, { myId: store.get().me.playerId, roomMode: store.get().room?.mode ?? null, vs: store.get().room?.content?.vs ?? null, content: store.get().room?.content ?? null, now: Date.now() });
  });
  net.on('m.toast', (msg) => {
    const kind = ['info', 'success', 'warn', 'error'].includes(msg.kind) ? msg.kind : 'info';
    // msgid + params (server ≥ 0.2.0) or the text itself as a msgid, in the current language
    toast(translateWire(msg), kind);
  });
  net.on('m.ticker', (msg) => {
    if (typeof msg.text !== 'string') return;
    const text = tickerText(msg);
    // type, player + the round it came in: a BOSS_HIT line is dropped once its boss round is over and superseded by the
    // same player's next one (ui/ticker.js tickerLineLive / tickerSupersedes)
    const type = typeof msg.type === 'string' ? msg.type : null;
    const playerId = typeof msg.playerId === 'string' ? msg.playerId : null;
    // its broadcast priority: the strip plays the highest first (ui/ticker.js enqueueTickerLines)
    const priority = Number.isFinite(msg.priority) ? msg.priority : 0;
    store.set((s) => ({ ticker: [...s.ticker.slice(-(TICKER_KEEP - 1)), { id: ++seq, text, at: Date.now(), type, playerId, round: s.match?.public?.round ?? null, priority }] }));
  });
  net.on('m.emote', (msg) => {
    store.set((s) => ({ emotes: [...s.emotes.slice(-(EMOTE_KEEP - 1)), { seq: ++seq, playerId: msg.playerId, id: msg.id, at: Date.now() }] }));
  });
  // room text chat (docs/MATCHMAKING.md §38): one transient event per live message (shown as a bubble, ui/chat.js);
  // never stored, never a list. Player text is rendered as text, never through innerHTML.
  net.on('m.chat', (msg) => {
    const ev = chatMessage(msg, seq + 1, Date.now());
    if (ev) { seq++; store.set((s) => ({ chat: [...s.chat.slice(-(CHAT_KEEP - 1)), ev] })); }
  });

  // Entering (title → lobby) while already online also needs the deep-link join.
  store.subscribe((s, prev) => {
    if (s.session.entered && !prev.session.entered) schedulePendingJoin();
    // in a room (co-op or solo, also a resumed one) a match is near: its data starts downloading
    if (s.room && !prev.room) warmGameData();
    // the match on screen is over (left, closed, kicked, a new session): a rehearsal task of it is dead, and the frame
    // that cancels it may never arrive (a disposed match sends nothing) — the page stops what it is running itself
    if (selectRoute(prev) === 'game' && selectRoute(s) !== 'game') rehearsal?.clear();
  });
}

/**
 * Download every data file of the match UI (gameComponents GAME_FILES: operators, skills, bonds, items, enemies, 特质 …)
 * in the background once the player is in a room — a match is near (the lobby alone never downloads them). The game's
 * texts are static data loaded once per page — never fetched during a match — and the match screen waits for these
 * files, so with them warmed it opens at once and no text ever appears late (user playtest #3 item 9). Idempotent (the
 * data store shares each file's promise).
 */
function warmGameData() {
  // a room with gameplay plugins: content.js downloads its content set's files instead (DESIGN §32.6)
  const go = () => { if (store.get().room?.content?.vanilla === false) return; data.loadAll(GAME_FILES).catch(() => {}); };
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 600);
}

// ---- UI chrome (the connection banner lives in ui/connBanner.js) -----------------------------------

function ScreenCrashed({ error, reset }) {
  return html`<div class="screen crash">
    <div class="crash__box brackets">
      <${MicroLabel} tone="mint">SYSTEM FAULT<//>
      <h2>${t('界面发生错误')}</h2>
      <p class="t-lo">${String(error?.message || error).slice(0, 200)}</p>
      <${Button} variant="primary" icon="refresh" onClick=${reset}>${t('重新加载界面')}<//>
    </div>
  </div>`;
}

function App() {
  const route = useStore(selectRoute);
  useLang(); // a language switch re-renders the whole tree in place
  const [error, resetError] = useErrorBoundary((err) => console.error('[ui] screen crashed', err));
  const Screen = SCREENS[route] || LobbyScreen;
  return html`<div class="app-root">
    <div class="app-bg" aria-hidden="true"></div>
    ${error ? html`<${ScreenCrashed} error=${error} reset=${resetError} />` : html`<${Screen} key=${route} />`}
    <${ConnectionBanner} />
    <${NoticeBanner} />
    <${ToastHost} />
    <${UiHosts} />
    <${GuideHost} />
    <${CodexHost} />
    <${BugReportHost} />
    <${LoadoutHost} />
    <${StatsHost} />
    <${AssetModePrompt} />
  </div>`;
}

// ---- boot -----------------------------------------------------------------------------------------

async function waitForFonts(ms) {
  const fonts = document.fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const loads = [
    fonts.load('900 1em "Noto Sans SC"', '卫戍协议盟约'), // i18n-ignore (font sample)
    fonts.load('700 1em "Noto Sans SC"', '开始'), // i18n-ignore (font sample)
    fonts.load('700 1em Bender', '0123456789'),
    fonts.load('700 1em Rajdhani', '0123456789'),
  ].map((p) => p.catch(() => null));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, ms))]);
}

function installGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (ev) => {
    const err = ev.reason;
    // Media autoplay/abort rejections (audio.play() before a user gesture, interrupted loads) are
    // expected browser behaviour, not app errors: log quietly, never toast.
    if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) { console.warn('[app] ignored rejection', err.name); return; }
    console.error('[app] unhandled rejection', err);
    recordError('rejection', err);
    if (err instanceof NetError) toastError(err);
    else toast(t('发生意外错误：{error}', { error: describeError(err) }).slice(0, 120), 'error');
  });
  window.addEventListener('error', (ev) => {
    if (!(ev instanceof ErrorEvent)) return; // resource load errors are not script errors
    console.error('[app] uncaught error', ev.error || ev.message);
    recordError('error', ev.error || ev.message, ev.error ? null : `${ev.filename || '?'}:${ev.lineno || 0}:${ev.colno || 0}`);
  });
}

/**
 * Mount the optional boot background video (js/preload.js BOOT_VIDEO): a distraction while the first load runs.
 * @returns {() => void} stop() — halts playback and frees the decoder. Call it when the boot screen goes away: a
 *   detached <video> holds its buffer/decoder, and the gesture listener below keeps it alive, so without this the first
 *   click after the boot would re-start the (now unmuted) video behind the game — stutter + it talks over the BGM.
 */
function mountBootVideo() {
  const box = document.getElementById('boot-video');
  const boot = document.getElementById('boot');
  if (!box || !boot || !BOOT_VIDEO) return () => {};
  let stop = () => {};
  try {
    if (BOOT_VIDEO.kind === 'bilibili') {
      const f = document.createElement('iframe');
      f.className = 'boot__frame';
      f.setAttribute('allowfullscreen', 'true');
      f.setAttribute('frameborder', '0');
      f.setAttribute('scrolling', 'no');
      f.src = `//player.bilibili.com/player.html?bvid=${encodeURIComponent(BOOT_VIDEO.bvid)}&page=${BOOT_VIDEO.page || 1}&autoplay=1&danmaku=0&high_quality=1`;
      box.appendChild(f);
      stop = () => { try { f.src = 'about:blank'; f.remove(); } catch { /* ignore */ } };
    } else if (BOOT_VIDEO.kind === 'file' && BOOT_VIDEO.src) {
      const v = document.createElement('video');
      v.className = 'boot__frame';
      // The owner's chain: the relay's /clip route, then GitHub and its mirrors (the plain file behind the route),
      // then this server's route and file. Each step only on an error.
      const clipRoute = BOOT_VIDEO.src;                        // '/clip/boot?v=2'
      const clipQuery = clipRoute.includes('?') ? clipRoute.slice(clipRoute.indexOf('?')) : '';
      const clipFile = `/assets/loading/boot.mp4${clipQuery}`; // shared/clip.js CLIP_PARTS.boot
      const clipChain = [...new Set([
        mirrorRouteUrl(clipRoute), ...mirrorCandidates(clipFile).slice(1, -1), clipRoute, clipFile,
      ])];
      let clipTier = 0;
      v.addEventListener('error', () => {
        if (clipTier + 1 >= clipChain.length) return;
        clipTier += 1;
        try { v.src = clipChain[clipTier]; v.load?.(); v.play?.().catch(() => {}); } catch { /* ignore */ }
      });
      v.src = clipChain[0];
      // Background only: looped + autoplay + NO controls (not seekable, not draggable, no PiP). Browsers refuse sound
      // until the user interacts with the page, so it starts muted and unmutes on the first pointer/键 gesture — no
      // visible control; a dim hint tells the player to tap/click.
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.controls = false;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.setAttribute('disablepictureinpicture', '');
      v.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback nofullscreen');
      box.appendChild(v);
      try { v.play?.().catch(() => {}); } catch { /* autoplay may be blocked; the frame still shows */ }
      const sound = document.getElementById('boot-sound');
      if (sound) sound.hidden = false;
      let done = false; // set by stop(): after the boot the gesture must never revive the retired video
      const unlock = () => {
        if (done) return;
        try { v.muted = false; v.play?.().catch(() => {}); } catch { /* ignore */ }
        if (sound) sound.hidden = true;
      };
      window.addEventListener('pointerdown', unlock, { once: true, capture: true });
      window.addEventListener('keydown', unlock, { once: true, capture: true });
      stop = () => {
        if (done) return;
        done = true;
        window.removeEventListener('pointerdown', unlock, { capture: true });
        window.removeEventListener('keydown', unlock, { capture: true });
        // pause + drop the source so the video decoder is released and it can no longer make any sound
        try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch { /* ignore */ }
      };
    } else {
      return () => {};
    }
    box.hidden = false;
    boot.classList.add('has-video');
  } catch { /* no video is fine */ }
  return stop;
}

/**
 * True when the art is already in the browser's HTTP cache. A cached image decodes in a few ms; from the network it
 * cannot beat a round trip — so a fast probe means a returning visitor, who must NOT queue behind a first-time
 * downloader at the boot gate (server/bootgate.js). ~0.35 s covers a warm cache with margin.
 * @param {string[]} urls
 * @returns {Promise<boolean>}
 */
function artLikelyCached(urls) {
  const picks = [urls[0], urls[(urls.length / 2) | 0], urls[urls.length - 1]].filter(Boolean);
  if (!picks.length) return Promise.resolve(false);
  const t0 = performance.now();
  return Promise.all(picks.map((u) => new Promise((res) => {
    const img = new Image();
    img.onload = img.onerror = () => res();
    img.src = u;
  }))).then(() => performance.now() - t0 < 350);
}

/**
 * Ask the server for a boot-preload slot (server/bootgate.js) and wait until it is granted. Never blocks the boot
 * forever: a server that does not know `boot.claim`, or one that is unreachable, just means "no gate".
 * @returns {Promise<boolean>} true when a slot is held (the caller must release it), false to proceed ungated
 */
async function acquireBootSlot() {
  let misses = 0;
  for (let i = 0; i < 300; i++) {
    try {
      await net.request('boot.claim', {});
      misses = 0;
    } catch (err) {
      if (err && err.code === 'BAD_MSG') { bootGate.supported = false; return false; } // server predates the gate
      if (++misses >= 15) return false;                                               // no server for ~30 s → don't block
    }
    if (bootGate.granted) return true;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return false;
}

/**
 * Boot-time art preload (docs/ASSETS.md): warm the HTTP cache for the image set the UI draws, so entering a screen does
 * not pop images in. Runs while fonts load and the socket connects; skippable and capped so a slow link is never stuck.
 * Scope 'all' = every manifest image (~104 MB, ~1 min at 20 Mbps) — the user asked for a full preload before the title.
 */
/**
 * Pick the CDN mirror **once**, as early as possible (js/assetMirror.js). The order is the whole point: the art
 * manifests are rewritten when they are fetched (`js/data.js` `rewriteArtManifest`), so a prefix that arrives after
 * them changes nothing — measured 2026-10-14 on the box, `/data/assets.json` came down 40 ms before the probe answered,
 * the store kept the raw paths, and the boot preload pulled all 135 MB of art from this server with the mirror idle.
 * One probe per page: a second call would clear the prefix mid-load.
 * @returns {Promise<string>} the installed prefix ('' when none)
 */
let assetMirrorReady = null;
function ensureAssetMirror() {
  return (assetMirrorReady ||= initAssetMirror().catch(() => ''));
}

async function preloadArt() {
  const bar = document.getElementById('boot-bar');
  const fill = document.getElementById('boot-bar-fill');
  const sub = document.getElementById('boot-sub');
  if (!bar || !fill) return;
  // Pick the CDN mirror first (js/assetMirror.js): it lets the boot preload come from gh-proxy / jsDelivr instead of
  // this box, while a dev origin and a silent mirror leave everything on this server.
  await ensureAssetMirror();
  // The local cache has two layers: the Service Worker (intercepts everything, needs HTTPS) and, when it cannot
  // register, the IndexedDB store for the files the game fetches itself (audio, scene bundles). The SW wins.
  setIdbEnabled(idbSupported() && !assetCacheSupported());
  let manifest = data.get('assets');
  if (!manifest) { try { await data.load('assets'); } catch { /* ignore */ } manifest = data.get('assets'); }
  const urls = collectArtUrls(manifest, 'all');
  if (!urls.length) return;
  bar.hidden = false;
  if (sub) { sub.hidden = false; sub.textContent = t('正在加载美术资源 0 / {n}', { n: urls.length }); }
  // Local asset cache (js/assetCache.js + public/sw.js): when the player chose "缓存到本地", bring the Service Worker
  // cache up to the server's art revision — a current copy fetches nothing, otherwise only the missing / changed
  // files. The server is never gated for a local hit, so we skip the boot gate here entirely.
  if (effectiveAssetMode() === 'cache' && assetCacheSupported()) {
    if (sub) { sub.hidden = false; sub.textContent = t('正在同步本地美术缓存…'); }
    try {
      const index = await fetchAssetIndex();
      const localBase = localSourceEnabled() ? await probeLocalBase({ remoteRevision: index.revision }) : '';
      const r = await ensureAssets({ urls, index, onProgress: artProgressReporter({ fill, sub }), localBase });
      if (r && r.ok) { bar.hidden = true; if (sub) sub.hidden = true; return; }
    } catch { /* fall back to the HTTP preload below */ }
    if (sub) sub.textContent = t('正在加载美术资源 0 / {n}', { n: urls.length });
  }
  // Boot gate (server/bootgate.js, docs/MATCHMAKING.md): the first-time payload is ~140 MB and the VPS uplink is only
  // 20 Mbps, so a few simultaneous arrivals saturate it and spike everyone's ping. Only a COLD load queues — a
  // returning visitor whose images are already cached skips the gate entirely.
  let holding = false;
  if (bootGate.supported && !(await artLikelyCached(urls))) {
    if (sub) { sub.hidden = false; sub.textContent = t('正在申请资源下载通道…'); }
    holding = await acquireBootSlot();
  }
  // The preload is a cache warmer, not a gate. It used to be open-ended ("the title only appears once every image is
  // in"), which held while this box was the source — its 1.2 MB/s pace put a floor of ~2 min on the whole load either
  // way. With the CDN mirror carrying the art (js/assetMirror.js) the wall clock is bounded by the mirror's per-image
  // latency instead: measured 2026-10-14, gh-proxy answered ~6 images/s (the browser's 6 connections per host), so the
  // full 2461 took ~6 min. Past the deadline the title shows and the rest warms on demand, which is what heavy art
  // (Spine, portraits, audio) already does. PRELOAD_DEADLINE_MS = 0 restores the old "everything first" behaviour.
  const pre = preloadImages(urls, {
    concurrency: 8,
    onProgress: artProgressReporter({ fill, sub }),
  });
  let preloadTimer = null;
  try {
    // Race the deadline against the preload rather than relying on cancel() to settle: cancel() stays pending while an
    // in-flight image hangs, and the title must not wait on that.
    const deadline = PRELOAD_DEADLINE_MS > 0
      ? new Promise((resolve) => { preloadTimer = setTimeout(() => { pre.cancel(); resolve(); }, PRELOAD_DEADLINE_MS); })
      : null;
    await (deadline ? Promise.race([pre.promise, deadline]) : pre.promise);
  } finally {
    if (preloadTimer) clearTimeout(preloadTimer);
    if (holding) net.request('boot.release', {}).catch(() => {});
    bar.hidden = true;
    if (sub) sub.hidden = true;
  }
}

async function boot() {
  // Pick the art origin FIRST (js/assetMirror.js). Everything below resolves against it — the art manifests are
  // rewritten when they are fetched, the boot video's <video> takes its src here, and a prefix that arrives later
  // cannot rewrite what is already cached or already loading (measured 2026-10-14: the manifests came down 40 ms
  // before the probe answered, and later the boot clip had already taken this server's URL).
  await ensureAssetMirror();
  // A mirrored <img> that fails falls back to this server once, whatever component rendered it.
  installImageFallback();
  // A stale served index.html may lack the manifest <link> (the stats.css lesson), which hides the title's
  // 添加到桌面 button; re-link it before the first render (ui/ensureManifest.js).
  ensureManifestLink('/manifest.json');
  installGlobalErrorHandlers();
  // what this page downloads, by category, for the 问题反馈 report's traffic line (diag.js; nothing is sent anywhere)
  installTrafficMeter();
  // touch / hover / fullscreen classes, zoom-gesture blocking, rotation re-layout (ui/device.js, css/devices.css)
  installDeviceSupport();
  // Optional boot background video (js/preload.js BOOT_VIDEO) — plays while the preload runs. stopBootVideo() (below,
  // at teardown) halts it and frees the decoder, so it can never keep decoding / making noise behind the game.
  const stopBootVideo = mountBootVideo();
  // A page restored from the back/forward cache has a dead socket and a stale token choice: start over.
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) location.reload(); });
  // Pick this tab's reconnect token (asks other live tabs; ≤150 ms) while fonts load.
  const identityReady = identity.init();

  const pendingJoin = parseRoomParam(location.search);
  const savedName = sanitizeName(identity.loadName());
  const entered = identity.wasEntered() && !!savedName;
  store.set((s) => ({
    me: { ...s.me, name: savedName },
    session: { entered },
    ui: { ...s.ui, pendingJoin },
  }));

  wireNet();
  installStatsRecorder(store); // follows the match on screen, so a 放弃模拟 can be recorded (ui/stats.js)
  // Match records are also submitted to the server (ui/statsSync.js, docs/MATCHMAKING.md §40): every stored record,
  // the local backlog on a `welcome`, and the backlog again once logged in.
  const statsSync = installStatsSync({ net });
  setStatsUploader(() => { void statsSync.flush(); });
  installLoadoutSync({ net });
  installOwnershipSync({ net });
  installDiySync({ net });
  installSkinsSync({ net });
  // A bot prep's layout rehearsal the server offers this host's browser (DESIGN §14, SP_BOT_REHEARSAL=host on the
  // server): a same-origin module Worker simulates the candidates off the main thread and answers with its pick; a
  // browser that cannot run one answers `error` and the server rehearses itself. Nothing happens while the server
  // does not delegate.
  rehearsal = installRehearsal({ net });
  // the room's cosmetic plugins and the player's own over the art manifest (content.js; nothing is fetched without them)
  installContent({ toast });
  // a room with gameplay plugins: its content set downloaded, checked and shown (content.js — DESIGN §32.6)
  installContentSet({ toast });
  net.attachBrowserHooks();
  // Audio: unlock on first gesture, BGM follows the route / match phase (js/audio.js).
  installAudio({ getManifest: () => data.get('assets'), subscribe: store.subscribe, getState: store.get, selectRoute, settings: settingsStore.get() });
  // Warm the data cache in the background (missing files are tolerated).
  data.loadAll('config').catch(() => {});
  // Optional local-client art manifest (emotes, tutorial pages, official UI sprites; DESIGN §13).
  data.load('local').catch(() => {});

  net.setAccountToken(loadPref('authToken', null)); // restore the stored account session before the hello
  const connectWhenReady = identityReady.then(() => {
    if (entered) net.setName(savedName);
    // On the title we still open a session (hello) so the 登录 / 注册 box works before 开始: the server requires a
    // session for auth.*. The provisional name is a placeholder, replaced when the player enters or logs in.
    else net.setName(savedName || t('博士'));
  });
  // the language (and its UI translations) before the first render: no Chinese flash for an English player
  const langReady = initLang().catch((err) => console.warn('[app] language setup failed', err));
  await Promise.all([waitForFonts(1200), connectWhenReady, preloadArt(), langReady]);
  const root = document.getElementById('app');
  render(html`<${App} />`, root);

  const splash = document.getElementById('boot');
  if (splash) {
    splash.classList.add('is-done');
    setTimeout(() => { splash.remove(); stopBootVideo(); }, 300);
  } else {
    stopBootVideo();
  }
  globalThis.__SP__ = { store, net, data, version: 1 };
  // A page keeps the modules it imported at load time for its whole lifetime, so a deploy cannot reach an open tab
  // (ui/buildGuard.js): watch `/healthz.build`. Outside a match the page reloads itself; during a match the guard says
  // so instead (the connection banner offers 刷新页面) and reloads once the match — settlement screen included — is over,
  // so a running game is never thrown away.
  try {
    startBuildGuard({
      inMatch: () => selectRoute(store.get()) === 'game',
      onStale: ({ waiting }) => { if (waiting) store.patch('ui', { buildStale: true }); },
      // the same /healthz names how many plugins the server has: the title screen shows it before any hello
      onHealth: (h) => { const n = pluginCount(h.content); if (n !== store.get().installedPlugins) store.set({ installedPlugins: n }); },
    });
  } catch (err) {
    console.warn('[app] build guard failed to start', err);
  }
}

boot().catch((err) => {
  console.error('[app] boot failed', err);
  const el = document.getElementById('boot-err');
  if (el) el.textContent = t('启动失败，请刷新页面重试');
});
