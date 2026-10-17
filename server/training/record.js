// server/training/record.js — what the match engine hands the training store, and the delegation sampling gate.
//
// The engine calls `recordRehearsal(m, ps, job)` once a SERVER-RUN bot rehearsal finishes (`botPrepEndSteps`). It builds
// one compact row: the prep digest, the candidate layouts by hash and the shared rehearsal's own per-candidate scores
// (`server/sim/rehearsal.js` RehearsalScore.results). Nothing here is trusted from a browser — a delegated rehearsal
// returns an index only, so it yields no labels and is not recorded.
//
// `shouldSampleLocally` keeps labels flowing while host delegation is on: a deterministic one-in-N prep is kept on the
// server (it rehearses and records there), the rest are delegated as usual. The sample is stable per (seed, round,
// seat) so re-running a match reproduces the same choice.
import { createHash } from 'node:crypto';

/** The current sink (`setTrainingSink`), null when training is off. */
let sink = null;

/** @param {null | ((row: object) => void)} fn */
export function setTrainingSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

/** Whether anything would be recorded (the boot report / tests read this). */
export function trainingEnabled() {
  return !!sink;
}

/** `SP_TRAINING_SAMPLE`: the fraction of bot preps rehearsed on the server while delegation is on (default 0.25). */
export function trainingSampleRate(env = process.env) {
  if (!sink) return 0;
  const raw = env.SP_TRAINING_SAMPLE;
  const v = raw == null || raw === '' ? 0.25 : Number(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.25;
}

/**
 * Deterministic in [0, 1) from the match seed, round and bot seat: the same prep always falls on the same side, so a
 * seeded match (tests, `tools/matchrun.mjs`) behaves identically on every run.
 */
function unitHash(seed, round, seat) {
  const h = createHash('sha1').update(`${seed}|${round}|${seat}|rehearsal-sample`).digest();
  return h.readUInt32BE(0) / 2 ** 32;
}

/**
 * Whether this prep should skip delegation (and keep its labels on the server).
 * @param {{ seed?: any, round?: number }} m
 * @param {{ seat?: number }} ps
 * @param {number} rate 0..1
 */
export function shouldSampleLocally(m, ps, rate) {
  if (!(rate > 0)) return false;
  if (rate >= 1) return true;
  return unitHash(m?.seed, m?.round, ps?.seat) < rate;
}

/**
 * Short, stable id of a candidate layout: the sorted `uid:key` pairs (`bot.js` plans are `Map<uid, 'r,c'>`), so the same
 * arrangement always hashes the same and the row stays compact.
 * @param {Map<number, string> | [number, string][]} plan
 */
export function layoutHash(plan) {
  const entries = plan instanceof Map ? [...plan.entries()] : Array.isArray(plan) ? plan : [];
  const text = entries.map(([uid, key]) => `${uid}:${key}`).sort().join(',');
  return createHash('sha1').update(text).digest('hex').slice(0, 12);
}

/** The active bonds of a seat as `{ active, layers }` (no names: the digest is all the model needs). */
function bondDigest(ps) {
  const bonds = ps?.bonds && typeof ps.bonds === 'object' ? Object.values(ps.bonds) : [];
  let active = 0;
  let layers = 0;
  for (const b of bonds) {
    if (!b) continue;
    if (b.active) active++;
    layers += Number(b.layers) || 0;
  }
  return { active, layers };
}

/**
 * The row for one finished server-side rehearsal (`job` = `createRehearsalJob`'s object with `plans`, `best`, `results`).
 * @returns {object}
 */
export function rehearsalRow(m, ps, job) {
  const plans = Array.isArray(job?.plans) ? job.plans : [];
  const results = Array.isArray(job?.results) ? job.results : [];
  const byIndex = new Map(results.map((r) => [r.i, r]));
  const chosen = plans.indexOf(job?.best);
  return {
    mode: m?.modeId ?? null,
    difficulty: m?.difficulty ?? null,
    stage: m?.stageId ?? null,
    round: m?.round ?? null,
    seat: ps?.seat ?? null,
    seed: m?.seed != null ? String(m.seed) : '',
    state: {
      funds: Number(ps?.funds) || 0,
      level: ps?.shop?.level ?? null,
      bonds: bondDigest(ps),
      board: ps?.board?.size ?? 0,
      hand: Array.isArray(ps?.hand) ? ps.hand.filter(Boolean).length : 0,
      temp: Array.isArray(ps?.temp) ? ps.temp.filter(Boolean).length : 0,
    },
    candidates: plans.map((plan, i) => {
      const r = byIndex.get(i);
      return { i, layout: layoutHash(plan), ...(r ? { leaks: r.leaks, kills: r.kills, score: r.score } : {}) };
    }),
    chosen: chosen >= 0 ? chosen : null,
    source: 'server',
  };
}

/** Hand one finished server-side rehearsal to the sink (never throws: training must not affect a match). */
export function recordRehearsal(m, ps, job) {
  if (!sink) return false;
  if (!job || !job.done) return false;
  if (!Array.isArray(job.results) || !job.results.length) return false;
  try {
    sink(rehearsalRow(m, ps, job));
    return true;
  } catch {
    return false;
  }
}
