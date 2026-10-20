// server/admin.js — the read-only operations page (docs/MATCHMAKING.md §12).
// (i18n-ignore-file: the operations page and its strings are developer-facing, never shown to players — docs/I18N.md)
//
//   GET /admin?token=…            → a self-contained page (polls the JSON every 2 s)
//   GET /admin/api/state?token=…  → { now, counts, queue, rooms, accounts, online }
//
// It lists every registered account with its live status (离线 / 在线 / 组队中 / 野排排队 / 野排游玩 / 同盟游玩 /
// 单人游玩) plus every connected session (guests included) and every room. Access needs a token: `var/admin-token.txt`
// (created on first boot, printed in the startup banner). Keep the server behind a firewall if the LAN should not see it.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { DIFFICULTY_NAMES, MAX_SEATS } from '../shared/constants.js';
import { presenceOnline } from './net.js';
import { scriptProbeStats } from './plugins/scriptPreflight.js';
import { readPolicy, POLICY_FILE } from './plugins/policy.js';

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
 *   bugSort?: string, now?: number, plugins?: { registry?: any, policy?: any }|null }} deps
 */
export function buildSnapshot({ registry, lobby, matchmaker, auth, community = null, bugStatus = null, bugSort = 'status', now = Date.now(), plugins = null }) {
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
    // a stuck match is diagnosable from here: its phase, round, phase deadline and live field modes
    phase: r.match ? r.match.phase : null,
    round: r.match ? r.match.round : null,
    deadline: r.match ? r.match.deadline : null,
    fields: r.match && Array.isArray(r.match.fields)
      ? r.match.fields.map((f) => ({ id: f.fieldId, kind: f.kind, mode: f.mode || (f.cc ? '?' : 'server'), done: !!f.done, authority: f.authority || null }))
      : null,
    auto: !!r.auto,
    humans: r.seats.filter((x) => x && !x.left && !x.isBot).length,
    bots: r.seats.filter((x) => x && !x.left && x.isBot).length,
    // Operations console (read-only): what content / appearance / script set this room is playing.
    content: r.content ? {
      cs: r.content.cs,
      vanilla: r.content.vanilla !== false,
      vs: r.content.vs || null,
      modeId: r.content.modeId || null,
      plugins: Array.isArray(r.content.plugins)
        ? r.content.plugins.map((p) => ({ id: p.id, version: p.version || null, class: p.class || null, hash: p.hash || null }))
        : [],
      trusted: !!r.content.trusted,
      consent: r.content.trusted && r.content.trusted.consent
        ? Object.values(r.content.trusted.consent).filter(Boolean).length
        : null,
      consentTotal: r.content.trusted && r.content.trusted.consent
        ? Object.keys(r.content.trusted.consent).length
        : null,
    } : null,
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

  return { now, counts, queue: mm ? mm.stats() : { queued: 0, buckets: 0 }, verify, rooms, accounts, online, bugs, bugCounts, notices: Array.isArray(lobby.notices) ? lobby.notices.slice(0, 20) : [], plugins: buildPluginSnapshot(plugins) };
}

/** Read-only operations view of the plugin system: installed entries, skipped/warnings and the owner policy. */
/**
 * The import report summary a Forge product keeps beside its plugin (forgeImport's `forge-import.json`).
 * Missing for hand-written plugins; a broken file is ignored rather than failing the operations page.
 * @param {any} p a registry plugin
 */
function forgeProvenance(p) {
  if (!p?.where) return null;
  try {
    const j = JSON.parse(readFileSync(join(p.where, 'forge-import.json'), 'utf8'));
    return {
      pack: j.pack && typeof j.pack === 'object' ? { id: j.pack.id ?? null, name: j.pack.name ?? null, version: j.pack.version ?? null } : null,
      primary: typeof j.primary === 'string' ? j.primary : null,
      products: Array.isArray(j.products) ? j.products.slice(0, 32).map((x) => ({ id: x?.id ?? null, class: x?.class ?? null, dir: x?.dir ?? null })) : [],
      skipped: Math.max(0, Number(j.skipped) || 0),
      assumed: Math.max(0, Number(j.assumed) || 0),
      partial: j.partial === true,
      report: typeof j.report === 'string' ? j.report : 'IMPORT-REPORT.md',
      importedAt: typeof j.importedAt === 'string' ? j.importedAt : null,
    };
  } catch { return null; }
}

export function buildPluginSnapshot(info = {}) {
  const { registry, policy, contents, market } = info || {};
  const list = registry && typeof registry.plugins === 'function' ? registry.plugins() : [];
  let report = { skipped: [], warnings: [] };
  try { report = registry?.report?.() || report; } catch { /* optional diagnostics */ }
  let ownerPolicy = null;
  try { ownerPolicy = policy?.get?.() || null; } catch { /* optional policy */ }
  const marketInstalled = new Map(
    (market && typeof market.installed === 'function' ? market.installed() : []).map((x) => [x.id, x]),
  );
  return {
    installed: list.map((p) => {
      const m = p.manifest || {};
      const name = typeof m.name === 'string' ? m.name : (m.name && (m.name.zh || m.name.en)) || p.id;
      const permissions = Array.isArray(m.permissions) ? m.permissions
        : (m.permissions && typeof m.permissions === 'object' ? Object.keys(m.permissions) : []);
      const meta = marketInstalled.get(p.id) || {};
      return {
        id: p.id, name, class: p.class, status: p.status, version: m.version || null,
        app: meta.app ?? m.app ?? null, api: meta.api ?? m.api ?? null, scope: Array.isArray(m.scope) ? m.scope : null,
        compatible: m.compatible !== false, permissions, bytes: Number.isFinite(p.bytes) ? p.bytes : null,
        description: meta.description ?? null, author: meta.author ?? null, compat: meta.compat || null,
        hasContent: !!p.content, hasScript: !!p.script, trusted: p.class === 'trusted',
        forge: forgeProvenance(p),
        missing: p.missing === true,
        notices: Array.isArray(m.notices) ? m.notices.slice(0, 20).map((n) => ({
          id: n?.id ?? null, title: n?.title ?? null, body: n?.body ?? null, date: n?.date ?? null,
        })) : [],
      };
    }),
    skipped: Array.isArray(report.skipped) ? report.skipped : [],
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    probe: scriptProbeStats(),
    contentSets: contents && typeof contents.stats === 'function' ? contents.stats() : null,
    market: market && typeof market.list === 'function' ? market.list({ admin: true }) : [],
    policy: ownerPolicy ? {
      rooms: ownerPolicy.rooms, default: ownerPolicy.default || [], allow: ownerPolicy.allow || [],
      classes: ownerPolicy.classes || {}, maxSets: ownerPolicy.maxSets,
      allowIncompatible: ownerPolicy.allowIncompatible === true ? true : Array.isArray(ownerPolicy.allowIncompatible) ? ownerPolicy.allowIncompatible.slice(0, 64) : false,
    } : null,
  };
}

/**
 * Write the safe subset of `plugins/config.json` from the owner console (Phase 2). It never edits plugin files,
 * trusted pins or code: unknown fields are rejected, and `trusted` / `allowDownloadHosts` already in the file survive.
 * @param {{ pluginsDir: string|null, body: unknown, now?: number, root?: string }} opts
 */
export function writePluginPolicy({ pluginsDir, body, now = Date.now(), root = process.cwd() }) {
  if (!pluginsDir) return { error: 'plugins are disabled' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'a JSON object is required' };
  const allowed = new Set(['rooms', 'default', 'allow', 'classes', 'limits', 'allowIncompatible']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) return { error: `unsupported field: ${key}` };
  if (!Object.keys(body).length) return { error: 'no policy field supplied' };
  const file = join(pluginsDir, POLICY_FILE);
  let current = {};
  try { current = JSON.parse(readFileSync(file, 'utf8')); } catch { /* absent or broken: start from empty */ }
  if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  const next = { ...current };
  for (const key of Object.keys(body)) next[key] = body[key];
  const checked = readPolicy(next, { env: {} });
  if (checked.problems.length) return { error: checked.problems.join('; ') };
  try {
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    mkdirSync(join(root, 'var'), { recursive: true });
    appendFileSync(join(root, 'var', 'admin-audit.log'), `${JSON.stringify({ at: new Date(now).toISOString(), action: 'plugin-policy', fields: Object.keys(body) })}\n`);
  } catch (e) {
    return { error: `could not write plugins/${POLICY_FILE}: ${e?.code || e?.message || e}` };
  }
  return { ok: true, policy: checked.policy };
}

/**
 * A PUBLIC, token-free view of who is online right now — for the lobby's 在线 badge link (`/online`). It deliberately
 * omits everything sensitive (no account list, no IPs, no last-login): player names are already visible in-game.
 *
 * `all` (the 公开房间 screen: `/online/api?all=1`) lifts the list caps — the lobby's mini rows only need a handful and it
 * slices them itself (screens/lobby.js), while the directory screen shows every public room.
 */
