// server/index.js — process entry & boot (DESIGN §1, §2). Plain node:http + ws, no framework: startServer() below
// (i18n-ignore-file: the /admin route's messages are developer-facing and bilingual by design — docs/I18N.md)
// wires the modules under server/http/, in this order —
//
//   http/config.js     ROOT, the served directories, the environment (PORT 3000, HOST '::' dual-stack, TRUST_PROXY auto, DEBUG),
//                      which startServer() options go to net.js / lobby.js, the console logger
//   http/websocket.js  session wiring (SessionRegistry → Lobby → Network) and the WebSocket at /ws (maxPayload 64 KB,
//                      permessage-deflate from 1 KB; refused at upgrade with 404 / 429 per network / 503)
//   http/static.js     the static mounts (/ → public/, /data/, /shared/, /sim/ `.js` only), the /data.js browser stand-in,
//                      the language packs (/packs/index.json, /packs/<id>/<file>), the plugin catalogue
//                      (/plugins/index.json — the registry is plugins/registry.js), the vanilla content set's manifest
//                      (/cs/<cs16>/index.json — plugins/identity.js: the content hash `cs`, DESIGN §32), the visual sets
//                      of cosmetic plugins (/vs/<vs16>/…, plugins/visualSet.js) and their files (/p/<id>/<hash8>/…),
//                      the content sets of gameplay plugins (/cs/<cs16>/…, plugins/contentSets.js — DESIGN §32.6; the
//                      server owner's plugins/config.json: plugins/policy.js; a room's plugins: plugins/roomSets.js; its
//                      match then runs in that set's worker: match/host/)
//   http/media.js      /media/bgm/act1 → public/assets/audio/bgm/act1.mp3 (audio addressed without its extension)
//   http/files.js      one file → response: MIME, brotli / gzip + memory cache, ETag / Last-Modified / 304, Cache-Control, ranges
//   http/assetIndex.js the content hashes of public/assets and public/fonts (built in the background, cached in
//                      .cache/asset-hashes.json by path + size + mtime; Spine models share one hash)
//   http/assetViews.js the served /data/assets.json and /data/local-assets.json: every art URL with its hash segment
//                      (/assets/~<hash>/…, immutable when the hash matches); the committed files stay unchanged
//   http/buildTag.js   the build tag of the served browser runtime (/healthz `build`, public/js/ui/buildGuard.js)
//   http/routes.js     the request listener: security headers, 414 / 400 / 405, GET /healthz → JSON status, else static
//   http/traffic.js    the traffic counters: bytes sent per category (assets / audio / code / data) and on the
//                      WebSocket, since the start (GET /healthz?traffic=1)
//   http/common.js     what every answer shares: security headers, URL split, error page, JSON replies, bare 400
//   http/boot.js       a pending update package first (update.js: old files deleted, the install verified against
//                      MANIFEST.json), banner (Local / LAN / tunnel URLs), port-in-use hint, graceful shutdown on SIGINT /
//                      SIGTERM
//
// Accounts & 野排 (docs/MATCHMAKING.md, opt-in with `accounts: true`): db.mjs / auth.js / admin.js, and the extra
// routes startServer() serves itself — GET /online/api (public online status) and the token-gated /admin page +
// /admin/api/state + POST /admin/api/notify (an operator notice pushed to the live sessions).
//
// Per-network limits for internet clients (see net.js clientAddress; local/LAN peers are exempt): open sockets
// (maxConnectionsPerAddr, refused at upgrade with 429), rooms and running matches (lobby.js).
//
// Programmatic use (tests): `const srv = await startServer({ port: 0, quiet: true }); … await srv.close();`
// The server only auto-listens when this file is the process entry point.

