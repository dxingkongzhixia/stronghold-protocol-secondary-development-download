// test/match/training-record.test.js — the bot-rehearsal training samples: the row the engine builds, the store that
// keeps them (its own SQLite file, batched, best-effort), and the deterministic sampling that keeps server-side labels
// flowing while host delegation is on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TrainingStore, TRAINING_MIN_FREE_BYTES } from '../../server/training/store.js';
import { layoutHash, rehearsalRow, recordRehearsal, setTrainingSink, shouldSampleLocally, trainingSampleRate } from '../../server/training/record.js';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'sp-training-'));

describe('rehearsalRow', () => {
  test('one compact row: the prep digest, one hashed layout per candidate and the rehearsal scores', () => {
    const plans = [new Map([[1, '3,4'], [2, '3,5']]), new Map([[1, '6,4'], [2, '6,5']])];
    const job = { done: true, plans, best: plans[1], results: [{ i: 0, leaks: 2, kills: 7, score: -1993 }, { i: 1, leaks: 0, kills: 5, score: 5 }] };
    const ps = { seat: 2, funds: 30, shop: { level: 4 }, bonds: { a: { active: true, layers: 2 }, b: { active: false, layers: 1 } }, board: new Map([['3,4', {}]]), hand: [null, {}], temp: [null] };
    const m = { modeId: 'coop', difficulty: 'HARD', stageId: 'act2autochess_m01', round: 5, seed: 1234 };
    const row = rehearsalRow(m, ps, job);
    assert.equal(row.mode, 'coop');
    assert.equal(row.round, 5);
    assert.equal(row.seat, 2);
    assert.deepEqual(row.state, { funds: 30, level: 4, bonds: { active: 1, layers: 3 }, board: 1, hand: 1, temp: 0 });
    assert.equal(row.candidates.length, 2);
    assert.equal(row.candidates[0].layout, layoutHash(plans[0]));
    assert.equal(row.candidates[1].score, 5);
    assert.equal(row.chosen, 1, 'the chosen candidate is the index of the winning plan');
    assert.equal(row.source, 'server');
    // the same plan hashes the same, in any entry order
    assert.equal(layoutHash(new Map([[2, '3,5'], [1, '3,4']])), layoutHash(plans[0]));
  });

  test('nothing is recorded without a finished, scored server rehearsal', () => {
    const rows = [];
    setTrainingSink((r) => rows.push(r));
    assert.equal(recordRehearsal({ seed: 1 }, { seat: 1 }, null), false);
    assert.equal(recordRehearsal({ seed: 1 }, { seat: 1 }, { done: false, plans: [], results: [] }), false);
    assert.equal(recordRehearsal({ seed: 1 }, { seat: 1 }, { done: true, plans: [new Map()], best: new Map(), results: [] }), false);
    setTrainingSink(null);
    assert.equal(rows.length, 0);
  });
});

describe('sampling gate', () => {
  test('deterministic per (seed, round, seat); 0 never, 1 always', () => {
    const m = { seed: 99, round: 3 };
    const ps = { seat: 1 };
    assert.equal(shouldSampleLocally(m, ps, 0), false);
    assert.equal(shouldSampleLocally(m, ps, 1), true);
    assert.equal(shouldSampleLocally(m, ps, 0.25), shouldSampleLocally(m, ps, 0.25));
    // different rounds spread over the range (not all on one side)
    const hits = new Set();
    for (let r = 1; r <= 40; r++) hits.add(shouldSampleLocally({ seed: 99, round: r }, ps, 0.5));
    assert.deepEqual([...hits].sort(), [false, true]);
  });

  test('the rate is off when training is off and reads SP_TRAINING_SAMPLE otherwise', () => {
    assert.equal(trainingSampleRate({}), 0, 'no sink: no server sampling for labels');
    setTrainingSink(() => {});
    assert.equal(trainingSampleRate({}), 0.25, 'default quarter');
    assert.equal(trainingSampleRate({ SP_TRAINING_SAMPLE: '0' }), 0);
    assert.equal(trainingSampleRate({ SP_TRAINING_SAMPLE: '2' }), 1, 'clamped');
    assert.equal(trainingSampleRate({ SP_TRAINING_SAMPLE: 'junk' }), 0.25);
    setTrainingSink(null);
  });
});

describe('TrainingStore', () => {
  test('opens lazily, batches rows into its own SQLite file and reports counters', () => {
    const dir = tmp();
    try {
      const file = path.join(dir, 'training.db');
      const store = new TrainingStore({ file, flushEvery: 2 });
      assert.equal(existsSync(file), false, 'no file until the first row');
      const row = { mode: 'solo', difficulty: 'NORMAL', stage: 'x', round: 1, seat: 1, seed: '5', state: { funds: 1 }, candidates: [{ i: 0, layout: 'abc', score: 1 }], chosen: 0, source: 'server' };
      assert.equal(store.record(row), true);
      assert.equal(store.record(row), true);           // flushEvery 2 → flushed here
      assert.equal(store.rows(), 2);
      store.record(row);
      assert.equal(store.flush(), 1);
      assert.equal(store.rows(), 3);
      const s = store.stats();
      assert.equal(s.open, true);
      assert.equal(s.recorded, 3);
      assert.equal(s.written, 3);
      assert.equal(s.dropped, 0);
      store.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('the disk guard drops rows instead of risking the game (a huge minimum free space)', () => {
    const dir = tmp();
    try {
      const store = new TrainingStore({ file: path.join(dir, 'training.db'), minFreeBytes: Number.MAX_SAFE_INTEGER });
      assert.equal(store.record({ candidates: [], source: 'server' }), false);
      assert.equal(store.stats().dropped, 1);
      store.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
