// Studio C (N2): create a plugin folder from a native Keel template (manifest 3) — the same templates `keel new` uses.
// The template's id namespace is rewritten in every text file (content record ids stay in the new plugin's namespace),
// and a native template's lock is regenerated for the new folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPlugin } from '../plugins/pack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The native templates offered by the studio's create dialog (no target: they are not cosmetic replacements). */
export const KEEL_TEMPLATES = Object.freeze([
  { id: 'keel-content', class: 'content', kinds: [], keel: true },
  { id: 'keel-lang', class: 'lang', kinds: [], keel: true },
  { id: 'keel-policy', class: 'script', kinds: [], keel: true },
  { id: 'keel-multi-module', class: 'script', kinds: [], keel: true },
  { id: 'keel-reference', class: 'script', kinds: [], keel: true },
]);

const TEXT = new Set(['.json', '.js', '.mjs', '.md', '.txt', '.html', '.css']);

/** Replace the template id (dashed and underscored) in the folder's text files. */
function rewriteIds(dir, fromId, toId) {
  const subs = new Map([[fromId, toId], [fromId.replaceAll('-', '_'), toId.replaceAll('-', '_')]]);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name === 'plugin.lock.json' || !TEXT.has(path.extname(e.name).toLowerCase())) continue;
      const before = fs.readFileSync(p, 'utf8');
      let after = before;
      for (const [a, b] of subs) after = after.split(a).join(b);
      if (after !== before) fs.writeFileSync(p, after);
    }
  };
  walk(dir);
}

/**
 * Create `pluginsDir/<id>` from `plugins/_template/<template>`.
 * @param {{ template: string, id: string, name?: string, pluginsDir: string, root?: string }} opts
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function createKeelPlugin({ template, id, name, pluginsDir, root = ROOT }) {
  if (!KEEL_TEMPLATES.some((t) => t.id === template)) return { ok: false, error: 'not a native template' };
  const src = path.join(root, 'plugins/_template', template);
  const descriptor = fs.existsSync(path.join(src, 'plugin.keel.json')) ? 'plugin.keel.json' : 'plugin.json';
  if (!fs.existsSync(path.join(src, descriptor))) return { ok: false, error: 'the template is not installed' };
  const dir = path.join(pluginsDir, id);
  if (fs.existsSync(dir)) return { ok: false, error: 'this id already exists' };
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.cpSync(src, dir, { recursive: true });
  rewriteIds(dir, template, id);
  const file = path.join(dir, descriptor);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.id = id;
  const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : id;
  manifest.name = typeof manifest.name === 'object' ? { ...manifest.name, zh: label, en: label } : { zh: label, en: label };
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  if ((manifest.modules ?? []).some((m) => ['sim', 'match', 'policy'].includes(m.kind))) {
    const packed = packPlugin(dir, { dataDir: path.join(root, 'data') });
    if (!packed.wrote) return { ok: false, error: 'the template lock could not be written' };
  }
  return { ok: true };
}
