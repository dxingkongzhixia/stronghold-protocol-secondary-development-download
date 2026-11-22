// server/http/routes/special.js — the small special routes (avatars, music, community upload, market/admin
// dispatch), moved verbatim out of startServer. The factory receives the context it closed over.

export function createSpecialRoute(ctx) {
  const { ROOT, adminRoute, avatarRoute, buildPublicSnapshot, community, communityUploadRoute, lobby, log, marketRoute, readUiMode, registry, sendJson, serveAvatar, serveMusic, splitUrl, uiConfigScript } = ctx;
  return function specialRoute(req, res) {
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
    // Main-interface switch (server/uiMode.js): a tiny no-store script loaded before main.js. The admin page writes
    // var/ui.json; no restart is needed, only the next page load.
    if (parts.rawPath === '/ui-config.js') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); sendJson(req, res, 405, { error: 'GET required' }); return true; }
      const body = Buffer.from(uiConfigScript(readUiMode(ROOT)));
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return true;
    }
    if (parts.rawPath === '/community/api/changelog') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      sendJson(req, res, 200, { now: Date.now(), changelog: community ? community.listChangelog() : [] });
      return true;
    }
    if (parts.rawPath === '/community/api/bug/upload') {
      communityUploadRoute(req, res).catch((e) => { log.error('[community] upload failed', e); sendJson(req, res, 500, { error: 'internal error' }); });
      return true;
    }
    // account profile images (schema v6): upload / clear with the account token, public immutable read
    if (parts.rawPath === '/api/account/avatar') {
      avatarRoute(req, res).catch((e) => { log.error('[avatar] request failed', e); sendJson(req, res, 500, { error: 'internal error' }); });
      return true;
    }
    if (parts.rawPath.startsWith('/avatar/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(req, res, 405, { error: 'GET required' }); return true; }
      serveAvatar(req, res, parts.rawPath);
      return true;
    }
    // optional 主界面音乐 pack (var/music, never committed; docs/ASSETS.md "Music pack")
    if (parts.rawPath === '/music/index.json' || parts.rawPath.startsWith('/music/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(req, res, 405, { error: 'GET required' }); return true; }
      serveMusic(req, res, parts.rawPath);
      return true;
    }
    if (parts.rawPath === '/market/api/list' || parts.rawPath === '/market/api/upload' || parts.rawPath.startsWith('/market/api/download/') || parts.rawPath.startsWith('/market/api/installed/')) {
      marketRoute(req, res, parts).catch((e) => { log.error('[market] request failed', e); sendJson(req, res, 500, { error: 'internal error' }); });
      return true;
    }
    if (parts.rawPath === '/admin' || parts.rawPath === '/admin/api/state' || parts.rawPath === '/admin/api/notify'
      || parts.rawPath === '/admin/api/speed' || parts.rawPath === '/admin/api/origins' || parts.rawPath === '/admin/api/plugin-policy'
      || parts.rawPath === '/admin/api/market' || parts.rawPath === '/admin/api/market/import' || parts.rawPath === '/admin/api/market/keys' || parts.rawPath === '/admin/api/audit' || parts.rawPath === '/admin/api/plugins/install' || parts.rawPath === '/admin/api/plugins/uninstall' || parts.rawPath === '/admin/api/plugins/stats' || parts.rawPath === '/admin/api/plugins/lock' || parts.rawPath === '/admin/api/plugins/ai' || parts.rawPath === '/admin/api/ui'
      || parts.rawPath === '/admin/api/bug/status' || parts.rawPath === '/admin/api/bug/export' || parts.rawPath.startsWith('/admin/api/bug/image/')
      || parts.rawPath === '/admin/docs' || parts.rawPath === '/admin/docs/'
      || parts.rawPath === '/admin/sandbox' || parts.rawPath === '/admin/sandbox/'
      || parts.rawPath === '/admin/api/docs' || parts.rawPath === '/admin/api/docs/file' || parts.rawPath === '/admin/api/docs/asset') {
      adminRoute(req, res, parts).catch((e) => { log.error('[admin] request failed', e); sendJson(req, res, 500, { error: 'internal error' }); });
      return true;
    }
    return false;
  };
}