export function buildPublicSnapshot({ registry, lobby, matchmaker, now = Date.now(), all = false }) {
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
    .slice(0, all ? undefined : 12);
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
    .slice(0, all ? undefined : 4);
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
html[data-theme=light]{color-scheme:light;
  --bg:#f3f7f5;--side:#ffffff;--panel:#ffffff;--panel2:#f6f9f7;--line:#dfe7e3;--line2:#cbd8d2;
  --text:#18231f;--dim:#5f7069;--dim2:#7c8c85;--mint:#0b8f6f;--mint-dim:#6bbfa8;
  --amber:#a66c00;--blue:#137ab3;--violet:#6e4bb5;--orange:#b35f00;--grey:#7a8781;--green:#2f8f52}
html[data-theme=light] body{background:radial-gradient(1100px 620px at 8% -10%,rgba(11,143,111,.08),transparent 60%),radial-gradient(900px 520px at 100% -6%,rgba(19,122,179,.05),transparent 55%),var(--bg)}
html[data-theme=light] .side{background:#fff}
html[data-theme=light] .side__mark{background:linear-gradient(180deg,#f3fbf7,#e8f5ef);box-shadow:inset 0 0 16px rgba(11,143,111,.08)}
html[data-theme=light] .head{background:linear-gradient(180deg,rgba(243,247,245,.98),rgba(243,247,245,.84) 72%,transparent)}
html[data-theme=light] .btn,html[data-theme=light] .theme-toggle,html[data-theme=light] .row-action,html[data-theme=light] .drawer__foot button,html[data-theme=light] kbd{background:#fff;color:var(--text)}
html[data-theme=light] thead th{background:#f4f8f6}
html[data-theme=light] .drawer{background:#fff}
html[data-theme=light] .drawer-backdrop{background:rgba(24,48,38,.28)}
html[data-theme=light] .plugin-avatar{background:#eef7f3}
html[data-theme=light] .plugin-stat{background:linear-gradient(180deg,#f8fbf9,transparent)}
html[data-theme=light] .switch span{background:#d9e3de}
html[data-theme=light] .switch span:after{background:#879991}
html[data-theme=light] .plugin-compat .pill,html[data-theme=light] .plugin-badges .pill{background:#f8fbf9}
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
.market-input{width:100%;min-width:100px;max-width:220px;background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:6px;padding:4px 7px;font:inherit;font-size:12px}
.market-input:focus{outline:none;border-color:var(--mint-dim)}
.market-input--wide{min-width:180px;max-width:300px}
.market-check{width:15px;height:15px;accent-color:var(--mint)}
.market-actions{display:flex;gap:5px;flex-wrap:wrap}
.market-actions button{padding:3px 7px;font-size:12px}
.plugin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;padding:12px 16px}
.plugin-card{border:1px solid var(--line);border-radius:10px;background:linear-gradient(180deg,rgba(18,28,25,.96),rgba(12,20,18,.92));padding:13px 14px;display:flex;flex-direction:column;gap:10px;min-width:0;transition:border-color .15s,box-shadow .15s}
.plugin-card:hover{border-color:var(--mint-dim);box-shadow:0 8px 28px rgba(0,0,0,.18)}
.plugin-card__head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.plugin-card__main{flex:1;min-width:0}
.plugin-avatar{width:34px;height:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 34px;font-weight:700;font-size:15px;border:1px solid var(--line2);background:#16221e;color:var(--mint);margin-top:2px}
.plugin-avatar.av-content{color:#ffd089;border-color:rgba(217,164,65,.35);background:#221d12}
.plugin-avatar.av-ui{color:#5cc8ff;border-color:rgba(92,200,255,.3);background:#101d22}
.plugin-avatar.av-script{color:#b28cff;border-color:rgba(178,140,255,.3);background:#1a1526}
.plugin-avatar.av-trusted{color:#ff9a9a;border-color:rgba(224,108,117,.35);background:#241416}
.plugin-avatar.av-forge{color:#e7c987;border-color:rgba(217,164,65,.35);background:#221d12}
.plugin-avatar.av-unknown{color:var(--dim)}
.plugin-card__title{font-weight:700;font-size:14px;line-height:1.3;overflow-wrap:anywhere}
.plugin-card__id{font-family:ui-monospace,Consolas,monospace;color:var(--dim);font-size:11px;margin-top:2px}
.plugin-card__badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.plugin-card__fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 10px}
.plugin-card__field{display:flex;flex-direction:column;gap:4px;min-width:0}
.plugin-card__field--wide{grid-column:1 / -1}
.plugin-card__field label{color:var(--dim);font-size:11px;letter-spacing:.03em}
.plugin-card__field .market-input{width:100%;max-width:none;box-sizing:border-box}
.plugin-card__compat{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:2px}
.plugin-card__compat-label{color:var(--dim);font-size:11px;margin-right:2px}
.plugin-card__compat .pill{font-size:11px}
.compat-k{color:var(--dim);font-size:11px;margin-right:3px}
.plugin-card__actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:2px}
.plugin-card__actions button{padding:5px 10px;font-size:12px;border-radius:6px}
.plugin-card__actions .danger{color:#ff9a9a;border-color:rgba(224,108,117,.45)}
.plugin-card__facts{display:flex;align-items:center;gap:6px 14px;flex-wrap:wrap;color:var(--dim);font-size:12px}
.plugin-card__facts b{color:var(--text);font-weight:500}
.plugin-card__listed{display:flex;align-items:center;gap:6px;color:var(--dim);font-size:12px;white-space:nowrap}
.plugin-empty{padding:26px 16px;border:1px dashed var(--line);border-radius:10px;color:var(--dim);text-align:center}
.plugin-publish{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--line)}
.plugin-publish select{min-width:240px;max-width:360px;background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:7px;padding:6px 9px;font:inherit;font-size:13px}
.plugin-publish button{padding:6px 11px;border-radius:7px;font-size:12px}
.plugin-fold{padding:0}
.plugin-fold summary{cursor:pointer;padding:12px 16px;font-weight:600;font-size:13px;color:var(--text);display:flex;align-items:baseline;gap:8px;list-style-position:inside}
.plugin-fold summary em{font-style:normal;color:var(--mint);font-size:12px}
.plugin-fold summary .hint{font-weight:400;margin-left:auto}
.plugin-fold[open] summary{border-bottom:1px solid var(--line)}
.plugin-fold .panel__body{padding:11px 16px 0}
.plugin-fold .plugin-grid{padding-top:12px}
@media (max-width:900px){.plugin-grid{grid-template-columns:1fr}.plugin-card__fields{grid-template-columns:1fr}.plugin-card__field--wide{grid-column:auto}}
.plugin-admin__head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.plugin-subnav{display:flex;align-items:center;gap:3px;flex-wrap:wrap;margin:0 0 12px;border-bottom:1px solid var(--line)}
.plugin-subnav__item{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dim);padding:8px 11px 9px;font:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px}
.plugin-subnav__item em{font-style:normal;color:var(--dim);background:rgba(255,255,255,.06);border-radius:999px;padding:1px 6px;font-size:10px}
.plugin-subnav__item:hover{color:var(--text)}
.plugin-subnav__item.is-on{color:var(--mint);border-bottom-color:var(--mint)}
.plugin-subnav__item.is-on em{color:#082019;background:var(--mint)}
.plugin-subview[hidden]{display:none}
.plugin-admin__head h2{margin:0 0 4px}
.plugin-admin__head .hint{max-width:560px}
.plugin-admin__tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.plugin-admin__tools .search{min-width:220px;max-width:320px}
.plugin-admin__tools select{background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:7px;padding:6px 8px;font:inherit;font-size:12px}
.plugin-tabs{display:flex;gap:4px;padding:10px 16px 0;border-bottom:1px solid var(--line)}
.plugin-tab{border:1px solid transparent;border-bottom:0;background:transparent;color:var(--dim);padding:7px 12px 9px;border-radius:7px 7px 0 0;font:inherit;font-size:12px;cursor:pointer}
.plugin-tab em{font-style:normal;opacity:.7;margin-left:3px}
.plugin-tab:hover{color:var(--text)}
.plugin-tab.is-on{color:var(--mint);background:var(--panel2);border-color:var(--line)}
.plugin-table td{white-space:normal;vertical-align:middle;padding:11px 12px}
.plugin-table table{table-layout:fixed;min-width:760px}
.plugin-table th:nth-child(1){width:24%}
.plugin-table th:nth-child(2){width:15%}
.plugin-table th:nth-child(3){width:20%}
.plugin-table th:nth-child(4){width:21%}
.plugin-table th:nth-child(5){width:6%}
.plugin-table th:nth-child(6){width:14%}
.plugin-table--installed th:nth-child(1){width:21%}
.plugin-table--installed th:nth-child(4){width:30%}
.plugin-table--installed th:nth-child(5){width:14%}
.plugin-table td:last-child{text-align:right}
.plugin-table tr[draggable="true"]{cursor:grab}
.plugin-table tr[draggable="true"]:active{cursor:grabbing}
.plugin-actions{display:flex;gap:4px;justify-content:flex-end;flex-wrap:nowrap}
.row-action--icon{padding:4px 7px;font-family:ui-monospace,Consolas,monospace}
.plugin-related{margin-top:4px;color:var(--dim);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plugin-related span{color:var(--mint)}
.plugin-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px}
.plugin-stat{border:1px solid var(--line);border-radius:9px;padding:9px 10px;background:linear-gradient(180deg,var(--panel2),transparent)}
.plugin-stat__icon{float:right;color:var(--mint);opacity:.65;font-size:14px}
.plugin-stat b{display:block;font-size:20px;line-height:1.2;font-variant-numeric:tabular-nums}
.plugin-stat span{color:var(--dim);font-size:11px}
.policy-kv{display:grid;grid-template-columns:minmax(96px,auto) 1fr;gap:0;font-size:13px;margin:0}
.policy-kv dt,.policy-kv dd{padding:7px 2px;border-bottom:1px dashed var(--line);margin:0}
.policy-kv dt{color:var(--dim)}
.policy-kv dt::before{content:"▸";color:var(--mint);margin-right:6px;font-size:10px}
.policy-kv dd{color:var(--text);text-align:right}
.policy-editor{width:100%;min-height:280px;margin-top:10px;box-sizing:border-box;font:13px/1.65 ui-monospace,Consolas,monospace;
  background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:12px;resize:vertical}
.policy-editor:focus{outline:none;border-color:var(--mint-dim)}
.theme-toggle{border:1px solid var(--line2);background:var(--panel2);color:var(--dim);border-radius:7px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}
.theme-toggle:hover{color:var(--mint);border-color:var(--mint-dim)}
.plugin-name{display:flex;align-items:center;gap:9px;min-width:0}
.plugin-name b{display:block;font-size:13px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plugin-name small{display:block;color:var(--dim);font-size:11px;font-family:ui-monospace,Consolas,monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plugin-badges{display:flex;gap:4px;flex-wrap:wrap}
.plugin-badges .pill{white-space:nowrap}
.plugin-sub{color:var(--dim);font-size:11px;margin-top:4px;white-space:nowrap}
.plugin-desc{color:var(--text);font-size:12px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plugin-compat{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.plugin-compat .compat-k{font-size:10px;white-space:nowrap}
.plugin-compat .pill{font-size:10px;min-height:18px;white-space:nowrap}
.switch{position:relative;display:inline-flex;width:32px;height:18px;vertical-align:middle}
.switch input{position:absolute;opacity:0;width:0;height:0}
.switch span{position:absolute;inset:0;border-radius:999px;background:#24302c;border:1px solid var(--line2);transition:.15s}
.switch span:after{content:"";position:absolute;width:12px;height:12px;left:2px;top:2px;border-radius:50%;background:#8a9b95;transition:.15s}
.switch input:checked + span{background:rgba(78,216,175,.28);border-color:var(--mint-dim)}
.switch input:checked + span:after{left:16px;background:var(--mint)}
.row-action{border:1px solid var(--line2);background:var(--panel2);color:var(--text);border-radius:6px;padding:4px 9px;font:inherit;font-size:12px;cursor:pointer}
.row-action:hover{border-color:var(--mint-dim);color:var(--mint)}
.row-action.danger{color:#ff9a9a;border-color:rgba(224,108,117,.35)}
.drawer-wrap{position:fixed;inset:0;z-index:70;display:flex;justify-content:flex-end}
.drawer-wrap[hidden]{display:none}
.drawer-backdrop{position:absolute;inset:0;background:rgba(3,7,6,.62);backdrop-filter:blur(2px)}
.drawer{position:relative;width:min(460px,94vw);height:100%;display:flex;flex-direction:column;background:#0d1513;border-left:1px solid var(--line2);box-shadow:-18px 0 50px rgba(0,0,0,.35)}
.drawer__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}
.drawer__kicker{color:var(--mint);font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:4px}
.drawer__head h3{margin:0;font-size:18px}
.drawer__x{background:transparent;border:0;color:var(--dim);font-size:22px;line-height:1;cursor:pointer;padding:2px 5px}
.drawer__x:hover{color:var(--text)}
.drawer__body{padding:16px 18px;overflow:auto;display:flex;flex-direction:column;gap:13px}
.drawer__meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.drawer-id{color:var(--dim);font-size:11px;font-family:ui-monospace,Consolas,monospace;margin-left:2px}
.drawer__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.plugin-field{display:flex;flex-direction:column;gap:5px;color:var(--dim);font-size:11px}
.plugin-field--wide{grid-column:1 / -1}
.plugin-field input,.plugin-field textarea,.plugin-field select{width:100%;box-sizing:border-box;background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:7px;padding:7px 9px;font:inherit;font-size:12px}
.plugin-field select{min-height:100px;padding:4px}
.plugin-field textarea{resize:vertical;min-height:74px;line-height:1.5}
.plugin-field input:focus,.plugin-field textarea:focus{outline:none;border-color:var(--mint-dim)}
.drawer__check{display:flex;align-items:center;gap:7px;color:var(--text);font-size:12px}
.drawer__check input{accent-color:var(--mint);width:15px;height:15px}
.drawer__compat{display:flex;align-items:center;gap:5px 9px;flex-wrap:wrap;padding:10px 11px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.015)}
.drawer__history{display:flex;flex-direction:column;gap:6px;font-size:11.5px;color:var(--dim)}
.drawer__history:empty{display:none}
.drawer__history b{color:var(--text);font-size:12px}
.drawer-history-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--line);border-radius:6px}
.drawer-history-row button{padding:2px 7px;font-size:11px;border:1px solid var(--line2);background:var(--panel2);color:var(--text);border-radius:5px;cursor:pointer}
.drawer__foot{display:flex;align-items:center;gap:7px;padding:12px 18px;border-top:1px solid var(--line);flex-wrap:wrap}
.drawer__foot .spacer{flex:1}
.drawer__foot button{border:1px solid var(--line2);background:var(--panel2);color:var(--text);border-radius:7px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer}
.drawer__foot button:hover{border-color:var(--mint-dim)}
.drawer__foot button.primary{background:var(--mint);border-color:var(--mint);color:#082019;font-weight:700}
.drawer__foot button.danger{color:#ff9a9a;border-color:rgba(224,108,117,.4)}
@media (max-width:700px){.plugin-admin__tools{width:100%}.plugin-admin__tools .search{max-width:none;flex:1}.plugin-desc{max-width:220px}}
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

/* 来源配置 (server/mirrors.js): the origin list, edited in place. Order = the chain's order. */
.origins{display:flex;flex-direction:column;gap:7px}
.origin-row{display:flex;align-items:center;gap:8px}
.origin-row__idx{width:18px;text-align:right;color:var(--dim2);font-size:12px;font-variant-numeric:tabular-nums}
.origin-row__url{flex:1;min-width:0;background:var(--panel2);color:var(--text);border:1px solid var(--line2);
  border-radius:8px;padding:6px 11px;font:inherit;font-size:13px;font-family:ui-monospace,Consolas,monospace}
.origin-row__url:focus{outline:none;border-color:var(--mint-dim)}
.origin-row__full{display:inline-flex;align-items:center;gap:5px;color:var(--dim);font-size:12.5px;white-space:nowrap;cursor:pointer}
.btn--tiny{padding:3px 9px;font-size:12px;line-height:1.35}

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
      <button class="nav__item" data-view="plugins"><i>◆</i>插件与内容<em id="navPlugins">0</em></button>
      <div class="nav__sect">诊断</div>
      <button class="nav__item" data-view="speed"><i>⚡</i>测速</button>
      <button class="nav__item" data-view="origins"><i>⇄</i>来源配置</button>
    </nav>
    <div class="side__foot">
      <span class="live"><i></i>实时 · 每 2 秒</span>
      <span class="side__line" id="verify">校验 —</span>
      <span class="side__line" id="updated">—</span>
      <button class="btn" id="refresh">立即刷新</button>
      <span class="side__keys">快捷键 <kbd>1</kbd>-<kbd>8</kbd> 切换 · <kbd>/</kbd> 搜索 · <kbd>Esc</kbd> 关闭预览</span>
    </div>
  </aside>

  <main class="main">
    <header class="head">
      <div><h2 id="viewTitle">概览</h2><p id="viewSub">服务器实时状态</p></div>
      <div class="head__right"><button type="button" id="themeToggle" class="theme-toggle">浅色</button><span>服务器时间</span><span class="clock" id="clock">—</span></div>
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

    <section class="view" id="view-plugins" hidden>
      <div class="plugin-subnav" role="tablist">
        <button type="button" class="plugin-subnav__item is-on" data-psub="market">商城插件 <em id="marketCount">0</em></button>
        <button type="button" class="plugin-subnav__item" data-psub="installed">本机插件 <em id="installedMetaCount">0</em></button>
        <button type="button" class="plugin-subnav__item" data-psub="policy">服务策略</button>
        <button type="button" class="plugin-subnav__item" data-psub="diagnostics">诊断与内容</button>
      </div>
      <div class="plugin-subview" data-pview="market">
        <section class="panel plugin-admin">
          <div class="plugin-admin__head">
            <div>
              <h2>商城插件</h2>
              <p class="hint">描述、作者、兼容性和上架状态在右侧抽屉里编辑；保存只改商城元数据，不改插件文件。</p>
            </div>
            <div class="plugin-admin__tools">
              <input class="search" id="pluginSearch" placeholder="搜索 ID / 名称 / 作者"/>
              <select id="publishSelect" aria-label="选择本机插件"></select>
              <button type="button" id="publishBtn" class="primary">上架本机插件</button>
              <select id="pluginImportKind" aria-label="导入格式"><option value="ordinary">普通 zip</option><option value="forge">Forge zip</option></select>
              <button type="button" id="pluginImportBtn">导入插件</button>
              <input id="pluginImportFile" type="file" accept=".zip,application/zip" hidden>
              <button type="button" id="pluginGcBtn">清理缓存</button>
            </div>
          </div>
          <div class="tablewrap plugin-table"><table><thead><tr><th>插件</th><th>类型 / 状态</th><th>兼容性</th><th>描述 / 作者</th><th>上架</th><th></th></tr></thead><tbody id="marketBody"></tbody></table></div>
          <div class="panel__body"><span id="marketMsg" class="hint"></span></div>
          <div class="panel__body hint">AI 接管接口（预留）：<code>GET /admin/api/plugins/ai</code> 返回能力声明；当前 POST 返回 501，未启用执行器，不会自行改动商城。</div>
        </section>
      </div>
      <div class="plugin-subview" data-pview="installed" hidden>
        <section class="panel">
          <div class="plugin-admin__head">
            <div><h2>本机插件</h2><p class="hint">只改商城展示用的描述 / 作者 / 兼容范围，不改 <code>plugins/</code> 里的文件；要真正上架请用「商城插件 → 上架本机插件」。</p></div>
            <div class="plugin-admin__tools">
              <button type="button" id="localInstallBtn">安装 / 更新 zip</button>
              <input id="localInstallFile" type="file" accept=".zip,application/zip" hidden>
            </div>
          </div>
          <div class="tablewrap plugin-table plugin-table--installed"><table><thead><tr><th>插件</th><th>类型</th><th>兼容性</th><th>描述 / 作者</th><th></th></tr></thead><tbody id="installedMetaBody"></tbody></table></div>
          <div class="panel__body"><span id="installedMetaMsg" class="hint"></span></div>
        </section>
      </div>
      <div class="plugin-subview" data-pview="policy" hidden>
        <div class="two">
          <section class="panel"><h2>插件概览</h2><div class="panel__body" id="pluginSummary"></div></section>
          <section class="panel"><h2>服务器策略</h2><div class="panel__body">
            <div id="pluginPolicy"></div>
            <textarea id="pluginPolicyJson" class="policy-editor" spellcheck="false" aria-label="插件策略 JSON"></textarea>
            <div class="tools"><button type="button" id="pluginPolicySave">保存插件策略</button><span id="pluginPolicyMsg" class="hint"></span></div>
          </div></section>
        </div>
      </div>
      <div class="plugin-subview" data-pview="diagnostics" hidden>
        <section class="panel">
          <h2>Forge 导入<em id="forgeCount"></em></h2>
          <div class="tablewrap"><table><thead><tr><th>插件</th><th>来源包</th><th>版本</th><th>产品</th><th>跳过</th><th>假设</th><th>部分</th><th>导入时间</th></tr></thead><tbody id="forgeBody"></tbody></table></div>
        </section>
        <section class="panel">
          <h2>兼容性与诊断<em id="pluginIssueCount"></em></h2>
          <div class="panel__body" id="pluginIssues"></div>
        </section>
        <section class="panel">
          <h2>审计日志<em id="auditCount"></em></h2>
          <div class="tablewrap"><table><thead><tr><th>时间</th><th>动作</th><th>详情</th></tr></thead><tbody id="auditBody"></tbody></table></div>
        </section>
        <section class="panel">
          <h2>房间内容与脚本</h2>
          <div class="tablewrap"><table><thead><tr><th>房间</th><th>内容集 cs</th><th>外观集 vs</th><th>模式</th><th>插件</th><th>脚本/信任</th><th>同意</th></tr></thead><tbody id="roomContentBody"></tbody></table></div>
        </section>
      </div>

      <div id="pluginDrawer" class="drawer-wrap" hidden>
        <div class="drawer-backdrop" data-drawer-close></div>
        <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
          <header class="drawer__head">
            <div><div class="drawer__kicker" id="drawerKicker">商城条目</div><h3 id="drawerTitle">编辑插件</h3></div>
            <button type="button" class="drawer__x" data-drawer-close aria-label="关闭">×</button>
          </header>
          <div class="drawer__body">
            <div id="drawerMeta" class="drawer__meta"></div>
            <label class="plugin-field plugin-field--wide"><span>描述</span><textarea id="drawerDescription" rows="3" placeholder="商城描述"></textarea></label>
            <div class="drawer__grid">
              <label class="plugin-field"><span>作者</span><input id="drawerAuthor" placeholder="作者"></label>
              <label class="plugin-field"><span>兼容范围 app</span><input id="drawerApp" placeholder=">=0.4.0 <0.5.0"></label>
              <label class="plugin-field"><span>API level</span><input id="drawerApi" type="number" min="1" max="99" placeholder="API"></label>
            </div>
            <label class="plugin-field" id="drawerRelatedRow"><span>关联插件（可多选）</span><select id="drawerRelated" multiple size="5"></select></label>
            <label class="drawer__check" id="drawerListedRow"><input id="drawerListed" type="checkbox"><span>上架到商城</span></label>
            <div id="drawerCompat" class="drawer__compat"></div>
            <div id="drawerHistory" class="drawer__history"></div>
            <p id="drawerMsg" class="hint"></p>
          </div>
          <footer class="drawer__foot">
            <button type="button" data-drawer-close>取消</button>
            <span class="spacer"></span>
            <button type="button" id="drawerReject" class="danger">拒绝</button>
            <button type="button" id="drawerTest">测试</button>
            <button type="button" id="drawerApprove">通过</button>
            <button type="button" id="drawerSave" class="primary">保存</button>
          </footer>
        </aside>
      </div>
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
      <section class="panel">
        <h2>插件公告（只读）</h2>
        <div class="notice-hist" id="pluginNotices"></div>
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

    <section class="view" id="view-origins" hidden>
      <section class="panel">
        <h2>来源配置<em>public/asset-mirrors.json · 客户端与 Service Worker 都读这一份</em></h2>
        <div class="tools">
          <button class="btn" id="originsAdd">+ 添加来源</button>
          <span class="grow"></span>
          <button class="btn" id="originsRevert">还原上一版</button>
          <button class="btn btn--primary" id="originsSave">保存</button>
        </div>
        <div class="panel__body">
          <div class="verdict" id="originsMsg">正在读取…</div>
          <div class="origins" id="originsList"></div>
          <p class="note">顺序就是链路的尝试顺序：客户端按顺序取 <strong>第一个跑过自己阈值</strong> 的来源（中继这类「全路由」来源要 1.2 MB/s，普通镜像 1.0 MB/s —— 见「测速」）。勾「全路由」= 它除普通文件外还能提供 /media · /scene · /clip。<strong>保存后立即生效</strong>（下一次请求就是新配置），客户端下次加载即可见，<strong>不需要重启</strong>。空地址行会被忽略；保存前会校验每个地址，并把上一版留成备份。</p>
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
  var lastAdminData = null;
  var pluginSection = 'market';
  var pluginDrawerItem = null;
  var pluginDrawerMode = 'market';
  function applyAdminTheme(theme) {
    var t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('sp_admin_theme', t); } catch (e) { /* private mode */ }
    if (el('themeToggle')) el('themeToggle').textContent = t === 'light' ? '深色' : '浅色';
  }
  try { applyAdminTheme(localStorage.getItem('sp_admin_theme') || 'dark'); } catch (e) { applyAdminTheme('dark'); }
  var COLORS = { offline:'#8a8f8c', online:'#4ed8af', room:'#5cc8ff', queue:'#ffd089', mmplay:'#ffa94d', alliance:'#b28cff', solo:'#7bd88f' };
  var LABELS = { offline:'离线', online:'在线', room:'组队中', queue:'野排排队', mmplay:'野排游玩', alliance:'同盟游玩', solo:'单人游玩' };
  var ROLE_LABELS = { admin:'管理员', dev:'开发者' };
  var CLASS_LABELS = { cosmetic:'外观', content:'玩法', ui:'界面', script:'脚本', trusted:'信任', lang:'语言', forge:'Forge 转换' };
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
    plugins: ['插件与内容','已安装插件、服务器策略、房间内容集与脚本信任状态'],
    speed: ['测速','中继与 GitHub 镜像的实测速率 · 与客户端同一套口径'],
    origins: ['来源配置','中继与镜像地址 · 改完即时生效，不用重启']
  };
  var VIEW_ORDER = ['overview','rooms','accounts','online','notice','bugs','plugins','speed','origins'];
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
  function stat(icon, value, label) {
    return '<div class="plugin-stat"><span class="plugin-stat__icon">' + esc(icon) + '</span><b>' + esc(String(value)) + '</b><span>' + esc(label) + '</span></div>';
  }
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
    if (id === 'origins' && !originsLoaded && !originsBusy) loadOrigins();
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

  function classAvatar(x) {
    var label = CLASS_LABELS[x.class] || '?';
    return label.slice(0, 1);
  }

  function compatPills(x) {
    var c = x.compat || {};
    if (x.kind === 'forge' || x.class === 'forge') {
      return {
        own: '<span class="compat-k">本服导入测试</span><span class="pill ' + (x.status === 'active' ? 'yes' : '') + '">' + (x.status === 'active' ? '已通过' : '待测试') + '</span>',
        main: '<span class="compat-k">主线 0.3.x</span><span class="pill">以导入结果为准</span>',
      };
    }
    var unrestricted = c.unrestricted || !c.app;
    var ownOk = unrestricted || c.own;
    var mainOk = unrestricted || c.mainline;
    var own = unrestricted ? '未限制' : c.own ? '兼容' : '不兼容';
    var main = unrestricted ? '未限制' : c.mainline ? '兼容' : '不兼容';
    var strict = c.mainline && !c.auto && (x.class === 'content' || x.class === 'script' || x.class === 'trusted');
    return {
      own: '<span class="compat-k">本服 0.4</span><span class="pill ' + (ownOk ? 'yes' : 'no') + '">' + own + '</span>',
      main: '<span class="compat-k">主线 0.3.x</span><span class="pill ' + (mainOk ? 'yes' : 'no') + '"' + (strict ? ' title="版本兼容；内容 / 脚本 / 信任仍需 owner allowIncompatible"' : '') + '>' + main + '</span>',
    };
  }

  function renderPlugins(d) {
    var p = d.plugins || { installed: [], skipped: [], warnings: [], policy: null };
    var list = Array.isArray(p.installed) ? p.installed : [];
    var skipped = Array.isArray(p.skipped) ? p.skipped : [];
    var warnings = Array.isArray(p.warnings) ? p.warnings : [];
    var scripts = list.filter(function (x) { return x.hasScript || x.trusted; });
    var forged = list.filter(function (x) { return x.forge; });
    el('pluginSummary').innerHTML = '<div class="plugin-stats">'
      + stat('▣', list.length, '已安装')
      + stat('⚠', skipped.length, '加载失败 / 跳过')
      + stat('⚑', warnings.length, '警告')
      + stat('◈', forged.length, 'Forge 导入')
      + stat('⌘', scripts.length, '脚本 / 信任')
      + stat('▤', p.contentSets ? p.contentSets.sets : 0, '内容集')
      + stat('◉', d.rooms.filter(function (r) { return r.content && !r.content.vanilla; }).length, '房间正在使用')
      + stat('⚡', p.probe ? p.probe.childRuns : 0, '脚本 probe 次')
      + '</div>';
    el('pluginPolicy').innerHTML = p.policy ? (
      '<dl class="policy-kv">'
      + kv('房间插件', p.policy.rooms)
      + kv('允许范围', (p.policy.allow || []).join(', ') || '全部')
      + kv('默认内容集', (p.policy.default || []).join(', ') || '无')
      + kv('class 开关', Object.keys(p.policy.classes || {}).map(function (k) { return k + '=' + (p.policy.classes[k] ? '开' : '关'); }).join(' · ') || '无')
      + kv('内容集上限', p.policy.maxSets)
      + kv('允许不兼容', p.policy.allowIncompatible === true ? '全部' : Array.isArray(p.policy.allowIncompatible) ? p.policy.allowIncompatible.join(', ') : '否')
      + '</dl>'
    ) : '<div class="empty">无插件策略（默认）</div>';
    var pj = p.policy ? { rooms: p.policy.rooms, default: p.policy.default || [], allow: p.policy.allow || [], classes: p.policy.classes || {}, limits: { maxSets: p.policy.maxSets }, allowIncompatible: p.policy.allowIncompatible === true ? true : Array.isArray(p.policy.allowIncompatible) ? p.policy.allowIncompatible : false } : {};
    var policyArea = el('pluginPolicyJson');
    if (policyArea && document.activeElement !== policyArea) policyArea.value = JSON.stringify(pj, null, 2);
    // 商城条目与本机插件共用一张表；描述 / 作者 / app / API / 上架在右侧抽屉编辑。
    var market = Array.isArray(p.market) ? p.market : [];
    var statusLabels = { active: '通过', pending: '待审核', rejected: '已拒绝' };
    var metaList = list.filter(function (x) { return x.class !== 'lang'; });
    el('marketCount').textContent = String(market.length);
    el('installedMetaCount').textContent = String(metaList.length);
    var q = (el('pluginSearch') && el('pluginSearch').value || '').trim().toLowerCase();
    var hit = function (x) {
      return !q || [x.id, x.name, x.author, x.description, x.class].some(function (v) {
        return String(v || '').toLowerCase().indexOf(q) >= 0;
      });
    };
    el('marketBody').innerHTML = market.filter(hit).map(function (x) {
      var listed = x.listed !== false;
      var state = x.needsReview ? '需重新审核' : x.pendingUpdate ? ('新版本 v' + x.pendingUpdate.version + ' 待审') : x.status === 'active' ? (listed ? '已上架' : '已下架') : (statusLabels[x.status] || x.status || '—');
      var kind = x.kind === 'forge' ? 'Forge 包' : '普通插件';
      var cls = CLASS_LABELS[x.class] || x.class || '未声明';
      var compat = compatPills(x);
      return '<tr draggable="true" data-kind="' + esc(x.kind) + '" data-id="' + esc(x.id) + '">'
        + '<td><div class="plugin-name"><span class="plugin-avatar av-' + esc(x.class || 'unknown') + '">' + esc(classAvatar(x)) + '</span><div><b>' + esc(x.name || x.id) + '</b><small>' + esc(x.id) + ' · v' + esc(x.version || '—') + '</small></div></div></td>'
        + '<td><div class="plugin-badges"><span class="pill">' + esc(kind) + '</span><span class="pill">' + esc(cls) + '</span></div><div class="plugin-sub">' + esc(state) + '</div></td>'
        + '<td><div class="plugin-compat">' + compat.own + compat.main + '</div></td>'
        + '<td><div class="plugin-desc">' + esc(x.description || '—') + '</div><div class="plugin-sub">' + esc(x.author || '未填写作者') + '</div>'
        + ((x.relatedPlugins || []).length ? '<div class="plugin-related">关联：<span>' + esc(x.relatedPlugins.map(function (r) { return r.name; }).join('、')) + '</span></div>' : '')
        + ((x.relatedBy || []).length ? '<div class="plugin-related">被关联：<span>' + esc(x.relatedBy.map(function (r) { return r.name; }).join('、')) + '</span></div>' : '') + '</td>'
        + '<td><label class="switch" title="上架 / 下架"><input type="checkbox" data-quick-listed' + (listed ? ' checked' : '') + '><span></span></label></td>'
        + '<td><div class="plugin-actions"><button type="button" class="row-action row-action--icon" data-move="up" title="上移">↑</button><button type="button" class="row-action row-action--icon" data-move="down" title="下移">↓</button><button type="button" class="row-action" data-edit>编辑</button></div></td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="6" class="empty">没有商城条目</td></tr>';
    el('installedMetaBody').innerHTML = metaList.filter(hit).map(function (x) {
      var cls = CLASS_LABELS[x.class] || x.class || '未声明';
      var compat = compatPills(x);
      return '<tr data-installed data-id="' + esc(x.id) + '">'
        + '<td><div class="plugin-name"><span class="plugin-avatar av-' + esc(x.class || 'unknown') + '">' + esc(classAvatar(x)) + '</span><div><b>' + esc(x.name || x.id) + '</b><small>' + esc(x.id) + ' · v' + esc(x.version || '—') + '</small></div></div></td>'
        + '<td><div class="plugin-badges"><span class="pill">本机</span><span class="pill">' + esc(cls) + '</span></div><div class="plugin-sub">已加载</div></td>'
        + '<td><div class="plugin-compat">' + compat.own + compat.main + '</div></td>'
        + '<td><div class="plugin-desc">' + esc(x.description || '未填写描述') + '</div><div class="plugin-sub">' + esc(x.author || '未填写作者') + '</div></td>'
        + '<td><div class="plugin-actions"><button type="button" class="row-action" data-edit>编辑</button><button type="button" class="row-action danger" data-uninstall>卸载</button></div></td>'
        + '</tr>';
    }).join('') || '<tr><td colspan="5" class="empty">没有本机插件</td></tr>';
    document.querySelectorAll('[data-pview]').forEach(function (v) {
      v.hidden = (v.dataset.pview || '') !== pluginSection;
    });
    document.querySelectorAll('[data-psub]').forEach(function (b) {
      b.classList.toggle('is-on', (b.dataset.psub || '') === pluginSection);
    });
    var published = new Set(market.map(function (x) { return x.id; }));
    var installable = list.filter(function (x) { return x.class !== 'lang' && !published.has(x.id); });
    var pubSelect = el('publishSelect');
    if (pubSelect && document.activeElement !== pubSelect) {
      pubSelect.innerHTML = installable.length
        ? installable.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name || x.id) + ' (' + esc(x.class || '?') + ')</option>'; }).join('')
        : '<option value="">没有可上架的本机插件</option>';
    }
    el('publishBtn').disabled = !installable.length;
    el('navPlugins').textContent = list.length;
    el('forgeBody').innerHTML = forged.map(function (x) {
      var f = x.forge || {};
      var pack = f.pack || {};
      var products = (f.products || []).map(function (p) { return p.id; }).filter(Boolean).join(', ') || '—';
      return row([
        cell(esc(x.id), 'mono'), cell(esc(pack.name || pack.id || '—') + (pack.id && pack.name ? ' <span class="t-dim mono">' + esc(pack.id) + '</span>' : '')),
        cell(esc(pack.version || '—')), cell(esc(products)),
        cell(String(f.skipped || 0)), cell(String(f.assumed || 0)),
        cell(f.partial ? '<span class="pill">部分</span>' : '<span class="pill yes">完整</span>'),
        cell(esc(f.importedAt || '—')),
      ]);
    }).join('') || '<tr><td colspan="8" class="empty">没有 Forge 导入记录</td></tr>';
    var withContent = d.rooms.filter(function (r) { return r.content; });
    el('roomContentBody').innerHTML = withContent.map(function (r) {
      var c = r.content;
      var plugs = (c.plugins || []).map(function (x) { return x.id + (x.version ? '@' + x.version : ''); }).join(', ') || '—';
      var script = c.trusted ? '<span class="pill no">原生信任</span>' : (c.plugins || []).some(function (x) { return x.class === 'script'; }) ? '<span class="pill">沙箱脚本</span>' : '—';
      var consent = c.trusted ? (c.consent == null ? '—' : c.consent + '/' + c.consentTotal) : '—';
      return row([cell(esc(r.code), 'mono'), cell(c.vanilla ? '原版' : '<span class="mono" title="' + esc(c.cs) + '">' + esc(String(c.cs).slice(0, 12)) + '…</span>'),
        cell(c.vs ? '<span class="mono" title="' + esc(c.vs) + '">' + esc(String(c.vs).slice(0, 12)) + '…</span>' : '—'),
        cell(esc(c.modeId || r.modeName || '')), cell(esc(plugs)), cell(script), cell(consent)]);
    }).join('') || '<tr><td colspan="7" class="empty">当前没有带内容集的房间</td></tr>';
    var skippedText = skipped.map(function (x) {
      return (x.where || x.id || '') + ': ' + (Array.isArray(x.problems) ? x.problems.join(' · ') : (x.problem || JSON.stringify(x)));
    });
    var warningText = warnings.map(function (x) {
      return typeof x === 'string' ? x : (x.warning || x.text || JSON.stringify(x));
    });
    el('pluginIssueCount').textContent = ' · ' + (skippedText.length + warningText.length) + ' 条';
    el('pluginIssues').innerHTML = (skippedText.concat(warningText)).slice(0, 20).map(function (x) {
      return '<div class="notice-item"><b>' + esc(x) + '</b></div>';
    }).join('') || '<div class="empty">没有跳过项或警告</div>';
    el('navPlugins').textContent = list.length;
  }

  function postMarket(body, msgEl) {
    var msg = msgEl || el('marketMsg');
    if (msg) { msg.textContent = '处理中…'; msg.style.color = 'var(--dim)'; }
    return fetch('/admin/api/market?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) {
      return r.text().then(function (text) {
        var j = {};
        try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { error: '服务返回了非 JSON 响应（HTTP ' + r.status + '）' }; }
        return { ok: r.ok, status: r.status, j: j };
      });
    })
      .then(function (res) {
        if (msg) {
          msg.textContent = res.ok ? ('完成：' + ((res.j && res.j.entry && (res.j.entry.name || res.j.entry.id)) || '已更新')) : ('失败：' + ((res.j && res.j.error) || ('HTTP ' + res.status)));
          msg.style.color = res.ok ? 'var(--mint)' : '#ff9a9a';
        }
        if (res.ok && typeof tick === 'function') tick();
        return res;
      })
      .catch(function (e) { if (msg) { msg.textContent = '失败：' + e.message; msg.style.color = '#ff9a9a'; } });
  }

  function openPluginDrawer(mode, id) {
    var p = (lastAdminData && lastAdminData.plugins) || {};
    var item = (mode === 'installed' ? (p.installed || []) : (p.market || [])).find(function (x) { return x.id === id; });
    if (!item) return;
    pluginDrawerItem = item;
    pluginDrawerMode = mode;
    var cls = CLASS_LABELS[item.class] || item.class || '未声明';
    var kind = mode === 'installed' ? '本机插件' : (item.kind === 'forge' ? 'Forge 包' : '普通插件');
    el('drawerKicker').textContent = mode === 'installed' ? '本机插件 · 展示元数据' : '商城条目';
    el('drawerTitle').textContent = item.name || item.id;
    el('drawerMeta').innerHTML = '<span class="pill">' + esc(kind) + '</span><span class="pill">' + esc(cls) + '</span>'
      + (mode === 'installed' ? '<span class="pill yes">已加载</span>' : '<span class="pill">' + esc(item.listed === false ? '已下架' : (item.status === 'active' ? '已上架' : (item.status || ''))) + '</span>')
      + '<span class="drawer-id">' + esc(item.id) + ' · v' + esc(item.version || '—') + '</span>';
    el('drawerDescription').value = item.description || '';
    el('drawerAuthor').value = item.author || '';
    el('drawerApp').value = item.app || '';
    el('drawerApi').value = item.api == null ? '' : String(item.api);
    el('drawerListed').checked = item.listed !== false;
    el('drawerListedRow').hidden = mode === 'installed';
    el('drawerRelatedRow').hidden = mode === 'installed';
    var relatedSel = el('drawerRelated');
    var selected = new Set(Array.isArray(item.related) ? item.related : []);
    var candidates = (p.market || []).concat(p.installed || []).filter(function (x) {
      return x.id !== item.id && x.class !== 'lang';
    });
    relatedSel.innerHTML = candidates.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (selected.has(x.id) ? ' selected' : '') + '>' + esc(x.name || x.id) + ' · ' + esc(x.id) + '</option>';
    }).join('') || '<option disabled>没有其它插件可关联</option>';
    var compat = compatPills(item);
    el('drawerCompat').innerHTML = '<span class="compat-k">' + (mode === 'installed' ? '本机展示' : '商城展示') + '</span>' + compat.own + compat.main;
    var history = Array.isArray(item.history) ? item.history : [];
    var pending = item.pendingUpdate;
    var relatedBy = Array.isArray(item.relatedBy) ? item.relatedBy : [];
    el('drawerHistory').innerHTML = (pending ? '<b>待审核新版本 v' + esc(pending.version) + '</b>' : '')
      + (relatedBy.length ? '<b>被这些插件关联</b><div>' + esc(relatedBy.map(function (r) { return r.name; }).join('、')) + '</div>' : '')
      + (history.length ? '<b>历史版本</b>' + history.slice().reverse().map(function (h) {
        return '<div class="drawer-history-row"><span>v' + esc(h.version) + ' · ' + esc(h.uploadedAt ? new Date(h.uploadedAt).toLocaleDateString() : '') + '</span><button type="button" data-rollback="' + esc(h.version) + '">回滚</button></div>';
      }).join('') : '');
    el('drawerTest').hidden = mode === 'installed';
    el('drawerApprove').hidden = mode === 'installed';
    el('drawerReject').hidden = mode === 'installed';
    el('drawerMsg').textContent = '';
    el('pluginDrawer').hidden = false;
  }

  function closePluginDrawer() {
    el('pluginDrawer').hidden = true;
    pluginDrawerItem = null;
  }

  function drawerPayload() {
    var apiRaw = el('drawerApi').value.trim();
    var fields = {
      description: el('drawerDescription').value,
      author: el('drawerAuthor').value,
      app: el('drawerApp').value.trim() || null,
      api: apiRaw === '' ? null : Number(apiRaw),
    };
    if (pluginDrawerMode === 'market') {
      fields.listed = el('drawerListed').checked;
      fields.related = Array.from(el('drawerRelated').selectedOptions || []).map(function (o) { return o.value; });
    }
    return {
      action: pluginDrawerMode === 'installed' ? 'edit-installed' : 'edit',
      id: pluginDrawerItem && pluginDrawerItem.id,
      kind: pluginDrawerItem && pluginDrawerItem.kind,
      fields: fields,
    };
  }

  el('pluginSearch').addEventListener('input', function () {
    if (lastAdminData) renderPlugins(lastAdminData);
  });

  document.querySelectorAll('[data-psub]').forEach(function (b) {
    b.addEventListener('click', function () {
      pluginSection = b.dataset.psub || 'market';
      if (lastAdminData) renderPlugins(lastAdminData);
      if (pluginSection === 'diagnostics') loadAudit();
    });
  });

  function loadAudit() {
    fetch('/admin/api/audit?token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (r) { return r.text().then(function (text) { var j = {}; try { j = text ? JSON.parse(text) : {}; } catch (e) { j = {}; } return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var rows = (res.ok && Array.isArray(res.j.entries)) ? res.j.entries : [];
        el('auditCount').textContent = ' · ' + rows.length + ' 条';
        el('auditBody').innerHTML = rows.map(function (x) {
          var detail = Object.keys(x).filter(function (k) { return k !== 'at' && k !== 'action'; })
            .map(function (k) { return k + '=' + (typeof x[k] === 'object' ? JSON.stringify(x[k]) : x[k]); }).join(' · ');
          return row([cell(esc(x.at || '—')), cell(esc(x.action || '—')), cell(esc(detail))]);
        }).join('') || '<tr><td colspan="3" class="empty">还没有审计记录</td></tr>';
      })
      .catch(function () { el('auditBody').innerHTML = '<tr><td colspan="3" class="empty">审计日志加载失败</td></tr>'; });
  }

  el('marketBody').addEventListener('click', function (e) {
    var mv = e.target.closest('[data-move]');
    if (mv) {
      var tr = mv.closest('tr');
      if (tr) postMarket({ action: 'move', kind: tr.dataset.kind, id: tr.dataset.id, direction: mv.dataset.move }, el('marketMsg'));
      return;
    }
    var edit = e.target.closest('[data-edit]');
    if (!edit) return;
    var row = edit.closest('tr');
    if (row) openPluginDrawer('market', row.dataset.id);
  });

  el('installedMetaBody').addEventListener('click', function (e) {
    var un = e.target.closest('[data-uninstall]');
    if (un) {
      var ur = un.closest('tr');
      if (!ur || !confirm('确定卸载本机插件 ' + ur.dataset.id + '？旧文件夹会移到 plugins/_removed/。')) return;
      fetch('/admin/api/plugins/uninstall?token=' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ur.dataset.id }),
      }).then(function (r) {
        return r.text().then(function (text) {
          var j = {}; try { j = text ? JSON.parse(text) : {}; } catch (err) { j = { error: '服务返回了非 JSON 响应（HTTP ' + r.status + '）' }; }
          return { ok: r.ok, status: r.status, j: j };
        });
      }).then(function (res) {
        var msg = el('installedMetaMsg');
        msg.textContent = res.ok ? ('已卸载：' + ur.dataset.id) : ('卸载失败：' + ((res.j && res.j.error) || ('HTTP ' + res.status)));
        msg.style.color = res.ok ? 'var(--mint)' : '#ff9a9a';
        if (res.ok) tick();
      }).catch(function (err) { el('installedMetaMsg').textContent = '卸载失败：' + err.message; });
      return;
    }
    var edit = e.target.closest('[data-edit]');
    if (!edit) return;
    var tr = edit.closest('tr');
    if (tr) openPluginDrawer('installed', tr.dataset.id);
  });

  el('localInstallBtn').addEventListener('click', function () { el('localInstallFile').click(); });
  el('localInstallFile').addEventListener('change', function () {
    var file = el('localInstallFile').files && el('localInstallFile').files[0];
    if (!file) return;
    var msg = el('installedMetaMsg');
    msg.textContent = '安装中…'; msg.style.color = 'var(--dim)';
    fetch('/admin/api/plugins/install?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/zip', 'X-Plugin-Filename': file.name }, body: file,
    }).then(function (r) {
      return r.text().then(function (text) {
        var j = {}; try { j = text ? JSON.parse(text) : {}; } catch (err) { j = { error: '服务返回了非 JSON 响应（HTTP ' + r.status + '）' }; }
        return { ok: r.ok, status: r.status, j: j };
      });
    }).then(function (res) {
      msg.textContent = res.ok ? ('已安装：' + (res.j.installed && res.j.installed.id ? res.j.installed.id : '插件')) : ('安装失败：' + ((res.j && res.j.error) || ('HTTP ' + res.status)));
      msg.style.color = res.ok ? 'var(--mint)' : '#ff9a9a';
      el('localInstallFile').value = '';
      if (res.ok) tick();
    }).catch(function (err) { msg.textContent = '安装失败：' + err.message; msg.style.color = '#ff9a9a'; });
  });

  el('marketBody').addEventListener('change', function (e) {
    if (!e.target.matches('[data-quick-listed]')) return;
    var tr = e.target.closest('tr');
    if (!tr) return;
    postMarket({ action: 'edit', kind: tr.dataset.kind, id: tr.dataset.id, fields: { listed: e.target.checked } }, el('marketMsg'));
  });

  var dragRow = null;
  el('marketBody').addEventListener('dragstart', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr || (el('pluginSearch').value || '').trim()) return;
    dragRow = tr;
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tr.dataset.id); } catch (err) { /* ignore */ }
  });
  el('marketBody').addEventListener('dragover', function (e) {
    if (!dragRow) return;
    var tr = e.target.closest('tr[data-id]');
    if (tr && tr !== dragRow) e.preventDefault();
  });
  el('marketBody').addEventListener('drop', function (e) {
    if (!dragRow) return;
    var target = e.target.closest('tr[data-id]');
    if (!target || target === dragRow) { dragRow = null; return; }
    e.preventDefault();
    target.parentNode.insertBefore(dragRow, target);
    var rows = Array.from(el('marketBody').querySelectorAll('tr[data-id]'));
    var kind = rows[0] && rows[0].dataset.kind;
    var ids = rows.map(function (r) { return r.dataset.id; });
    dragRow = null;
    if (kind) postMarket({ action: 'reorder', kind: kind, ids: ids }, el('marketMsg'));
  });
  el('marketBody').addEventListener('dragend', function () { dragRow = null; });

  el('pluginDrawer').addEventListener('click', function (e) {
    if (e.target.closest('[data-drawer-close]')) closePluginDrawer();
    var rb = e.target.closest('[data-rollback]');
    if (!rb || !pluginDrawerItem) return;
    postMarket({ action: 'rollback', kind: pluginDrawerItem.kind, id: pluginDrawerItem.id, version: rb.dataset.rollback }, el('drawerMsg')).then(function (res) {
      if (res && res.ok) closePluginDrawer();
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el('pluginDrawer').hidden) closePluginDrawer();
  });
  el('drawerSave').addEventListener('click', function () {
    if (!pluginDrawerItem) return;
    postMarket(drawerPayload(), el('drawerMsg')).then(function (res) {
      if (res && res.ok) closePluginDrawer();
    });
  });
  el('drawerTest').addEventListener('click', function () {
    if (!pluginDrawerItem) return;
    postMarket({ action: 'test', kind: pluginDrawerItem.kind, id: pluginDrawerItem.id }, el('drawerMsg'));
  });
  el('drawerApprove').addEventListener('click', function () {
    if (!pluginDrawerItem) return;
    postMarket({ action: 'approve', kind: pluginDrawerItem.kind, id: pluginDrawerItem.id }, el('drawerMsg')).then(function (res) {
      if (res && res.ok) closePluginDrawer();
    });
  });
  el('drawerReject').addEventListener('click', function () {
    if (!pluginDrawerItem) return;
    postMarket({ action: 'reject', kind: pluginDrawerItem.kind, id: pluginDrawerItem.id }, el('drawerMsg')).then(function (res) {
      if (res && res.ok) closePluginDrawer();
    });
  });

  el('publishBtn').addEventListener('click', function () {
    var id = el('publishSelect').value;
    if (!id) return;
    postMarket({ action: 'publish', id: id }, el('marketMsg')).then(function (res) {
      if (res && res.ok) pluginSection = 'market';
    });
  });

  el('pluginImportBtn').addEventListener('click', function () { el('pluginImportFile').click(); });
  el('pluginImportFile').addEventListener('change', function () {
    var file = el('pluginImportFile').files && el('pluginImportFile').files[0];
    if (!file) return;
    var kind = el('pluginImportKind').value || 'ordinary';
    var msg = el('marketMsg');
    msg.textContent = '导入中…'; msg.style.color = 'var(--dim)';
    fetch('/admin/api/market/import?token=' + encodeURIComponent(token) + '&kind=' + encodeURIComponent(kind), {
      method: 'POST', headers: { 'Content-Type': 'application/zip', 'X-Plugin-Filename': file.name }, body: file,
    }).then(function (r) {
      return r.text().then(function (text) {
        var j = {};
        try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { error: '服务返回了非 JSON 响应（HTTP ' + r.status + '）' }; }
        return { ok: r.ok, status: r.status, j: j };
      });
    })
      .then(function (res) {
        msg.textContent = res.ok ? ('已导入：' + (res.j.plugin && (res.j.plugin.name || res.j.plugin.id)) + '，等待审核') : ('导入失败：' + ((res.j && res.j.error) || ('HTTP ' + res.status)));
        msg.style.color = res.ok ? 'var(--mint)' : '#ff9a9a';
        el('pluginImportFile').value = '';
        if (res.ok) { pluginSection = 'market'; tick(); }
      })
      .catch(function (e) { msg.textContent = '导入失败：' + e.message; msg.style.color = '#ff9a9a'; });
  });

  el('pluginGcBtn').addEventListener('click', function () {
    if (!confirm('清理没有被商城条目、待审版本或历史版本引用的 zip，以及本机下载缓存？')) return;
    postMarket({ action: 'gc' }, el('marketMsg')).then(function (res) {
      if (res && res.ok) el('marketMsg').textContent = '已清理：zip ' + (res.j.removed || 0) + ' 个，本机缓存 ' + (res.j.cached || 0) + ' 个';
    });
  });

  el('themeToggle').addEventListener('click', function () {
    applyAdminTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });

  el('pluginPolicySave').addEventListener('click', function () {
    var area = el('pluginPolicyJson');
    var msg = el('pluginPolicyMsg');
    var btn = el('pluginPolicySave');
    var body;
    try { body = JSON.parse(area.value); } catch (e) { msg.textContent = 'JSON 解析失败：' + e.message; return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { msg.textContent = '需要一个 JSON 对象'; return; }
    btn.disabled = true;
    msg.textContent = '保存中…';
    fetch('/admin/api/plugin-policy?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || 'HTTP');
        msg.textContent = '已保存 · 下一次读取策略时生效';
        tick();
      })
      .catch(function (e) { msg.textContent = '保存失败：' + e.message; })
      .then(function () { btn.disabled = false; });
  });

  function render(d) {
    lastAdminData = d;
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
    renderPluginNotices(d);
    // renderBugs FIRST: it sets bugList, which renderBugToolbar reads for the 「显示 N / 共 M 条」 count.
    renderBugs(d.bugs);
    renderBugToolbar(d.bugCounts);
    renderPlugins(d);
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
  function renderPluginNotices(d) {
    var p = d.plugins || { installed: [] };
    var items = [];
    (p.installed || []).forEach(function (pl) {
      (pl.notices || []).forEach(function (n) {
        items.push({ plugin: pl.name || pl.id, id: n.id, title: n.title, body: n.body, date: n.date });
      });
    });
    el('pluginNotices').innerHTML = items.slice(0, 20).map(function (n) {
      return '<div class="notice-item"><time>' + esc(n.date || '') + '</time><b>' + esc(n.title || n.id || '') + '</b>'
        + '<i>— 插件：' + esc(n.plugin) + '</i><em>' + esc(n.body || '') + '</em></div>';
    }).join('') || '<div class="empty">没有插件公告</div>';
  }

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

  // ---------------- 来源配置 (server/mirrors.js → /admin/api/origins): the art origins, edited in place. The file is
  // the ONE place they live; a save is validated, backed up, and live on the next request (no restart). --------------
  var originsLoaded = false, originsBusy = false, originsRows = [];
  function originsMsg(text, bad) {
    var n = el('originsMsg');
    n.textContent = text;
    n.className = 'verdict' + (bad ? ' is-bad' : '');
  }
  function originsToRows(d) {
    var full = {};
    (Array.isArray(d.fullSources) ? d.fullSources : []).forEach(function (u) { full[u] = true; });
    return (Array.isArray(d.sources) ? d.sources : []).map(function (u) { return { url: u, full: !!full[u] }; });
  }
  function originsBody() {
    var rows = originsRows.map(function (r) { return { url: String(r.url || '').trim(), full: !!r.full }; })
      .filter(function (r) { return r.url; });
    return { sources: rows.map(function (r) { return r.url; }), fullSources: rows.filter(function (r) { return r.full; }).map(function (r) { return r.url; }) };
  }
  function renderOrigins() {
    var rows = originsRows.length ? originsRows : [{ url: '', full: false }];
    el('originsList').innerHTML = rows.map(function (r, i) {
      return '<div class="origin-row" data-i="' + i + '">'
        + '<span class="origin-row__idx">' + (i + 1) + '</span>'
        + '<input class="origin-row__url" value="' + esc(r.url) + '" placeholder="https://…" spellcheck="false"/>'
        + '<label class="origin-row__full"><input type="checkbox" data-full="1"' + (r.full ? ' checked' : '') + '/>全路由</label>'
        + '<button class="btn btn--tiny" data-act="up" title="上移" aria-label="上移">↑</button>'
        + '<button class="btn btn--tiny" data-act="down" title="下移" aria-label="下移">↓</button>'
        + '<button class="btn btn--tiny" data-act="del" title="删除" aria-label="删除">✕</button>'
        + '</div>';
    }).join('');
  }
  function loadOrigins() {
    originsBusy = true;
    originsMsg('正在读取…', false);
    fetch('/admin/api/origins?token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        originsRows = originsToRows(d);
        originsLoaded = true;
        renderOrigins();
        originsMsg('已加载 ' + originsRows.length + ' 个来源 · ' + (d.backup ? '可还原上一版' : '暂无上一版可还原'), false);
      })
      .catch(function (e) { originsMsg('读取失败：' + e.message, true); })
      .then(function () { originsBusy = false; });
  }
  function saveOrigins(what, body) {
    if (originsBusy) return;
    originsBusy = true;
    originsMsg('正在' + what + '…', false);
    fetch('/admin/api/origins?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || originsBody()),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || 'HTTP');
        originsRows = originsToRows(res.j);
        originsLoaded = true;
        renderOrigins();
        originsMsg(what + '成功 · ' + originsRows.length + ' 个来源 · 下一次请求即生效，客户端下次加载可见'
          + (res.j.revert ? ' · 已还原到上一版' : ' · 上一版已留作备份'), false);
      })
      .catch(function (e) { originsMsg(what + '失败：' + e.message, true); })
      .then(function () { originsBusy = false; });
  }
  el('originsAdd').addEventListener('click', function () {
    originsRows = (originsRows.length ? originsRows : []).concat([{ url: '', full: false }]);
    renderOrigins();
    var inputs = el('originsList').querySelectorAll('.origin-row__url');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  el('originsSave').addEventListener('click', function () { saveOrigins('保存'); });
  el('originsRevert').addEventListener('click', function () { saveOrigins('还原', { revert: true }); });
  el('originsList').addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('origin-row__url')) return;
    var row = t.closest('.origin-row');
    if (row) originsRows[Number(row.dataset.i)].url = t.value;
  });
  el('originsList').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.dataset || t.dataset.full !== '1') return;
    var row = t.closest('.origin-row');
    if (row) originsRows[Number(row.dataset.i)].full = !!t.checked;
  });
  el('originsList').addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!b) return;
    var row = b.closest('.origin-row');
    var i = Number(row.dataset.i);
    var act = b.dataset.act;
    if (act === 'del') originsRows.splice(i, 1);
    else {
      var j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= originsRows.length) return;
      var swap = originsRows[i];
      originsRows[i] = originsRows[j];
      originsRows[j] = swap;
    }
    renderOrigins();
  });

  setView(location.hash.slice(1) || 'overview', true);
  tick(); setInterval(tick, 2000);
})();
</script>
</body></html>
`;

/**
 * The sha256 of the page's one inline script, for its Content-Security-Policy.
 * The site policy hashes import maps only (server/http/csp.js), so the admin route adds this hash itself —
 * without it the browser blocks the script and the page shows empty panels.
 */
export const ADMIN_CSP_HASH = (() => {
  const m = /<script>([\s\S]*?)<\/script>/.exec(ADMIN_HTML);
  return m ? createHash('sha256').update(m[1]).digest('base64') : null;
})();
