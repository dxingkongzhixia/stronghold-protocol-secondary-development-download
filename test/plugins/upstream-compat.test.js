// Mainline 0.3.1 plugin compatibility: the fork must read Manifest 2 plugins made for
// `>=0.3.0 <0.4.0` (the app-range warning is expected) and compose their content once the
// server owner's `allowIncompatible` policy admits them. Fixtures: test/fixtures/plugins/upstream-0.3.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(ROOT, 'test/fixtures/plugins/upstream-0.3.1');

function registry() {
  return createPluginRegistry({
    publicDir: path.join(ROOT, 'public'),
    dataDir: path.join(ROOT, 'data'),
    packsDir: path.join(ROOT, 'packs'),
    pluginsDir: FIXTURES,
  }, { app: '0.4.0', log: { info() {}, warn() {} } });
}

test('mainline 0.3.1 content and offers plugins load, then compose under allowIncompatible', () => {
  const reg = registry();
  for (const id of ['data-demo', 'offers-demo']) {
    const p = reg.plugin(id);
    assert.ok(p, `${id} is discovered`);
    assert.equal(p.status, 'loaded', `${id} loads`);
    assert.equal(p.manifest.compatible, false, `${id} keeps its app-range warning`);
    const blocked = buildContentSet({ registry: reg, ids: [id] });
    assert.ok(blocked.problems?.length, `${id} is refused without the owner policy`);
  }

  const data = buildContentSet({ registry: reg, ids: ['data-demo'], allowIncompatible: true });
  assert.deepEqual(data.problems, []);
  const demoId = Object.keys(data.data.chess).find((id) => id.includes('data_demo_guard'));
  assert.ok(demoId, 'the content operator is composed');
  assert.ok(data.data.bonds?.deputShip, 'the official bond patch is applied');

  // A real battle, not only a composition: the mainline operator's stats, kit and asset ref must load.
  const trialData = new DataSource({
    chess: data.data.chess, enemies: data.data.enemies, tokens: data.data.tokens,
    stages: data.data.stages, waves: data.data.waves,
  }, getDefaultSource());
  const h = makeBattle({ data: trialData, units: [{ chessId: demoId, row: 10, col: 5 }], timeLimit: 1, autoFinish: false });
  h.step();
  assert.equal(h.b.errors.length, 0, 'the mainline content operator fights without engine errors');
  h.run(1);
  h.v?.destroy?.();
  h.b?.dispose?.();

  const offers = buildContentSet({ registry: reg, ids: ['offers-demo'], allowIncompatible: true });
  assert.deepEqual(offers.problems, []);
  assert.ok(JSON.stringify(offers.offers || []).includes('supplies'), 'the offers part reaches the content set');
});
