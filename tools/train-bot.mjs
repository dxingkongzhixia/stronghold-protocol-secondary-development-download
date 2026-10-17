#!/usr/bin/env node
// tools/train-bot.mjs — fit the bot layout prior from the recorded rehearsals and publish it atomically.
//
// Input:  var/training.db (server/training/store.js rows: one per server-run bot rehearsal, with the shared rehearsal's
//         own per-candidate scores).
// Output: server/match/botPrior.json (machine-local, git-ignored) — the table server/match/botPrior.js hot-reloads at
//         the next bot prep. The previous file is kept as botPrior.json.prev (one-step rollback).
//
// The model is deliberately small and dependency-free: a per-`(stage|round)` table of layout FAMILIES (a 3×5 band
// signature, server/match/botPrior.js `planFamily`) with `{ n, mean }` of the rehearsal score. It only decides WHICH
// candidates the `botRehearsal` slice simulates; the simulation still picks the winner, and `server/sim` is untouched.
//
// Validation (hold-out, one in five matches by seed): top-1 agreement with the rehearsal's own argmax and the mean
// regret. Below the gates the previous prior stays and the report says why.
//
// Usage:
//   node tools/train-bot.mjs --auto          # export + prune + train (cron), skips while a match is running
//   node tools/train-bot.mjs --dry-run       # train + report, write nothing
//   node tools/train-bot.mjs --since 30 --min-samples 200 --min-top1 0.5
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DB_FILE = path.join(ROOT, 'var', 'training.db');
const PRIOR_FILE = path.join(ROOT, 'server', 'match', 'botPrior.json');
const REPORT_DIR = path.join(ROOT, 'var', 'training');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

const DRY = has('--dry-run');
const AUTO = has('--auto');
const SINCE = num(opt('--since', 0), 0);
const MIN_SAMPLES = num(opt('--min-samples', 200), 200);
const MIN_TOP1 = num(opt('--min-top1', 0.5), 0.5);
const SCHEMA = 1;

const log = (...a) => console.log('[train-bot]', ...a);

/** Skip the nightly run while a match is on (the box's own healthz; a single-player box has none). */
async function matchesRunning() {
  try {
    const res = await fetch('http://127.0.0.1:3000/healthz', { signal: AbortSignal.timeout(3000) });
    const j = await res.json();
    return Number(j?.matches || 0) > 0;
  } catch {
    return false; // no server / not reachable: nothing to disturb
  }
}

/** One in five matches (by seed) is held out; rows of the same seed stay together. */
const heldOut = (row) => {
  const h = createHash('sha1').update(`holdout|${row.seed ?? ''}`).digest();
  return h[0] % 5 === 0;
};

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function loadRows() {
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  const cutoff = SINCE > 0 ? Date.now() - SINCE * 86400_000 : 0;
  const rows = db.prepare('SELECT at, mode, difficulty, stage, round, seat, seed, state, candidates, chosen FROM bot_training WHERE at >= ? ORDER BY at ASC').all(cutoff);
  db.close();
  return rows.map((r) => ({ ...r, candidates: JSON.parse(r.candidates || '[]') }));
}

/** `(stage|round)` → `family` → score list. */
function fit(rows) {
  const byKey = {};
  let samples = 0;
  for (const r of rows) {
    const key = `${r.stage ?? ''}|${r.round ?? ''}`;
    const table = byKey[key] || (byKey[key] = {});
    for (const c of r.candidates || []) {
      if (!c || typeof c.score !== 'number' || !c.family) continue;
      const cell = table[c.family] || (table[c.family] = { n: 0, sum: 0 });
      cell.n++;
      cell.sum += c.score;
      samples++;
    }
  }
  for (const table of Object.values(byKey)) for (const cell of Object.values(table)) { cell.mean = cell.sum / cell.n; delete cell.sum; }
  return { byKey, samples };
}

