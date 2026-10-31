// server/plugins/keelManifest.js — read `plugin.keel.json` as the plugin's declaration and project it onto the
// manifest-2 shape the registry, content compiler, visual sets and FX reader still consume.
//
// This is the cutover point: a folder with `plugin.keel.json` is declared by Keel. Its `plugin.json` is not read.
// Folders without one keep the manifest-2 reader.

import { readKeelManifest } from '../../shared/keel/manifest.js';
import { keelToV2 } from '../../shared/keel/legacy.js';
import { KEEL_MANIFEST } from '../../shared/plugins/manifest.js';

/**
 * @param {unknown} raw the parsed plugin.keel.json
 * @param {{ id: string, app?: string }} ctx
 * @returns {{ manifest: any, draft: any, problems: string[], warnings: string[], issues: any[] }}
 */
export function readKeelPluginManifest(raw, ctx) {
  const checked = readKeelManifest(raw, { id: ctx.id });
  const issues = [...checked.issues];
  const warnings = [...checked.warnings];
  if (!checked.manifest) {
    return { manifest: null, draft: null, problems: [...checked.problems], warnings, issues };
  }
  const manifest = keelToV2(checked.manifest, ctx);
  // The registry hashes this file instead of plugin.json; `readVisual` and `readContentData` read it by this name.
  manifest.manifestFile = KEEL_MANIFEST;
  // A manifest-3 plugin declares its app range like manifest 2; the old registry still needs the answer.
  if (manifest.compatible === false) {
    const text = `made for app ${manifest.app}; this is ${ctx.app ?? 'this build'}`;
    warnings.push(text);
    issues.push({ level: 'warning', code: 'PLUGIN_APP_MISMATCH', text, range: manifest.app, app: ctx.app });
  }
  return {
    manifest: checked.problems.length ? null : manifest,
    draft: manifest,
    problems: [...checked.problems],
    warnings,
    issues,
  };
}
