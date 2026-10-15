// server/admin.js — the read-only operations page (docs/MATCHMAKING.md §12).
// (i18n-ignore-file: the operations page and its strings are developer-facing, never shown to players — docs/I18N.md)
//
//   GET /admin?token=…            → a self-contained page (polls the JSON every 2 s)
//   GET /admin/api/state?token=…  → { now, counts, queue, rooms, accounts, online }
//
// It lists every registered account with its live status (离线 / 在线 / 组队中 / 野排排队 / 野排游玩 / 同盟游玩 /
// 单人游玩) plus every connected session (guests included) and every room. Access needs a token: `var/admin-token.txt`
// (created on first boot, printed in the startup banner). Keep the server behind a firewall if the LAN should not see it.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DIFFICULTY_NAMES, MAX_SEATS } from '../shared/constants.js';
import { presenceOnline } from './net.js';

/** The status vocabulary shown in the page (order = how the columns are grouped). */
export const STATUS = Object.freeze({
  offline: { label: '离线', color: '#8a8f8c' },
  online: { label: '在线', color: '#4ed8af' },
  room: { label: '组队中', color: '#5cc8ff' },
  queue: { label: '野排排队', color: '#ffd089' },
  mmplay: { label: '野排游玩', color: '#ffa94d' },
  alliance: { label: '同盟游玩', color: '#b28cff' },
  solo: { label: '单人游玩', color: '#7bd88f' },
});

/**
 * The live status of one session. 野排 rooms carry `room.auto` (set by Lobby.createMatchedRoom), which is what
 * separates 野排游玩 from a hand-made 同盟游玩.
 * @param {any} session
 * @param {{ lobby: any, matchmaker: any }} env
 * @returns {keyof typeof STATUS}
 */
export function statusOf(session, { lobby, matchmaker, now = Date.now() }) {
  // presence, not raw `connected`: a logged-in session stays online through its short post-disconnect grace.
  if (!presenceOnline(session, now)) return 'offline';
  if (matchmaker && matchmaker.byKey && matchmaker.byKey.has(session.playerId)) return 'queue';
  const room = session.roomCode ? lobby.getRoom(session.roomCode) : null;
  const seat = room ? room.seatOf(session.playerId) : null;
  if (room && seat && !seat.left) {
    if (room.match) {
      if (room.mode === 'solo') return 'solo';
      return room.auto ? 'mmplay' : 'alliance';
    }
    return 'room'; // in a room lobby, not started yet
  }
  return 'online';
}

/**
 * A JSON-serializable snapshot of accounts + live sessions + rooms.
 * @param {{ registry: any, lobby: any, matchmaker?: any, auth: any, community?: any, bugStatus?: string|null,
 *   bugSort?: string, now?: number }} deps
 */
export function buildSnapshot({ registry, lobby, matchmaker, auth, community = null, bugStatus = null, bugSort = 'status', now = Date.now() }) {
  const mm = matchmaker || (lobby && lobby.mm) || null;
  const sessions = [...registry.all()];
  const liveByAccount = new Map();
  for (const s of sessions) if (presenceOnline(s, now) && s.accountId != null) liveByAccount.set(s.accountId, s);

  const online = sessions.filter((s) => presenceOnline(s, now)).map((s) => ({
    playerId: s.playerId,
    name: s.name,
    role: s.role ?? null,
    accountId: s.accountId ?? null,
    status: statusOf(s, { lobby, matchmaker: mm, now }),
    roomCode: s.roomCode ?? null,
    addr: s.addr ?? null,
    lastSeen: s.lastSeen ?? null,
  }));

  const accounts = (auth && typeof auth.listAccounts === 'function' ? auth.listAccounts() : []).map((a) => {
    const s = liveByAccount.get(a.id) || null;
    return {
      id: a.id,
      name: a.name,
      createdAt: a.created_at ?? null,
      lastLogin: a.last_login ?? null,
      banned: !!a.banned,
      role: a.role ?? null,
      status: statusOf(s, { lobby, matchmaker: mm, now }),
      playerId: s ? s.playerId : null,
      roomCode: s ? s.roomCode : null,
    };
  });

  const counts = { accounts: accounts.length, connected: online.length, guests: 0 };
  for (const k of Object.keys(STATUS)) counts[k] = 0;
  for (const a of accounts) counts[a.status] = (counts[a.status] || 0) + 1;
  for (const s of online) if (s.accountId == null) counts.guests += 1;

  const rooms = [...lobby.rooms.values()].map((r) => ({
    code: r.code,
    mode: r.mode,
    modeName: r.mode === 'solo' ? '独立模拟' : '同盟模拟',
    difficulty: r.difficulty,
    difficultyName: DIFFICULTY_NAMES[r.difficulty] || r.difficulty,
    inMatch: !!r.match,
    auto: !!r.auto,
    humans: r.seats.filter((x) => x && !x.left && !x.isBot).length,
    bots: r.seats.filter((x) => x && !x.left && x.isBot).length,
  }));

  // SP_VERIFY (docs): the server re-simulates a sample of client battle results and uses its own on a mismatch —
  // a safe anti-cheat that never rejects an honest result. Surface it so the mode and counters are observable.
  const envVerify = String(process.env.SP_VERIFY || '').trim().toLowerCase();
  const verify = { mode: envVerify === 'sample' || envVerify === 'all' ? envVerify : 'off', checked: 0, mismatches: 0, rejected: 0, takeovers: 0 };
  for (const r of lobby.rooms.values()) {
    const m = r.match;
    if (!m || typeof m !== 'object') continue;
    if (typeof m.verifyMode === 'string' && m.verifyMode !== 'off') verify.mode = m.verifyMode;
    const v = m.verifyStats;
    if (v) {
      verify.checked += v.checked || 0;
      verify.mismatches += v.mismatches || 0;
      verify.rejected += v.rejected || 0;
      verify.takeovers += v.takeovers || 0;
    }
  }

  // Player bug reports (server/community.js, docs/MATCHMAKING.md §36): TEXT + images (metadata only here; the image
  // bytes come from the token-gated /admin/api/bug/image/<id>). Server-side filtered / sorted (bugStatus / bugSort) so
  // the rules apply to the whole set, not only this page; `bugCounts` feeds the filter chips.
  const bugs = community && typeof community.listBugReports === 'function' ? community.listBugReports({ status: bugStatus, sort: bugSort, limit: 100 }) : [];
  const bugCounts = community && typeof community.bugReportCounts === 'function' ? community.bugReportCounts() : { new: 0, triaged: 0, fixed: 0, total: 0 };

  return { now, counts, queue: mm ? mm.stats() : { queued: 0, buckets: 0 }, verify, rooms, accounts, online, bugs, bugCounts, notices: Array.isArray(lobby.notices) ? lobby.notices.slice(0, 20) : [] };
}

/**
 * A PUBLIC, token-free view of who is online right now — for the lobby's 在线 badge link (`/online`). It deliberately
 * omits everything sensitive (no account list, no IPs, no last-login): player names are already visible in-game.
 */
