// A mainline 0.3.1 SCRIPT plugin: code that runs in a battle, not data. The fork must read it, keep it behind the
// owner's `allowIncompatible` policy, and carry its script into the content set once admitted. Fixture source: the
// repository's own script template shape (`plugins/_template/script`), with a mainline app range — the same bytes a
// mainline 0.3.x server would load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scriptFixture } from '../helpers/scriptFixtures.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';

const guard = {
  ...JSON.parse(fs.readFileSync(new URL('../../plugins/_template/script/guard.json', import.meta.url), 'utf8')),
  charId: 'char_x_mainline_script_guard',
  // a plugin's own records are namespaced by its id (shared/plugins/dataUtils.js recordId)
  skills: [{ ...JSON.parse(fs.readFileSync(new URL('../../plugins/_template/script/guard.json', import.meta.url), 'utf8')).skills[0], skillId: 'skx_mainline_script_guard_1' }],
};

/** The smallest script kit: no probes, no engine objects — registers a passive skill for the fixture operator. */
const SOURCE = `import {kit} from 'sp:sdk@1'; export default sp => {
  sp.kits.register('char_x_mainline_script_guard', () => ({ skill: { kind: 'passive', mods: { atkPct: kit.num(0.1) } } }));
}`;

test('mainline 0.3.1 script plugin: read, refused without the owner flag, then composed with its script', (t) => {
  const f = scriptFixture(t, { mode: 'sandbox' });
  f.put('mainline-script', SOURCE, {
    app: '>=0.3.0 <0.4.0', permissions: ['sim.code', 'data.add'], operators: ['guard.json'],
  }, { 'guard.json': guard });

  const p = f.registry.plugin('mainline-script');
  assert.ok(p, 'the folder is discovered');
  assert.equal(p.status, 'loaded', 'a script folder is still read: the refusal is the owner policy, not the scanner');
  assert.equal(p.manifest.compatible, false, 'code plugins keep the strict app check on this fork');

  const refused = buildContentSet({ registry: f.registry, ids: ['mainline-script'] });
  assert.ok(refused.problems.length, 'no room may compose it until the owner admits it');

  const built = buildContentSet({ registry: f.registry, ids: ['mainline-script'], allowIncompatible: ['mainline-script'] });
  assert.deepEqual(built.problems, [], 'the owner flag admits it');
  assert.ok(Object.keys(built.data.chess || {}).length, 'its operator record composes');
  assert.equal((built.scripts || []).length, 1, 'its script travels with the content set');
  assert.equal(built.scripts[0].id, 'mainline-script');
  assert.match(built.scripts[0].sources['index.js'], /sp\.kits\.register\('char_x_mainline_script_guard'/);
});