import http from 'node:http';
import path from 'node:path';
import { getData, loadData } from './data.js';
import { readFileSync } from 'node:fs';
import { openDb } from './db.mjs';
import { AuthService } from './auth.js';
import { CommunityService, bugReportsExport, bugReportsToCsv } from './community.js';
import { StatsService } from './stats.js';
import { TrainingStore } from './training/store.js';
import { setTrainingSink } from './training/record.js';
import { configurePrior, priorStatus } from './match/botPrior.js';
import { ADMIN_HTML, buildPublicSnapshot, buildSnapshot, loadAdminToken, tokenMatches } from './admin.js';
import { createSpeedProbe } from './speed.js';
import { readMirrors, writeMirrors, revertMirrors, backupPath, hasBackup } from './mirrors.js';
import { clientAddress } from './net.js';
import { BUG_IMAGE_MAX_BYTES, BUG_IMAGES_MAX } from '../shared/constants.js';
import { ROOT, listenAddress, bindCandidates, serveDirs, makeLogger, parseTrustProxy, assetIndexOptionsFrom } from './http/config.js';import { WS_MAX_PAYLOAD, createSessionStack, attachWebSocket } from './http/websocket.js';
import { DATA_SHIM_JS, createStaticHandler } from './http/static.js';
import { createPluginRegistry } from './plugins/registry.js';
import { computeVanillaContent } from './plugins/identity.js';
import { createVisualSets } from './plugins/visualSet.js';
import { createPluginPolicy } from './plugins/policy.js';
import { createContentSets } from './plugins/contentSets.js';
import { createRoomSets } from './plugins/roomSets.js';
import { createMatchHosts } from './match/host/index.js';
import { createTrustedRuntime } from './plugins/trustedRuntime.js';
import { trustedHostAllowed } from './plugins/trusted.js';
import { createStudio } from './studio/index.js';
import { siteCsp } from './http/csp.js';
import { MIME, COMPRESSIBLE, acceptsGzip, pickEncoding, parseRange } from './http/files.js';
import { BUILD_INPUTS, computeBuildTag, buildTag, resetBuildTag } from './http/buildTag.js';
import { createRequestHandler } from './http/routes.js';
import { answerClientError, sendError, sendJson, setSecurityHeaders, splitUrl } from './http/common.js';
import { createTrafficCounter } from './http/traffic.js';
import { createAssetIndex } from './http/assetIndex.js';
import { createManifestViews } from './http/assetViews.js';
import { lanUrls, displayHost, isProcessEntry, runMain } from './http/boot.js';

// The public API of this module (tests and tools import it from here); the code lives in ./http/.
export {
  ROOT, WS_MAX_PAYLOAD, DATA_SHIM_JS, MIME, COMPRESSIBLE, BUILD_INPUTS, computeBuildTag, buildTag, resetBuildTag,
  acceptsGzip, pickEncoding, parseRange, createStaticHandler, lanUrls, parseTrustProxy,
};

/**
 * Read a small JSON request body (POST /admin/api/notify). Resolves null on an empty / oversized / malformed body
 * (the socket is destroyed past `maxBytes`, so a huge body can not be used as a memory lever).
 * @param {import('node:http').IncomingMessage} req @param {number} [maxBytes]
 * @returns {Promise<any|null>}
 */
function readJsonBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve(null); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * Read a raw request body (POST /community/api/bug/upload) up to `maxBytes`. Resolves null past the cap or on error
 * (the socket is destroyed so an oversized upload cannot be used as a memory lever).
 * @param {import('node:http').IncomingMessage} req @param {number} maxBytes
 * @returns {Promise<Buffer|null>}
 */
function readRawBody(req, maxBytes) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0)));
    req.on('error', () => resolve(null));
  });
}

/** One cookie's value from a Cookie header (tiny parser, no dependency). */
function cookieValue(header, name) {
  if (typeof header !== 'string' || !header) return '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      try { return decodeURIComponent(v); } catch { return v; }
    }
  }
  return '';
}

