// server/speed.js — the console's 测速: time the art origins (the owner's relay, the GitHub mirrors) the way a
// player loads them, so a throttled uplink is visible without guessing.
// (i18n-ignore-file: this module's origin labels are developer-facing, shown only on the operations page — docs/I18N.md)
//
// Two vantages, one sample set:
//   - the SERVER probe below answers "how does THIS box reach each origin" (the box that serves the lobby);
//   - the console page times the same URLs from the operator's browser (`sources[].base` + `samples`), which is the
//     vantage a player actually has.
// The rule is deliberately the client's own (public/js/assetMirror.js): six committed portraits fetched IN PARALLEL —
// a single small file measures round-trip latency, not bandwidth, which is what once made a fixed relay look slow —
// then the aggregate bytes over the wall clock, compared against the same bars (relay 1.2 MB/s, mirror 1.0 MB/s).
// test/speed.test.js re-reads that module and fails if these constants drift apart.
//
// Read-only: the probe only GETs third-party URLs. It never touches the lobby, the registry or the database, and the
// console cannot use it to change anything — the origins come from public/asset-mirrors.json, not from the caller.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Mirrors public/js/assetMirror.js SPEED_SAMPLES: six operator portraits (~110 KB each) present on the relay, on both
 *  GitHub mirrors and on this server. */
export const SPEED_SAMPLES = Object.freeze([
  '/assets/char/portrait/char_003_kalts_1.png',
  '/assets/char/portrait/char_010_chen_1.png',
  '/assets/char/portrait/char_103_angel_1.png',
  '/assets/char/portrait/char_140_whitew_1.png',
  '/assets/char/portrait/char_199_yak_1.png',
  '/assets/char/portrait/char_150_snakek_1.png',
]);
/** Mirrors RELAY_MIN_BPS: a FULL origin (the relay: files + the /media,/scene,/clip routes) must clear this to stay first. */
export const RELAY_MIN_BPS = 1.2 * 1024 * 1024;
/** Mirrors MIRROR_MIN_BPS: a plain-file mirror (gh-proxy / jsDelivr) must clear this to be used at all. */
export const MIRROR_MIN_BPS = 1.0 * 1024 * 1024;
/** Mirrors SPEED_TIMEOUT_MS / SPEED_BYTE_CAP: per-source budget, and the per-file cap that ends a fast one early. */
export const SPEED_BUDGET_MS = 2500;
export const SPEED_BYTE_CAP = 400 * 1024;
/** The console asks for a reading at most this often; a second request inside the window gets the previous one. The
 *  probe spends ~650 KB per source, and the free mirrors are not ours to hammer. */
export const SPEED_COOLDOWN_MS = 10_000;

/** Pure: bytes per second of a timed download (0 when nothing arrived). Same as the client's `rateOf`. */
export const rateOf = (bytes, ms) => (bytes > 0 && ms > 0 ? (bytes * 1000) / ms : 0);

/**
 * Pure: the origin a player would actually load from, given the measured rates — the client's own rule
 * (`assetMirror.js pickMirror`): the FIRST origin in configured order that clears its own bar, else the game server
 * (''). Kept here so the console can say which origin is in use right now, not just which one is slow.
 * @param {{ base: string, full?: boolean, bps: number }[]} measured
 * @param {{ relayMin?: number, mirrorMin?: number }} [o]
 */
export function pickMirror(measured, { relayMin = RELAY_MIN_BPS, mirrorMin = MIRROR_MIN_BPS } = {}) {
  for (const m of Array.isArray(measured) ? measured : []) {
    if (!m || typeof m.base !== 'string' || !m.base) continue;
    if (m.bps >= (m.full ? relayMin : mirrorMin)) return m.base;
  }
  return '';
}

/** A human label for a configured origin (the console's 来源 column). Matched by substring, so an owner/repo move
 *  inside a CDN URL does not need a code change here. */
export function labelOf(base) {
  const b = String(base || '');
  if (!b) return '本服务器';
  if (/jsdelivr\.net/i.test(b)) return 'GitHub 镜像 · jsDelivr';
  if (/gh-proxy\.com|ghproxy/i.test(b)) return 'GitHub 镜像 · gh-proxy';
  if (/raw\.githubusercontent\.com/i.test(b)) return 'GitHub raw';
  if (/^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?\/?$/.test(b)) return '中继';
  if (/^https?:\/\//i.test(b)) return '镜像';
  return b;
}

/**
 * The origins to measure, in the client's own order: public/asset-mirrors.json `sources` (best first) with
 * `fullSources` marking the ones that also reimplement /media, /scene and /clip. Never throws: a missing or malformed
 * file yields an empty list, and the console just shows nothing to measure.
 * @param {string} root repository root
 */
export function readOrigins(root) {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(join(root, 'public', 'asset-mirrors.json'), 'utf8'));
  } catch { return []; }
  const full = new Set(Array.isArray(cfg && cfg.fullSources) ? cfg.fullSources : []);
  const list = Array.isArray(cfg && cfg.sources) ? cfg.sources : [];
  return list
    .filter((b) => typeof b === 'string' && b.trim())
    .map((b) => {
      const base = b.trim().replace(/\/+$/, '');
      return { base, label: labelOf(base), full: full.has(b.trim()) || full.has(base) };
    });
}

