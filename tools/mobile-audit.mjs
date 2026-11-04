#!/usr/bin/env node
/* global document, window, getComputedStyle */
// P0 mobile audit (docs/MOBILE-UI.md §7 M0.4): drives public/dev/mobile-audit.html (mock page skeletons) over the phone /
// tablet matrix and reports, per page and viewport:
//   * horizontal overflow (document.scrollWidth > clientWidth + 1)
//   * clickable controls whose hit area (including the ::before 44 px hit box of devices.css) is under 44×44
//   * bottom-area content that leaves the simulated safe area (--sa-* = 24/24/34/24)
// and writes one screenshot per page × viewport to test/e2e/out/mobile/.
//
//   node tools/mobile-audit.mjs                 # starts its own server (port 0), all pages and viewports
//   node tools/mobile-audit.mjs --page room     # one page (repeatable / comma-separated)
//   node tools/mobile-audit.mjs --viewport se1  # one viewport by name
//   SP_MOBILE_BASE=http://127.0.0.1:3000 node tools/mobile-audit.mjs   # use a running server
//   CHROME_PATH=... node tools/mobile-audit.mjs  # Chrome / Edge binary (defaults per platform)
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, SAFE_AREA } from '../test/mobile/matrix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'e2e', 'out', 'mobile');
const PAGES = ['lobby', 'hub', 'room', 'result', 'settle', 'codex', 'stats', 'settings', 'game'];
const EXCEPTIONS = loadExceptions();
const TAP_SKIP = EXCEPTIONS.filter((x) => !x.safe).map((x) => x.selector);
const SAFE_SKIP = EXCEPTIONS.filter((x) => x.safe).map((x) => x.selector);

function loadExceptions() {
  const p = join(ROOT, 'test', 'mobile', 'tap-exceptions.json');
  if (!existsSync(p)) return [];
  try {
    const list = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(list) ? list.filter((x) => x && typeof x.selector === 'string' && x.reason) : [];
  } catch (e) {
    console.error(`[mobile-audit] ${p}: ${e.message}`);
    return [];
  }
}

