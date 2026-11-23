// Every `test/ui/*.e2e.test.js` has exactly one lane (docs/TESTING-PLAN.md 4.2): the two CI smoke jobs
// (tools/browser-smoke.mjs RUNS), the asset lane, the native lane, or `LOCAL_ONLY` with a written reason. A new suite
// with no decision fails here instead of quietly joining the tree; a lane naming a deleted file fails too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { RUNS } from '../../tools/browser-smoke.mjs';
import { ASSETS, NATIVE, LOCAL_ONLY } from '../../tools/e2e-lanes.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const smoke = new Set(RUNS.flat().filter((s) => s.endsWith('.js')));
const files = fs.readdirSync(path.join(ROOT, 'test/ui')).filter((f) => f.endsWith('.e2e.test.js')).map((f) => `test/ui/${f}`);

test('every e2e file belongs to exactly one lane, and no lane names a missing file', () => {
  const problems = [];
  for (const file of files) {
    const lanes = [
      smoke.has(file) && 'smoke',
      ASSETS.includes(file) && 'assets',
      NATIVE.includes(file) && 'native',
      LOCAL_ONLY[file] && 'local',
    ].filter(Boolean);
    if (lanes.length !== 1) problems.push(`${file}: ${lanes.join(' + ') || 'no lane'}`);
  }
  const registered = [...smoke, ...ASSETS, ...NATIVE, ...Object.keys(LOCAL_ONLY)];
  for (const file of registered) if (!files.includes(file)) problems.push(`${file}: registered but missing`);
  assert.deepEqual(problems, []);
});