/**
 * Build and start the HTTP + WebSocket server.
 * @param {{
 *   port?: number, host?: string, quiet?: boolean, log?: object,
 *   publicDir?: string, dataDir?: string, sharedDir?: string, packsDir?: string, pluginsDir?: string,
 *   MatchClass?: Function, seedFn?: () => number,
 *   lobbyGraceMs?: number, reconnectWindowMs?: number, heartbeatMs?: number, helloTimeoutMs?: number,
 *   ratePerSec?: number, rateBurst?: number, maxConnections?: number, maxRooms?: number,
 *   maxConnectionsPerAddr?: number, maxRoomsPerAddr?: number, maxMatchesPerAddr?: number, resyncMinGapMs?: number,
 *   heavyPerSec?: number, heavyBurst?: number, trustProxy?: 'auto' | boolean, soloReconnectWindowMs?: number,
 *   accounts?: boolean, auth?: object, db?: object, dbFile?: string, adminToken?: string,
 *   assetIndex?: boolean | { cacheFile?: string | null, delayMs?: number }, studio?: boolean,
 *   matchHost?: object,
 * }} [opts]
 *   assetIndex: the content-hash index (default on; false or SP_ASSET_INDEX=0: off — config.js assetIndexOptionsFrom);
 *   studio: the plugin studio at /studio/ (default on for this machine and the local network — SP_STUDIO=local|off;
 *   false: none);
 *   matchHost: options of the match hosts (server/match/host/index.js — watchdogMs, matchOptions …; tests)
 * @returns {Promise<{ port: number, host: string, url: string, server: http.Server, wss: import('ws').WebSocketServer,
 *                     lobby: import('./lobby.js').Lobby, network: import('./net.js').Network,
 *                     registry: import('./net.js').SessionRegistry, packs: ReturnType<typeof createPluginRegistry>,
 *                     db: object|null, auth: object|null, adminUrl: string|null,
 *                     content: import('./plugins/identity.js').VanillaContent, visual: ReturnType<typeof createVisualSets>,
 *                     contents: ReturnType<typeof createContentSets>, hosts: ReturnType<typeof createMatchHosts>,
 *                     traffic: ReturnType<typeof createTrafficCounter>, assetIndex: ReturnType<typeof createAssetIndex> | null,
 *                     views: ReturnType<typeof createManifestViews> | null, studio: ReturnType<typeof createStudio> | null,
 *                     close: () => Promise<void> }>}
 */
