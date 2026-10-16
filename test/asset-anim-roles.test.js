// test/asset-anim-roles.test.js — data/assets.json's animation roles vs the resolver that builds them.
//
// The roles are written by tools/fetch-assets.mjs from each skeleton's clip names (tools/assets/anim-roles.mjs) plus the
// prefab-sourced fix tables (tools/assets/spine.mjs PREFAB_SPINE_ROLES / LOCAL_SPINE_ROLES). tools/refresh-anim-roles.mjs
// re-derives them OFFLINE from the manifest's own committed `animations` (the skeleton's clip names + durations), so the
// committed roles can be checked without the network: a resolver change or a fix entry that was not rebuilt shows up here.
//
// 澄闪 (char_377_gdglow): her client prefab's animation table (chararts/char_377_gdglow.ab `_animations`) maps
// `Attack` (loop 0), `Attack_Start` and `Attack_End` as one attack sequence and her skeleton has no `Attack_Loop` (the
// only roster model with that shape), so the plain `Attack` alone lost the wind-up and the recovery (owner report,
// 2026-10-16). The fix table pins the triple.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

test('an operator\'s manifest roles match the resolver + the prefab fix tables (node tools/refresh-anim-roles.mjs)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'refresh-anim-roles.mjs')], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /already up to date/, `the committed roles are stale: ${r.stdout}`);
});

test('澄闪\'s attack is the official Attack_Start → Attack → Attack_End sequence (client prefab `_animations`)', () => {
  for (const face of ['front', 'back']) {
    const a = manifest.chars.char_377_gdglow.spine[face].anims.attack;
    assert.deepEqual(a, { begin: 'Attack_Start', loop: 'Attack', end: 'Attack_End' }, `${face}: ${JSON.stringify(a)}`);
  }
});
