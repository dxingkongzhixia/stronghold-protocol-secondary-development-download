// The module / permission matrix (docs/keel/MODULES.md) is an author-facing contract. Keep it in sync with the
// code tables: every module kind, capability, UI slot, stable point and experimental point must be named there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KEEL_MODULE_KINDS, KEEL_PERMISSIONS } from '../../shared/keel/manifest.js';
import { KEEL_EXPERIMENTAL_POINTS, KEEL_STABLE_POINTS } from '../../shared/keel/contracts.js';
import { UI_SLOT_IDS } from '../../shared/plugins/manifest.js';

const doc = fs.readFileSync(new URL('../../docs/keel/MODULES.md', import.meta.url), 'utf8');

test('the matrix lists every module kind, capability, slot and contract point', () => {
  for (const kind of KEEL_MODULE_KINDS) {
    assert.match(doc, new RegExp(`\\|\\s*\`${kind}\`\\s*\\|`), `module kind ${kind} is missing from the kind table`);
  }
  for (const cap of Object.keys(KEEL_PERMISSIONS)) {
    assert.ok(doc.includes(`\`${cap}\``), `capability ${cap} is missing from the matrix`);
  }
  for (const slot of UI_SLOT_IDS) assert.ok(doc.includes(slot), `UI slot ${slot} is missing`);
  for (const p of KEEL_STABLE_POINTS) assert.ok(doc.includes(`\`${p.point}\``), `stable point ${p.point} is missing`);
  for (const p of KEEL_EXPERIMENTAL_POINTS) assert.ok(doc.includes(`\`${p}\``), `experimental point ${p} is missing`);
});

test('content.extend is a real content capability (C2 aligned)', () => {
  assert.deepEqual(KEEL_PERMISSIONS['content.extend'], ['content']);
  assert.match(doc, /`content\.extend`/);
});
