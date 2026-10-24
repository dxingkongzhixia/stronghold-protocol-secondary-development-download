// tools/lobby-music.mjs — download the official 主界面音乐 the Hub's music picker plays (public/js/ui/musicPicker.js,
// `audio.lobbyMusic` in data/assets.json; docs/ASSETS.md "Lobby music").
//
// The ids come from tools/assets/lobby-music.mjs and name / intro / loop from the official
// excel/audio_data.json `musics[]` catalogue (via tools/assets/audio.mjs indexAudio().music). Files land at
// public/assets/audio/music/<id>_{intro,loop}.mp3, from the same ArknightsAssets2 `voice` dump the rest of the
// audio uses. The picker's default (no selection) is the mode's own `audio.bgm.lobby` and is not downloaded here.
//
// Usage: node tools/lobby-music.mjs [--offline] [--force] [--only=music_bg_default,…] [--concurrency=3] [--dry-run]
//   --offline   no network: write the manifest from the files already on disk (a full fetch-assets run plans the same
//               leaves; this tool is the quick path for the picker's own list)
//   --force     download even when the target file already exists
//
// curl is the transport: this project's machines route GitHub downloads through gh-proxy, which Node's fetch cannot
// always reach (the same reason tools/illust.mjs lists its sources first). A 404 is a miss, never an error.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexAudio } from './assets/audio.mjs';
import { LOBBY_MUSIC } from './assets/lobby-music.mjs';
import { isMp3 } from './assets/formats.mjs';
import { contentHash } from './assets/manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'assets', 'audio', 'music');
const MANIFEST = join(ROOT, 'data', 'assets.json');
const AUDIO_DATA = join(ROOT, '.cache', 'gamedata', 'excel', 'audio_data.json');
// The same dump the BGM plan uses (tools/assets/sources.mjs RAW.aa2voice); gh-proxy first, raw second.
const URLS = [
  (path) => `https://gh-proxy.com/https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/${path}`,
  (path) => `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/${path}`,
];

function parseArgs(argv) {
  const o = { offline: false, force: false, only: null, concurrency: 3, dryRun: false };
  for (const a of argv) {
    if (a === '--offline') o.offline = true;
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a.startsWith('--only=')) o.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--concurrency=')) o.concurrency = Math.max(1, Number(a.slice(14)) || 3);
    else if (a === '--help' || a === '-h') {
      console.log('node tools/lobby-music.mjs [--offline] [--force] [--only=id,…] [--concurrency=3] [--dry-run]');
      process.exit(0);
    }
  }
  return o;
}

/** Run curl for one URL; resolve true on a written, valid MP3. */
function curlTo(url, dst) {
  return new Promise((resolve) => {
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const tmp = `${dst}.part`;
    // --ssl-no-revoke is Schannel (Windows) only: the owner's desktop otherwise refuses raw.githubusercontent.com's
    // certificate check. curl still falls back to the plain URL when gh-proxy is unreachable.
    const args = ['-sSL', '--fail', ...(process.platform === 'win32' ? ['--ssl-no-revoke'] : []),
      '--retry', '2', '--retry-delay', '1', '--max-time', '240', '-o', tmp, url];
    const child = spawn(curl, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { rmSync(tmp, { force: true }); resolve(false); if (process.env.SP_LOBBY_MUSIC_DEBUG) console.warn('[lobby-music] curl', e.message); });
    child.on('close', (code) => {
      try {
        if (code === 0 && existsSync(tmp) && isMp3(readFileSync(tmp))) {
          renameSync(tmp, dst);
          resolve(true);
          return;
        }
      } catch { /* treated as a miss */ }
      rmSync(tmp, { force: true });
      if (process.env.SP_LOBBY_MUSIC_DEBUG) console.warn('[lobby-music] curl failed', code, stderr.trim().slice(0, 200), url);
      resolve(false);
    });
  });
}

async function fetchOne(id, rel, source) {
  const dst = join(OUT, `${id}_${rel}.mp3`);
  for (const url of URLS) if (await curlTo(url(source), dst)) return true;
  return false;
}

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const n = items[i++]; await fn(n); }
  });
  await Promise.all(workers);
}

/**
 * Write `audio.lobbyMusic` from the files on disk. Only the files this run added are counted in `stats`
 * (files/bytes), the same incremental rule tools/illust.mjs uses.
 */
