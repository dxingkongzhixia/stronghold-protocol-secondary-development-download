// Site policy (DESIGN §32.11). Hash only import maps, never arbitrary inline script. Worker/UI policies are independent.
// worker-src 'self' is the asset service worker at /sw.js. blob: stays for workers the page already creates
// (the simulation worker). Do not add a remote worker origin. SIM_WORKER_CSP is that worker's own policy and
// must not gain the asset worker.
// The art mirrors (public/asset-mirrors.json — the one place the origins are written down, server/mirrors.js) must be
// allowed for what the client does with them: `connect-src` (the throughput probe is a fetch), `img-src` (the rewritten
// manifest URLs) and `media-src` (a full origin reimplements /media). Without them the browser refuses every mirror —
// the relay and the CDNs alike — and the whole feature is dead on an otherwise healthy server (2026-10-26).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// SES evaluates confined code. v2 sandbox scripts and native Keel modules run in the simulation Worker
// (SIM_WORKER_CSP), so the game document itself never allows eval.
export const SIM_WORKER_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'";

/**
 * The origins the art mirrors may be loaded from: `sources` + `fullSources` of public/asset-mirrors.json, reduced to
 * scheme + host (+ port) and deduped. A missing or broken file means no mirror, so no extra origin.
 * @param {string} publicDir
 * @returns {string[]} e.g. ['https://relay.example:56148', 'https://cdn.example']
 */
export function artOrigins(publicDir) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(path.join(publicDir, 'asset-mirrors.json'), 'utf8'));
  } catch {
    return [];
  }
  const out = new Set();
  for (const raw of [...(Array.isArray(doc?.sources) ? doc.sources : []), ...(Array.isArray(doc?.fullSources) ? doc.fullSources : [])]) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      out.add(`${u.protocol}//${u.host}`);
    } catch { /* not a URL: the client skips it too */ }
  }
  return [...out];
}

export function siteCsp(publicDir) {
  const hashes = new Set();
  for (const rel of ['index.html', 'studio/index.html', 'studio/console.html', 'dev/game-mock.html', 'dev/render-demo.html', 'dev/battle-perf.html', 'dev/uikit.html']) {
    let html;
    try { html = fs.readFileSync(path.join(publicDir, rel), 'utf8'); } catch { continue; }
    for (const m of html.matchAll(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    }
  }
  const mirrors = artOrigins(publicDir);
  const art = mirrors.length ? ' ' + mirrors.join(' ') : '';
  return `default-src 'self'; script-src 'self'${hashes.size ? ' ' + [...hashes].join(' ') : ''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://fonts.gstatic.cn; img-src 'self' data: blob:${art}; connect-src 'self'${art}; media-src 'self'${art}; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'`;
}
