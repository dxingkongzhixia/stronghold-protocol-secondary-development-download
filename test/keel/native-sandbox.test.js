// Native Keel modules are confined by SES on the page (public/js/battle/keelSandbox.js): these cases drive the same
// loader inside the production sandbox Worker, where `lockdown` is safe to run, and check what a module can and cannot
// reach. The page document is exercised end to end by test/ui/plugins.e2e.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { WorkerSimHost } from '../../public/js/battle/simHost.js';

function workerFactory() {
  const worker = new Worker(new URL('../helpers/simWorkerNode.mjs', import.meta.url));
  const port = { postMessage: (m) => worker.postMessage(m), terminate: () => worker.terminate() };
  worker.on('message', (data) => port.onmessage?.({ data }));
  worker.on('error', (e) => port.onerror?.(e));
  return port;
}

/** @param {import('node:test').TestContext} t */
function host(t) {
  const h = new WorkerSimHost({ workerFactory });
  t.after(() => h.stop());
  return h;
}

const load = (h, source) => h.rpc('keel', [source], 20000);

test('a worker that stops answering the heartbeat is terminated and reported', async () => {
  let terminated = false;
  const failures = [];
  const port = {
    postMessage: (m) => { if (m.method === 'ping') return; port.onmessage?.({ data: { id: m.id, value: { ok: true } } }); },
    terminate: () => { terminated = true; },
  };
  const h = new WorkerSimHost({ workerFactory: () => port, heartbeatMs: 0, pingTimeoutMs: 50, onFailure: (e) => failures.push(e) });
  h.heartbeat();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(terminated, true, 'the unresponsive worker is terminated');
  assert.equal(failures[0]?.code, 'PLUGIN_WORKER_TIMEOUT');
});

test('a worker that answers the heartbeat stays up', async () => {
  let terminated = false;
  const port = { postMessage: (m) => port.onmessage?.({ data: { id: m.id, value: { ok: true } } }), terminate: () => { terminated = true; } };
  const h = new WorkerSimHost({ workerFactory: () => port, heartbeatMs: 0, pingTimeoutMs: 50 });
  h.heartbeat();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(h.stopped, false);
  assert.equal(terminated, false);
  h.stop();
  assert.equal(terminated, true);
});

test('a native Keel module sees only its compartment: no page globals, no network, no eval', async (t) => {
  const h = host(t);
  const out = await load(h, `
    globalThis.__keelProbe = 1;
    export default {
      setup({ api }) { api.state.patch({ ticks: 0 }); },
      hooks: {
        'sim.tick'(_ctx, api) {
          api.setView({
            ticks: 1,
            document: typeof globalThis.document,
            process: typeof globalThis.process,
            fetch: typeof globalThis.fetch,
            storage: typeof globalThis.localStorage,
            evalType: typeof globalThis.eval,
            hostGlobal: typeof globalThis.__keelProbe,
          });
        },
      },
    };`);
  assert.equal(out.error, undefined, JSON.stringify(out));
  assert.deepEqual(out.keys, ['hooks', 'setup']);
  assert.deepEqual(out.hooks, ['sim.tick']);
  assert.deepEqual(out.view, {
    ticks: 1, document: 'undefined', process: 'undefined', fetch: 'undefined', storage: 'undefined', evalType: 'undefined',
    // the compartment has a global of its own; the Worker's is untouched (this probe is never set there)
    hostGlobal: 'number',
  });
  assert.equal(out.hostGlobal, 'undefined');
});

test('a native Keel module cannot reach shared intrinsics or add globals', async (t) => {
  const h = host(t);
  const proto = await load(h, `export default { setup() { Array.prototype.__keelPwn = 1; } };`);
  assert.ok(proto.error, 'prototype write must fail under lockdown');
  const global = await load(h, `export default { setup() { Object.defineProperty(globalThis, 'fetch', { value: () => 'x' }); } };`);
  assert.ok(global.error, 'a denied global stays denied');
});

test('a native Keel module is self-contained: no static or dynamic imports, default is an object', async (t) => {
  const h = host(t);
  const stat = await load(h, `import x from './x.js'; export default { setup() {} };`);
  assert.equal(stat.error?.code, 'PLUGIN_SANDBOX_IMPORT');
  const dyn = await load(h, `export default { setup() { return import('./x.js'); } };`);
  assert.equal(dyn.error?.code, 'PLUGIN_SANDBOX_SYNTAX');
  const fn = await load(h, `export default function setup() {}`);
  assert.equal(fn.error?.code, 'PLUGIN_SANDBOX_SYNTAX');
  const none = await load(h, `export const x = 1;`);
  assert.equal(none.error?.code, 'PLUGIN_SANDBOX_SYNTAX');
  const empty = await load(h, '');
  assert.equal(empty.error?.code, 'PLUGIN_SANDBOX_SYNTAX');
});
