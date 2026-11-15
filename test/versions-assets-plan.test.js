// test/versions-assets-plan.test.js — the version asset planner (tools/assets/versions.mjs): the presentation union of
// every official version built under data/versions, and the gap audit against the web + committed local manifests. The
// 规程 union is complete except for optional boss/summon handbook icons the client itself does not ship.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionAssetData, presentationUnion, versionAssetGaps, addManifestEntries } from '../tools/assets/versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the union covers the regulation season by art identity', () => {
  const sets = versionAssetData(ROOT);
  assert.deepEqual(sets.map((s) => s.version.id), ['act3autochess@V3_1']);
  const u = presentationUnion(sets);
  assert.ok(Object.keys(u.operators).length >= 141, `${Object.keys(u.operators).length} operators`);
  assert.equal(Object.keys(u.enemies).length, 343);
  assert.equal(Object.keys(u.bands).length, 61);
  assert.equal(Object.keys(u.bonds).length, 26);
  assert.ok(Object.keys(u.items).length >= 70);
  assert.ok(u.moduleTypes.length > 100);
});

test('the gap audit is clean except the optional handbook icons', () => {
  const { versions } = versionAssetGaps(ROOT);
  assert.equal(versions.length, 1);
  const v = versions[0];
  assert.equal(v.id, 'act3autochess@V3_1');
  assert.ok(v.gaps.length <= 30, `${v.gaps.length} gaps`);
  for (const g of v.gaps) {
    assert.deepEqual(g.missing, ['icon'], `${g.kind} ${g.id}: ${g.missing.join(', ')}`);
    assert.ok(['enemy', 'boss'].includes(g.kind), `${g.kind} ${g.id}`);
  }
});

test('addManifestEntries is add-only and recursive', () => {
  const prev = { chars: { a: { avatar: '/a.png' }, b: null }, songs: [1, 2] };
  const next = { chars: { a: { avatar: '/ignored.png', portrait: '/a_1.png' }, c: { avatar: '/c.png' } }, extra: 1 };
  assert.deepEqual(addManifestEntries(prev, next), {
    chars: { a: { avatar: '/a.png', portrait: '/a_1.png' }, b: null, c: { avatar: '/c.png' } }, songs: [1, 2], extra: 1,
  });
});