export async function startServer(opts = {}) {
  const { port, host } = listenAddress(opts);
  const log = opts.log || makeLogger(!!opts.quiet);
  const { publicDir, dataDir, sharedDir, packsDir, pluginsDir } = serveDirs(opts);
  const simDir = path.join(ROOT, 'server', 'sim');

  // The process-wide singleton serves the default data dir; a custom dir (tests) gets its own copy.
  const data = opts.dataDir ? loadData(dataDir, { log }) : getData({ dir: dataDir, log });

  // Accounts & 野排 (docs/MATCHMAKING.md). The SQLite file lives OUTSIDE the served data/ dir (var/, git-ignored).
  // Enabled only when asked — the real server (main) or a test injecting auth/db — so unit tests stay file-free; a
  // null auth runs the guests-only flow exactly as before.
  const accounts = opts.accounts === true || !!opts.auth || !!opts.db;
  const db = accounts ? (opts.db || openDb(opts.dbFile || process.env.SP_DB || path.join(ROOT, 'var', 'accounts.db'))) : null;
  const auth = accounts ? (opts.auth || new AuthService({ db })) : null;
  // Operations page (server/admin.js): enabled with accounts; the token file is `var/admin-token.txt`.
  const admin = auth ? { token: opts.adminToken || loadAdminToken(ROOT) } : null;
// 测速 (server/speed.js, docs/MATCHMAKING.md §12.2): the console times the art origins from here on demand. Created
// only with the admin page; the cooldown inside the probe keeps a refresh-happy operator off the free mirrors.
const speedProbe = admin ? createSpeedProbe({ root: ROOT }) : null;
  // Community data (server/community.js): the persisted 更新日志 + player bug reports/images, on the same DB. Seeded
  // ONCE from the repo's CHANGELOG.md; uploads land in `var/bug-uploads/` (git-ignored, never served statically).
  const community = db
    ? (opts.community || new CommunityService({ db, dir: opts.uploadDir || path.join(ROOT, 'var', 'bug-uploads') }))
    : null;
  if (community && !opts.community) {
    try { community.importChangelogMarkdown(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')); } catch (e) { log.warn('[community] changelog seed skipped', e?.message); }
  }
  // Match statistics (server/stats.js, docs/MATCHMAKING.md §40): every finished match, per owner (account or guest),
  // on the same DB — schema v5 (server/db.mjs). Null without a DB (guests-only, file-free tests): stats.* is disabled.
  const stats = db ? (opts.stats || new StatsService({ db })) : null;
  // Bot-rehearsal training samples (server/training/store.js): their OWN SQLite file, batched and best-effort, so a
  // failure or a full disk never touches a match. Opt-in: `SP_TRAINING=on` (tests and a plain `node server/index.js`
  // record nothing); the store opens lazily on the first recorded rehearsal.
  const training = opts.training !== undefined
    ? opts.training
    : (process.env.SP_TRAINING === 'on'
      ? new TrainingStore({ file: opts.trainingFile || path.join(ROOT, 'var', 'training.db'), log })
      : null);
  // the store opens lazily on the first recorded rehearsal: a match without bots never creates the file
  setTrainingSink(training ? (row) => training.record(row) : null);
  // The trained bot prior (server/match/botPrior.js): machine-local, re-read per bot prep; a missing file or
  // SP_BOT_PRIOR=off leaves the heuristic candidate order untouched.
  configurePrior({ file: path.join(ROOT, 'server', 'match', 'botPrior.json'), enabled: process.env.SP_BOT_PRIOR !== 'off', log });
  // the vanilla content hash `cs` (DESIGN 32): the bytes of the served sim, shared code and game data, read once
  // now - like the data the matches use and the build tag below
  const content = computeVanillaContent({ simDir, sharedDir, dataDir, shim: DATA_SHIM_JS, log });
  log.info(`[content] vanilla ${content.cs.slice(0, 16)} (${Object.keys(content.simFiles).length} code files, ${Object.keys(content.data).length} data files)`);
  // language packs and plugins (docs/PACKS.md, docs/PLUGINS.md): scanned now - the start log names them - and again
  // whenever their folders change
  const packs = createPluginRegistry({ publicDir, dataDir, packsDir, pluginsDir }, { log, scriptHost: host, scriptMode: process.env.SP_PLUGIN_SCRIPTS });
  packs.refresh(true);
  // the content hashes of the art (built in the background once listening) and the manifests served with them
  const indexOptions = assetIndexOptionsFrom(opts, publicDir);
  const assetIndex = indexOptions ? createAssetIndex({ publicDir, log, ...indexOptions }) : null;
  const views = assetIndex ? createManifestViews({ dataDir, index: assetIndex, log }) : null;
  // the visual sets of the cosmetic plugins (DESIGN 32 P1a): what a room's host switches on, served at /vs/ and /p/
  const visual = createVisualSets({ registry: packs, log });
  // the server owner's policy (plugins/config.json) and the content sets of the gameplay plugins (served at
  // /cs/<cs16>/?? a room holds one while it plays it, its data patched by P1b); no match hosts here: the browser simulates
  const policy = createPluginPolicy({ pluginsDir, log });
  const contents = createContentSets({ registry: packs, vanillaData: data, log, maxSets: () => policy.get().maxSets });
  const roomSets = createRoomSets({ registry: packs, visual, contents, policy });
  // gameplay-plugin rooms simulate in a host (server/match/host, DESIGN §32.6): one per content set; a child process
  // by default, a worker thread when SP_MATCH_HOST=worker asks for it
  const transport = String(process.env.SP_MATCH_HOST || '').trim().toLowerCase() === 'worker' ? 'worker' : 'process';
  const hosts = createMatchHosts({ contents, log, options: { transport, maxWorkers: Math.max(1, policy.get().maxSets), ...(opts.matchHost || {}) } });
  const { registry, lobby, network } = createSessionStack({ ...opts, auth, community, stats }, { data, log, content, plugins: roomSets, hosts });
  lobby.network = network; // lets the lobby close a session's socket the net way (account kick, docs/MATCHMAKING.md)
  const serveStatic = createStaticHandler({ publicDir, dataDir, sharedDir, simDir, packsDir, pluginsDir, packs, content, log, assetIndex, views, visual, contents });
  // the plugin studio (DESIGN §32.9): its page and API for this machine and the local network; it watches plugins/ only
  // once it is used (hot reload), and rooms whose host is the author or alone follow a plugin's changes by themselves
  const studio = opts.studio === false ? null : createStudio({ publicDir, pluginsDir, dataDir, registry: packs, lobby, sessions: registry, log, fetch: opts.fetch });
  const trustedRuntime = await createTrustedRuntime({ registry: packs, log });
  lobby.trustedRuntime = trustedRuntime;
  const startedAt = Date.now();
  // The tag is per process (see buildTag): read the browser runtime once, here, not on every /healthz.
  resetBuildTag();
  buildTag();

  const traffic = createTrafficCounter();
  // The identity of a player's HTTP request (upload / changelog): the bound account when an `X-Account-Token` header
  // resolves (the browser's stored session token), else the per-network key — the same scheme when the report arrives
  // over the WebSocket, so an upload and its report share an owner.
  const trustProxy = opts.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY);
  // the page policy (server/http/csp.js): every response carries it unless SP_CSP=off
  const sitePolicy = process.env.SP_CSP === 'off' ? null : siteCsp(publicDir);
  const baseHandler = createRequestHandler({
    serveStatic, studio, trustedRuntime, csp: sitePolicy,
    health: { startedAt, network, registry, lobby, content, visual, traffic, assetIndex, views, prior: priorStatus(), trusted: trustedRuntime?.health },
    log, trustProxy,
  });
  function communityKey(req) {
    const tok = req.headers['x-account-token'];
    const acc = auth && typeof tok === 'string' && tok ? auth.resolve(tok) : null;
    if (acc) return { key: `account:${acc.id}`, accountId: acc.id, name: acc.name };
    const { ip, key } = clientAddress(req, trustProxy);
    return { key: `net:${key || ip || 'unknown'}`, accountId: null, name: null };
  }

  /**
   * Token-gated operations routes (server/admin.js). notify pushes an operator notice to the live sessions
   * (lobby.broadcastNotice). Security headers are already set by the caller.
   */
  async function adminRoute(req, res, parts) {
    const notify = parts.rawPath === '/admin/api/notify';
    const bugStatus = parts.rawPath === '/admin/api/bug/status';
    const bugExport = parts.rawPath === '/admin/api/bug/export';
    const speed = parts.rawPath === '/admin/api/speed';
    const origins = parts.rawPath === '/admin/api/origins';
    const imageMatch = /^\/admin\/api\/bug\/image\/(\d+)$/.exec(parts.rawPath);
    if (!admin) { sendError(req, res, 404, '管理页未启用 · Admin disabled'); return; }
    const queryToken = new URLSearchParams(parts.query).get('token');
    const provided = queryToken || req.headers['x-admin-token'] || cookieValue(req.headers.cookie, 'sp_admin') || '';
    if (!tokenMatches(provided, admin.token)) {
      sendError(req, res, 403, '需要管理令牌 · Admin token required', '令牌见 var/admin-token.txt（或启动日志的 Admin 链接）');
      return;
    }
    // Remember a valid ?token= in a cookie for 30 days, so plain /admin links (the lobby's 在线 badge) work.
    if (queryToken) res.setHeader('Set-Cookie', `sp_admin=${encodeURIComponent(admin.token)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=2592000`);
    // 测速 (server/speed.js, docs/MATCHMAKING.md §12.2): time every configured art origin (the relay + the GitHub
    // mirrors) and report which one a client would install right now. GET only; the probe's own cooldown keeps a
    // refresh-happy operator from hammering the free mirrors (?force=1 skips it, used by the button).
    if (speed) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const force = new URLSearchParams(parts.query).get('force') === '1';
      const r = await speedProbe.run({ force });
      sendJson(req, res, 200, { ok: true, ...r });
      return;
    }
    // 来源配置 (server/mirrors.js, docs/MATCHMAKING.md §12.3): read / write public/asset-mirrors.json — the ONE place
    // the art origins are written down. Every URL is validated and the previous file is kept as a backup, so an edit is
    // reversible; a save is live on the next request (the asset index keys its cache on this file's mtime) — no restart.
    if (origins) {
      const backup = backupPath(ROOT);
      if (req.method === 'GET' || req.method === 'HEAD') {
        sendJson(req, res, 200, { ok: true, file: 'public/asset-mirrors.json', backup: hasBackup(ROOT), ...readMirrors(publicDir) });
        return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); sendJson(req, res, 405, { error: 'GET or POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') { sendJson(req, res, 400, { error: '请求体需要是 JSON' }); return; }
      const r = body.revert
        ? revertMirrors(publicDir, { backup })
        : writeMirrors(publicDir, { sources: body.sources, fullSources: body.fullSources }, { backup });
      if (r.error) { sendJson(req, res, 400, { error: r.error }); return; }
      sendJson(req, res, 200, { ok: true, file: 'public/asset-mirrors.json', backup: hasBackup(ROOT), reverted: !!body.revert, ...readMirrors(publicDir) });
      return;
    }
    if (notify) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') { sendJson(req, res, 400, { error: '请求体需要是 JSON' }); return; }
      const r = lobby.broadcastNotice({ text: body.text, sign: body.sign, scope: body.scope });
      if (r.error) { sendJson(req, res, 400, { error: '通知内容为空或过长' }); return; }
      // Every notice is also logged as the running 更新日志's next minor version (server/community.js recordNotice),
      // so report the created version back to the admin page; a failed write leaves `changelog` null, the push stands.
      sendJson(req, res, 200, { ok: true, sent: r.sent, notice: r.notice, changelog: r.changelog || null });
      return;
    }
    // bug report status (server/community.js): POST { id, status } marks a report 待处理 / 已受理 / 已修复.
    if (bugStatus) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') { sendJson(req, res, 400, { error: '请求体需要是 JSON' }); return; }
      const r = community ? community.setBugStatus(Number(body.id), String(body.status)) : { error: 'disabled' };
      if (r.error) { sendJson(req, res, 400, { error: '无效的报告或状态' }); return; }
      sendJson(req, res, 200, { ok: true });
      return;
    }
    // one report image, from `var/bug-uploads/` (never statically served): Content-Type from the stored sniffed mime.
    if (imageMatch) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const row = community ? community.getUpload(Number(imageMatch[1])) : null;
      const bytes = row ? community.readUpload(row) : null;
      if (!bytes) { sendError(req, res, 404, '图片不存在 · Image not found'); return; }
      res.writeHead(200, { 'Content-Type': row.mime, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
      return;
    }
    // bug report export (server/community.js): the FULL filtered / sorted set as a download — JSON or CSV (UTF-8 BOM).
    // Identity fields only: no accountId, no image bytes, never the account store.
    if (bugExport) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const qs = new URLSearchParams(parts.query);
      const status = qs.get('status');
      const sort = qs.get('sort');
      const list = community ? community.listBugReports({ status, sort, limit: 500 }) : [];
      const csv = qs.get('format') === 'csv';
      const body = Buffer.from(csv ? bugReportsToCsv(list) : JSON.stringify(bugReportsExport(list, { status, sort })), 'utf8');
      res.writeHead(200, {
        'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Content-Disposition': `attachment; filename="bug-reports.${csv ? 'csv' : 'json'}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (parts.rawPath === '/admin/api/state') {
      const qs = new URLSearchParams(parts.query);
      sendJson(req, res, 200, buildSnapshot({ registry, lobby, matchmaker: lobby.mm, auth, community, bugStatus: qs.get('bugStatus'), bugSort: qs.get('bugSort') || 'status', plugins: { registry: packs, policy } }));
      return;
    }
    const body = Buffer.from(ADMIN_HTML);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  /** POST /community/api/bug/upload: an image's raw bytes (magic-byte checked, rate limited, never statically served). */
  async function communityUploadRoute(req, res) {
    if (!community) { sendJson(req, res, 404, { error: 'community disabled' }); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
    const bytes = await readRawBody(req, BUG_IMAGE_MAX_BYTES + 1);
    if (bytes == null) { sendJson(req, res, 413, { error: 'image too large' }); return; }
    const { key, accountId } = communityKey(req);
    const r = community.saveUpload({ key, accountId, bytes });
    if (r.error) { sendJson(req, res, r.error === 'RATE' ? 429 : 400, { error: r.error, maxImages: BUG_IMAGES_MAX }); return; }
    sendJson(req, res, 200, { ok: true, ...r.upload });
  }

  /** Our extra routes (online status, /admin); true when it took the request (or will). */
  function specialRoute(req, res) {
    const parts = splitUrl(req.url || '/');
    if (!parts) return false; // the base handler answers 400
    // Public online status (server/admin.js buildPublicSnapshot): the in-game 在线 overlay polls this. Token-free.
    // `?all=1` lifts the room-list caps for the 公开房间 directory (the lobby slices its own mini rows).
    if (parts.rawPath === '/online/api') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      const all = new URLSearchParams(parts.query).get('all') === '1';
      sendJson(req, res, 200, buildPublicSnapshot({ registry, lobby, matchmaker: lobby.mm, all }));
      return true;
    }
    // Community (server/community.js): the lobby's 更新日志 panel reads the changelog, its bug提交 form uploads
    // images. Token-free reads (the changelog is public), rate-limited uploads; the report itself goes over the
    // WebSocket (`bug.report`), so it carries the session identity.
    if (parts.rawPath === '/community/api/changelog') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      sendJson(req, res, 200, { now: Date.now(), changelog: community ? community.listChangelog() : [] });
      return true;
    }
    if (parts.rawPath === '/community/api/bug/upload') {
      communityUploadRoute(req, res).catch((e) => { log.error('[community] upload failed', e); sendJson(req, res, 500, { error: 'internal error' }); });
      return true;
    }
    if (parts.rawPath === '/admin' || parts.rawPath === '/admin/api/state' || parts.rawPath === '/admin/api/notify'
      || parts.rawPath === '/admin/api/speed' || parts.rawPath === '/admin/api/origins'
      || parts.rawPath === '/admin/api/bug/status' || parts.rawPath === '/admin/api/bug/export' || parts.rawPath.startsWith('/admin/api/bug/image/')) {
      adminRoute(req, res, parts).catch((e) => { log.error('[admin] request failed', e); sendJson(req, res, 500, { error: 'internal error' }); });
      return true;
    }
    return false;
  }

  const server = http.createServer((req, res) => {
    setSecurityHeaders(res);
    if (sitePolicy) res.setHeader('Content-Security-Policy', sitePolicy);
    if (specialRoute(req, res)) return;
    baseHandler(req, res);
  });
  // Disable Nagle for every socket: small frames (WebSocket intents, room/match state) otherwise wait out the
  // Nagle/delayed-ACK window (~40 ms) before they leave, which shows up directly in the lobby's ping. Large asset
  // downloads are unaffected. The app's own frames are tiny and latency-sensitive, so noDelay is a net win.
  server.on('connection', (socket) => { try { socket.setNoDelay(true); } catch { /* ignore */ } });

  server.on('clientError', answerClientError);
  const wss = attachWebSocket(server, { network, log, traffic });

  // The address actually bound. The default may fall back to IPv4; the returned host and url follow that.
  let boundHost;
  try {
    // A host with IPv6 switched off refuses '::'. Fall back to IPv4 rather than not booting. Only the default is
    // retried: an explicit HOST is literal (server/http/config.js bindCandidates).
    let bound = null;
    let lastError = null;
    const candidates = bindCandidates(host);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        await new Promise((resolve, reject) => {
          const onError = (e) => { server.off('listening', onListening); reject(e); };
          const onListening = () => { server.off('error', onError); resolve(); };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port, candidate);
        });
        bound = candidate;
        break;
      } catch (e) {
        lastError = e;
        const retry = ['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL'].includes(e.code) && i < candidates.length - 1;
        if (!retry) break;
        log.warn(`[boot] cannot bind ${candidate} (${e.code}) — falling back to IPv4 only`);
      }
    }
    if (bound === null) throw lastError;
    boundHost = bound;
    // Check the kernel's address too: aliases/DNS and bind fallback cannot weaken the owner gate.
    const actual = server.address();
    const scriptHost = actual && typeof actual === 'object' ? actual.address : '';
    packs.setScriptHost(scriptHost);
    if (typeof lobby.setTestHost === 'function') {
      const testGate = lobby.setTestHost(scriptHost);
      if (testGate.warn) log.warn(`[test-mode] ${testGate.warn}`);
      else if (testGate.enabled) log.info('[test-mode] test rooms enabled');
    }
    if (!trustedHostAllowed(scriptHost, process.env.SP_PLUGIN_SCRIPTS)) {
      lobby.trustedRuntime = null;
      await trustedRuntime?.close();
    }
  } catch (e) {
    network.close(); // stop heartbeat/sweep timers of the half-built server
    assetIndex?.close();
    studio?.close();
    await trustedRuntime?.close();
    throw e;
  }
  server.on('error', (e) => log.error('[http] server error', e));
  assetIndex?.start();

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${displayHost(boundHost)}:${actualPort}`;

  let closing = null;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      try { lobby.shutdown('shutdown'); } catch (e) { log.error('[shutdown] lobby', e); }
      try { hosts.close(); } catch (e) { log.error('[shutdown] match hosts', e); }
      network.close();
      assetIndex?.close();
      studio?.close();
      await trustedRuntime?.close();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
        setTimeout(() => { server.closeAllConnections?.(); }, 500).unref();
      });
      try { wss.close(); } catch { /* ignore */ }
      try { db?.close?.(); } catch (e) { log.error('[shutdown] db', e); }
    })();
    return closing;
  }

  const adminUrl = admin ? `${url}/admin?token=${admin.token}` : null;
  return { port: actualPort, host: boundHost, url, server, wss, lobby, network, registry, packs, content, visual, contents, hosts, db, auth, stats, adminUrl, traffic, assetIndex, views, studio, trustedRuntime, close };
}

// `node server/index.js` / npm start: listen (accounts & 野排 on), print the banner, stop on SIGINT / SIGTERM
// (http/boot.js).
if (isProcessEntry(import.meta.url)) runMain(() => startServer({ accounts: true }));
