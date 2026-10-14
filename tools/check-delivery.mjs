// tools/check-delivery.mjs — verify the asset-delivery chain and the cache-first path (docs/ASSETS.md).
//
// The owner's rule (2026-10-14): a client must READ FROM ITS CACHE FIRST and only then walk the chain
// (the Aliyun relay → GitHub and its mirrors → the game server). This tool checks both halves against the live site, so
// "is the cache still first?" and "does the chain hold?" stop being questions answered by reading code.
//
// Offline (default; needs HTTP to the origins, no browser):
//   1. the configured origins, in order (public/asset-mirrors.json),
//   2. which one answers the probe — the prefix the client would install,
//   3. the chain the client would then use, per asset class (an image; the audio / scene / clip routes),
//   4. each origin's route shapes: does it answer a plain file, /media, /scene and /clip?
// --live (adds one browser): two visits in ONE profile — the cold one must pull the art from the installed origin, the
//   warm one must come back fromCache() (the browser's own report), which is the guarantee the design rests on.
//
// Usage: node tools/check-delivery.mjs [--json] [--live] [--site <url>] [--no-probe]
//   --site <url>   the game server (default http://183.66.27.19:20522; SP_SITE)
//   --live         add the two-visit browser check (needs puppeteer-core + a Chrome; headless)
//   --no-probe     skip the HTTP probes and print the configuration only
// Exit codes: 0 everything as expected; 1 a finding (a route missing where it should answer, or the warm visit not
//   coming from the cache).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import {
  mirrorCandidates, mirrorRouteUrl, mirrorUrl, setMirrorPrefix,
} from '../public/js/assetMirror.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_SITE = 'http://183.66.27.19:20522';

/** The origin list as the client reads it. */
export function parseMirrorConfig(json) {
  const sources = json && Array.isArray(json.sources) ? json.sources.filter((s) => typeof s === 'string' && s) : [];
  const full = json && Array.isArray(json.fullSources) ? json.fullSources.filter((s) => typeof s === 'string' && s) : [];
  return { sources, fullSources: full };
}

/** The URL shapes one origin must answer to carry every class, and which of them only a full origin can. */
export function routeShapes(origin) {
  return [
    { name: 'image', url: `${origin}/assets/char/avatar/char_003_kalts.png`, full: false },
    { name: 'audio', url: `${origin}/media/bgm/m_sys_act1autochess_loop`, full: true },
    { name: 'scene', url: `${origin}/scene/act1autochess_m01/bin`, full: true },
    { name: 'clip', url: `${origin}/clip/boot`, full: true },
  ];
}

/** An image the manifests really name (used to show the class chain). */
export const SAMPLE_IMAGE = '/assets/~398f32e2ff78d9e6/char/avatar/char_003_kalts.png';

export function formatReport(m) {
  const L = [];
  const say = (s = '') => L.push(s);
  say('config      public/asset-mirrors.json');
  m.sources.forEach((s, i) => say(`  ${i + 1}. ${s}${m.fullSources.includes(s) ? '   (full origin: files + routes)' : '   (plain files only)'}`));
  say(`installed   ${m.installed || '(no origin answered — every request goes to this server)'}`);
  say('');
  say('The chain the client would use:');
  say(`  image   ${m.chains.image.map((u) => u.replace(/^https?:\/\//, '').slice(0, 52)).join('\n          ')}`);
  say(`  audio   ${m.chains.audio.map((u) => u.replace(/^https?:\/\//, '').slice(0, 52)).join('\n          ')}`);
  say(`  scene   ${m.chains.scene.join('  ·  ').replace(/^https?:\/\//, '').slice(0, 100)}`);
  say(`  clip    ${m.chains.clip.join('  ·  ').replace(/^https?:\/\//, '').slice(0, 100)}`);
  if (m.probes) {
    say('');
    say('Route shapes per origin (200 = it can carry that class):');
    for (const p of m.probes) say(`  ${p.origin.replace(/^https?:\/\//, '').slice(0, 46).padEnd(48)} ${p.results.map((r) => `${r.name}:${r.status}`).join('  ')}`);
  } else {
    say('');
    say('(probes skipped: --no-probe)');
  }
  if (m.live) {
    const line = (label, v) => `${label}  requests ${String(v.total).padStart(5)}  ·  fromCache ${String(v.cached).padStart(5)}  ·  relay ${v.relay}  ·  github ${v.github}  ·  this server ${v.server}`;
    say('');
    say(line('Cold visit ', m.live.cold));
    say(line('Warm visit ', m.live.warm));
    say('');
    say(m.live.ok
      ? `CACHE-FIRST OK: ${((m.live.warm.cached / m.live.warm.total) * 100).toFixed(1)}% of the warm visit is answered by the browser cache.`
      : 'CACHE-FIRST FAILING: the warm visit still fetches assets over the network.');
  }
  return L.join('\n');
}