function argList(name) {
  const out = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}` && argv[i + 1]) out.push(...argv[++i].split(','));
    else if (a.startsWith(`--${name}=`)) out.push(...a.slice(name.length + 3).split(','));
  }
  return out;
}

function chromePath() {
  const env = process.env.CHROME_PATH;
  if (env) return env;
  const candidates = process.platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found) return found;
  // browser-actions/setup-chrome (CI) puts the binary on PATH
  for (const cmd of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    try {
      const p = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' })
        .split(/\r?\n/).map((s) => s.trim()).find((s) => s && existsSync(s));
      if (p) return p;
    } catch { /* not on PATH */ }
  }
  return null;
}

const pageFilter = argList('page').filter((p) => PAGES.includes(p));
const viewFilter = argList('viewport');
const pages = pageFilter.length ? pageFilter : PAGES;
const viewports = viewFilter.length ? VIEWPORTS.filter((v) => viewFilter.includes(v.name)) : VIEWPORTS;

if (!pages.length || !viewports.length) {
  console.error(`[mobile-audit] no pages / viewports selected (pages: ${PAGES.join(', ')}; viewports: ${VIEWPORTS.map((v) => v.name).join(', ')})`);
  process.exit(2);
}

const missing = viewFilter.filter((n) => !VIEWPORTS.some((v) => v.name === n));
if (missing.length) {
  console.error(`[mobile-audit] unknown viewport(s): ${missing.join(', ')}`);
  process.exit(2);
}

const chrome = chromePath();
if (!chrome) {
  console.error('[mobile-audit] no Chrome/Edge binary found — set CHROME_PATH');
  process.exit(2);
}

const puppeteer = (await import('puppeteer-core')).default;
let server = null;
let base = process.env.SP_MOBILE_BASE || '';
if (!base) {
  try {
    const { startServer } = await import('../server/index.js');
    server = await startServer({ port: 0, quiet: true });
    base = `http://127.0.0.1:${server.port}`;
  } catch (e) {
    console.error(`[mobile-audit] could not start the server: ${e.stack || e.message}`);
    process.exit(2);
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

/** In-page measurement: overflow, tap targets (with the ::before hit box) and safe-area breaches. */
function measure({ safe, tapSkip, safeSkip }) {
  const de = document.documentElement;
  const vw = window.innerWidth, vh = window.innerHeight;
  const overflow = Math.max(0, de.scrollWidth - vw);
  const matchesAny = (el, selectors) => selectors.some((sel) => {
    try { return el.matches(sel) || !!el.closest(sel); } catch { return false; }
  });
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Effective hit box: the control's own rect enlarged by the devices.css ::before hit area (width/height are used px in
  // Chrome, e.g. `max(100%, 44px)` resolves to `44px`). A control without one needs a 44×44 rect itself.
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const hitSize = (el) => {
    const r = el.getBoundingClientRect();
    let w = r.width, h = r.height;
    const s = getComputedStyle(el, '::before');
    if (s && s.content !== 'none' && s.position === 'absolute') {
      const pw = px(s.width), ph = px(s.height);
      if (pw != null) w = Math.max(w, pw);
      if (ph != null) h = Math.max(h, ph);
    }
    return { w, h };
  };
  const clickables = 'button, a[href], [role="button"], [role="tab"], [role="option"], summary,' +
    ' .scard, .bslot .bond, .mode-card, .hub-entry, .seat, .tips__nav, .cx-chip, .tabs__tab, .set-toggle';
  const taps = [];
  for (const el of document.querySelectorAll(clickables)) {
    if (el.closest('.ma-nav') || matchesAny(el, tapSkip) || !visible(el)) continue;
    const { w, h } = hitSize(el);
    if (w >= 44 - 0.5 && h >= 44 - 0.5) continue;
    const name = el.id ? `#${el.id}` : `.${[...el.classList].slice(0, 2).join('.')}`;
    taps.push({ sel: `${el.tagName.toLowerCase()}${name}`, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
  }
  const safeBreaches = [];
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}]`;
  };
  const inside = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return true;
    const out = r.left < safe.left - 1 || r.top < safe.top - 1
      || r.right > vw - safe.right + 1 || r.bottom > vh - safe.bottom + 1;
    return !out;
  };
  const mustFit = ['.gm__hud', '.shopbar', '.gm__corner', '.room-bar', '.settle__next'];
  for (const sel of mustFit) for (const el of document.querySelectorAll(sel)) {
    if (visible(el) && !matchesAny(el, safeSkip) && !inside(el)) safeBreaches.push(`${sel} ${rect(el)}`);
  }
  for (const el of document.querySelectorAll('button.btn, a.btn, .result__actions .btn, .settle__next')) {
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.bottom < vh * 0.72 || matchesAny(el, safeSkip)) continue;
    if (!inside(el)) safeBreaches.push(`${el.tagName.toLowerCase()}.btn "${(el.textContent || '').trim().slice(0, 12)}" ${rect(el)}`);
  }
  return {
    overflow,
    taps,
    safeBreaches,
    page: de.dataset.auditPage || '',
  };
}

const failures = [];
let shots = 0;
try {
  for (const v of viewports) {
    for (const name of pages) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
      try {
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.goto(`${base}/dev/mobile-audit.html?page=${name}`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForSelector(`[data-page="${name}"]`, { timeout: 15000 });
        await page.evaluate((safe, height) => {
          // what js/ui/device.js puts on a touch phone, and the safe area the owner cares about
          document.documentElement.classList.add('sp-touch', 'sp-coarse', 'sp-no-hover');
          const r = document.documentElement.style;
          r.setProperty('--sa-t', `${safe.top}px`);
          r.setProperty('--sa-r', `${safe.right}px`);
          r.setProperty('--sa-b', `${safe.bottom}px`);
          r.setProperty('--sa-l', `${safe.left}px`);
          r.setProperty('--sp-vh', `${height / 100}px`);
        }, SAFE_AREA, v.h);
        await new Promise((r) => setTimeout(r, 80));
        const res = await page.evaluate(measure, { safe: SAFE_AREA, tapSkip: TAP_SKIP, safeSkip: SAFE_SKIP });
        const file = join(OUT, `${name}-${v.w}x${v.h}.png`);
        await page.screenshot({ path: file, fullPage: false });
        shots++;
        const bad = res.overflow > 1 || res.taps.length > 0 || res.safeBreaches.length > 0 || pageErrors.length > 0;
        const bits = [];
        if (res.overflow > 1) bits.push(`overflow ${res.overflow}px`);
        if (res.taps.length) bits.push(`taps ${res.taps.slice(0, 6).map((t) => `${t.sel} ${t.w}x${t.h}`).join(', ')}${res.taps.length > 6 ? ` +${res.taps.length - 6}` : ''}`);
        if (res.safeBreaches.length) bits.push(`safe ${[...new Set(res.safeBreaches)].slice(0, 6).join(', ')}`);
        if (pageErrors.length) bits.push(`script errors: ${pageErrors.slice(0, 2).join(' / ')}`);
        if (bad) {
          failures.push({ page: name, viewport: v.name, w: v.w, h: v.h, overflow: res.overflow, taps: res.taps, safe: res.safeBreaches, errors: pageErrors });
          console.log(`[FAIL] ${name} @ ${v.w}x${v.h} (${v.name}) — ${bits.join(' | ')}`);
        } else {
          console.log(`[ok]   ${name} @ ${v.w}x${v.h} (${v.name})`);
        }
      } catch (e) {
        failures.push({ page: name, viewport: v.name, error: e.message });
        console.log(`[FAIL] ${name} @ ${v.w}x${v.h} (${v.name}) — ${e.message}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
  await server?.close?.().catch(() => {});
}

console.log(`\n[mobile-audit] ${pages.length} page(s) × ${viewports.length} viewport(s); ${shots} screenshot(s) in ${OUT}`);
if (failures.length) {
  console.log(`[mobile-audit] ${failures.length} failing page/viewport combination(s) — see the lines above`);
  process.exit(1);
}
console.log('[mobile-audit] all clear');
