// server/keel/room-source.js — build the Keel descriptor a room can hand to `Match`/`newBattle`.
//
// A folder opts in by carrying a manifest 3 (`plugin.json` or the `plugin.keel.json` that `keel migrate --write`
// produces). Manifest-2 folders without that file are skipped: their old loader remains the source of truth.
//
// This is the "room level module source" half of M1.5: it does not choose which rooms use it. The lobby/test that
// constructs the Match decides, and `newBattle` attaches only when `KEEL=1` and the descriptor is present.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildKeelGraph, keelToV2, loadKeelModules, readKeelManifest } from '../../shared/keel/index.js';
import { readOffers } from '../plugins/registry.js';
import { listPluginFiles } from '../plugins/registry.js';
import { applyTrust, readScripts } from '../plugins/trusted.js';
import { loadV2ScriptPlugin } from './v2-script.js';
import { loadKeelContent } from './content.js';
import { readNativeCode } from './native-code.js';

/**
 * @param {string} dir a plugin folder
 * @returns {Promise<{ id: string, dir: string, manifest: any, graph: any, modules: any[], problems: string[], warnings: string[] } | null>}
 *   null when the folder has no manifest 3 (a v2 plugin that has not been migrated)
 */
export async function loadKeelPlugin(dir, { code = true } = {}) {
  const absolute = path.resolve(dir);
  const keelFile = path.join(absolute, 'plugin.keel.json');
  const pluginFile = path.join(absolute, 'plugin.json');
  const file = fs.existsSync(keelFile) ? keelFile : pluginFile;
  if (!fs.existsSync(file)) throw new Error(`no plugin.json or plugin.keel.json in ${absolute}`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not JSON: ${e.message}`, { cause: e }); }
  if (raw?.manifest !== 3) return null;
  const id = path.basename(absolute);
  const checked = readKeelManifest(raw, { id });
  if (!checked.manifest) return { id, dir: absolute, manifest: null, graph: null, modules: [], problems: checked.problems, warnings: checked.warnings };
  const graph = buildKeelGraph(checked.manifest, { id });
  // Native trust is the legacy loader's contract (owner review + lock pin + every player's consent). A Keel room never
  // sets room.content.trusted, so running it here would silently skip consent: refuse it and leave the plugin to the
  // old path until the trust chain is ported.
  if (checked.manifest.trust === 'native') {
    return {
      id, dir: absolute, manifest: checked.manifest, graph: graph.graph, modules: [],
      problems: [...checked.problems, 'PLUGIN_KEEL_NATIVE: native trust is not executed on the Keel path; keep this plugin on the legacy loader'],
      warnings: checked.warnings,
    };
  }
  const content = loadKeelContent(absolute, checked.manifest);
  const native = readNativeCode(absolute, checked.manifest, listPluginFiles(absolute));
  const hasNative = native.entries.length > 0;
  const legacy = keelToV2(checked.manifest, { id });
  const offerRead = readOffers(legacy, content);
  const offers = offerRead.offers ?? null;
  const contentProblems = [...(content.dslProblems ?? []), ...offerRead.problems];
  const assets = checked.manifest.modules.find((m) => m.kind === 'asset')?.assets ?? null;
  let ui = null;
  const uiModule = checked.manifest.modules.find((m) => m.kind === 'ui' && m.entry);
  if (uiModule) {
    try { ui = JSON.parse(fs.readFileSync(path.join(absolute, uiModule.entry), 'utf8')); }
    catch { ui = null; }
  }
  if (checked.manifest.compat?.v2Script) {
    const rawLegacy = checked.manifest.legacy ?? {};
    const loaded = await loadV2ScriptPlugin(absolute, { entry: rawLegacy.entry ?? {} });
    const script = readScripts(absolute, legacy, listPluginFiles(absolute));
    return {
      id,
      dir: absolute,
      manifest: checked.manifest,
      graph: graph.graph,
      modules: [],
      v2: {
        setup: loaded.setup,
        entry: loaded.entry,
        script,
        tampered: loaded.tampered,
        plugin: { id, permissions: rawLegacy.permissions ?? [], overrides: rawLegacy.overrides ?? [] },
        settings: checked.manifest.settings ?? {},
      },
      ui,
      content,
      assets,
      offers,
      problems: [...checked.problems, ...graph.problems, ...contentProblems],
      warnings: [...checked.warnings, ...graph.warnings, 'v2Script: the setup(sp) runs in the legacy extension registry before a battle'],
    };
  }
  // `code: 'meta'` loads only match/policy modules (the server's meta runtime); `code: false` loads none (the room map
  // and HTTP process); `true` loads every code module (CLI/tools/tests).
  const modules = code ? await loadKeelModules(checked.manifest, { urlOf: (rel) => pathToFileURL(path.join(absolute, rel)).href,
    ...(code === 'meta' ? { kinds: ['match', 'policy'] } : {}) }) : [];
  return {
    id,
    dir: absolute,
    manifest: checked.manifest,
    graph: graph.graph,
    modules,
    ...(hasNative ? { native } : {}),
    ui,
    content,
    assets,
    offers,
    problems: [...checked.problems, ...graph.problems, ...contentProblems,
      ...(native.parseProblems ?? []).map((p) => `KEEL_PARSE: ${p.entry}:${p.line ?? '?'}: ${p.message}`)],
    warnings: [...checked.warnings, ...graph.warnings],
  };
}

/**
 * Load several plugin folders; v2 folders are skipped, not errors.
 * @param {string[]} dirs
 */
export async function loadKeelRoom(dirs = []) {
  const out = [];
  for (const dir of dirs) {
    const plugin = await loadKeelPlugin(dir);
    if (plugin) out.push(plugin);
  }
  return out;
}

/** A room descriptor for `Match({ keel })`: one manifest + modules per plugin, in order. */
export async function createKeelDescriptor(dirs = []) {
  const plugins = await loadKeelRoom(dirs);
  return plugins.length ? { plugins: plugins.map(({ id, dir, manifest, modules, content, ui, assets, offers, v2 }) => ({ id, dir, manifest, modules, content, ui, assets, offers, ...(v2 ? { v2 } : {}) })) } : null;
}

/**
 * Load every opt-in plugin under a plugins directory into `Map<id, { manifest, modules }>`.
 * A folder without manifest 3 is skipped; a broken one is skipped too (the old loader reports it).
 * @param {string} pluginsDir
 * @param {{ host?: string, mode?: string, log?: any }} [opts]
 */
export async function loadKeelPluginMap(pluginsDir, { host, mode, log } = {}) {
  const map = new Map();
  if (!pluginsDir || !fs.existsSync(pluginsDir)) return map;
  const pending = [];
  const scripts = [];
  for (const name of fs.readdirSync(pluginsDir).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const dir = path.join(pluginsDir, name);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    if (!fs.existsSync(path.join(dir, 'plugin.json')) && !fs.existsSync(path.join(dir, 'plugin.keel.json'))) continue;
    try {
      // no code is imported until the trust gate below says it may run
      const plugin = await loadKeelPlugin(dir, { code: false });
      if (plugin && plugin.manifest && !plugin.problems.length) {
        pending.push(plugin);
        if (plugin.v2?.script) scripts.push({ id: plugin.id, class: 'script', script: plugin.v2.script });
        if (plugin.native?.entries?.length) scripts.push({ id: plugin.id, class: 'script', script: plugin.native });
      }
    } catch { /* the old registry reports it */ }
  }
  if (scripts.length) applyTrust(scripts, { pluginsDir, host, mode, log });
  const denied = new Map(scripts.filter((s) => s.disabled).map((s) => [s.id, s.disabled]));
  for (const plugin of pending) {
    const off = denied.has(plugin.id);
    const native = plugin.native?.entries?.length ? plugin.native : null;
    // A native code plugin is all-or-nothing: without the owner's mode/pin its content must not load either (the room
    // would otherwise show a plugin whose code never runs).
    if (off && native) {
      log?.warn?.(`[keel] ${plugin.id}: native code is not enabled (SP_PLUGIN_SCRIPTS / lock); skipped`);
      continue;
    }
    // a broken native entry is caught before it reaches a browser (parse-only, no execution)
    if (native?.parseProblems?.length) {
      log?.warn?.(`[keel] ${plugin.id}: native entry does not parse (${native.parseProblems[0].entry}: ${native.parseProblems[0].message}); skipped`);
      continue;
    }
    // The server never imports a native Keel module (D10): the browser runs it in its Worker. The map carries the
    // manifest, content and the source bytes the content set serves; its `modules` stay empty for the match host too.
    if (native && !off) log?.info?.(`[keel] ${plugin.id}: native code is served to browsers only (the server does not run it)`);
    map.set(plugin.id, {
      id: plugin.id, dir: plugin.dir, manifest: plugin.manifest, modules: plugin.modules, content: plugin.content,
      ui: plugin.ui, assets: plugin.assets, offers: plugin.offers,
      ...(plugin.v2 ? { v2: { ...plugin.v2, ...(off ? { disabled: denied.get(plugin.id) } : {}) } } : {}),
      ...(native ? { native } : {}),
    });
  }
  return map;
}

/**
 * Pick the Keel descriptors a room's content set names.
 * @param {{ plugins?: { id: string }[] } | null} content
 * @param {Map<string, { manifest: any, modules: any[] }> | null} map
 */
export function keelDescriptorForContent(content, map) {
  if (!content || !map || !map.size) return null;
  const plugins = [];
  for (const p of content.plugins ?? []) {
    const found = map.get(p.id);
    if (found) plugins.push(found);
  }
  return plugins.length ? { plugins } : null;
}
