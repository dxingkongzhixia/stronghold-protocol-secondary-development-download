// server/http/routes/admin.js — the token-gated /admin/* and /admin/api/* routes (admin page, market, plugins,
// docs, audit, bugs, UI mode), moved verbatim out of startServer. The factory receives the context it closed over.
//
// i18n-ignore-file: the /admin route's messages are developer-facing and bilingual (code + English), like the server's own.

export function createAdminRoute(ctx) {
  const { ADMIN_CSP_HASH, ADMIN_HTML, DOCS_HTML, PLUGIN_MAX_BYTES, ROOT, admin, auditAdmin, auth, backupPath, bugReportsExport, bugReportsToCsv, buildPluginStats, buildSnapshot, community, contents, cookieValue, docIndex, existsSync, hasBackup, installPluginBytes, lobby, lockPlugins, log, market, movePluginAside, packs, path, pluginsDir, policy, publicDir, readDoc, readDocAsset, readFileSync, readJsonBody, readMirrors, readRawBody, readUiMode, registry, revertMirrors, rollbackPlugin, sendError, sendJson, sitePolicy, speedProbe, tokenMatches, unlockPlugins, versionLockView, writeMirrors, writePluginPolicy, writeUiMode } = ctx;
  return async function adminRoute(req, res, parts) {
  async function handleAdmin(req, res, _parts) {
    if (!admin) { sendError(req, res, 404, '管理页未启用 · Admin disabled'); return; }
  }

  async function handleAdminRole(req, res, _parts) {
      sendError(req, res, 403, '需要管理令牌 · Admin token required', '令牌见 var/admin-token.txt（或启动日志的 Admin 链接）');
  }

  async function handleAdminRoleX(req, res, _parts) {
      sendJson(req, res, 403, { error: 'read-only admin token' });
  }

  async function handleMarketAdmin(req, res, _parts) {
      sendJson(req, res, 403, { error: 'reviewer token can only write marketplace review endpoints' });
  }

  async function handleUiApi(req, res, _parts) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        sendJson(req, res, 200, { ok: true, main: readUiMode(ROOT) });
        return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); sendJson(req, res, 405, { error: 'GET or POST required' }); return; }
      const body = await readJsonBody(req);
      const saved = writeUiMode(ROOT, body?.main);
      if (!saved) { sendJson(req, res, 400, { error: 'main must be "hub" or "classic"' }); return; }
      log.info(`[ui] main interface set to ${saved}`);
      sendJson(req, res, 200, { ok: true, main: saved });
  }

  async function handleDocsPage(req, res, _parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const body = Buffer.from(DOCS_HTML);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handleRawPath(req, res, parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const qs = new URLSearchParams(parts.query);
      const unit = /^[A-Za-z0-9_]+$/.test(qs.get('unit') || '') ? qs.get('unit') : 'char_4247_oxi';
      const skill = Math.max(0, Math.min(2, Number(qs.get('s') ?? 2) || 0));
      const stage = /^[A-Za-z0-9_]+$/.test(qs.get('stage') || '') ? qs.get('stage') : 'act1autochess_m01';
      const wave = /^[A-Za-z0-9_]+$/.test(qs.get('wave') || '') ? qs.get('wave') : 'act1autochess_05';
      if (!existsSync(path.join(ROOT, 'public', 'dev', 'sandbox.html'))) {
        sendError(req, res, 404, '沙盒未安装 · sandbox not installed', 'public/dev/sandbox.html 缺失（部署时未带 public/dev）');
        return;
      }
      res.writeHead(302, { Location: `/dev/sandbox.html?unit=${unit}&s=${skill}&stage=${stage}&wave=${wave}` });
      res.end();
  }

  async function handleDocsIndex(req, res, _parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      sendJson(req, res, 200, { ok: true, ...docIndex(ROOT) });
  }

  async function handleDocsFile(req, res, parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const rel = new URLSearchParams(parts.query).get('path') || '';
      const doc = readDoc(ROOT, rel);
      if (!doc) { sendJson(req, res, 404, { error: 'document not found' }); return; }
      sendJson(req, res, 200, { ok: true, ...doc });
  }

  async function handleDocsAsset(req, res, parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const rel = new URLSearchParams(parts.query).get('path') || '';
      const asset = readDocAsset(ROOT, rel);
      if (!asset) { sendJson(req, res, 404, { error: 'asset not found' }); return; }
      res.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.bytes.length, 'Cache-Control': 'private, max-age=300' });
      res.end(req.method === 'HEAD' ? undefined : asset.bytes);
  }

  async function handleSpeed(req, res, parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const force = new URLSearchParams(parts.query).get('force') === '1';
      const r = await speedProbe.run({ force });
      sendJson(req, res, 200, { ok: true, ...r });
  }

  async function handleOrigins(req, res, _parts) {
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
  }

  async function handleNotify(req, res, _parts) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') { sendJson(req, res, 400, { error: '请求体需要是 JSON' }); return; }
      const r = lobby.broadcastNotice({ text: body.text, sign: body.sign, scope: body.scope, changelog: body.changelog === true });
      if (r.error) { sendJson(req, res, 400, { error: '通知内容为空或过长' }); return; }
      // Only a changelog notice is also logged as the running 更新日志's next minor version (server/community.js
      // recordNotice); a plain notice returns `changelog: null` and the push stands either way.
      sendJson(req, res, 200, { ok: true, sent: r.sent, notice: r.notice, changelog: r.changelog || null });
  }

  async function handlePluginPolicy(req, res, _parts) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) { sendJson(req, res, 400, { error: '请求体需要是 JSON 对象' }); return; }
      const r = writePluginPolicy({ pluginsDir, body });
      if (r.error) { sendJson(req, res, 400, { error: r.error }); return; }
      sendJson(req, res, 200, { ok: true, policy: r.policy });
  }

  async function handleMarketImport(req, res, parts) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const kind = new URLSearchParams(parts.query).get('kind') || 'ordinary';
      const bytes = await readRawBody(req, PLUGIN_MAX_BYTES + 1);
      if (bytes == null) { sendJson(req, res, 413, { error: 'zip is over the plugin size limit' }); return; }
      const signature = req.headers['x-plugin-key-id'] && req.headers['x-plugin-signature']
        ? { keyId: String(req.headers['x-plugin-key-id']).slice(0, 80), value: String(req.headers['x-plugin-signature']) }
        : null;
      try {
        const r = await market.upload({
          kind, bytes, filename: String(req.headers['x-plugin-filename'] || '').slice(0, 120), uploadedBy: 'admin', signature,
        });
        sendJson(req, res, 201, { ok: true, plugin: r });
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300) });
      }
  }

  async function handleAuditLog(req, res, _parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      let entries = [];
      try {
        entries = readFileSync(path.join(ROOT, 'var', 'admin-audit.log'), 'utf8').trim().split('\n').filter(Boolean).slice(-300)
          .map((line) => { try { return JSON.parse(line); } catch { return { at: null, action: 'unreadable', detail: line.slice(0, 300) }; } });
      } catch { /* no audit yet */ }
      sendJson(req, res, 200, { entries: entries.reverse() });
  }

  async function handlePluginInstall(req, res, _parts) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      if (!pluginsDir) { sendJson(req, res, 404, { error: 'plugins are disabled' }); return; }
      const bytes = await readRawBody(req, PLUGIN_MAX_BYTES + 1);
      if (bytes == null) { sendJson(req, res, 413, { error: 'zip is over the plugin size limit' }); return; }
      try {
        const r = installPluginBytes(bytes, { pluginsDir, force: true });
        packs.refresh(true);
        auditAdmin('plugin-install', { id: r.id, version: r.version || null });
        sendJson(req, res, 200, { ok: true, installed: r });
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300), code: e?.code || null });
      }
  }

  async function handlePluginUninstall(req, res, _parts) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      if (!pluginsDir) { sendJson(req, res, 404, { error: 'plugins are disabled' }); return; }
      const body = await readJsonBody(req);
      const id = String(body?.id || '');
      try {
        const moved = movePluginAside(pluginsDir, id, '_removed');
        packs.refresh(true);
        auditAdmin('plugin-uninstall', { id, moved });
        sendJson(req, res, 200, { ok: true, id, moved });
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300), code: e?.code || null });
      }
  }

  async function handlePluginLock(req, res, _parts) {
      if (!pluginsDir) { sendJson(req, res, 404, { error: 'plugins are disabled' }); return; }
      if (req.method === 'GET' || req.method === 'HEAD') {
        sendJson(req, res, 200, versionLockView(pluginsDir, packs.plugins()));
        return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); sendJson(req, res, 405, { error: 'GET or POST required' }); return; }
      const body = await readJsonBody(req);
      try {
        const action = String(body?.action || '');
        if (action === 'lock') {
          const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : null;
          const r = lockPlugins(pluginsDir, packs.plugins(), { ids });
          auditAdmin('plugin-lock', { ids: r.results.map((x) => x.id), errors: r.results.filter((x) => x.error).length });
          sendJson(req, res, 200, { ok: true, ...r });
          return;
        }
        if (action === 'unlock') {
          const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
          const r = unlockPlugins(pluginsDir, ids);
          auditAdmin('plugin-unlock', { ids: r.removed });
          sendJson(req, res, 200, { ok: true, ...r });
          return;
        }
        if (action === 'rollback') {
          const r = rollbackPlugin(pluginsDir, String(body.id || ''));
          packs.refresh(true);
          auditAdmin('plugin-rollback', { id: r.id, version: r.version, file: r.file, replaced: r.replaced });
          sendJson(req, res, 200, { ok: true, ...r });
          return;
        }
        sendJson(req, res, 400, { error: 'action must be lock, unlock or rollback' });
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300), code: e?.code || null });
      }
  }

  async function handleMarketKeys(req, res, _parts) {
      if (req.method === 'GET' || req.method === 'HEAD') { sendJson(req, res, 200, market.publicKeys()); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); sendJson(req, res, 405, { error: 'GET or POST required' }); return; }
      const body = await readJsonBody(req);
      try {
        const action = String(body?.action || '');
        if (action === 'add') sendJson(req, res, 200, { ok: true, ...market.addSigningKey({ id: body.id, publicKey: body.publicKey, label: body.label }) });
        else if (action === 'revoke') sendJson(req, res, 200, { ok: true, ...market.revokeSigningKey(String(body.id || ''), body.revoked !== false) });
        else if (action === 'policy') sendJson(req, res, 200, { ok: true, ...market.setSignaturePolicy(Array.isArray(body.requireSigned) ? body.requireSigned : []) });
        else sendJson(req, res, 400, { error: 'action must be add, revoke or policy' });
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300) });
      }
  }

  async function handleMarketAdminX(req, res, parts) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const qs = new URLSearchParams(parts.query);
        const q = qs.get('q') || '';
        const kind = qs.get('kind') || '';
        const cls = qs.get('class') || '';
        const page = Number(qs.get('page') || 1);
        const limit = Number(qs.get('limit') || 20);
        const paged = q || kind || cls || page > 1 || qs.has('limit')
          ? market.listPage({ admin: true, q, kind, cls, page, limit })
          : null;
        sendJson(req, res, 200, {
          plugins: paged ? paged.items : market.list({ admin: true }),
          pagination: paged ? { total: paged.total, page: paged.page, pages: paged.pages, limit: paged.limit } : null,
        });
        return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); sendJson(req, res, 405, { error: 'GET or POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) { sendJson(req, res, 400, { error: '请求体需要是 JSON 对象' }); return; }
      try {
        const action = String(body.action || '');
        const kind = String(body.kind || '');
        const id = String(body.id || '');
        if (action === 'edit') {
          const r = market.edit(kind, id, body.fields && typeof body.fields === 'object' ? body.fields : {}, { reviewer: 'admin' });
          sendJson(req, res, 200, { ok: true, action, entry: r });
          return;
        }
        if (action === 'edit-installed') {
          const r = market.editInstalled(id, body.fields && typeof body.fields === 'object' ? body.fields : {}, { reviewer: 'admin' });
          sendJson(req, res, 200, { ok: true, action, entry: r });
          return;
        }
        if (action === 'publish') {
          const r = await market.publishInstalled(id, { reviewer: 'admin' });
          sendJson(req, res, 200, { ok: true, action, entry: r });
          return;
        }
        if (action === 'move') {
          const r = market.move(kind, id, String(body.direction || ''));
          sendJson(req, res, 200, r);
          return;
        }
        if (action === 'reorder') {
          const r = market.reorder(kind, Array.isArray(body.ids) ? body.ids : []);
          sendJson(req, res, 200, { ok: true, plugins: r });
          return;
        }
        if (action === 'rollback') {
          const r = await market.rollback(kind, id, String(body.version || ''), { reviewer: 'admin' });
          sendJson(req, res, 200, r);
          return;
        }
        if (action === 'gc') {
          sendJson(req, res, 200, market.gc());
          return;
        }
        const r = await market.review(kind, id, action, { reviewer: 'admin', note: body.note });
        sendJson(req, res, 200, r);
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300) });
      }
  }

  async function handlePluginStats(req, res, _parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      sendJson(req, res, 200, buildPluginStats({ registry: packs, policy, contents, market, lobby }));
  }

  async function handleRawPathX(req, res, _parts) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        sendJson(req, res, 200, {
          ok: true, reserved: true, version: 1, auth: 'admin-token', executor: false,
          actions: ['preview', 'edit', 'publish', 'test', 'approve', 'reject'],
          note: 'Reserved for an owner-approved AI plugin manager; preview is read-only, no executor is enabled in this build.',
        });
        return;
      }
      const body = await readJsonBody(req);
      if (body && body.dryRun === true && body.action === 'edit') {
        const kind = String(body.kind || '');
        const id = String(body.id || '');
        const before = market.list({ admin: true }).find((x) => x.kind === kind && x.id === id);
        if (!before) { sendJson(req, res, 404, { error: 'plugin not found' }); return; }
        sendJson(req, res, 200, {
          ok: true, dryRun: true, before: before,
          proposal: body.fields && typeof body.fields === 'object' ? body.fields : {},
          note: 'Preview only: no validation or write was performed. Owner approval is required.',
        });
        return;
      }
      sendJson(req, res, 501, { ok: false, error: 'AI plugin takeover is reserved but no executor is configured' });
  }

  async function handleBugStatus(req, res, _parts) {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object') { sendJson(req, res, 400, { error: '请求体需要是 JSON' }); return; }
      const r = community ? community.setBugStatus(Number(body.id), String(body.status)) : { error: 'disabled' };
      if (r.error) { sendJson(req, res, 400, { error: '无效的报告或状态' }); return; }
      sendJson(req, res, 200, { ok: true });
  }

  async function handleImageMatch(req, res, _parts) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const row = community ? community.getUpload(Number(imageMatch[1])) : null;
      const bytes = row ? community.readUpload(row) : null;
      if (!bytes) { sendError(req, res, 404, '图片不存在 · Image not found'); return; }
      res.writeHead(200, { 'Content-Type': row.mime, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
  }

  async function handleBugExport(req, res, parts) {
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
  }

  async function handleRawPathXX(req, res, parts) {
      const qs = new URLSearchParams(parts.query);
      sendJson(req, res, 200, buildSnapshot({ registry, lobby, matchmaker: lobby.mm, auth, community, bugStatus: qs.get('bugStatus'), bugSort: qs.get('bugSort') || 'status', plugins: { registry: packs, policy, contents, market } }));
  }

    const notify = parts.rawPath === '/admin/api/notify';
    const bugStatus = parts.rawPath === '/admin/api/bug/status';
    const bugExport = parts.rawPath === '/admin/api/bug/export';
    const speed = parts.rawPath === '/admin/api/speed';
    const origins = parts.rawPath === '/admin/api/origins';
    const pluginPolicy = parts.rawPath === '/admin/api/plugin-policy';
    const marketAdmin = parts.rawPath === '/admin/api/market';
    const marketImport = parts.rawPath === '/admin/api/market/import';
    const marketKeys = parts.rawPath === '/admin/api/market/keys';
    const pluginInstall = parts.rawPath === '/admin/api/plugins/install';
    const pluginUninstall = parts.rawPath === '/admin/api/plugins/uninstall';
    const pluginStats = parts.rawPath === '/admin/api/plugins/stats';
    const pluginLock = parts.rawPath === '/admin/api/plugins/lock';
    const auditLog = parts.rawPath === '/admin/api/audit';
    const docsPage = parts.rawPath === '/admin/docs' || parts.rawPath === '/admin/docs/';
    const docsIndex = parts.rawPath === '/admin/api/docs';
    const docsFile = parts.rawPath === '/admin/api/docs/file';
    const docsAsset = parts.rawPath === '/admin/api/docs/asset';
    const uiApi = parts.rawPath === '/admin/api/ui';
    const imageMatch = /^\/admin\/api\/bug\/image\/(\d+)$/.exec(parts.rawPath);
    if (!admin) return handleAdmin(req, res, parts);
    const queryToken = new URLSearchParams(parts.query).get('token');
    const provided = queryToken || req.headers['x-admin-token'] || cookieValue(req.headers.cookie, 'sp_admin') || '';
    const adminRole = tokenMatches(provided, admin.token) ? 'owner'
      : tokenMatches(provided, admin.reviewerToken) ? 'reviewer'
        : tokenMatches(provided, admin.readonlyToken) ? 'readonly' : null;
    if (!adminRole) return handleAdminRole(req, res, parts);
    const adminWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (adminWrite && adminRole === 'readonly') return handleAdminRoleX(req, res, parts);
    if (adminWrite && adminRole === 'reviewer' && !marketAdmin) return handleMarketAdmin(req, res, parts);
    // Remember a valid ?token= in a cookie for 30 days, so plain /admin links (the lobby's 在线 badge) work.
    if (queryToken) res.setHeader('Set-Cookie', `sp_admin=${encodeURIComponent(admin.token)}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=2592000`);
    // 主界面开关 (server/uiMode.js): GET returns the effective mode, POST { main: 'hub'|'classic' } saves it.
    if (uiApi) return handleUiApi(req, res, parts);
    // Read-only documentation chain for the admin page (server/docs.js): only docs/, root README/AGENTS/
    // CHANGELOG/CONTRIBUTING/NOTICE and plugins/{README,AGENTS}.md; paths are re-resolved and checked.
    if (docsPage) return handleDocsPage(req, res, parts);
    // /admin/sandbox — an admin-only shortcut into the dev sandbox: a real battle (the client's own /sim) with one
    // operator and one skill, drawn by the battlefield renderer — default 塔露拉 S3 (char_4247_oxi, skill index 2), so the
    // fix's cast, its waves and their damage are visible without a live room. `?unit=` / `?s=` / `?stage=` / `?wave=`.
    // The page itself lives under /dev (deploy public/dev with it).
    if (parts.rawPath === '/admin/sandbox' || parts.rawPath === '/admin/sandbox/') return handleRawPath(req, res, parts);
    if (docsIndex) return handleDocsIndex(req, res, parts);
    if (docsFile) return handleDocsFile(req, res, parts);
    if (docsAsset) return handleDocsAsset(req, res, parts);
    // 测速 (server/speed.js, docs/MATCHMAKING.md §12.2): time every configured art origin (the relay + the GitHub
    // mirrors) and report which one a client would install right now. GET only; the probe's own cooldown keeps a
    // refresh-happy operator from hammering the free mirrors (?force=1 skips it, used by the button).
    if (speed) return handleSpeed(req, res, parts);
    // 来源配置 (server/mirrors.js, docs/MATCHMAKING.md §12.3): read / write public/asset-mirrors.json — the ONE place
    // the art origins are written down. Every URL is validated and the previous file is kept as a backup, so an edit is
    // reversible; a save is live on the next request (the asset index keys its cache on this file's mtime) — no restart.
    if (origins) return handleOrigins(req, res, parts);
    if (notify) return handleNotify(req, res, parts);
    // owner plugin policy (Phase 2): the safe fields of plugins/config.json, never plugin files, pins or code.
    if (pluginPolicy) return handlePluginPolicy(req, res, parts);
    if (marketImport) return handleMarketImport(req, res, parts);
    if (auditLog) return handleAuditLog(req, res, parts);
    if (pluginInstall) return handlePluginInstall(req, res, parts);
    if (pluginUninstall) return handlePluginUninstall(req, res, parts);
    if (pluginLock) return handlePluginLock(req, res, parts);
    if (marketKeys) return handleMarketKeys(req, res, parts);
    if (marketAdmin) return handleMarketAdminX(req, res, parts);
    // Read-only runtime metrics for external monitoring / the admin 运行指标 view (no writes, no plugin files).
    if (pluginStats) return handlePluginStats(req, res, parts);
    // Reserved AI takeover surface: the same admin-token boundary, a stable capability document today, and a 501
    // executor until an operator explicitly configures one. Kept separate so a future agent can be added without
    // changing the human admin API.
    if (parts.rawPath === '/admin/api/plugins/ai') return handleRawPathX(req, res, parts);
    // bug report status (server/community.js): POST { id, status } marks a report 待处理 / 已受理 / 已修复.
    if (bugStatus) return handleBugStatus(req, res, parts);
    // one report image, from `var/bug-uploads/` (never statically served): Content-Type from the stored sniffed mime.
    if (imageMatch) return handleImageMatch(req, res, parts);
    // bug report export (server/community.js): the FULL filtered / sorted set as a download — JSON or CSV (UTF-8 BOM).
    // Identity fields only: no accountId, no image bytes, never the account store.
    if (bugExport) return handleBugExport(req, res, parts);
    if (parts.rawPath === '/admin/api/state') return handleRawPathXX(req, res, parts);
    const body = Buffer.from(ADMIN_HTML);
    if (sitePolicy && ADMIN_CSP_HASH) {
      // the page's own inline script: the site policy hashes import maps only (server/http/csp.js)
      res.setHeader('Content-Security-Policy', sitePolicy.replace(/script-src ([^;]*)/,
        (m, v) => `script-src ${v} 'sha256-${ADMIN_CSP_HASH}'`));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
