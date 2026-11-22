// server/http/routes/market.js — the /market/* routes (plugin upload / listing), moved verbatim out of
// startServer so the server file stays assembly. The factory receives the server context it closed over.

export function createMarketRoute(ctx) {
  const { PLUGIN_MAX_BYTES, communityKey, market, marketUploadAllowed, readRawBody, sendJson, sendZip } = ctx;
  return async function marketRoute(req, res, parts) {
    if (parts.rawPath === '/market/api/list') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      const qs = new URLSearchParams(parts.query);
      const q = qs.get('q') || '';
      const kind = qs.get('kind') || '';
      const cls = qs.get('class') || '';
      const page = Number(qs.get('page') || 1);
      const limit = Number(qs.get('limit') || 20);
      const paged = q || kind || cls || page > 1 || qs.has('limit')
        ? market.listPage({ q, kind, cls, page, limit })
        : null;
      sendJson(req, res, 200, {
        now: Date.now(),
        plugins: paged ? paged.items : market.list({ status: 'active' }),
        installed: market.installed(),
        pagination: paged ? { total: paged.total, page: paged.page, pages: paged.pages, limit: paged.limit, counts: paged.counts } : null,
      });
      return;
    }
    const installedDl = /^\/market\/api\/installed\/([^/]+)\/download$/.exec(parts.rawPath);
    if (installedDl) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      let id; try { id = decodeURIComponent(installedDl[1]); } catch { sendJson(req, res, 400, { error: 'bad id' }); return; }
      const got = market.downloadInstalled(id);
      if (!got) { sendJson(req, res, 404, { error: 'installed plugin not found' }); return; }
      sendZip(req, res, got);
      return;
    }
    const dl = /^\/market\/api\/download\/(ordinary|forge)\/([^/]+)$/.exec(parts.rawPath);
    if (dl) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); sendJson(req, res, 405, { error: 'GET required' }); return; }
      let id; try { id = decodeURIComponent(dl[2]); } catch { sendJson(req, res, 400, { error: 'bad id' }); return; }
      const got = market.download(dl[1], id);
      if (!got) { sendJson(req, res, 404, { error: 'plugin not found or not active' }); return; }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': got.bytes.length,
        'Content-Disposition': `attachment; filename="${got.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : got.bytes);
      return;
    }
    if (parts.rawPath === '/market/api/upload') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { error: 'POST required' }); return; }
      const who = communityKey(req);
      if (!marketUploadAllowed(who.key)) { sendJson(req, res, 429, { error: 'too many uploads; try again later' }); return; }
      const kind = new URLSearchParams(parts.query).get('kind');
      const bytes = await readRawBody(req, PLUGIN_MAX_BYTES + 1);
      if (bytes == null) { sendJson(req, res, 413, { error: 'zip is over the plugin size limit' }); return; }
      const signature = req.headers['x-plugin-key-id'] && req.headers['x-plugin-signature']
        ? { keyId: String(req.headers['x-plugin-key-id']).slice(0, 80), value: String(req.headers['x-plugin-signature']) }
        : null;
      try {
        const entry = await market.upload({ kind, bytes, filename: req.headers['x-plugin-filename'], uploadedBy: who.name || who.key, signature });
        sendJson(req, res, 201, { ok: true, plugin: entry });
      } catch (e) {
        sendJson(req, res, 400, { error: String(e?.message || e).slice(0, 300) });
      }
      return;
    }
  };
}
