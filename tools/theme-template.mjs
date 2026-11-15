#!/usr/bin/env node
// tools/theme-template.mjs — the official UI theme pack helper (P3). The registry is shared/uiTheme.js; this tool checks
// it against the extracted assets and prints a template for a new version.
//
//   node tools/theme-template.mjs --check
//       every registered theme's art exists under public/, public/css/ui-theme.css styles its
//       `html[data-ui-theme="<id>"]`, and its version is a registered official version; exit 1 on a problem.
//   node tools/theme-template.mjs --write <version-id>
//       scan public/assets/local/theme/<season>/ and public/assets/local/ui/activity/<season>/ and print a
//       shared/uiTheme.js entry template (the theme image and the activity images; colors stay to fill in by hand).
//
// The extracted assets are git-tracked (public/assets/local), so --check runs in CI without the game client.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UI_THEMES } from '../shared/uiTheme.js';
import { versionById } from '../shared/versions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** @returns {string[]} problems */
export function checkThemes(root = ROOT) {
  const problems = [];
  let css = '';
  try { css = readFileSync(path.join(root, 'public', 'css', 'ui-theme.css'), 'utf8'); } catch { problems.push('public/css/ui-theme.css is missing'); }
  for (const theme of Object.values(UI_THEMES)) {
    if (!theme || typeof theme !== 'object' || typeof theme.id !== 'string') { problems.push('a theme has no id'); continue; }
    if (!versionById(theme.version)) problems.push(`${theme.id}: version ${theme.version} is not registered`);
    const art = typeof theme.art === 'string' ? theme.art.replace(/^\//, '') : '';
    if (!art || !existsSync(path.join(root, 'public', art))) problems.push(`${theme.id}: art ${theme.art} is missing`);
    if (css && !css.includes(`html[data-ui-theme="${theme.id}"]`)) problems.push(`${theme.id}: public/css/ui-theme.css has no html[data-ui-theme="${theme.id}"] block`);
  }
  return problems;
}

/** Asset inventory for a version's themed directories. @param {string} version @param {string} [root] */
export function themeTemplate(version, root = ROOT) {
  const entry = versionById(version);
  if (!entry) throw new Error(`unknown version ${version}`);
  const season = entry.season;
  const dirs = [`public/assets/local/theme/${season}`, `public/assets/local/ui/activity/${season}`];
  const images = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) if (/\.(png|webp|jpg)$/i.test(name)) images.push(`/${rel(path.join(abs, name)).replace(/^public\//, '')}`);
  }
  const art = images.find((p) => p.includes(`/theme/${season}/`)) || images[0] || null;
  return {
    id: season,
    version,
    art,
    accent: '#cf4a40',
    accentSoft: '#8f2f29',
    glow: '#ff6f61',
    assets: images,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const problems = checkThemes();
    for (const p of problems) console.error(`x ${p}`);
    console.log(problems.length ? `${problems.length} theme problem(s)` : `ok: ${Object.keys(UI_THEMES).length} UI theme(s) checked`);
    process.exit(problems.length ? 1 : 0);
  }
  const i = args.indexOf('--write');
  if (i >= 0 && args[i + 1]) {
    console.log(JSON.stringify(themeTemplate(args[i + 1]), null, 2));
    process.exit(0);
  }
  console.error('usage: node tools/theme-template.mjs --check | --write <version-id>');
  process.exit(2);
}
