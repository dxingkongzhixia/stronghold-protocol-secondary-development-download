// server/keel/v2-script.js — the `sp:sdk@1` compatibility layer.
//
// A v2 script exports `default setup(sp)` and registers kits / enemies / content / meta through the SDK. That is not a
// Keel module: it feeds the existing extension registry (`server/sim/content/extensions.js`) which the battle content
// reads when it installs a battle. This file loads such a script without inventing a new sandbox:
//   - `importScript` (shared/plugins/scriptLoad.js) links `sp:sdk@1` to the real SDK and imports the source;
//   - `runV2Setup` resets, runs setup(sp), seals the registry and returns what it registered.
//
// It is a *pre-battle* hook: call `runV2Setup` before `new Battle(...)`/`battle.start()`, not after. The old loader still
// owns trust, lock pins and consent; this helper does not read or relax those gates.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { importScript } from '../../shared/plugins/scriptLoad.js';
import { createSDK } from '../../shared/plugins/sdk.js';
import { createExtensionRegistry } from '../sim/content/extensions.js';

export class KeelV2Error extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'KeelV2Error';
    this.code = code;
  }
}

/**
 * Import a v2 script source and return its `setup(sp)` function.
 * @param {string} source the script bytes (already read from a verified plugin folder)
 * @param {{ sdkUrl?: string }} [opts]
 */
export async function loadV2Setup(source, opts = {}) {
  if (typeof source !== 'string' || !source.trim()) throw new KeelV2Error('KEEL_V2_SOURCE', 'the script source is empty');
  const mod = await importScript(source, opts.sdkUrl ? { sdkUrl: opts.sdkUrl } : {});
  if (typeof mod.default !== 'function') throw new KeelV2Error('KEEL_V2_SETUP', 'a v2 script must export default setup(sp)');
  return mod.default;
}

/**
 * Read and import a v2 script plugin folder (manifest entry.sim / entry.meta).
 * @param {string} dir
 * @param {{ id: string, permissions?: string[], overrides?: string[], entry?: { sim?: string, meta?: string } }} manifest
 */
export async function loadV2ScriptPlugin(dir, manifest) {
  const rels = [...new Set([manifest?.entry?.sim, manifest?.entry?.meta].filter(Boolean))];
  if (!rels.length) throw new KeelV2Error('KEEL_V2_ENTRY', 'the manifest has no entry.sim / entry.meta');
  const setups = [];
  const sources = new Map();
  for (const rel of rels) {
    const file = path.join(path.resolve(dir), rel);
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch (e) { throw new KeelV2Error('KEEL_V2_READ', `cannot read ${rel}: ${e.message}`); }
    sources.set(rel, source);
    setups.push({ rel, setup: await loadV2Setup(source) });
  }
  // A lock next to the plugin is byte-level tamper detection; no lock keeps the old trust chain's decision.
  let tampered = false;
  const lockFile = path.join(path.resolve(dir), 'plugin.lock.json');
  if (fs.existsSync(lockFile)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      for (const [rel, source] of sources) {
        const expected = lock?.files?.[rel]?.sha256;
        if (typeof expected !== 'string' || expected !== createHash('sha256').update(source).digest('hex')) tampered = true;
      }
    } catch { tampered = true; }
  }
  // One plugin = one sp; sim and meta entries run in declaration order against it (the old loader's order).
  const setup = (sp) => { for (const s of setups) s.setup(sp); };
  return { setup, entry: rels.length === 1 ? rels[0] : rels, setups, manifest, tampered };
}

/**
 * Run one v2 setup against a fresh extension registry.
 * Call before constructing a battle: the content installer reads the registry during construction.
 * @param {{ setup: (sp: any) => void, plugin: { id: string, permissions?: string[], overrides?: string[] }, settings?: object, log?: Function }} opts
 * @returns {{ registrations: { key: string, pluginId: string }[], registry: any }}
 */
export function runV2Setup(opts) {
  return runV2Setups([opts]);
}

/**
 * Run several v2 setups in one transactional registry.
 * The registry is per call (and per match), never the process-wide one: two rooms may run different scripts.
 * @param {{ setup: (sp: any) => void, plugin: { id: string, permissions?: string[], overrides?: string[] }, settings?: object, log?: Function }[]} items
 * @param {{ registry?: any }} [opts]
 */
export function runV2Setups(items, { registry = createExtensionRegistry() } = {}) {
  if (!Array.isArray(items) || !items.length) throw new KeelV2Error('KEEL_V2_SETUP', 'runV2Setups needs at least one setup');
  registry.reset();
  try {
    for (const item of items) {
      const { setup, plugin, settings = {}, log = () => {}, tampered = false } = item ?? {};
      if (typeof setup !== 'function') throw new KeelV2Error('KEEL_V2_SETUP', 'setup is not a function');
      if (tampered) throw new KeelV2Error('KEEL_V2_LOCK', `${plugin?.id ?? 'plugin'}: script bytes do not match plugin.lock.json`);
      if (!plugin || typeof plugin.id !== 'string') throw new KeelV2Error('KEEL_V2_PLUGIN', 'plugin.id is required');
      const sp = createSDK({ id: plugin.id, permissions: plugin.permissions ?? [], overrides: plugin.overrides ?? [] }, { settings, log, registry });
      const result = setup(sp);
      if (result && typeof result.then === 'function') throw new KeelV2Error('KEEL_V2_ASYNC', 'setup must be synchronous');
    }
  } catch (e) {
    registry.reset();
    throw e instanceof KeelV2Error ? e : new KeelV2Error(e.code ?? 'KEEL_V2_SETUP', e.message);
  }
  registry.seal();
  return { registrations: registry.registrations(), registry };
}

/** True for a manifest-2 script/trusted plugin (the input of this layer). */
export const isV2Script = (manifest) => !!manifest && manifest.manifest === 2 && (manifest.class === 'script' || manifest.class === 'trusted') && !!manifest.entry;
