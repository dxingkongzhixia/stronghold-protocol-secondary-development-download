// test/keel/graph.test.js — module graph and plugin order (shared/keel/graph.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKeelGraph, orderPlugins } from '../../shared/keel/index.js';

const manifest = (over = {}) => ({
  manifest: 3,
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  app: '*',
  api: { content: 1, sim: 1 },
  scope: ['room'],
  trust: 'sandbox',
  modules: [
    { kind: 'content', files: ['content/a.json'], permissions: ['content.define'], provides: ['enemy:demo:guard'] },
    { kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.damage.write', 'sim.rng'], consumes: ['enemy:demo:guard'] },
  ],
  ...over,
});

test('the graph unions modules, capabilities and provides/consumes', () => {
  const { graph, problems } = buildKeelGraph(manifest());
  assert.deepEqual(problems, []);
  assert.deepEqual(graph.kinds, ['content', 'sim']);
  assert.deepEqual(graph.permissions, ['content.define', 'sim.read', 'sim.damage.write', 'sim.rng']);
  assert.deepEqual(graph.provides, ['enemy:demo:guard']);
  assert.deepEqual(graph.consumes, ['enemy:demo:guard']);
  assert.equal(graph.modules[0].id, 'content:content/a.json');
});

test('native.execute is refused outside native trust', () => {
  const r = buildKeelGraph(manifest({
    trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['native.execute'] }],
  }));
  assert.equal(r.graph, null);
  assert.ok(r.problems.some((p) => p.includes('native.execute')));
});

test('native trust warns about the gates', () => {
  const r = buildKeelGraph(manifest({ trust: 'native', modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['native.execute', 'sim.rng'] }] }));
  assert.ok(r.graph);
  assert.ok(r.warnings.some((w) => w.includes('review, lock pin')));
});

test('a sim module without sim.rng warns', () => {
  const r = buildKeelGraph(manifest({ modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read'] }] }));
  assert.ok(r.graph);
  assert.ok(r.warnings.some((w) => w.includes('sim.rng')));
});

test('self order hints and duplicate module ids are problems', () => {
  const self = buildKeelGraph(manifest({ loadAfter: ['demo'] }));
  assert.ok(self.problems.some((p) => p.includes('names itself')));
  const dup = buildKeelGraph(manifest({
    modules: [
      { kind: 'content', files: ['a.json'], permissions: ['content.define'] },
      { kind: 'content', files: ['a.json'], permissions: ['content.define'] },
    ],
  }));
  assert.ok(dup.problems.some((p) => p.includes('both start at')));
});

test('orderPlugins sorts requires/after and reports a cycle', () => {
  const graphs = [
    { id: 'a', order: { requires: ['b'], after: [], before: [], priority: 0 } },
    { id: 'b', order: { requires: ['c'], after: [], before: [], priority: 0 } },
    { id: 'c', order: { requires: [], after: [], before: [], priority: 0 } },
  ];
  const r = orderPlugins(graphs);
  assert.deepEqual(r.order, ['c', 'b', 'a']);
  assert.deepEqual(r.cycles, []);
  const cyc = orderPlugins([
    { id: 'a', order: { requires: ['b'], after: [], before: [], priority: 0 } },
    { id: 'b', order: { requires: ['a'], after: [], before: [], priority: 0 } },
  ]);
  assert.equal(cyc.order.length, 0);
  assert.equal(cyc.cycles.length, 1);
  assert.ok(cyc.problems.some((p) => p.includes('cycle')));
});

test('a missing dependency is reported without inventing it', () => {
  const r = orderPlugins([{ id: 'a', order: { requires: ['ghost'], after: [], before: [], priority: 0 } }]);
  assert.deepEqual(r.order, ['a']);
  assert.deepEqual(r.missing, [{ id: 'a', needs: 'ghost' }]);
  assert.ok(r.problems.some((p) => p.includes('missing plugin')));
});