/** Evaluate the table on held-out rows: top-1 agreement + mean regret against the rehearsal's own argmax. */
function evaluate(rows, model) {
  let top1 = 0;
  let regrets = [];
  let tested = 0;
  for (const r of rows) {
    const scored = (r.candidates || []).filter((c) => typeof c.score === 'number' && c.family);
    if (scored.length < 2) continue;
    const key = `${r.stage ?? ''}|${r.round ?? ''}`;
    const table = model.byKey[key] || {};
    const predicted = scored.slice().sort((a, b) => ((table[b.family]?.mean ?? -Infinity) - (table[a.family]?.mean ?? -Infinity)) || a.i - b.i)[0];
    const actual = scored.slice().sort((a, b) => (b.score - a.score) || a.i - b.i)[0];
    tested++;
    if (predicted.family === actual.family) top1++;
    regrets.push(actual.score - predicted.score);
  }
  return { tested, top1: tested ? top1 / tested : 0, regret: mean(regrets) };
}

/** Write the prior atomically, keeping the previous one for a one-step rollback. */
function publish(doc) {
  fs.mkdirSync(path.dirname(PRIOR_FILE), { recursive: true });
  const tmp = `${PRIOR_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc) + '\n');
  if (fs.existsSync(PRIOR_FILE)) fs.copyFileSync(PRIOR_FILE, `${PRIOR_FILE}.prev`);
  fs.renameSync(tmp, PRIOR_FILE);
}

async function main() {
  if (!fs.existsSync(DB_FILE)) { log('no database yet:', path.relative(ROOT, DB_FILE), '- nothing to learn'); return 0; }
  if (AUTO && (await matchesRunning())) { log('a match is running: skipping this run'); return 0; }
  if (AUTO) {
    // archive + prune first, so the trainer reads a compact table (the exported rows are already on disk)
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bot-training.mjs'), 'export', '--days', '14'], { stdio: 'inherit' });
      execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bot-training.mjs'), 'prune'], { stdio: 'inherit' });
    } catch (e) { log('export/prune failed (continuing):', e?.message || e); }
  }
  const rows = loadRows();
  const train = rows.filter((r) => !heldOut(r));
  const test = rows.filter(heldOut);
  if (train.length < 5) { log(`only ${train.length} training rows - not enough to fit (wait for more samples)`); return 0; }
  const model = fit(train);
  const ev = evaluate(test, model);
  const version = (Number(JSON.parse(fs.existsSync(PRIOR_FILE) ? fs.readFileSync(PRIOR_FILE, 'utf8') : '{}')?.version) || 0) + 1;
  const report = {
    at: new Date().toISOString(), rows: rows.length, train: train.length, test: test.length,
    samples: model.samples, evaluated: ev.tested, top1: ev.top1, regret: ev.regret,
    gates: { minSamples: MIN_SAMPLES, minTop1: MIN_TOP1 }, version, published: false, reason: null,
  };
  const pass = model.samples >= MIN_SAMPLES && ev.tested >= 20 && ev.top1 >= MIN_TOP1;
  if (!pass) {
    report.reason = `samples ${model.samples} (>= ${MIN_SAMPLES}) / top1 ${ev.top1.toFixed(3)} (>= ${MIN_TOP1}) / tested ${ev.tested} — previous prior kept`;
    log(report.reason);
  } else if (!DRY) {
    publish({ schemaVersion: SCHEMA, version, trainedAt: report.at, samples: model.samples, byKey: model.byKey });
    report.published = true;
    log(`published server/match/botPrior.json v${version}: ${model.samples} samples, top1 ${ev.top1.toFixed(3)}, regret ${ev.regret.toFixed(2)}`);
  } else {
    log(`dry-run: would publish v${version} (${model.samples} samples, top1 ${ev.top1.toFixed(3)})`);
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, `report-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(report, null, 2) + '\n');
  return 0;
}

process.exit(await main());
