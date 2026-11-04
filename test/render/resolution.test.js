// The render resolution policy (public/js/render/app/host.js): a phone / tablet keeps its own DPR at high quality and
// the adaptive load scale never drops below 0.8 on a coarse pointer (the "blurry operators" the owner reported on a
// phone: 0.55 × a 3× screen = a 1.65× buffer, while the desktop floor is fine at 2×).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityResolution, loadRenderScale } from '../../public/js/render/app/host.js';

test('qualityResolution: a coarse pointer at high keeps the device DPR (3–4), desktops keep the table', () => {
  assert.equal(qualityResolution('high', true, 3), 3, 'a 3× phone is not upscaled from a 2× buffer');
  assert.equal(qualityResolution('high', true, 3.5), 3.5, '3.5× phones too');
  assert.equal(qualityResolution('high', true, 4.5), 4, 'absurd DPRs stay capped at 4');
  assert.equal(qualityResolution('high', false, 3), 2, 'desktop keeps the 2 cap');
  assert.equal(qualityResolution('medium', true, 3), 1.5, 'the quality choice still wins');
  assert.equal(qualityResolution('low', true, 3), 1);
  assert.equal(qualityResolution('weird', false, 3), 2, 'unknown quality → the default cap');
});

test('loadRenderScale: the phone floor is 0.8 (legible units), the desktop table is unchanged', () => {
  assert.deepEqual([0, 1, 2, 3].map((l) => loadRenderScale(l, true)), [1, 0.9, 0.82, 0.8]);
  assert.deepEqual([0, 1, 2, 3].map((l) => loadRenderScale(l, false)), [1, 0.82, 0.68, 0.55]);
  // the worst phone case still renders above 2.4× CSS pixels (was 1.65× before the fix)
  const worst = qualityResolution('high', true, 3) * loadRenderScale(3, true);
  assert.ok(worst >= 2.4, `worst phone resolution ${worst}`);
});