export function buildPublicSnapshot({ registry, lobby, matchmaker, now = Date.now() }) {
  const mm = matchmaker || (lobby && lobby.mm) || null;
  const online = [...registry.all()].filter((s) => presenceOnline(s, now)).map((s) => ({
    name: s.name,
    role: s.role ?? null,
    guest: s.accountId == null,
    status: statusOf(s, { lobby, matchmaker: mm, now }),
    roomCode: s.roomCode ?? null,
  }));
  const counts = { online: online.length, guests: online.filter((x) => x.guest).length };
  // The account binding of a seat is the only private bit behind `seats` below; playerId is an internal id, so it is
  // looked up here and never sent (the same rule that keeps accountId / addrs / tokens off this endpoint).
  const accountByPlayerId = new Map();
  for (const s of typeof registry.all === 'function' ? registry.all() : []) {
    if (s && s.accountId != null) accountByPlayerId.set(s.playerId, s.accountId);
  }
  // A room's MAX_SEATS co-op seats, in seat order: null for an empty seat (or one its player has left), else the
  // public identity the directory draws in a seat cell. No playerId / accountId / addr — names and roles are already
  // exposed in-game; `guest` is the only thing read from the account binding.
  const seatsOf = (r) => Array.from({ length: MAX_SEATS }, (_, i) => {
    const s = r.seats[i];
    if (!s || s.left) return null;
    const isBot = !!s.isBot;
    return {
      name: s.name,
      role: s.role ?? null,
      guest: !isBot && !accountByPlayerId.has(s.playerId),
      isBot,
      isHost: s.playerId === r.hostId,
    };
  });
  // 组队中 rooms (hand-made co-op rooms still in the lobby): a full lobby (no free seat) is kept too — the directory
  // lists it below the joinable ones and offers 观战 instead of 加入 (owner 2026-10-09). Each entry carries `full` and
  // `freeSeats`; the rest of the fields are unchanged.
  const freeSeatsOf = (r) => r.seats.filter((s) => s == null).length;
  // A room lives only while it seats a human PLAYER (owner rule, docs/MATCHMAKING.md §20): never list an all-AI room,
  // and never a `humans: 0` entry. Bot-only rooms are already disposed when their last human leaves, so this is a
  // belt-and-braces guard on the public directory too.
  const humansOf = (r) => r.seats.filter((x) => x && !x.left && !x.isBot).length;
  const openRooms = [...lobby.rooms.values()]
    .filter((r) => r.mode === 'coop' && r.public && !r.match && !r.auto && humansOf(r) > 0)
    .map((r) => ({
      code: r.code,
      difficulty: r.difficulty,
      difficultyName: DIFFICULTY_NAMES[r.difficulty] || r.difficulty,
      host: (r.seatOf(r.hostId) || {}).name || null,
      hostRole: (r.seatOf(r.hostId) || {}).role ?? null,
      humans: humansOf(r),
      full: r.freeSeat() < 0,
      freeSeats: freeSeatsOf(r),
      seats: seatsOf(r),
    }))
    .sort((a, b) => (a.full - b.full) || (b.humans - a.humans))
    .slice(0, 12);
  // Rooms whose match is already running (the lobby's 正在模拟 row → enter as a spectator): 野排 first, then rooms with
  // an AI seat to 夺舍, then the fullest — at most 4.
  const playRooms = [...lobby.rooms.values()]
    .filter((r) => r.mode === 'coop' && r.match && humansOf(r) > 0)
    .map((r) => ({
      code: r.code,
      difficulty: r.difficulty,
      difficultyName: DIFFICULTY_NAMES[r.difficulty] || r.difficulty,
      host: (r.seatOf(r.hostId) || {}).name || null,
      hostRole: (r.seatOf(r.hostId) || {}).role ?? null,
      humans: humansOf(r),
      bots: r.seats.filter((x) => x && !x.left && x.isBot).length,
      auto: !!r.auto,
      seats: seatsOf(r),
    }))
    .sort((a, b) => (b.auto - a.auto) || ((b.bots > 0) - (a.bots > 0)) || (b.humans - a.humans))
    .slice(0, 4);
  return { now, counts, openRooms, playRooms, online };
}

/**
 * Read (or create) the admin token at `var/admin-token.txt`.
 * @param {string} root repo root
 * @param {string} [file]
 * @returns {string}
 */
