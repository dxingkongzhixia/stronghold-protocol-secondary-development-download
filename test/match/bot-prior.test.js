// test/match/bot-prior.test.js — the trained bot prior: the family signature, the candidate ordering (which candidates
// the rehearsal budget simulates), the fail-safe fallbacks, and the hot reload.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { configurePrior, priorStatus, rankPlans, planFamily, currentPrior, reloadPrior, PRIOR_SCHEMA } from '../../server/match/botPrior.js';

const dirs = [];
const tmpFile = (body) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sp-prior-'));
  dirs.push(dir);
  const f = path.join(dir, 'botPrior.json');
  if (body !== undefined) writeFileSync(f, JSON.stringify(body));
  return f;
};
const m = { stageId: 'act2autochess_m01', round: 5 };
const plan = (entries) => new Map(entries);
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('planFamily', () => {
  test('a coarse 3×5 band signature: same region → same family, far apart → different', () => {
    const a = plan([[1, '2,2'], [2, '2,3']]);
    const b = plan([[9, '2,3'], [8, '2,2']]);     // same cells, different uids/order
    assert.equal(planFamily(a), planFamily(b));
    const far = plan([[1, '11,19'], [2, '11,20']]);
    assert.notEqual(planFamily(a), planFamily(far));
    assert.match(planFamily(a), /^[0-9a-f]{10}$/);
  });
});

describe('rankPlans', () => {
  test('no prior loaded → the heuristic order is returned unchanged (and counted as a fallback)', () => {
    configurePrior({ file: tmpFile(), enabled: true });
    const plans = [plan([[1, '2,2']]), plan([[1, '9,9']]), plan([[1, '5,5']])];
    const out = rankPlans(m, plans);
    assert.deepEqual(out.map(planFamily), plans.map(planFamily));
    assert.equal(priorStatus().fallbacks, 1);
  });

  test('a loaded prior orders by its mean, keeps the heuristic first, and puts unseen families last', () => {
    const p1 = plan([[1, '2,2']]);
    const p2 = plan([[1, '9,9']]);
    const p3 = plan([[1, '5,5']]);
    const fam = (p) => planFamily(p);
    const file = tmpFile({
      schemaVersion: PRIOR_SCHEMA, version: 1, trainedAt: '2026-10-17', samples: 40,
      byKey: { [`${m.stageId}|${m.round}`]: { [fam(p1)]: { n: 10, mean: 1 }, [fam(p3)]: { n: 10, mean: 9 } } },
    });
    configurePrior({ file, enabled: true });
    assert.ok(currentPrior(), 'the table loaded');
    // p1 (mean 1) is first because it is the heuristic's pick; p3 (mean 9) comes before p2 (unseen)
    const out = rankPlans(m, [p1, p2, p3]);
    assert.deepEqual(out.map(fam), [fam(p1), fam(p3), fam(p2)]);
    assert.equal(priorStatus().applied, 1);
  });

  test('an invalid or missing file keeps the previous table (fail-safe) and reports it', () => {
    const good = tmpFile({ schemaVersion: PRIOR_SCHEMA, version: 2, trainedAt: 'x', samples: 5, byKey: {} });
    configurePrior({ file: good, enabled: true });
    assert.equal(currentPrior()?.version, 2);
    writeFileSync(good, JSON.stringify({ schemaVersion: 999, version: 3, byKey: {} }));
    utimesSync(good, new Date(), new Date(Date.now() + 5000));
    reloadPrior();                        // the per-prep hot reload, not a re-configure
    assert.equal(currentPrior()?.version, 2, 'the mismatched schema is refused');
    assert.match(String(priorStatus().lastError), /schema/);
    configurePrior({ file: path.join(path.dirname(good), 'missing.json'), enabled: true });
    assert.equal(currentPrior(), null);
    assert.equal(priorStatus().loaded, false);
  });

  test('SP_BOT_PRIOR=off equivalent: disabled configuration never ranks', () => {
    const file = tmpFile({ schemaVersion: PRIOR_SCHEMA, version: 1, trainedAt: 'x', samples: 9, byKey: {} });
    configurePrior({ file, enabled: false });
    assert.equal(priorStatus().enabled, false);
    const plans = [plan([[1, '2,2']]), plan([[1, '9,9']])];
    assert.deepEqual(rankPlans(m, plans).map(planFamily), plans.map(planFamily));
  });
});
