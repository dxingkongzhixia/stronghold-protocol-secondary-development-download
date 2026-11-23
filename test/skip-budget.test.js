// test/skip-budget.test.js — the skip budget (docs/TESTING.md §7): skips may only go down.
//
// A full `npm test` reports **91 skipped** today (the number a person reads), but that count is what one run happens to
// reach: a CI shard only sees its own slice, and a suite-level `{ skip: !CHROME }` hides every test inside it behind one
// marker. So the gate counts the *source markers* instead — every `skip:` option and `.skip(` call under test/ and
// plugins/_template — and forbids new ones. Removing a skip is always welcome; when the number drops, lower BUDGET
// below to keep the new floor (never raise it to make a red pass).
//
// Adding a browser suite's standard `{ skip: !ENABLED && 'set SP_E2E=1 …' }` gate therefore needs an equivalent removal,
// which is the point: a new skip is a decision, not an accident.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
/** Static skip markers allowed in the tree (2026-11-23). Only ever lower this.
 * It counts skips that carry a written reason (`skip: '…'`, `t.skip(`), not the structural environment gates
 * (`skip: !ENABLED && …`), which are how every browser suite states it needs Chrome. */
export const BUDGET = 44;
const SELF = path.join(ROOT, 'test', 'skip-budget.test.js');
const MARKER = /\bskip:\s*['"`]|\.skip\(/g;

/** Every test file under `dir` (recursive), as absolute paths. */
function testFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(full));
    else if (/\.(test\.js|mjs)$/.test(entry.name) && full !== SELF) out.push(full);
  }
  return out;
}

const files = [...testFiles(path.join(ROOT, 'test')), ...testFiles(path.join(ROOT, 'plugins', '_template'))];
const hits = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    MARKER.lastIndex = 0;
    if (MARKER.test(line)) hits.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}`);
  });
}
if (process.env.SP_SKIP_BUDGET_REPORT) console.log(`[skip-budget] ${hits.length} markers in ${files.length} files`);

test('the skip budget holds: no new skip markers (only down)', () => {
  assert.ok(hits.length <= BUDGET,
    `${hits.length} skip markers > budget ${BUDGET}: remove a skip or justify it and lower the floor in test/skip-budget.test.js\n${hits.join('\n')}`);
});