/**
 * Read one sample up to `cap` bytes or `budgetMs` (a partial read is enough to judge), and report what arrived.
 * Never throws: a refused connection, a 404 or an aborted body all come back as 0 bytes. `fetchFn` is injectable so
 * the tests need no network.
 */
export async function readCapped(url, fetchFn = fetch, budgetMs = SPEED_BUDGET_MS, cap = SPEED_BYTE_CAP) {
  const t0 = Date.now();
  let timer = null;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    timer = ctrl && budgetMs > 0 ? setTimeout(() => ctrl.abort(), budgetMs + 500) : null;
    const res = await fetchFn(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    if (!res || !res.ok) return 0;
    let bytes = 0;
    const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value && value.byteLength ? value.byteLength : 0;
        if (bytes >= cap || Date.now() - t0 >= budgetMs) break;
      }
      try { await reader.cancel(); } catch { /* the cap is enough */ }
    } else {
      bytes = (await res.arrayBuffer()).byteLength;
    }
    return bytes;
  } catch { return 0; } finally { if (timer) clearTimeout(timer); }
}

/** Time one origin: every sample in parallel (the way the boot preload pulls art), aggregate bytes over wall clock. */
export async function measureOrigin(base, { fetchFn = fetch, samples = SPEED_SAMPLES, budgetMs = SPEED_BUDGET_MS, cap = SPEED_BYTE_CAP, now = Date.now } = {}) {
  const t0 = now();
  const parts = await Promise.all(samples.map((s) => readCapped(base + s, fetchFn, budgetMs, cap)));
  const bytes = parts.reduce((a, b) => a + b, 0);
  const ms = now() - t0;
  return { bytes, ms, bps: rateOf(bytes, ms) };
}

/**
 * Measure every configured origin (in parallel — they are independent hosts) and judge each against its own bar.
 * @param {{ root: string, fetchFn?: Function, samples?: readonly string[], budgetMs?: number, cap?: number, now?: Function }} o
 */
export async function probeOrigins({ root, fetchFn = fetch, samples = SPEED_SAMPLES, budgetMs = SPEED_BUDGET_MS, cap = SPEED_BYTE_CAP, now = Date.now } = {}) {
  const origins = readOrigins(root);
  const measured = await Promise.all(origins.map(async (o) => {
    const r = await measureOrigin(o.base, { fetchFn, samples, budgetMs, cap, now });
    const min = o.full ? RELAY_MIN_BPS : MIRROR_MIN_BPS;
    return { ...o, ...r, min, ok: r.bytes > 0, pass: r.bytes > 0 && r.bps >= min };
  }));
  const chosen = pickMirror(measured);
  return {
    at: now(),
    samples: [...samples],
    thresholds: { relay: RELAY_MIN_BPS, mirror: MIRROR_MIN_BPS },
    sources: measured,
    chosen: chosen || '',
    chosenLabel: chosen ? (measured.find((m) => m.base === chosen) || {}).label || chosen : '本服务器',
  };
}

/**
 * The console's probe, with a cooldown so a refresh-happy operator cannot hammer the free mirrors: a run inside
 * `cooldownMs` replays the last reading, and `force` (the console button) measures again at once.
 * @param {{ root: string, fetchFn?: Function, now?: Function, cooldownMs?: number }} o
 */
export function createSpeedProbe({ root, fetchFn = fetch, now = Date.now, cooldownMs = SPEED_COOLDOWN_MS } = {}) {
  let last = null;
  let running = null;
  return {
    /** @param {{ force?: boolean }} [o] */
    async run({ force = false } = {}) {
      const t = now();
      if (last && !force && t - last.at < cooldownMs) return { ...last, cached: true };
      if (running) return running;
      running = probeOrigins({ root, fetchFn, now })
        .then((r) => { last = r; return { ...r, cached: false }; })
        .finally(() => { running = null; });
      return running;
    },
    /** The last reading, or null (for a caller that wants to render without probing). */
    peek() { return last; },
  };
}