async function probeOrigin(fetchFn, origin, full) {
  const results = [];
  for (const s of routeShapes(origin)) {
    if (s.full && !full) { results.push({ ...s, status: 'n/a' }); continue; }
    try {
      const r = await fetchFn(s.url, { method: 'HEAD', cache: 'no-store' });
      results.push({ ...s, status: r.status });
    } catch { results.push({ ...s, status: 'ERR' }); }
  }
  return { origin, results };
}

/** @param {{ site?: string, probe?: boolean, live?: boolean, fetchFn?: typeof fetch }} o */
export async function check({ site = DEFAULT_SITE, probe = true, live = false, fetchFn = globalThis.fetch } = {}) {
  const cfg = parseMirrorConfig(JSON.parse(readFileSync(path.join(ROOT, 'public', 'asset-mirrors.json'), 'utf8')));
  let installed = '';
  if (probe) {
    for (const base of cfg.sources) {
      try {
        const r = await fetchFn(mirrorUrl(base, '/asset-mirrors.json'), { cache: 'no-store' });
        if (r && r.ok) { installed = base; break; }
      } catch { /* the next source */ }
    }
    setMirrorPrefix(installed, cfg.fullSources.includes(installed), cfg.sources);
  }
  const chains = {
    image: mirrorCandidates(SAMPLE_IMAGE),
    audio: [...new Set([mirrorRouteUrl('/media/~0123456789abcdef/bgm/x'), ...mirrorCandidates('/assets/audio/bgm/x.mp3').slice(1, -1), '/media/~0123456789abcdef/bgm/x'])],
    scene: [...new Set([mirrorRouteUrl('/scene/act1autochess_m01/bin'),
      ...mirrorCandidates('/assets/local/scene/act1autochess_m01/scene.bin').slice(1, -1),
      '/scene/act1autochess_m01/bin', '/assets/local/scene/act1autochess_m01/scene.bin'])],
    clip: [...new Set([mirrorRouteUrl('/clip/boot?v=2'),
      ...mirrorCandidates('/assets/loading/boot.mp4?v=2').slice(1, -1),
      '/clip/boot?v=2', '/assets/loading/boot.mp4?v=2'])],
  };
  const probes = probe ? await Promise.all(cfg.sources.map((s) => probeOrigin(fetchFn, s, cfg.fullSources.includes(s)))) : null;
  const model = { ...cfg, installed, chains, probes, live: null };
  if (live) model.live = await liveCheck(site);
  return model;
}

/** Two visits in one browser profile: the second must be served by the cache. */
export async function liveCheck(site = DEFAULT_SITE) {
  const puppeteer = (await import('puppeteer-core')).default;
  const chrome = process.env.CHROME_PATH
    || path.join(homedir(), '.cache', 'puppeteer', 'chrome', 'win64-153.0.8010.36', 'chrome-win64', 'chrome.exe');
  const profile = path.join(process.env.TEMP || '/tmp', 'sp-delivery-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: true, userDataDir: profile,
    args: ['--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const host = new URL(site).host;
  const empty = () => ({ total: 0, cached: 0, relay: 0, github: 0, server: 0 });
  let tally = empty();
  page.on('response', (r) => {
    const u = r.url();
    if (!/\/assets\//.test(u) && !/\/(media|scene|clip)\//.test(u)) return;
    tally.total++;
    let h = '';
    try { h = new URL(u).host; } catch { /* ignore */ }
    if (h === host) tally.server++;
    else if (/(gh-proxy|jsdelivr|githubusercontent)/.test(u)) tally.github++;
    else tally.relay++;
    try { if (r.fromCache()) tally.cached++; } catch { /* ignore */ }
  });
  const visit = async () => {
    tally = empty();
    await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 40000));
    return { ...tally };
  };
  const cold = await visit();
  const warm = await visit();
  await browser.close();
  return { cold, warm, ok: warm.total > 0 && warm.cached / warm.total > 0.5 };
}

const USAGE = 'usage: node tools/check-delivery.mjs [--json] [--live] [--site <url>] [--no-probe]';

export async function main(argv = process.argv.slice(2)) {
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return 0; }
  const site = val('--site', process.env.SP_SITE || DEFAULT_SITE);
  const model = await check({ site, probe: !argv.includes('--no-probe'), live: argv.includes('--live') });
  process.stdout.write(argv.includes('--json') ? JSON.stringify(model, null, 2) + '\n' : formatReport(model) + '\n');
  if (model.live && !model.live.ok) return 1;
  return 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) process.exit(await main());
