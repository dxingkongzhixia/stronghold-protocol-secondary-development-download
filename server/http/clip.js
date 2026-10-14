// server/http/clip.js — the extension-less clip route /clip/<name> → a file under `public/assets/` (shared/clip.js).
//
// Clients ask for the boot clip through this path because download managers (IDM, 迅雷, FDM …) hijack XHR/fetch whose
// URL ends in a media extension; a stolen response leaves the boot screen without its background video. The same trick
// the audio (/media/) and the battlefield bundles (/scene/) use.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { clipFile } from '../../shared/clip.js';
import { sendError } from './common.js';
import { serveFile } from './files.js';
import { hashedFileOpts } from './assetIndex.js';

/**
 * `/clip/boot?v=2` → `public/assets/loading/boot.mp4` (Range requests come from serveFile, so the clip streams).
 * @param {{ urlHash?: string | null, assetIndex?: ReturnType<typeof import('./assetIndex.js').createAssetIndex> | null }} [hashing]
 */
export async function serveClip(req, res, rest, query, publicDir, gzipCache, log, { urlHash = null, assetIndex = null } = {}, limiter = null) {
  const root = path.join(path.resolve(publicDir), 'assets');
  const segments = String(rest || '').split('/').filter((s) => s.length > 0);
  if (segments.length !== 1) { sendError(req, res, 404, '页面不存在 · Not found'); return; }
  const [name] = segments;
  if (name === '..' || name === '.' || name.startsWith('.') || name.endsWith('.')) { sendError(req, res, 403, '禁止访问 · Forbidden'); return; }
  const rel = clipFile(name);
  if (!rel) { sendError(req, res, 404, '页面不存在 · Not found'); return; }
  const absPath = path.join(root, ...rel.split('/'));
  if (!absPath.startsWith(root + path.sep)) { sendError(req, res, 403, '禁止访问 · Forbidden'); return; }
  const stat = await fsp.stat(absPath).catch(() => null);
  if (!stat || !stat.isFile()) { sendError(req, res, 404, '页面不存在 · Not found'); return; }
  await serveFile(req, res, absPath, stat, 'public', ['assets', ...rel.split('/')], query, gzipCache, log, hashedFileOpts(assetIndex, `assets/${rel}`, stat, urlHash), limiter);
}
