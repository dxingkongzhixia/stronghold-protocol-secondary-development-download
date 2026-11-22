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
// routes startServer() serves itself — GET /online/api (public online status) and the token-gated /admin page,
// /admin/docs documentation viewer, /admin/api/state + POST /admin/api/notify (an operator notice pushed to the
// live sessions), and the read-only /admin/api/docs index/file/asset routes.
//
// Per-network limits for internet clients (see net.js clientAddress; local/LAN peers are exempt): open sockets
// (maxConnectionsPerAddr, refused at upgrade with 429), rooms and running matches (lobby.js).
//
// Programmatic use (tests): `const srv = await startServer({ port: 0, quiet: true }); … await srv.close();`
// The server only auto-listens when this file is the process entry point.

import http from 'node:http';
import path from 'node:path';
import { getData, loadData } from './data.js';
import { appendFileSync, createReadStream, existsSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openDb } from './db.mjs';
import { AuthService } from './auth.js';
import { CommunityService, bugReportsExport, bugReportsToCsv, sniffImageType } from './community.js';
import { StatsService } from './stats.js';
import { TrainingStore } from './training/store.js';
import { setTrainingSink } from './training/record.js';
import { configurePrior, priorStatus } from './match/botPrior.js';
import { getBotStrategy, getBotStrategySeats } from './match/botStrategies.js';
import { noteLlmIgnored, releaseIgnoresExternalAi, validateExternalConfig } from './match/llmGate.js';
import { ADMIN_HTML, ADMIN_CSP_HASH, buildPluginStats, buildPublicSnapshot, buildSnapshot, loadAdminToken, tokenMatches, writePluginPolicy } from './admin.js';
import { readUiMode, writeUiMode, uiConfigScript } from './uiMode.js';
import { docIndex, readDoc, readDocAsset } from './docs.js';
import { DOCS_HTML } from './adminDocs.js';
import { createSpeedProbe } from './speed.js';
import { readMirrors, writeMirrors, revertMirrors, backupPath, hasBackup } from './mirrors.js';
import { clientAddress } from './net.js';
import { BUG_IMAGE_MAX_BYTES, BUG_IMAGES_MAX, AVATAR_MAX_BYTES, AVATAR_MIMES, AVATAR_RATE_WINDOW_MS, AVATAR_UPLOAD_LIMIT } from '../shared/constants.js';
import { PLUGIN_MAX_BYTES } from '../shared/plugins/manifest.js';
import { ROOT, listenAddress, bindCandidates, serveDirs, makeLogger, parseTrustProxy, versionsFrom, assetIndexOptionsFrom } from './http/config.js';
import { WS_MAX_PAYLOAD, createSessionStack, attachWebSocket } from './http/websocket.js';
import { DATA_SHIM_JS, createStaticHandler } from './http/static.js';
import { createPluginRegistry } from './plugins/registry.js';
import { installPluginBytes, movePluginAside } from './plugins/install.js';
import { lockPlugins, rollbackPlugin, unlockPlugins, versionLockView } from './plugins/lock.js';
import { computeVanillaContent } from './plugins/identity.js';
import { createVersionSets } from './versions.js';
import { createVisualSets } from './plugins/visualSet.js';
import { createPluginPolicy } from './plugins/policy.js';
import { createPluginMarket } from './market.js';
import { createRoomSets } from './plugins/roomSets.js';
import { loadKeelPluginMap } from './keel/room-source.js';
import { createKeelContentSets } from './keel/content-sets.js';
import { createMatchHosts } from './match/host/index.js';
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
import { createMarketRoute } from './http/routes/market.js';
import { createAdminRoute } from './http/routes/admin.js';
import { createSpecialRoute } from './http/routes/special.js';

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
  // External AI (sp-ai/1, docs/EXTERNAL_AI.md): a release ignores its settings (one log line) and keeps the built-in
  // bot; an unknown strategy id fails here, before data is loaded or the port is opened.
  if (releaseIgnoresExternalAi()) noteLlmIgnored(log);
  try {
    const strategy = getBotStrategy(process.env.SP_BOT_STRATEGY);
    log.info(`[ai] bot strategy ${strategy.id}`);
    if (strategy.id === 'external') validateExternalConfig();
  } catch (cause) {
    throw new Error(`Invalid SP_BOT_STRATEGY: ${cause.message}. Unset SP_BOT_STRATEGY to use the original bot (legacy).`, { cause });
  }
  // per-seat overrides (#816 P1): validated before data is loaded, like the match-wide selection above
  try {
    const seats = getBotStrategySeats(process.env.SP_BOT_STRATEGY_SEATS);
    if (Object.values(seats).some((s) => s.id === 'external')) validateExternalConfig();
  } catch (cause) {
    throw new Error(`Invalid SP_BOT_STRATEGY_SEATS: ${cause.message}. Unset SP_BOT_STRATEGY_SEATS to use SP_BOT_STRATEGY for every seat.`, { cause });
  }
  const { publicDir, dataDir, sharedDir, packsDir, pluginsDir, skinsDir } = serveDirs(opts);
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
  const admin = auth ? {
    token: opts.adminToken || loadAdminToken(ROOT),
    readonlyToken: opts.adminReadonlyToken || process.env.SP_ADMIN_READONLY_TOKEN || '',
    reviewerToken: opts.adminReviewerToken || process.env.SP_ADMIN_REVIEWER_TOKEN || '',
  } : null;
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
  // official versions (shared/versions.js): each enabled one's cs and data directory, served at /data/versions/ and
  // /cs/ (server/versions.js); nothing set enables the default version alone
  const versionCfg = versionsFrom(opts);
  for (const id of versionCfg.unknown) log.warn(`[versions] unknown version ${id}, dropped`);
  const versionSets = createVersionSets({ enabled: versionCfg.enabled, default: versionCfg.default, maxHosts: versionCfg.maxHosts,
    simDir, sharedDir, shim: DATA_SHIM_JS, vanilla: content, log });
  if (versionSets.list.length) {
    log.info(`[versions] enabled: ${versionSets.list.map((s) => `${s.id} (${s.entry.label}, ${s.cs.slice(0, 16)})`).join(', ')}; default ${versionCfg.default}`);
  }
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
  // the server owner's policy (plugins/config.json) and the content sets of the Keel plugins (served at
  // /cs/<cs16>/: a room holds one while it plays it, its data patched by P1b); no match hosts here: the browser simulates
  const policy = createPluginPolicy({ pluginsDir, log });
  // The only plugin loader is Keel: a folder without manifest 3 is reported by the registry and left out.
  const keelPlugins = pluginsDir ? await loadKeelPluginMap(pluginsDir, { host, mode: process.env.SP_PLUGIN_SCRIPTS, log }) : new Map();
  // Built-in plugins have no folder: give them the same Keel descriptor entry the folder scan produces. A folder plugin
  // is already in the map with its own (richer) descriptor and must not be replaced.
  for (const p of packs.plugins()) if (p.keel && !keelPlugins.has(p.id)) {
    keelPlugins.set(p.id, { id: p.id, manifest: p.keel, modules: [], content: p.content, ui: p.ui ?? null, assets: p.keel.modules?.find((m) => m.kind === 'asset')?.assets ?? null });
  }
  if (keelPlugins.size) log.info(`[keel] ${keelPlugins.size} plugin(s) loaded`);
  const roomContents = createKeelContentSets({ plugins: keelPlugins, vanillaData: data, log, maxSets: () => policy.get().maxSets });
  const contents = roomContents;
  const market = createPluginMarket({ root: ROOT, log, registry: packs });
  const roomSets = createRoomSets({ registry: packs, visual, contents: roomContents, policy });
  // gameplay-plugin rooms simulate in a host (server/match/host, DESIGN §32.6): one per content set; a child process
  // by default, a worker thread when SP_MATCH_HOST=worker asks for it. The host count is NOT the content-set limit: a
  // host is a whole node process (≈110–180 MB resident) while a content set is a few MB of data, so `limits.maxSets`
  // (0–128 since 2026-10-26) must not become 128 processes on a 4 GB box. Idle hosts end after 10 min; a set needing a
  // host beyond MAX_HOSTS reports PLUGIN_BUSY instead.
  const transport = String(process.env.SP_MATCH_HOST || '').trim().toLowerCase() === 'worker' ? 'worker' : 'process';
  const MAX_HOSTS = 6;
  const hosts = createMatchHosts({ contents: roomContents, log, options: { transport, maxWorkers: Math.min(MAX_HOSTS, Math.max(1, policy.get().maxSets)), ...(opts.matchHost || {}) } });
  // the match hosts of the other official versions (server/match/host/index.js kind 'version'): one worker per version
  // cs, counted apart from the plugin hosts; none when no non-default version is enabled
  const versionHosts = versionSets.nonDefault.length
    ? createMatchHosts({ contents: versionSets, log, options: { transport, ...(opts.matchHost || {}), kind: 'version', maxWorkers: Math.max(1, versionCfg.maxHosts) } })
    : null;
  const { registry, lobby, network } = createSessionStack({ ...opts, auth, community, stats, keel: keelPlugins }, { data, log, content, plugins: roomSets, hosts, versions: versionSets, versionHosts });
  lobby.network = network; // lets the lobby close a session's socket the net way (account kick, docs/MATCHMAKING.md)
  const serveStatic = createStaticHandler({ publicDir, dataDir, sharedDir, simDir, packsDir, pluginsDir, skinsDir, packs, content, log, assetIndex, views, visual, contents: roomContents, versions: versionSets });
  // the plugin studio (DESIGN §32.9): its page and API for this machine and the local network; it watches plugins/ only
  // once it is used (hot reload), and rooms whose host is the author or alone follow a plugin's changes by themselves
  const studio = opts.studio === false ? null : createStudio({ publicDir, pluginsDir, dataDir, registry: packs, lobby, sessions: registry, log, fetch: opts.fetch });
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
    serveStatic, studio, csp: sitePolicy,
    health: { startedAt, network, registry, lobby, content, visual, traffic, assetIndex, views, versions: versionSets, versionHosts, prior: priorStatus() },
    log, trustProxy,
  });
  function communityKey(req) {
    const tok = req.headers['x-account-token'];
    const acc = auth && typeof tok === 'string' && tok ? auth.resolve(tok) : null;
    if (acc) return { key: `account:${acc.id}`, accountId: acc.id, name: acc.name };
    const { ip, key } = clientAddress(req, trustProxy);
    return { key: `net:${key || ip || 'unknown'}`, accountId: null, name: null };
  }

  /** Send a zip with Content-Length, Range and streaming (used by installed downloads; cached after the first). */
  function sendZip(req, res, got) {
    const total = Number(got.size || (got.bytes && got.bytes.length) || 0);
    if (!total) { sendJson(req, res, 404, { error: 'zip not found' }); return; }
    let start = 0;
    let end = total - 1;
    let status = 200;
    const range = String(req.headers.range || '');
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), total - 1);
      } else {
        const suffix = Number(m[2]);
        start = Math.max(0, total - suffix);
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' });
        res.end();
        return;
      }
      status = 206;
    }
    const headers = {
      'Content-Type': 'application/zip',
      'Content-Length': end - start + 1,
      'Content-Disposition': `attachment; filename="${String(got.filename || 'plugin.zip').replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    if (got.path && !got.bytes) {
      createReadStream(got.path, { start, end }).pipe(res);
      return;
    }
    res.end(Buffer.from(got.bytes).subarray(start, end + 1));
  }

  // Public upload throttle: five accepted zip uploads per network/account in ten minutes. Admin import is separate.
  const marketUploadTimes = new Map();
  function auditAdmin(action, detail) {
    try {
      appendFileSync(path.join(ROOT, 'var', 'admin-audit.log'), `${JSON.stringify({ at: new Date().toISOString(), action, ...detail })}\n`);
    } catch { /* audit is best effort */ }
  }
  function marketUploadAllowed(key) {
    const now = Date.now();
    const recent = (marketUploadTimes.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 5) { marketUploadTimes.set(key, recent); return false; }
    recent.push(now);
    marketUploadTimes.set(key, recent);
    if (marketUploadTimes.size > 500) {
      for (const [k, times] of marketUploadTimes) if (!times.some((t) => now - t < 10 * 60 * 1000)) marketUploadTimes.delete(k);
    }
    return true;
  }

  /** Public plugin marketplace: list/download active entries, raw-zip upload, admin review under /admin/api/market. */
  const marketRoute = createMarketRoute({ PLUGIN_MAX_BYTES, communityKey, market, marketUploadAllowed, readRawBody, sendJson, sendZip });

  /**
   * Token-gated operations routes (server/admin.js). notify pushes an operator notice to the live sessions
   * (lobby.broadcastNotice). Security headers are already set by the caller.
   */
  const adminRoute = createAdminRoute({ ADMIN_CSP_HASH, ADMIN_HTML, DOCS_HTML, PLUGIN_MAX_BYTES, ROOT, admin, auditAdmin, auth, backupPath, bugReportsExport, bugReportsToCsv, buildPluginStats, buildSnapshot, community, contents, cookieValue, docIndex, existsSync, hasBackup, installPluginBytes, lobby, lockPlugins, log, market, movePluginAside, packs, path, pluginsDir, policy, publicDir, readDoc, readDocAsset, readFileSync, readJsonBody, readMirrors, readRawBody, readUiMode, registry, revertMirrors, rollbackPlugin, sendError, sendJson, sitePolicy, speedProbe, tokenMatches, unlockPlugins, versionLockView, writeMirrors, writePluginPolicy, writeUiMode });

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

  // Account profile images (schema v6, owner 2026-10-24): an authenticated raster upload, content-addressed under
  // var/avatars and served publicly at /avatar/<file>. The account's `avatar` column names that file; the session /
  // seat picks it up through lobby.applyProfile and every client redraws.
  const avatarUploadTimes = new Map();
  function avatarUploadAllowed(accountId) {
    const now = Date.now();
    const recent = (avatarUploadTimes.get(accountId) || []).filter((t) => now - t < AVATAR_RATE_WINDOW_MS);
    if (recent.length >= AVATAR_UPLOAD_LIMIT) { avatarUploadTimes.set(accountId, recent); return false; }
    recent.push(now);
    avatarUploadTimes.set(accountId, recent);
    if (avatarUploadTimes.size > 1000) {
      for (const [id, times] of avatarUploadTimes) if (!times.some((t) => now - t < AVATAR_RATE_WINDOW_MS)) avatarUploadTimes.delete(id);
    }
    return true;
  }
  const AVATAR_FILE = /^[0-9a-f]{32}\.(png|jpg|webp)$/;
  const AVATAR_MIME = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' });

  async function avatarRoute(req, res) {
    if (!auth) { sendJson(req, res, 404, { error: 'accounts disabled' }); return; }
    const tok = req.headers['x-account-token'];
    const acc = typeof tok === 'string' && tok ? auth.resolve(tok) : null;
    if (!acc) { sendJson(req, res, 401, { error: 'AUTH_REQUIRED' }); return; }
    if (req.method === 'POST') {
      if (!avatarUploadAllowed(acc.id)) { sendJson(req, res, 429, { error: 'RATE' }); return; }
      const bytes = await readRawBody(req, AVATAR_MAX_BYTES + 1);
      if (bytes == null) { sendJson(req, res, 413, { error: 'image too large' }); return; }
      const mime = sniffImageType(bytes);
      if (!bytes.length || !mime || !AVATAR_MIMES.includes(mime)) { sendJson(req, res, 400, { error: 'BAD_IMAGE' }); return; }
      const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
      const file = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
      const dir = path.join(ROOT, 'var', 'avatars');
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, file), bytes);
      } catch (e) {
        log.error('[avatar] write failed', e);
        sendJson(req, res, 500, { error: 'internal error' });
        return;
      }
      const account = auth.setAvatar(acc.id, file);
      lobby?.applyProfile?.(acc.id, { avatar: file });
      sendJson(req, res, 200, { ok: true, avatar: file, url: `/avatar/${file}`, account });
      return;
    }
    if (req.method === 'DELETE') {
      const account = auth.setAvatar(acc.id, null);
      lobby?.applyProfile?.(acc.id, { avatar: null });
      sendJson(req, res, 200, { ok: true, avatar: null, account });
      return;
    }
    res.setHeader('Allow', 'POST, DELETE');
    sendJson(req, res, 405, { error: 'POST or DELETE required' });
  }

  /** GET/HEAD /avatar/<32 hex>.<png|jpg|webp>: a public avatar file, immutable because its name is its hash. */
  function serveAvatar(req, res, rawPath) {
    const file = rawPath.slice('/avatar/'.length);
    if (!AVATAR_FILE.test(file)) { sendJson(req, res, 404, { error: 'not found' }); return; }
    let st;
    try { st = statSync(path.join(ROOT, 'var', 'avatars', file)); } catch { sendJson(req, res, 404, { error: 'not found' }); return; }
    if (!st.isFile()) { sendJson(req, res, 404, { error: 'not found' }); return; }
    const ext = file.slice(file.lastIndexOf('.') + 1);
    res.writeHead(200, {
      'Content-Type': AVATAR_MIME[ext], 'Content-Length': st.size,
      'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${file}"`,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(path.join(ROOT, 'var', 'avatars', file)).pipe(res);
  }

  // 主界面音乐 pack (owner 2026-10-25): the optional full catalogue (218 tracks, ~580 MB) lives OUTSIDE the repository
  // in var/music (git-ignored; tools/local-extract/music.py, docs/ASSETS.md "Music pack"). /music/index.json tells the
  // picker which tracks exist; /music/<id>_{intro,loop}.mp3 serves them. A missing pack is normal: an empty index and
  // the committed 24 in data/assets.json remain the picker's catalogue.
  // Catalogue ids are lower-case except two furniture themes (music_furniture_audioPlayer / musicBox).
  const MUSIC_FILE = /^music_[A-Za-z0-9_]+_(intro|loop)\.mp3$/;
  function serveMusic(req, res, rawPath) {
    const name = rawPath.slice('/music/'.length);
    if (name === 'index.json') {
      const file = path.join(ROOT, 'var', 'music', 'index.json');
      let st;
      try { st = statSync(file); } catch { sendJson(req, res, 200, { version: 1, entries: {} }); return; }
      if (!st.isFile()) { sendJson(req, res, 200, { version: 1, entries: {} }); return; }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8', 'Content-Length': st.size, 'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(file).pipe(res);
      return;
    }
    if (!MUSIC_FILE.test(name)) { sendJson(req, res, 404, { error: 'not found' }); return; }
    const file = path.join(ROOT, 'var', 'music', name);
    let st;
    try { st = statSync(file); } catch { sendJson(req, res, 404, { error: 'not found' }); return; }
    if (!st.isFile()) { sendJson(req, res, 404, { error: 'not found' }); return; }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg', 'Content-Length': st.size,
      'Cache-Control': 'public, max-age=86400',
      ETag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  }

  /** Our extra routes (online status, /admin); true when it took the request (or will). */
  const specialRoute = createSpecialRoute({ ROOT, adminRoute, avatarRoute, buildPublicSnapshot, community, communityUploadRoute, lobby, log, marketRoute, readUiMode, registry, sendJson, serveAvatar, serveMusic, splitUrl, uiConfigScript });

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
  } catch (e) {
    network.close(); // stop heartbeat/sweep timers of the half-built server
    assetIndex?.close();
    studio?.close();
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
  try { versionHosts?.close(); } catch (e) { log.error('[shutdown] version hosts', e); }
      network.close();
      assetIndex?.close();
      studio?.close();
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
  return { port: actualPort, host: boundHost, url, server, wss, lobby, network, registry, packs, content, visual, contents, hosts, versions: versionSets, versionHosts, db, auth, stats, adminUrl, traffic, assetIndex, views, studio, close };
}

// `node server/index.js` / npm start: listen (accounts & 野排 on), print the banner, stop on SIGINT / SIGTERM
// (http/boot.js).
if (isProcessEntry(import.meta.url)) runMain(() => startServer({ accounts: true }));