function updateManifest(entries) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const prev = manifest.audio?.lobbyMusic && typeof manifest.audio.lobbyMusic === 'object' ? manifest.audio.lobbyMusic : {};
  const known = new Set();
  for (const e of Object.values(prev)) for (const k of ['intro', 'loop']) if (typeof e?.[k] === 'string') known.add(e[k]);
  let added = 0;
  let bytes = 0;
  for (const e of Object.values(entries)) {
    for (const k of ['intro', 'loop']) {
      const rel = e[k];
      if (typeof rel !== 'string' || known.has(rel)) continue;
      added++;
      try { bytes += statSync(join(ROOT, 'public', rel)).size; } catch { /* raced */ }
    }
  }
  manifest.audio = { ...(manifest.audio || {}), lobbyMusic: entries };
  if (added) {
    manifest.stats = { ...(manifest.stats || {}), files: (manifest.stats?.files || 0) + added, bytes: (manifest.stats?.bytes || 0) + bytes };
  }
  const body = { ...manifest };
  delete body.version; delete body.hash; delete body.generator; delete body.stats;
  manifest.hash = contentHash(body);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest)}\n`);
  return added;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(OUT, { recursive: true });
  const audioData = JSON.parse(readFileSync(AUDIO_DATA, 'utf8'));
  const audio = indexAudio(audioData);
  const wanted = LOBBY_MUSIC.filter((x) => !opts.only || opts.only.includes(x.id));
  const entries = {};
  const missing = [];
  let downloaded = 0;
  let skipped = 0;

  const jobs = [];
  for (const item of wanted) {
    const m = audio.music(item.id);
    if (!m) { missing.push(`${item.id} (not in audio_data)`); continue; }
    const entry = { name: m.name, group: item.group };
    const files = [];
    if (m.intro) files.push({ kind: 'intro', path: m.intro });
    files.push({ kind: 'loop', path: m.loop });
    entry.files = files;
    jobs.push({ item, entry, files });
  }

  await pool(jobs, opts.concurrency, async ({ item, entry, files }) => {
    for (const f of files) {
      const rel = `/assets/audio/music/${item.id}_${f.kind}.mp3`;
      const dst = join(ROOT, 'public', rel);
      if (!opts.force && existsSync(dst) && isMp3(readFileSync(dst))) { entry[f.kind] = rel; skipped++; continue; }
      if (opts.dryRun) { console.log('would fetch', rel, f.path); entry[f.kind] = rel; continue; }
      if (opts.offline) { missing.push(`${item.id} ${f.kind} (file missing; run without --offline)`); continue; }
      if (!(await fetchOne(item.id, f.kind, f.path))) { missing.push(`${item.id} ${f.kind}`); continue; }
      entry[f.kind] = rel;
      downloaded++;
      console.log(`[lobby-music] + ${rel}`);
    }
    // Only a track with its loop is playable; an intro without a loop is not an entry.
    if (entry.loop) {
      entries[item.id] = { name: entry.name, group: entry.group };
      if (entry.intro) entries[item.id].intro = entry.intro;
      entries[item.id].loop = entry.loop;
    }
  });

  // The picker lists the manifest's insertion order: rebuild it from the curated list, not from whichever download
  // finished first (the pool writes `entries` concurrently), so a rebuild is byte-for-byte stable. A --only run keeps
  // the other catalogue entries already in the manifest.
  const prev = JSON.parse(readFileSync(MANIFEST, 'utf8')).audio?.lobbyMusic || {};
  const ordered = {};
  for (const item of LOBBY_MUSIC) {
    const entry = entries[item.id] || prev[item.id];
    if (entry) ordered[item.id] = entry;
  }
  if (!opts.dryRun) {
    const added = updateManifest(ordered);
    console.log(added ? `[lobby-music] data/assets.json: +${added} files (hash updated)` : '[lobby-music] data/assets.json already lists every downloaded file');
  }
  const order = Object.keys(ordered).length;
  console.log(`[lobby-music] ${wanted.length} tracks: ${order} in the manifest, ${skipped} files existing, ${downloaded} downloaded`);
  if (missing.length) console.log(`[lobby-music] missing: ${missing.join(', ')}`);
  if (opts.dryRun) console.log('[lobby-music] dry run: nothing was written');
}

await main();
