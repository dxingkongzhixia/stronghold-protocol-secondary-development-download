// Native Keel modules run in the simulation Worker (public/js/battle/simWorker.js, D9), never on the page: the Worker's
// own realm is isolated from the page and its CSP (SIM_WORKER_CSP) permits SES. The Node harness takes the same path
// with a `file:` base. The page never compiles or executes native code, so a SES escape cannot reach the game document or
// its storage, and a plugin loop cannot block the main thread.
import { initializeSandbox, loadKeelModule } from '../../../shared/plugins/sandbox.js';
import { sha256Hex } from '../../../shared/sha256.js';

let localParse = null;

function compileLocal(plugins, base) {
  if (!localParse) {
    const root = new URL(base, globalThis.location?.href ?? 'file:///');
    localParse = (async () => {
      await initializeSandbox({
        loadSES: () => import(new URL('../vendor/ses.umd.js', root).href),
        loadMath: () => import(new URL('detmath.js', root).href),
      });
      const { parse } = await import(new URL('../vendor/acorn.mjs', root).href);
      return parse;
    })();
  }
  return localParse.then((parse) => plugins.map((p) => ({
    manifest: { manifest: 3, id: p.id, version: p.version ?? '0.0.0', ...(p.state ? { state: p.state } : {}) },
    modules: p.modules.map((m) => {
      if (typeof m.source !== 'string') throw new Error(`${p.id}: ${m.entry} has no checked source`);
      if (typeof m.sha256 === 'string' && sha256Hex(new TextEncoder().encode(m.source)) !== m.sha256) {
        throw new Error(`${p.id}: ${m.entry} does not match its pinned hash`);
      }
      return { kind: m.kind, entry: m.entry, permissions: Array.isArray(m.permissions) ? m.permissions : [],
        ...(m.state ? { state: m.state } : {}),
        code: loadKeelModule(m.source, { parse }) };
    }),
  })));
}

/** The hidden same-origin frame is gone (D9): native modules are compiled by the simulation Worker only. */

/**
 * Compile a content set's native modules into the shapes `attachBattleKeel` takes.
 * @param {{ id: string, version?: string|null, state?: any, modules: { kind: string, entry: string, source: string, sha256?: string }[] }[]} plugins
 * @param {{ base?: string }} [opts]
 */
export async function loadKeelPlugins(plugins, { base = '/sim/' } = {}) {
  // Only a Worker (or the Node harness) may compile native code; a browser document must never run SES lockdown.
  if (typeof document !== 'undefined') throw new Error('native Keel modules run in the simulation Worker (D9)');
  return compileLocal(plugins, base);
}
