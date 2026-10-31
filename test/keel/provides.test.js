// test/keel/provides.test.js — `provides` is attributed from records and `add` patch operations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providesFromContent, withContentProvides } from '../../shared/keel/index.js';

test('records and add patches become <kind>:<id> provides', () => {
  const provides = providesFromContent({
    records: [
      { table: 'enemies', id: 'enemy_x_demo' },
      { table: 'operators', id: 'char_x_demo' },
      { table: 'tokens', id: 'token_x_demo' },
    ],
    patches: [{ ops: [
      { op: 'merge', file: 'config', path: ['modes', 'mode_single_normal', 'bossWeights'], value: {} },
      { op: 'add', file: 'config', path: ['modes'], id: 'mode_x_demo' },
      { op: 'add', file: 'bosses', id: 'boss_x_demo' },
    ] }],
  });
  assert.deepEqual(provides, ['boss:boss_x_demo', 'enemy:enemy_x_demo', 'mode:mode_x_demo', 'operator:char_x_demo', 'token:token_x_demo']);
});

test('withContentProvides adds to the content module only, without mutating the input', () => {
  const manifest = { modules: [{ kind: 'content', files: ['a.json'] }, { kind: 'asset', files: ['a.png'] }] };
  const out = withContentProvides(manifest, ['enemy:enemy_x_demo']);
  assert.deepEqual(out.modules[0].provides, ['enemy:enemy_x_demo']);
  assert.equal(out.modules[1].provides, undefined);
  assert.equal(manifest.modules[0].provides, undefined);
});
