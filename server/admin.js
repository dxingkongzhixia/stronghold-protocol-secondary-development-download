// server/admin.js — the read-only operations page (docs/MATCHMAKING.md §12).
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
import { DIFFICULTY_NAMES } from '../shared/constants.js';
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
 * @param {{ registry: any, lobby: any, matchmaker?: any, auth: any, now?: number }} deps
 */
export function buildSnapshot({ registry, lobby, matchmaker, auth, now = Date.now() }) {
  const mm = matchmaker || (lobby && lobby.mm) || null;
  const sessions = [...registry.all()];
  const liveByAccount = new Map();
  for (const s of sessions) if (presenceOnline(s, now) && s.accountId != null) liveByAccount.set(s.accountId, s);

  const online = sessions.filter((s) => presenceOnline(s, now)).map((s) => ({
    playerId: s.playerId,
    name: s.name,
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

  return { now, counts, queue: mm ? mm.stats() : { queued: 0, buckets: 0 }, verify, rooms, accounts, online };
}

/**
 * A PUBLIC, token-free view of who is online right now — for the lobby's 在线 badge link (`/online`). It deliberately
 * omits everything sensitive (no account list, no IPs, no last-login): player names are already visible in-game.
 */
export function buildPublicSnapshot({ registry, lobby, matchmaker, now = Date.now() }) {
  const mm = matchmaker || (lobby && lobby.mm) || null;
  const online = [...registry.all()].filter((s) => presenceOnline(s, now)).map((s) => ({
    name: s.name,
    guest: s.accountId == null,
    status: statusOf(s, { lobby, matchmaker: mm, now }),
    roomCode: s.roomCode ?? null,
  }));
  const counts = { online: online.length, guests: online.filter((x) => x.guest).length };
  // Joinable 同盟 rooms (hand-made co-op rooms still in the lobby with a free seat) — the lobby's 公开同盟 list.
  const openRooms = [...lobby.rooms.values()]
    .filter((r) => r.mode === 'coop' && r.public && !r.match && !r.auto && r.freeSeat() >= 0)
    .map((r) => ({
      code: r.code,
      difficulty: r.difficulty,
      difficultyName: DIFFICULTY_NAMES[r.difficulty] || r.difficulty,
      host: (r.seatOf(r.hostId) || {}).name || null,
      humans: r.seats.filter((x) => x && !x.left && !x.isBot).length,
    }))
    .sort((a, b) => b.humans - a.humans)
    .slice(0, 12);
  // Rooms whose match is already running (the lobby's 正在模拟 row → enter as a spectator): 野排 first, then rooms with
  // an AI seat to 夺舍, then the fullest — at most 4.
  const playRooms = [...lobby.rooms.values()]
    .filter((r) => r.mode === 'coop' && r.match)
    .map((r) => ({
      code: r.code,
      difficulty: r.difficulty,
      difficultyName: DIFFICULTY_NAMES[r.difficulty] || r.difficulty,
      host: (r.seatOf(r.hostId) || {}).name || null,
      humans: r.seats.filter((x) => x && !x.left && !x.isBot).length,
      bots: r.seats.filter((x) => x && !x.left && x.isBot).length,
      auto: !!r.auto,
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
  --bg:#080c0b;--panel:#0e1513;--panel2:#0a100e;--line:#1c2923;--line2:#273831;
  --text:#e6f2ec;--dim:#8a9b94;--dim2:#64736c;--mint:#4ed8af;--mint-dim:#2f7f68}
*{box-sizing:border-box}
html,body{margin:0}
body{min-height:100vh;
  background:radial-gradient(1100px 620px at 12% -12%,rgba(78,216,175,.10),transparent 60%),
    radial-gradient(900px 520px at 98% -4%,rgba(92,200,255,.07),transparent 55%),var(--bg);
  color:var(--text);font:14px/1.55 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1200px;margin:0 auto;padding:22px 22px 60px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:12px}
.brand__mark{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--line2);border-radius:10px;
  color:var(--mint);font-size:20px;background:linear-gradient(180deg,#121a17,#0b1210);box-shadow:inset 0 0 16px rgba(78,216,175,.14)}
.brand h1{margin:0;font-size:19px;letter-spacing:.02em}
.brand small{color:var(--dim);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase}
.topbar__right{display:flex;align-items:center;gap:14px;color:var(--dim);font-size:12.5px}
.live{display:inline-flex;align-items:center;gap:6px;color:var(--mint)}
.live i{width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 9px var(--mint);animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.updated{font-variant-numeric:tabular-nums}
button.refresh{background:#111917;color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:6px 13px;cursor:pointer;
  font:inherit;font-size:12.5px;transition:border-color .15s,color .15s}
button.refresh:hover{border-color:var(--mint-dim);color:var(--mint)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;margin-bottom:22px}
.card{position:relative;padding:13px 14px 12px 17px;border:1px solid var(--line);border-radius:11px;
  background:linear-gradient(180deg,var(--panel),var(--panel2));overflow:hidden}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent,var(--mint));opacity:.9}
.card b{display:block;font-size:26px;line-height:1.12;font-variant-numeric:tabular-nums;color:var(--accent,var(--mint))}
.card span{font-size:12px;color:var(--dim)}
.panel{border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,var(--panel),var(--panel2));margin-bottom:20px;overflow:hidden}
.panel>h2{display:flex;align-items:center;gap:9px;margin:0;padding:13px 16px;font-size:14px;font-weight:600;letter-spacing:.02em;
  color:#d3efe2;border-bottom:1px solid var(--line)}
.panel>h2::before{content:"";width:3px;height:15px;border-radius:2px;background:var(--mint);box-shadow:0 0 9px rgba(78,216,175,.55)}
.panel>h2 em{font-style:normal;color:var(--dim);font-weight:400;font-size:12px}
.tablewrap{overflow:auto;max-height:62vh}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 15px;white-space:nowrap;border-bottom:1px solid var(--line)}
thead th{position:sticky;top:0;z-index:1;background:#0c1311;color:var(--dim);font-weight:600;font-size:11px;letter-spacing:.07em;text-transform:uppercase}
tbody tr:hover{background:rgba(78,216,175,.05)}
tbody tr:last-child td{border-bottom:0}
td.mono,.mono{font-family:ui-monospace,Consolas,"Cascadia Mono",monospace;color:#a9c6bd;font-size:12px}
.empty{color:var(--dim2);text-align:center;padding:24px}
.badge{display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 8px;border:1px solid;border-radius:999px;font-size:12px}
.badge i{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}
.pill{display:inline-block;padding:1px 9px;border-radius:7px;font-size:11.5px;border:1px solid var(--line2);color:var(--dim)}
.pill.yes{color:var(--mint);border-color:rgba(78,216,175,.42);background:rgba(78,216,175,.08)}
.pill.guest{color:#ffd089;border-color:rgba(255,208,137,.4);background:rgba(255,208,137,.08)}
</style></head><body>
<div class="wrap">
  <header class="topbar">
    <div class="brand">
      <span class="brand__mark">◈</span>
      <div><h1>服务器管理</h1><small>Stronghold Protocol · Alliance</small></div>
    </div>
    <div class="topbar__right">
      <span class="live"><i></i>实时</span>
      <span class="updated" id="verify">—</span>
      <span class="updated" id="updated">—</span>
      <button class="refresh" id="refresh">刷新</button>
    </div>
  </header>

  <section class="cards" id="cards"></section>

  <section class="panel">
    <h2>注册账号<em id="acctCount"></em></h2>
    <div class="tablewrap"><table>
      <thead><tr><th>ID</th><th>代号</th><th>状态</th><th>房间</th><th>playerId</th><th>注册时间</th><th>最后登录</th></tr></thead>
      <tbody id="accountsBody"></tbody>
    </table></div>
  </section>

  <section class="panel">
    <h2>在线会话（含游客）<em id="onlineCount"></em></h2>
    <div class="tablewrap"><table>
      <thead><tr><th>名字</th><th>账号</th><th>状态</th><th>房间</th><th>地址</th><th>最近活动</th></tr></thead>
      <tbody id="onlineBody"></tbody>
    </table></div>
  </section>

  <section class="panel">
    <h2>房间<em id="roomCount"></em></h2>
    <div class="tablewrap"><table>
      <thead><tr><th>房间码</th><th>模式</th><th>难度</th><th>状态</th><th>类型</th><th>玩家</th><th>AI</th></tr></thead>
      <tbody id="roomsBody"></tbody>
    </table></div>
  </section>
</div>
<script>
(function () {
  var token = new URLSearchParams(location.search).get('token') || '';
  var COLORS = { offline:'#8a8f8c', online:'#4ed8af', room:'#5cc8ff', queue:'#ffd089', mmplay:'#ffa94d', alliance:'#b28cff', solo:'#7bd88f' };
  var LABELS = { offline:'离线', online:'在线', room:'组队中', queue:'野排排队', mmplay:'野排游玩', alliance:'同盟游玩', solo:'单人游玩' };
  var CARDS = [
    ['accounts','注册账号','#4ed8af'],['connected','当前在线','#4ed8af'],['guests','游客在线','#ffd089'],
    ['offline','离线','#8a8f8c'],['queue','野排排队','#ffd089'],['mmplay','野排游玩','#ffa94d'],
    ['alliance','同盟游玩','#b28cff'],['solo','单人游玩','#7bd88f'],['rooms','房间','#5cc8ff']
  ];
  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (ch) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[ch]; }); }
  function badge(s) { var c = COLORS[s] || '#aaaaaa'; return '<span class="badge" style="color:' + c + ';border-color:' + c + '55;background:' + c + '14"><i></i>' + (LABELS[s] || s) + '</span>'; }
  function ts(v) { if (!v) return '—'; try { return new Date(v).toLocaleString('zh-CN'); } catch (e) { return '—'; } }
  function cell(html, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>'; }
  function row(cells) { return '<tr>' + cells.join('') + '</tr>'; }
  function render(d) {
    var c = d.counts; c.rooms = d.rooms.length;
    el('cards').innerHTML = CARDS.map(function (it) {
      return '<div class="card" style="--accent:' + it[2] + '"><b>' + (c[it[0]] || 0) + '</b><span>' + it[1] + '</span></div>';
    }).join('');
    el('acctCount').textContent = d.accounts.length + ' 个';
    el('onlineCount').textContent = d.online.length + ' 个';
    el('roomCount').textContent = d.rooms.length + ' 个';
    el('accountsBody').innerHTML = d.accounts.map(function (a) {
      return row([cell(a.id, 'mono'), cell(esc(a.name)), cell(badge(a.status)),
        cell(a.roomCode ? esc(a.roomCode) : '—', 'mono'), cell(a.playerId ? esc(a.playerId) : '—', 'mono'),
        cell(ts(a.createdAt)), cell(ts(a.lastLogin))]);
    }).join('') || '<tr><td colspan="7" class="empty">暂无注册账号</td></tr>';
    el('onlineBody').innerHTML = d.online.map(function (s) {
      return row([cell(esc(s.name)),
        cell(s.accountId == null ? '<span class="pill guest">游客</span>' : '<span class="mono">#' + s.accountId + '</span>'),
        cell(badge(s.status)), cell(s.roomCode ? esc(s.roomCode) : '—', 'mono'),
        cell(s.addr ? esc(s.addr) : '—', 'mono'), cell(ts(s.lastSeen))]);
    }).join('') || '<tr><td colspan="6" class="empty">当前无在线会话</td></tr>';
    el('roomsBody').innerHTML = d.rooms.map(function (r) {
      return row([cell(esc(r.code), 'mono'), cell(esc(r.modeName || r.mode)), cell(esc(r.difficultyName || r.difficulty)),
        cell(r.inMatch ? '<span class="pill yes">进行中</span>' : '<span class="pill">准备中</span>'),
        cell(r.auto ? '<span class="pill yes">野排</span>' : '<span class="pill">手建</span>'),
        cell(String(r.humans)), cell(String(r.bots))]);
    }).join('') || '<tr><td colspan="7" class="empty">当前无房间</td></tr>';
    el('updated').textContent = new Date(d.now).toLocaleTimeString('zh-CN');
    var v = d.verify || {};
    el('verify').textContent = v.mode
      ? '校验 ' + v.mode + ' · 复算 ' + (v.checked || 0) + ' · 不一致 ' + (v.mismatches || 0) + ' · 拒收 ' + (v.rejected || 0) + ' · 接管 ' + (v.takeovers || 0)
      : '校验 off';
  }
  function tick() {
    fetch('/admin/api/state?token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(render)
      .catch(function (e) { el('updated').textContent = '加载失败：' + e.message; });
  }
  el('refresh').addEventListener('click', tick);
  tick(); setInterval(tick, 2000);
})();
</script>
</body></html>
`;
