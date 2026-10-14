// server/http/scene.js — the extension-less battlefield-scene route /scene/<stageId>/<part> →
// `public/assets/local/scene/<stageId>/scene.{json,bin}`.
//
// Clients ask for the scene bundle through this path because download managers (IDM, 迅雷, FDM …) hijack XHR/fetch
// whose URL ends in a downloadable extension — `scene.bin` is `application/octet-stream`, and a stolen response leaves
// the 3D board on its procedural fallback. See `shared/scene.js` (the mapping both sides share) and the same trick for
// audio in `media.js`. Requests for the direct `/assets/local/scene/…` URLs keep working (they are the fallback for
// plain static hosts).

import fsp from 'node:fs/promises';
import path from 'node:path';
import { SCENE_PREFIX, scenePartFile } from '../../shared/scene.js';
import { sendError } from './common.js';
import { serveFile } from './files.js';
import { hashedFileOpts } from './assetIndex.js';

/**
 * `/scene/act2autochess_m04/bin` → `public/assets/local/scene/act2autochess_m04/scene.bin`.
 * @param {{ urlHash?: string | null, assetIndex?: ReturnType<typeof import('./assetIndex.js').createAssetIndex> | null }} [hashing]
 */
export async function serveScene(req, res, rest, query, publicDir, gzipCache, log, { urlHash = null, assetIndex = null } = {}, limiter = null) {
  const root = path.join(path.resolve(publicDir), 'assets', 'local', 'scene');
  const segments = String(rest || '').split('/').filter((s) => s.length > 0);
  if (segments.length !== 2) { sendError(req, res, 404, '页面不存在 · Not found'); return; }
  const [stageId, part] = segments;
  if ([stageId, part].some((s) => s === '..' || s === '.' || s.startsWith('.') || s.endsWith('.'))) {
    sendError(req, res, 403, '禁止访问 · Forbidden');
    return;
  }
  const file = scenePartFile(part);
  if (!file || !/^[A-Za-z0-9_-]+$/.test(stageId)) { sendError(req, res, 404, '页面不存在 · Not found'); return; }
  const absPath = path.join(root, stageId, file);
  if (!absPath.startsWith(root + path.sep)) { sendError(req, res, 403, '禁止访问 · Forbidden'); return; }
  const stat = await fsp.stat(absPath).catch(() => null);
  if (!stat || !stat.isFile()) { sendError(req, res, 404, '页面不存在 · Not found'); return; }
  // The cache policy / ETag of the public path the client would otherwise have asked for (/assets/local/scene/…).
  const rel = ['assets', 'local', 'scene', stageId, file].join('/');
  await serveFile(req, res, absPath, stat, 'public', ['assets', 'local', 'scene', stageId, file], query, gzipCache, log, hashedFileOpts(assetIndex, rel, stat, urlHash), limiter);
}

export { SCENE_PREFIX };