export function loadAdminToken(root, file = join(root, 'var', 'admin-token.txt')) {
  try {
    const t = readFileSync(file, 'utf8').trim();
    if (t) return t;
  } catch { /* create below */ }
  const token = randomBytes(16).toString('hex');
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${token}\n`, { mode: 0o600 });
  } catch { /* keep the in-memory token even if the file cannot be written */ }
  return token;
}

/** Constant-time token comparison (false when either side is empty/missing). */
export function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || !provided || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The self-contained admin page (no external assets; polls the API and renders cards + three tables). */
export const ADMIN_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>服务器管理 · Stronghold Protocol</title>
<style>
:root{color-scheme:dark;
  --bg:#070b0a;--side:#0a100e;--panel:#0d1412;--panel2:#0a100e;--line:#1b2823;--line2:#263630;
  --text:#e6f2ec;--dim:#8a9b94;--dim2:#64736c;--mint:#4ed8af;--mint-dim:#2f7f68;
  --amber:#ffd089;--blue:#5cc8ff;--violet:#b28cff;--orange:#ffa94d;--grey:#8a8f8c;--green:#7bd88f}
*{box-sizing:border-box}
html,body{margin:0}
body{background:radial-gradient(1100px 620px at 8% -10%,rgba(78,216,175,.09),transparent 60%),
  radial-gradient(900px 520px at 100% -6%,rgba(92,200,255,.06),transparent 55%),var(--bg);
  color:var(--text);font:14px/1.55 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
[hidden]{display:none!important}
.app{display:flex;align-items:stretch;min-height:100vh}

/* ---------------- 侧栏 ---------------- */
.side{width:240px;flex:none;position:sticky;top:0;height:100vh;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#0b1210,#080d0c);border-right:1px solid var(--line)}
.side__brand{display:flex;align-items:center;gap:11px;padding:15px 16px 14px;border-bottom:1px solid var(--line)}
.side__mark{width:36px;height:36px;flex:none;display:grid;place-items:center;border:1px solid var(--line2);border-radius:10px;
  color:var(--mint);font-size:18px;background:linear-gradient(180deg,#121a17,#0b1210);box-shadow:inset 0 0 16px rgba(78,216,175,.14)}
.side__brand h1{margin:0;font-size:15.5px;letter-spacing:.02em}
.side__brand small{display:block;color:var(--dim2);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase}
.nav{padding:9px 8px 12px;display:flex;flex-direction:column;gap:2px;overflow:auto}
.nav__sect{padding:11px 10px 4px;color:var(--dim2);font-size:10px;letter-spacing:.17em;text-transform:uppercase}
.nav__item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:1px solid transparent;
  border-radius:9px;padding:7px 10px;color:var(--dim);font:inherit;font-size:13.5px;cursor:pointer;
  transition:background .14s,color .14s,border-color .14s}
.nav__item:hover{background:rgba(78,216,175,.06);color:var(--text)}
.nav__item.is-on{background:rgba(78,216,175,.10);border-color:rgba(78,216,175,.28);color:var(--mint)}
.nav__item i{font-style:normal;width:15px;text-align:center;opacity:.85}
.nav__item em{margin-left:auto;font-style:normal;font-size:11.5px;color:var(--dim2);font-variant-numeric:tabular-nums}
.nav__item.is-on em{color:var(--mint)}
.side__foot{margin-top:auto;padding:12px 14px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:7px;
  color:var(--dim);font-size:12px}
.live{display:inline-flex;align-items:center;gap:6px;color:var(--mint)}
.live i{width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 9px var(--mint);animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.side__line{color:var(--dim2);font-size:11.5px;font-variant-numeric:tabular-nums;word-break:break-word}
.side__keys{color:var(--dim2);font-size:11px}
kbd{font:inherit;font-size:10.5px;color:var(--dim);border:1px solid var(--line2);border-radius:4px;padding:0 4px;background:#0e1614}
.btn{background:#111917;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:6px 12px;cursor:pointer;
  font:inherit;font-size:12.5px;transition:border-color .15s,color .15s,background .15s}
.btn:hover:not(:disabled){border-color:var(--mint-dim);color:var(--mint)}
.btn:disabled{opacity:.55;cursor:default}
.btn--primary{border-color:rgba(78,216,175,.45);color:var(--mint);background:rgba(78,216,175,.10)}
.btn--primary:hover:not(:disabled){background:rgba(78,216,175,.16)}

/* ---------------- 主区 ---------------- */
.main{flex:1;min-width:0;padding:0 22px 56px}
.head{position:sticky;top:0;z-index:5;display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;
  padding:16px 0 12px;margin-bottom:14px;border-bottom:1px solid var(--line);
  background:linear-gradient(180deg,rgba(7,11,10,.97),rgba(7,11,10,.75) 72%,transparent);backdrop-filter:blur(6px)}
.head h2{margin:0;font-size:20px;letter-spacing:.01em}
.head p{margin:2px 0 0;color:var(--dim);font-size:12.5px}
.head__right{display:flex;align-items:center;gap:12px;color:var(--dim);font-size:12.5px}
.clock{font-variant-numeric:tabular-nums}

.cards-group{margin-bottom:15px}
.cards-group>h3{margin:0 0 8px;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim2);font-weight:600}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px}
.card{position:relative;padding:12px 13px 11px 16px;border:1px solid var(--line);border-radius:11px;
  background:linear-gradient(180deg,var(--panel),var(--panel2));overflow:hidden}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent,var(--mint));opacity:.9}
.card b{display:block;font-size:25px;line-height:1.1;font-variant-numeric:tabular-nums;color:var(--accent,var(--mint))}
.card span{font-size:12px;color:var(--dim)}

.two{display:grid;grid-template-columns:1fr 1fr;gap:15px}
.panel{border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,var(--panel),var(--panel2));
  margin-bottom:15px;overflow:hidden}
.panel>h2{display:flex;align-items:center;gap:9px;margin:0;padding:12px 16px;font-size:13.5px;font-weight:600;letter-spacing:.02em;
  color:#d3efe2;border-bottom:1px solid var(--line)}
.panel>h2::before{content:"";width:3px;height:15px;border-radius:2px;background:var(--mint);box-shadow:0 0 9px rgba(78,216,175,.55)}
.panel>h2 em{font-style:normal;color:var(--dim);font-weight:400;font-size:12px}
.panel__body{padding:14px 16px}

/* 状态分布 */
.dist{display:flex;height:12px;border-radius:999px;overflow:hidden;border:1px solid var(--line);background:#0a100e}
.dist__seg{height:100%;transition:width .3s}
.legend{display:flex;flex-wrap:wrap;gap:7px 17px;margin-top:11px}
.legend span{display:inline-flex;align-items:center;gap:6px;color:var(--dim);font-size:12.5px}
.legend i{width:8px;height:8px;border-radius:2px;background:currentColor}
.legend b{color:var(--text);font-variant-numeric:tabular-nums}

/* 运行状态 / 迷你列表 */
.kv{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:13px;margin:0}
.kv dt{color:var(--dim2)}
.kv dd{margin:0;color:var(--text);font-variant-numeric:tabular-nums}
.mini-item{display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px}
.mini-item:last-child{border-bottom:0}
.mini-item time{color:var(--dim2);font-size:11.5px;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.mini-item span{flex:1;color:var(--dim)}
.mini-item em{font-style:normal;color:var(--mint);font-size:12px;white-space:nowrap}

/* 表格 + 工具条 */
.tools{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--line)}
.search{flex:1;min-width:170px;max-width:360px;background:var(--panel2);color:var(--text);border:1px solid var(--line2);
  border-radius:8px;padding:6px 11px;font:inherit;font-size:13px}
.search:focus{outline:none;border-color:var(--mint-dim)}
.tools .hint{color:var(--dim2);font-size:12px}
.tablewrap{overflow:auto;max-height:66vh}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 15px;white-space:nowrap;border-bottom:1px solid var(--line)}
thead th{position:sticky;top:0;z-index:1;background:#0c1311;color:var(--dim);font-weight:600;font-size:11px;
  letter-spacing:.07em;text-transform:uppercase}
thead th[data-key]{cursor:pointer;user-select:none}
thead th[data-key]:hover{color:var(--mint)}
thead th.is-sorted{color:var(--mint)}
tbody tr:hover{background:rgba(78,216,175,.05)}
tbody tr:last-child td{border-bottom:0}
td.mono,.mono{font-family:ui-monospace,Consolas,"Cascadia Mono",monospace;color:#a9c6bd;font-size:12px}
.empty{color:var(--dim2);text-align:center;padding:24px}
.badge{display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 8px;border:1px solid;border-radius:999px;font-size:12px}
.badge i{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}
.pill{display:inline-block;padding:1px 9px;border-radius:7px;font-size:11.5px;border:1px solid var(--line2);color:var(--dim)}
.pill.yes{color:var(--mint);border-color:rgba(78,216,175,.42);background:rgba(78,216,175,.08)}
.pill.guest{color:#ffd089;border-color:rgba(255,208,137,.4);background:rgba(255,208,137,.08)}
/* account role (shared/constants.js ROLES): 管理员 / 开发者, assigned with tools/role.mjs */
.roletag{display:inline-block;padding:1px 8px;font-size:11px;font-weight:600;color:#ffd089;
  border:1px solid rgba(255,208,137,.5);border-radius:99px;background:rgba(255,208,137,.08)}
/* 通知 (operator broadcast, server/lobby.js broadcastNotice): a form + the sent history */
.notice-form{display:flex;flex-direction:column;gap:9px;padding:14px 16px 4px}
.notice-form textarea{width:100%;min-height:62px;resize:vertical;background:var(--panel2);color:var(--text);
  border:1px solid var(--line2);border-radius:8px;padding:9px 11px;font:inherit}
.notice-form textarea:focus{outline:none;border-color:var(--mint-dim)}
.notice-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.notice-row input,.notice-row select{background:var(--panel2);color:var(--text);border:1px solid var(--line2);
  border-radius:8px;padding:6px 10px;font:inherit;font-size:13px}
.notice-row input{width:170px}
.notice-row .grow{flex:1}
.notice-note{padding:4px 16px 0;color:var(--dim2);font-size:12px}
.notice-hist{padding:10px 16px 14px}
.notice-item{display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px dashed var(--line);font-size:13px}
.notice-item:last-child{border-bottom:0}
.notice-item time{color:var(--dim2);font-size:11.5px;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.notice-item b{color:#d3efe2;font-weight:600}
.notice-item i{font-style:normal;color:var(--dim)}
.notice-item em{font-style:normal;color:var(--mint);font-size:12px;white-space:nowrap}
/* 玩家反馈 (server/community.js): text reports + their images (served from the token-gated image route) */
.bug-item{padding:11px 16px;border-bottom:1px dashed var(--line)}
.bug-item:last-child{border-bottom:0}
.bug-head{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.bug-head b{color:#d3efe2;font-weight:600}
.bug-head i{font-style:normal;color:var(--dim)}
.bug-head time{color:var(--dim2);font-size:11.5px;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.bug-body{white-space:pre-wrap;color:var(--dim);font-size:13px;margin:6px 0 8px;word-break:break-word}
.bug-imgs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 8px}
.bug-imgs img{max-width:160px;max-height:110px;border:1px solid var(--line2);border-radius:7px;background:#000;cursor:zoom-in}
.bug-actions{display:flex;gap:7px;flex-wrap:wrap}
.bug-actions button{background:#111917;color:var(--dim);border:1px solid var(--line2);border-radius:7px;padding:3px 12px;cursor:pointer;font:inherit;font-size:12px}
.bug-actions button:hover:not(:disabled){border-color:var(--mint-dim);color:var(--mint)}
.bug-actions button:disabled{opacity:.55;cursor:default;border-color:var(--mint-dim);color:var(--mint)}
.bug-status{display:inline-block;padding:1px 9px;border-radius:7px;font-size:11.5px;border:1px solid var(--line2)}
.bug-status.is-new{color:#ffd089;border-color:rgba(255,208,137,.45);background:rgba(255,208,137,.08)}
.bug-status.is-triaged{color:#5cc8ff;border-color:rgba(92,200,255,.45);background:rgba(92,200,255,.08)}
.bug-status.is-fixed{color:var(--mint);border-color:rgba(78,216,175,.45);background:rgba(78,216,175,.08)}
.bug-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 16px;border-bottom:1px solid var(--line)}
.bug-toolbar .grow{flex:1}
.bug-sorts{display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;background:#111917;color:var(--dim);border:1px solid var(--line2);border-radius:999px;
  padding:3px 12px;cursor:pointer;font:inherit;font-size:12px;transition:border-color .15s,color .15s,background .15s}
.chip:hover{border-color:var(--mint-dim);color:var(--mint)}
.chip.is-on{border-color:var(--mint-dim);color:var(--mint);background:rgba(78,216,175,.08)}
.chip em{font-style:normal;color:var(--dim2);margin-left:6px;font-variant-numeric:tabular-nums}
.chip.is-on em{color:var(--mint)}
/* 点击图片放大 (viewer / lightbox): the same token-gated /admin/api/bug/image route, just larger */
.viewer{position:fixed;inset:0;z-index:60;background:rgba(4,7,6,.88);display:none;align-items:center;justify-content:center;padding:26px}
.viewer.is-open{display:flex}
.viewer img{max-width:92vw;max-height:84vh;border:1px solid var(--line2);border-radius:8px;background:#000;box-shadow:0 18px 60px rgba(0,0,0,.6)}
.viewer__bar{position:fixed;top:14px;right:18px;display:flex;gap:8px}
.viewer__nav{position:fixed;top:50%;transform:translateY(-50%);width:46px;height:70px;border:1px solid var(--line2);
  background:rgba(14,21,19,.82);color:var(--text);border-radius:10px;cursor:pointer;font-size:24px;line-height:1}
.viewer__nav:hover{border-color:var(--mint-dim);color:var(--mint)}
.viewer__nav.prev{left:16px}
.viewer__nav.next{right:16px}
.viewer__count{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);color:var(--dim);font-size:12.5px;
  background:rgba(8,12,11,.82);padding:4px 12px;border-radius:99px;border:1px solid var(--line);font-variant-numeric:tabular-nums}

/* 测速 (server/speed.js): both vantages per origin, each judged against its own bar. The address is deliberately NOT
   on screen — it is long and pushes the numbers out of view; it stays in the row's tooltip for the rare case. */
.verdict{display:flex;gap:9px;align-items:flex-start;margin:0 0 13px;padding:10px 13px;border:1px solid rgba(78,216,175,.28);
  border-radius:10px;background:rgba(78,216,175,.06);font-size:13.5px;line-height:1.5}
.verdict::before{content:"✔";color:var(--mint);font-weight:700}
.verdict.is-bad{border-color:rgba(255,208,137,.45);background:rgba(255,208,137,.07)}
.verdict.is-bad::before{content:"!";color:var(--amber)}
.verdict b{color:var(--mint)}
.verdict.is-bad b{color:var(--amber)}
.verdict em{font-style:normal;color:var(--dim)}
.speed-table table{table-layout:fixed}
.speed-table th,.speed-table td{white-space:normal;padding:9px 12px}
.speed-table th:nth-child(1){width:30%}
.speed-table th:nth-child(2),.speed-table th:nth-child(3){width:19%}
.speed-table th:nth-child(4){width:13%}
.speed-table th:nth-child(5){width:19%}
.rate{display:flex;flex-direction:column;gap:3px}
.rate b{font-size:14.5px;font-variant-numeric:tabular-nums;color:var(--dim2);line-height:1.2}
.rate__unit{font-size:11px;color:var(--dim2);margin-left:3px}
.rate__bar{height:4px;border-radius:99px;background:#12201c;overflow:hidden;width:100%;max-width:104px}
.rate__bar i{display:block;height:100%;background:var(--grey);transition:width .3s}
.rate.is-ok b{color:var(--mint)}
.rate.is-ok .rate__bar i{background:var(--mint)}
.rate.is-slow b{color:var(--amber)}
.rate.is-slow .rate__bar i{background:var(--amber)}
.src{display:flex;flex-direction:column;gap:2px}
.src b{font-weight:600;color:var(--text)}
.src em{font-style:normal;color:var(--dim2);font-size:11px}
tbody tr.is-chosen td{background:rgba(78,216,175,.06)}
tbody tr.is-chosen td:first-child{box-shadow:inset 3px 0 0 var(--mint)}
.note{margin:13px 0 0;color:var(--dim2);font-size:12px;line-height:1.65}
.note strong{color:var(--dim);font-weight:600}

/* 窄屏：侧栏变成顶部导航 */
@media (max-width:900px){
  .app{flex-direction:column}
  .side{width:auto;height:auto;position:static;border-right:0;border-bottom:1px solid var(--line)}
  .nav{flex-direction:row;flex-wrap:wrap;gap:6px}
  .nav__sect{display:none}
  .nav__item{width:auto}
  .side__foot{flex-direction:row;align-items:center;flex-wrap:wrap}
  .two{grid-template-columns:1fr}
  .main{padding:0 14px 40px}
}
</style></head><body>
<div class="app">
  <aside class="side">
    <div class="side__brand">
      <span class="side__mark">◈</span>
      <div><h1>服务器管理</h1><small>Stronghold Protocol</small></div>
    </div>
    <nav class="nav" id="nav">
      <div class="nav__sect">总览</div>
      <button class="nav__item" data-view="overview"><i>▤</i>概览</button>
      <div class="nav__sect">运营</div>
      <button class="nav__item" data-view="rooms"><i>▣</i>房间<em id="navRooms">0</em></button>
      <button class="nav__item" data-view="accounts"><i>◉</i>账号<em id="navAccounts">0</em></button>
      <button class="nav__item" data-view="online"><i>◎</i>在线<em id="navOnline">0</em></button>
      <button class="nav__item" data-view="notice"><i>✦</i>通知<em id="navNotice">0</em></button>
      <button class="nav__item" data-view="bugs"><i>⚑</i>反馈<em id="navBugs">0</em></button>
      <div class="nav__sect">诊断</div>
      <button class="nav__item" data-view="speed"><i>⚡</i>测速</button>
    </nav>
    <div class="side__foot">
      <span class="live"><i></i>实时 · 每 2 秒</span>
      <span class="side__line" id="verify">校验 —</span>
      <span class="side__line" id="updated">—</span>
      <button class="btn" id="refresh">立即刷新</button>
      <span class="side__keys">快捷键 <kbd>1</kbd>-<kbd>7</kbd> 切换 · <kbd>/</kbd> 搜索 · <kbd>Esc</kbd> 关闭预览</span>
    </div>
  </aside>

  <main class="main">
    <header class="head">
      <div><h2 id="viewTitle">概览</h2><p id="viewSub">服务器实时状态</p></div>
      <div class="head__right"><span>服务器时间</span><span class="clock" id="clock">—</span></div>
    </header>

    <section class="view" id="view-overview">
      <div id="cards"></div>
      <section class="panel">
        <h2>账号状态分布<em id="distTotal"></em></h2>
        <div class="panel__body">
          <div class="dist" id="dist"></div>
          <div class="legend" id="legend"></div>
        </div>
      </section>
      <div class="two">
        <section class="panel">
          <h2>运行状态</h2>
          <div class="panel__body"><dl class="kv" id="runtime"></dl></div>
        </section>
        <section class="panel">
          <h2>最近通知<em id="recentNoticeCount"></em></h2>
          <div class="panel__body" id="recentNotices"></div>
        </section>
      </div>
    </section>

    <section class="view" id="view-rooms" hidden>
      <section class="panel">
        <h2>房间<em id="roomCount">—</em></h2>
        <div class="tools">
          <input class="search" id="roomsSearch" placeholder="搜索 房间码 / 模式 / 难度 / 玩家数"/>
          <span class="hint">点表头排序</span>
        </div>
        <div class="tablewrap"><table data-table="rooms"><thead id="roomsHead"></thead><tbody id="roomsBody"></tbody></table></div>
      </section>
    </section>

    <section class="view" id="view-accounts" hidden>
      <section class="panel">
        <h2>注册账号<em id="acctCount">—</em></h2>
        <div class="tools">
          <input class="search" id="accountsSearch" placeholder="搜索 代号 / 身份 / 状态 / playerId"/>
          <span class="hint">点表头排序</span>
        </div>
        <div class="tablewrap"><table data-table="accounts"><thead id="accountsHead"></thead><tbody id="accountsBody"></tbody></table></div>
      </section>
    </section>

    <section class="view" id="view-online" hidden>
      <section class="panel">
        <h2>在线会话（含游客）<em id="onlineCount">—</em></h2>
        <div class="tools">
          <input class="search" id="onlineSearch" placeholder="搜索 名字 / 账号 / 状态 / 房间 / 地址"/>
          <span class="hint">点表头排序</span>
        </div>
        <div class="tablewrap"><table data-table="online"><thead id="onlineHead"></thead><tbody id="onlineBody"></tbody></table></div>
      </section>
    </section>

    <section class="view" id="view-notice" hidden>
      <section class="panel">
        <h2>通知<em>推送给在线玩家 · 署名建议 d星空之下 · 每次发送同时记入「更新日志」的下一小版本</em></h2>
        <div class="notice-form">
          <textarea id="noticeText" maxlength="300" placeholder="通知内容（例如：服务器将在 5 分钟后重启更新，请尽快结束当前对局；更新完成后刷新页面即可）"></textarea>
          <div class="notice-row">
            <span class="pill">署名</span>
            <input id="noticeSign" maxlength="12" value="d星空之下" />
            <select id="noticeScope">
              <option value="accounts">仅已登录账号</option>
              <option value="all">全部在线（含游客）</option>
            </select>
            <span class="grow"></span>
            <span class="pill" id="noticeHint">0/300</span>
            <button class="btn btn--primary" id="noticeSend">发送通知</button>
          </div>
          <div class="notice-note">发送后内容同时作为该条目摘要，记入大厅「更新日志」的下一小版本（如 0.2.1）。</div>
        </div>
        <div class="notice-hist" id="noticeHist"></div>
      </section>
    </section>

    <section class="view" id="view-bugs" hidden>
      <section class="panel">
        <h2>玩家反馈<em id="bugCount"></em></h2>
        <div class="bug-toolbar">
          <div class="bug-filters" id="bugFilters">
            <button class="chip is-on" data-status="">全部<em id="chipAll">0</em></button>
            <button class="chip" data-status="new">待处理<em id="chipNew">0</em></button>
            <button class="chip" data-status="triaged">已受理<em id="chipTriaged">0</em></button>
            <button class="chip" data-status="fixed">已修复<em id="chipFixed">0</em></button>
          </div>
          <div class="bug-sorts" id="bugSorts">
            <button class="chip is-on" data-sort="status">未处理优先</button>
            <button class="chip" data-sort="newest">新→旧</button>
            <button class="chip" data-sort="oldest">旧→新</button>
          </div>
          <span class="grow"></span>
          <button class="btn" id="bugExportJson">导出 JSON</button>
          <button class="btn" id="bugExportCsv">导出 CSV</button>
        </div>
        <div id="bugsBody"></div>
      </section>
    </section>

    <section class="view" id="view-speed" hidden>
      <section class="panel">
        <h2>测速<em id="speedNote">各来源的实测加载速率 · 判定与客户端同一套规则</em></h2>
        <div class="tools">
          <button class="btn btn--primary" id="speedRun">开始测速</button>
          <span class="hint" id="speedWhen">—</span>
          <span class="grow"></span>
          <span class="hint" id="speedBars">阈值 中继 1.2 MB/s · 镜像 1.0 MB/s</span>
        </div>
        <div class="panel__body">
          <div class="verdict" id="speedVerdict">还没有测过 —— 点「开始测速」，或切到本页时会自动测一次。</div>
          <div class="speed-table">
            <table><thead><tr><th>来源</th><th>服务器</th><th>本机浏览器</th><th>阈值</th><th>判定</th></tr></thead>
              <tbody id="speedBody"></tbody>
            </table>
          </div>
          <p class="note" id="speedHint">「服务器」列 = 本机服务端到各来源；「本机浏览器」列 = 你当前这台浏览器到各来源 —— <strong>玩家看到的就是这一列</strong>，判定与结论也按它算。取样与客户端一致：并行拉 6 张立绘（每来源约 650 KB、单文件上限 400 KB / 2.5 秒）。来源要跑过自己的阈值才会被装上，否则链路继续往后走，最后回落到本服务器。<strong>地址不显示</strong>，鼠标悬停「来源」可见。</p>
        </div>
      </section>
    </section>
  </main>
</div>
<div class="viewer" id="viewer" role="dialog" aria-modal="true" aria-hidden="true" aria-label="反馈图片">
  <div class="viewer__bar"><button class="btn" id="viewerClose">关闭 ✕</button></div>
  <button class="viewer__nav prev" id="viewerPrev" title="上一张">‹</button>
  <img id="viewerImg" alt="反馈图片">
  <button class="viewer__nav next" id="viewerNext" title="下一张">›</button>
  <div class="viewer__count" id="viewerCount"></div>
</div>
<script>
(function () {
  var token = new URLSearchParams(location.search).get('token') || '';
  var COLORS = { offline:'#8a8f8c', online:'#4ed8af', room:'#5cc8ff', queue:'#ffd089', mmplay:'#ffa94d', alliance:'#b28cff', solo:'#7bd88f' };
  var LABELS = { offline:'离线', online:'在线', room:'组队中', queue:'野排排队', mmplay:'野排游玩', alliance:'同盟游玩', solo:'单人游玩' };
  var ROLE_LABELS = { admin:'管理员', dev:'开发者' };
  // 概览卡片：分组呈现。数值全部来自 /admin/api/state 的 counts（账号按状态计数，游客是会话数，另计）。
  var CARD_GROUPS = [
    ['玩家', [['accounts','注册账号','#4ed8af'],['connected','当前在线','#4ed8af'],['guests','游客在线','#ffd089'],['offline','离线','#8a8f8c']]],
    ['对局', [['queue','野排排队','#ffd089'],['mmplay','野排游玩','#ffa94d'],['room','组队中','#5cc8ff'],['alliance','同盟游玩','#b28cff'],['solo','单人游玩','#7bd88f'],['rooms','房间','#5cc8ff']]]
  ];
  // 状态分布（账号口径，各状态之和 = 注册账号数）
  var DIST_KEYS = ['queue','mmplay','room','alliance','solo','online','offline'];
  var VIEWS = {
    overview: ['概览','服务器实时状态 · 每 2 秒自动刷新'],
    rooms: ['房间','当前所有房间与它们的对局状态'],
    accounts: ['账号','全部注册账号与其实时状态'],
    online: ['在线','当前在线会话（含游客）'],
    notice: ['通知','向在线玩家推送公告，并保留发送历史'],
    bugs: ['反馈','玩家提交的问题报告与处理状态'],
    speed: ['测速','中继与 GitHub 镜像的实测速率 · 与客户端同一套口径']
  };
  var VIEW_ORDER = ['overview','rooms','accounts','online','notice','bugs','speed'];
  // 表格列：[表头, 排序键]（排序键为空 = 该列不可排序，只能搜索）
  var COLS = {
    rooms: [['房间码','code'],['模式','mode'],['难度','difficulty'],['状态',''],['类型',''],['玩家','humans'],['AI','bots']],
    accounts: [['ID','id'],['代号','name'],['身份','role'],['状态','status'],['房间',''],['playerId',''],['注册时间','createdAt'],['最后登录','lastLogin']],
    online: [['名字','name'],['账号','accountId'],['状态','status'],['房间',''],['地址',''],['最近活动','lastSeen']]
  };

  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (ch) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[ch]; }); }
  function badge(s) { var c = COLORS[s] || '#aaaaaa'; return '<span class="badge" style="color:' + c + ';border-color:' + c + '55;background:' + c + '14"><i></i>' + (LABELS[s] || s) + '</span>'; }
  function rolePill(r) { var l = ROLE_LABELS[r]; return l ? '<span class="roletag">' + l + '</span>' : ''; }
  function ts(v) { if (!v) return '—'; try { return new Date(v).toLocaleString('zh-CN'); } catch (e) { return '—'; } }
  function cell(html, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>'; }
  function row(cells) { return '<tr>' + cells.join('') + '</tr>'; }
  function kv(k, v) { return '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>'; }
  function int(v) { return v == null || isNaN(v) ? 0 : Number(v); }

  // ---------------- 视图切换：hash 路由（刷新后仍在同一页）+ 侧栏高亮 ----------------
  var view = 'overview';
  function setView(id, silent) {
    if (!VIEWS[id]) id = 'overview';
    view = id;
    for (var i = 0; i < VIEW_ORDER.length; i++) {
      var v = VIEW_ORDER[i];
      var sec = el('view-' + v);
      if (sec) sec.hidden = v !== id;
      var item = document.querySelector('.nav__item[data-view="' + v + '"]');
      if (item) item.classList.toggle('is-on', v === id);
    }
    el('viewTitle').textContent = VIEWS[id][0];
    el('viewSub').textContent = VIEWS[id][1];
    document.title = VIEWS[id][0] + ' · 服务器管理 · Stronghold Protocol';
    if (!silent && location.hash.slice(1) !== id) location.hash = id;
    if (id === 'speed' && !speedLoaded && !speedRunning) runSpeed(false);
    if (id !== 'bugs') closeViewer();
  }
  el('nav').addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.nav__item') : null;
    if (b) setView(b.dataset.view);
  });
  window.addEventListener('hashchange', function () { setView(location.hash.slice(1), true); });

  // ---------------- 表格：客户端搜索 + 点表头排序（每次轮询后按同一状态重绘，输入不丢） ----------------
  var TS = { rooms:{q:'',key:'',dir:1}, accounts:{q:'',key:'',dir:1}, online:{q:'',key:'',dir:1} };
  var lastRows = { rooms:[], accounts:[], online:[] };
  function cmpv(x, y) {
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    var sx = String(x == null ? '' : x).toLowerCase(), sy = String(y == null ? '' : y).toLowerCase();
    if (sx < sy) return -1;
    if (sx > sy) return 1;
    return 0;
  }
  function paintTable(key) {
    var st = TS[key], cols = COLS[key];
    el(key + 'Head').innerHTML = '<tr>' + cols.map(function (c) {
      var on = c[1] && st.key === c[1];
      return '<th' + (c[1] ? ' data-key="' + c[1] + '"' : '') + (on ? ' class="is-sorted"' : '') + '>'
        + c[0] + (on ? (st.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>';
    }).join('') + '</tr>';
    var q = TS[key].q.trim().toLowerCase();
    var rows = lastRows[key];
    var list = q ? rows.filter(function (r) { return r.text.indexOf(q) >= 0; }) : rows.slice();
    if (st.key) list.sort(function (a, b) { return st.dir * cmpv(a.v[st.key], b.v[st.key]); });
    el(key + 'Body').innerHTML = list.map(function (r) { return row(r.cells); }).join('')
      || '<tr><td colspan="' + cols.length + '" class="empty">' + el(key + 'Body').dataset.empty + '</td></tr>';
    var label = el(key === 'accounts' ? 'acctCount' : key === 'online' ? 'onlineCount' : 'roomCount');
    label.textContent = (q || list.length !== rows.length)
      ? '显示 ' + list.length + ' / 共 ' + rows.length + ' 个'
      : rows.length + ' 个';
  }
  function paint() { paintTable('accounts'); paintTable('online'); paintTable('rooms'); }
  el('accountsBody').dataset.empty = '暂无注册账号';
  el('onlineBody').dataset.empty = '当前无在线会话';
  el('roomsBody').dataset.empty = '当前无房间';
  document.addEventListener('click', function (e) {
    var th = e.target && e.target.closest ? e.target.closest('th[data-key]') : null;
    if (!th) return;
    var table = th.closest('table');
    var key = table && table.dataset ? table.dataset.table : null;
    var st = key ? TS[key] : null;
    if (!st) return;
    var k = th.dataset.key;
    if (st.key === k) st.dir = -st.dir; else { st.key = k; st.dir = 1; }
    paintTable(key);
  });
  ['rooms', 'accounts', 'online'].forEach(function (k) {
    var inp = el(k + 'Search');
    if (!inp) return;
    inp.addEventListener('input', function () { TS[k].q = inp.value; paintTable(k); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { inp.value = ''; TS[k].q = ''; paintTable(k); inp.blur(); }
    });
  });

  // ---------------- 渲染 ----------------
  function accountRow(a) {
    return {
      text: [a.id, a.name, a.role, LABELS[a.status] || a.status, a.roomCode, a.playerId, ts(a.createdAt), ts(a.lastLogin)].join(' ').toLowerCase(),
      v: { id: int(a.id), name: a.name, role: a.role || '', status: LABELS[a.status] || a.status || '', createdAt: a.createdAt, lastLogin: a.lastLogin },
      cells: [cell(a.id, 'mono'), cell(esc(a.name)), cell(rolePill(a.role) || '—'), cell(badge(a.status)),
        cell(a.roomCode ? esc(a.roomCode) : '—', 'mono'), cell(a.playerId ? esc(a.playerId) : '—', 'mono'),
        cell(ts(a.createdAt)), cell(ts(a.lastLogin))]
    };
  }
  function onlineRow(s) {
    return {
      text: [s.name, s.accountId, LABELS[s.status] || s.status, s.roomCode, s.addr, ts(s.lastSeen)].join(' ').toLowerCase(),
      v: { name: s.name, accountId: int(s.accountId), status: LABELS[s.status] || s.status || '', lastSeen: s.lastSeen },
      cells: [cell(esc(s.name) + rolePill(s.role)),
        cell(s.accountId == null ? '<span class="pill guest">游客</span>' : '<span class="mono">#' + s.accountId + '</span>'),
        cell(badge(s.status)), cell(s.roomCode ? esc(s.roomCode) : '—', 'mono'),
        cell(s.addr ? esc(s.addr) : '—', 'mono'), cell(ts(s.lastSeen))]
    };
  }
  function roomRow(r) {
    return {
      text: [r.code, r.modeName || r.mode, r.difficultyName || r.difficulty, r.inMatch ? '进行中' : '准备中', r.auto ? '野排' : '手建', r.humans, r.bots].join(' ').toLowerCase(),
      v: { code: r.code, mode: r.modeName || r.mode, difficulty: r.difficultyName || r.difficulty, humans: int(r.humans), bots: int(r.bots) },
      cells: [cell(esc(r.code), 'mono'), cell(esc(r.modeName || r.mode)), cell(esc(r.difficultyName || r.difficulty)),
        cell(r.inMatch ? '<span class="pill yes">进行中</span>' : '<span class="pill">准备中</span>'),
        cell(r.auto ? '<span class="pill yes">野排</span>' : '<span class="pill">手建</span>'),
        cell(String(r.humans)), cell(String(r.bots))]
    };
  }

  function render(d) {
    var c = d.counts || {}; c.rooms = d.rooms.length;
    el('cards').innerHTML = CARD_GROUPS.map(function (g) {
      return '<div class="cards-group"><h3>' + g[0] + '</h3><div class="cards">' + g[1].map(function (it) {
        return '<div class="card" style="--accent:' + it[2] + '"><b>' + int(c[it[0]]) + '</b><span>' + it[1] + '</span></div>';
      }).join('') + '</div></div>';
    }).join('');
    var total = DIST_KEYS.reduce(function (s, k) { return s + int(c[k]); }, 0) || 1;
    el('dist').innerHTML = DIST_KEYS.map(function (k) {
      return '<div class="dist__seg" style="width:' + ((int(c[k]) / total) * 100) + '%;background:' + COLORS[k]
        + '" title="' + LABELS[k] + ' ' + int(c[k]) + '"></div>';
    }).join('');
    el('distTotal').textContent = '共 ' + total + ' 个注册账号' + (int(c.guests) ? ' · 另有 ' + int(c.guests) + ' 名游客在线' : '');
    el('legend').innerHTML = DIST_KEYS.map(function (k) {
      return '<span style="color:' + COLORS[k] + '"><i></i>' + LABELS[k] + ' <b>' + int(c[k]) + '</b></span>';
    }).join('');
    var v = d.verify || {};
    var q = d.queue || {};
    el('runtime').innerHTML = kv('在线会话', d.online.length + ' 个（含游客 ' + int(c.guests) + '）')
      + kv('野排队列', int(q.queued) + ' 人 · ' + int(q.buckets) + ' 个分段')
      + kv('战斗校验', (v.mode || 'off') + ' · 复算 ' + int(v.checked) + ' · 不一致 ' + int(v.mismatches)
        + ' · 拒收 ' + int(v.rejected) + ' · 接管 ' + int(v.takeovers))
      + kv('待处理反馈', int(d.bugCounts && d.bugCounts.new) + ' 条')
      + kv('自动刷新', '每 2 秒（页面隐藏时暂停）');
    var notices = d.notices || [];
    el('recentNotices').innerHTML = notices.slice(0, 3).map(function (n) {
      return '<div class="mini-item"><time>' + ts(n.at) + '</time><span>' + esc(n.text) + '</span><em>' + int(n.sent) + ' 人</em></div>';
    }).join('') || '<div class="empty">还没有发过通知</div>';
    el('recentNoticeCount').textContent = notices.length ? '最近 ' + Math.min(3, notices.length) + ' 条 · 共 ' + notices.length + ' 条' : '';

    lastRows.accounts = d.accounts.map(accountRow);
    lastRows.online = d.online.map(onlineRow);
    lastRows.rooms = d.rooms.map(roomRow);
    paint();

    el('navRooms').textContent = d.rooms.length;
    el('navAccounts').textContent = d.accounts.length;
    el('navOnline').textContent = d.online.length;
    el('navNotice').textContent = notices.length;
    el('navBugs').textContent = int(d.bugCounts && d.bugCounts.new);
    el('updated').textContent = '刷新于 ' + new Date(d.now).toLocaleTimeString('zh-CN');
    el('clock').textContent = new Date(d.now).toLocaleString('zh-CN');
    el('verify').textContent = v.mode ? ('校验 ' + v.mode + ' · 不一致 ' + int(v.mismatches)) : '校验 off';
    renderNotices(notices);
    // renderBugs FIRST: it sets bugList, which renderBugToolbar reads for the 「显示 N / 共 M 条」 count.
    renderBugs(d.bugs);
    renderBugToolbar(d.bugCounts);
  }

  var painted = false; // 首帧无论如何都要渲染一次（后台标签页也要有内容）；之后隐藏才暂停，切回来立刻补一次
  function tick() {
    if (painted && document.hidden) return;
    fetch('/admin/api/state?token=' + encodeURIComponent(token)
      + '&bugStatus=' + encodeURIComponent(bugStatus) + '&bugSort=' + encodeURIComponent(bugSort), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { painted = true; render(d); })
      .catch(function (e) { el('updated').textContent = '加载失败：' + e.message; });
  }
  el('refresh').addEventListener('click', tick);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  // 通知 (server/lobby.js broadcastNotice): push one notice to the live sessions; the history is the state's notices array.
  var noticeText = el('noticeText'), noticeSign = el('noticeSign'), noticeScope = el('noticeScope');
  noticeText.addEventListener('input', function () { el('noticeHint').textContent = noticeText.value.length + '/' + noticeText.maxLength; });
  function renderNotices(list) {
    el('noticeHist').innerHTML = (Array.isArray(list) ? list : []).map(function (n) {
      return '<div class="notice-item"><time>' + ts(n.at) + '</time><b>' + esc(n.text) + '</b>'
        + (n.sign ? '<i>—— ' + esc(n.sign) + '</i>' : '') + '<em>' + int(n.sent) + ' 人</em></div>';
    }).join('') || '<div class="empty">还没有发过通知</div>';
  }
  el('noticeSend').addEventListener('click', function () {
    var text = noticeText.value.trim();
    if (!text) { noticeText.focus(); return; }
    var btn = el('noticeSend');
    btn.disabled = true;
    fetch('/admin/api/notify?token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, sign: noticeSign.value, scope: noticeScope.value })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && (res.j.error || res.j.message)) || 'HTTP');
        noticeText.value = '';
        el('noticeHint').textContent = '0/300';
        var ver = res.j.changelog && res.j.changelog.version;
        el('updated').textContent = '已推送 ' + res.j.sent + ' 人' + (ver ? ' · 记入日志 ' + ver : ' · 日志写入失败（通知已发出）') + ' · ' + new Date().toLocaleTimeString('zh-CN');
        tick();
      })
      .catch(function (e) { el('updated').textContent = '推送失败：' + e.message; })
      .then(function () { btn.disabled = false; });
  });
  // 玩家反馈 (server/community.js): the report list, its images (token-gated image route), the status buttons, the
  // status / sort filters (applied server-side) and the export.
  var BUG_LABELS = { new: '待处理', triaged: '已受理', fixed: '已修复' };
  var BUG_STATUSES = ['new', 'triaged', 'fixed'];
  var bugStatus = ''; // '' = 全部; else new / triaged / fixed (a server-side filter, so it spans the whole set)
  var bugSort = 'status'; // 'status' = 未处理优先 + 新→旧 (historical default); also newest / oldest
  var bugList = []; // the last rendered page, kept for the image viewer
  function bugImg(id) { return '/admin/api/bug/image/' + id + '?token=' + encodeURIComponent(token); }
  function renderBugToolbar(counts) {
    counts = counts || {};
    el('chipAll').textContent = counts.total || 0;
    el('chipNew').textContent = counts.new || 0;
    el('chipTriaged').textContent = counts.triaged || 0;
    el('chipFixed').textContent = counts.fixed || 0;
    el('bugCount').textContent = '显示 ' + bugList.length + ' / 共 ' + (counts.total || 0) + ' 条';
  }
  function renderBugs(list) {
    bugList = Array.isArray(list) ? list : [];
    el('bugsBody').innerHTML = bugList.map(function (b, r) {
      var imgs = (b.images || []).map(function (i, k) {
        return '<img src="' + bugImg(i.id) + '" data-r="' + r + '" data-i="' + k + '" alt="" title="点击放大">';
      }).join('');
      var btns = BUG_STATUSES.map(function (s) {
        return '<button class="bst" data-id="' + b.id + '" data-status="' + s + '"' + (b.status === s ? ' disabled' : '') + '>' + (BUG_LABELS[s] || s) + '</button>';
      }).join('');
      return '<div class="bug-item">'
        + '<div class="bug-head"><span class="bug-status is-' + esc(b.status) + '">' + (BUG_LABELS[b.status] || esc(b.status)) + '</span>'
        + '<b>#' + b.id + ' ' + esc(b.title) + '</b>'
        + (b.submitter ? '<i>' + esc(b.submitter) + '</i>' : '<i>游客</i>')
        + '<time>' + ts(b.created_at) + '</time></div>'
        + (b.body ? '<div class="bug-body">' + esc(b.body) + '</div>' : '')
        + (imgs ? '<div class="bug-imgs">' + imgs + '</div>' : '')
        + '<div class="bug-actions">' + btns + '</div></div>';
    }).join('') || '<div class="empty">暂无玩家反馈</div>';
  }
  // Click a thumbnail → the full-size viewer (the same token-gated route, just larger); ← / → step through a report's
  // images, Esc or the backdrop closes it.
  var viewer = el('viewer'), viewerImg = el('viewerImg'), viewerCount = el('viewerCount');
  var viewerUrls = [], viewerAt = 0;
  function showViewer() {
    viewerImg.src = viewerUrls[viewerAt];
    viewerCount.textContent = (viewerAt + 1) + ' / ' + viewerUrls.length;
    var multi = viewerUrls.length > 1;
    el('viewerPrev').style.display = multi ? '' : 'none';
    el('viewerNext').style.display = multi ? '' : 'none';
  }
  function openViewer(urls, at) {
    if (!urls || !urls.length) return;
    viewerUrls = urls; viewerAt = Math.max(0, Math.min(at | 0, urls.length - 1));
    showViewer();
    viewer.classList.add('is-open'); viewer.setAttribute('aria-hidden', 'false');
  }
  function closeViewer() {
    if (!viewer.classList.contains('is-open')) return;
    viewer.classList.remove('is-open'); viewer.setAttribute('aria-hidden', 'true');
    viewerImg.removeAttribute('src'); viewerUrls = [];
  }
  function stepViewer(d) { if (viewerUrls.length < 2) return; viewerAt = (viewerAt + d + viewerUrls.length) % viewerUrls.length; showViewer(); }
  el('viewerClose').addEventListener('click', closeViewer);
  el('viewerPrev').addEventListener('click', function () { stepViewer(-1); });
  el('viewerNext').addEventListener('click', function () { stepViewer(1); });
  viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
    if (viewer.classList.contains('is-open')) {
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowLeft') stepViewer(-1);
      else if (e.key === 'ArrowRight') stepViewer(1);
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { var s = el(view + 'Search'); if (s) { e.preventDefault(); s.focus(); } return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= VIEW_ORDER.length) setView(VIEW_ORDER[n - 1]);
  });
  // 筛选 / 排序: re-poll with the new params — the server filters / sorts the FULL set, not only the 100 rows here.
  function setActive(container, attr, value) {
    Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (c) {
      c.classList.toggle('is-on', (c.dataset[attr] || '') === value);
    });
  }
  el('bugFilters').addEventListener('click', function (e) {
    var c = e.target && e.target.closest ? e.target.closest('.chip') : null;
    if (!c) return;
    bugStatus = c.dataset.status || '';
    setActive(el('bugFilters'), 'status', bugStatus);
    tick();
  });
  el('bugSorts').addEventListener('click', function (e) {
    var c = e.target && e.target.closest ? e.target.closest('.chip') : null;
    if (!c) return;
    bugSort = c.dataset.sort || 'status';
    setActive(el('bugSorts'), 'sort', bugSort);
    tick();
  });
  // 导出: the token-gated full (filtered) set, JSON or CSV, as a download.
  function exportBugs(format) {
    var a = document.createElement('a');
    a.href = '/admin/api/bug/export?token=' + encodeURIComponent(token) + '&format=' + format
      + '&status=' + encodeURIComponent(bugStatus) + '&sort=' + encodeURIComponent(bugSort);
    a.download = 'bug-reports.' + format;
    document.body.appendChild(a); a.click(); a.remove();
  }
  el('bugExportJson').addEventListener('click', function () { exportBugs('json'); });
  el('bugExportCsv').addEventListener('click', function () { exportBugs('csv'); });
  setActive(el('bugFilters'), 'status', bugStatus);
  setActive(el('bugSorts'), 'sort', bugSort);
  el('bugsBody').addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset && t.dataset.r != null) {
      var rep = bugList[Number(t.dataset.r)];
      if (rep) openViewer((rep.images || []).map(function (i) { return bugImg(i.id); }), Number(t.dataset.i));
      return;
    }
    var btn = t && t.closest ? t.closest('button.bst') : null;
    if (!btn) return;
    var b = btn;
    b.disabled = true;
    fetch('/admin/api/bug/status?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(b.dataset.id), status: b.dataset.status }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) { if (!res.ok) throw new Error((res.j && res.j.error) || 'HTTP'); tick(); })
      .catch(function (err) { el('updated').textContent = '状态更新失败：' + err.message; });
  });
  // ---------------- 测速 (server/speed.js → /admin/api/speed): the origins timed from the SERVER and from this
  // BROWSER (the vantage a player has). Same samples, same budgets; the verdict reuses the client's own rule, so
  // the console says which origin a player would install right now — the point is spotting a throttled relay. -----
  var speedLoaded = false, speedRunning = false;
  var SPEED_BUDGET = 2500, SPEED_CAP = 400 * 1024;
  function rateCell(r, min) {
    if (!r) return '<td class="ratecell"><div class="rate"><b>…</b><div class="rate__bar"><i style="width:0"></i></div></div></td>';
    var cls = !r.ok ? 'is-fail' : (r.bps >= min ? 'is-ok' : 'is-slow');
    var pct = min > 0 ? Math.max(3, Math.min(100, (r.bps / min) * 100)) : 0;
    return '<td class="ratecell"><div class="rate ' + cls + '">'
      + '<div><b>' + (r.ok ? (r.bps / 1048576).toFixed(2) : '失败') + '</b>'
      + '<span class="rate__unit">' + (r.ok ? 'MB/s' : '0 字节 / ' + r.ms + 'ms') + '</span></div>'
      + '<div class="rate__bar" title="阈值 ' + (min / 1048576).toFixed(1) + ' MB/s"><i style="width:' + pct.toFixed(0) + '%"></i></div>'
      + '</div></td>';
  }
  /**
   * A client decides on ITS OWN measurement, so the verdict follows the browser column whenever it has one (that is
   * the player's vantage) and falls back to the server's. Returns the rows in configured order with the deciding
   * numbers, plus the origin the rule would install — the point of the whole view.
   */
  function speedVerdict(srcs, browser) {
    var rows = srcs.map(function (s) {
      var b = browser[s.base];
      var use = b || s;
      return { label: s.label, full: s.full, base: s.base, min: s.min, bps: use.bps, ok: use.ok,
        pass: !!use.ok && use.bps >= s.min, from: b ? 'browser' : 'server' };
    });
    var chosen = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pass) { chosen = rows[i]; break; }
    return { rows: rows, chosen: chosen, byBrowser: rows.some(function (r) { return r.from === 'browser'; }) };
  }
  function renderSpeed(d, browser) {
    var srcs = Array.isArray(d.sources) ? d.sources : [];
    var b = browser || {};
    var v = speedVerdict(srcs, b);
    el('speedBody').innerHTML = srcs.map(function (s, i) {
      var rowv = v.rows[i] || {};
      var chosen = !!(v.chosen && v.chosen.base === s.base);
      var short = String(s.label || '').split('·').pop().trim() || s.label;
      var group = s.full ? '含 /media · /scene · /clip' : (short === s.label ? '仅普通文件' : 'GitHub 镜像');
      return '<tr' + (chosen ? ' class="is-chosen"' : '') + '>'
        + cell('<div class="src" title="' + esc(s.base) + '"><b>' + esc(short) + '</b><em>' + esc(group) + '</em></div>'
            + (chosen ? ' <span class="pill yes">当前加载</span>' : ''))
        + rateCell(s, s.min)
        + rateCell(b[s.base], s.min)
        + cell('<span class="mono">' + (s.min / 1048576).toFixed(1) + ' MB/s</span>')
        + cell((rowv.pass ? '<span class="pill yes">通过</span>' : '<span class="pill bad" title="低于该来源的阈值，客户端会继续往后走">偏慢</span>')
            + (rowv.from === 'browser' ? ' <span class="pill">按浏览器</span>' : ''))
        + '</tr>';
    }).join('') || '<tr><td colspan="5" class="empty">public/asset-mirrors.json 里没有配置来源</td></tr>';
    var slow = v.rows.filter(function (r) { return !r.pass; });
    var line = '按' + (v.byBrowser ? '本机浏览器实测（玩家视角）' : '服务器实测')
      + '，现在会加载：<b>' + esc(v.chosen ? v.chosen.label : '本服务器') + '</b>';
    if (!srcs.length) line = '没有配置任何来源。';
    else if (!slow.length) line += '（所有来源都跑过了各自的阈值）';
    else {
      line += '（' + slow.map(function (r) { return esc(r.label); }).join(' / ') + ' 未过阈值被跳过'
        + (v.chosen ? '' : '，链路回落到本服务器') + '）';
    }
    var el0 = el('speedVerdict');
    el0.innerHTML = line;
    el0.className = 'verdict' + (srcs.length && !v.chosen ? ' is-bad' : '');
    var t = d.thresholds || {};
    el('speedBars').textContent = '阈值 中继 ' + ((t.relay || 0) / 1048576).toFixed(1) + ' MB/s · 镜像 ' + ((t.mirror || 0) / 1048576).toFixed(1) + ' MB/s';
    el('speedWhen').textContent = '测得于 ' + new Date(d.at).toLocaleTimeString('zh-CN')
      + (d.cached ? ' · 冷却中（沿用上次结果，点按钮强制重测）' : '')
      + (browser ? '' : ' · 正在从本机浏览器测…');
  }
  /** One sample, byte-capped and budgeted — the same read the client's assetMirror.js does. */
  function readCappedInPage(url) {
    var t0 = Date.now();
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, SPEED_BUDGET + 500) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res || !res.ok) return 0;
        if (!res.body || !res.body.getReader) return res.arrayBuffer().then(function (buf) { return buf.byteLength; });
        var reader = res.body.getReader(), bytes = 0;
        var pump = function () {
          return reader.read().then(function (part) {
            if (part.done) return bytes;
            bytes += part.value && part.value.byteLength ? part.value.byteLength : 0;
            if (bytes >= SPEED_CAP || Date.now() - t0 >= SPEED_BUDGET) {
              try { reader.cancel(); } catch (e) { /* the cap is enough */ }
              return bytes;
            }
            return pump();
          });
        };
        return pump();
      })
      .catch(function () { return 0; })
      .then(function (n) { if (timer) clearTimeout(timer); return n; });
  }
  /** Time every origin from this browser: samples in parallel, aggregate bytes over the wall clock (the client's way). */
  function measureFromBrowser(sources, samples) {
    var list = Array.isArray(samples) && samples.length ? samples : [];
    if (!list.length) return Promise.resolve({});
    return Promise.all(sources.map(function (s) {
      var t0 = Date.now();
      return Promise.all(list.map(function (p) { return readCappedInPage(s.base + p); })).then(function (parts) {
        var bytes = parts.reduce(function (a, x) { return a + x; }, 0);
        var ms = Date.now() - t0;
        return { bytes: bytes, ms: ms, bps: bytes > 0 && ms > 0 ? (bytes * 1000) / ms : 0, ok: bytes > 0 };
      }).then(function (r) { return [s.base, r]; });
    })).then(function (pairs) {
      var out = {};
      for (var i = 0; i < pairs.length; i++) out[pairs[i][0]] = pairs[i][1];
      return out;
    });
  }
  function runSpeed(force) {
    if (speedRunning) return;
    speedRunning = true;
    el('speedRun').disabled = true;
    el('speedWhen').textContent = '测量中…（服务器视角约 2-3 秒）';
    fetch('/admin/api/speed?token=' + encodeURIComponent(token) + (force ? '&force=1' : ''), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        renderSpeed(d, null);
        el('speedWhen').textContent = '服务器视角已出，正在从本机浏览器测…';
        return measureFromBrowser(d.sources || [], d.samples || []).then(function (b) { renderSpeed(d, b); });
      })
      .catch(function (e) { el('speedWhen').textContent = '测速失败：' + e.message; })
      .then(function () { speedRunning = false; speedLoaded = true; el('speedRun').disabled = false; });
  }
  el('speedRun').addEventListener('click', function () { runSpeed(true); });

  setView(location.hash.slice(1) || 'overview', true);
  tick(); setInterval(tick, 2000);
})();
</script>
</body></html>
`;
