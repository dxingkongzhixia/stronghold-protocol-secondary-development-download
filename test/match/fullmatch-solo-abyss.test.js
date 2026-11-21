// test/match/fullmatch-solo-abyss.test.js — solo ABYSS, the real simulation to RESULT with zero errors. Split from
// fullmatch.test.js (one difficulty per file) so the four difficulties run in parallel under --test-concurrency.
import { test, after } from 'node:test';
import { SEEDS, runFull, reportSimIssues } from './fullmatchRun.js';

after(reportSimIssues);

test(`solo ABYSS: ${SEEDS} seeds to RESULT with zero errors`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) runFull({ mode: 'solo', difficulty: 'ABYSS', humans: 1, bots: 0, seed });
});
