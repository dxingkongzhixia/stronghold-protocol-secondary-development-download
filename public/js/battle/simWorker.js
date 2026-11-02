// A module Worker with its own response CSP. No fetch: checked content bytes/data arrive from the page.
import { createSimWorker } from './simWorkerRuntime.js';

const dispatch = createSimWorker();
// Serialize asynchronous boot/start/control calls; a second command never observes half-installed content.
let queue = Promise.resolve();
globalThis.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try { globalThis.postMessage({ id: data.id, value: await dispatch(data.method, data.args) }); }
    catch (e) {
      globalThis.postMessage({ id: data.id, error: {
        code: e.code || 'PLUGIN_WORKER_FAILED',
        message: String(e.message || e).slice(0, 300),
        // SES evaluates `keel/<id>/<entry>` with a sourceURL; the stack is what maps the failure back to the module.
        stack: String(e.stack || '').slice(0, 4000),
      } });
    }
  });
};
