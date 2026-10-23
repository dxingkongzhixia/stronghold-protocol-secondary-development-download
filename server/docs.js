// server/docs.js — read-only documentation index for the admin page.
//
// The admin page is token-gated and self-contained; this module only reads Markdown that belongs to
// the project documentation chain. It never follows a path outside `docs/`, the whitelisted root
// documents or `plugins/{README,AGENTS}.md`, and never writes anything.
//
//   docIndex(root)            → { files: [{ path, title, group, bytes, mtime }], count }
//   readDoc(root, relative)   → { path, title, markdown, bytes, mtime } | null

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const MAX_DOC_BYTES = 4 * 1024 * 1024;
const MAX_DOCS = 500;
const ROOT_DOCS = new Set([
  'README.md', 'AGENTS.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'NOTICE.md', 'THIRD-PARTY-NOTICES.md',
]);
const PLUGIN_DOCS = new Set(['plugins/README.md', 'plugins/AGENTS.md']);

const norm = (p) => String(p || '').replace(/\\/g, '/');

function titleOf(markdown, rel) {
  const heading = /^#\s+(.+?)\s*$/m.exec(markdown);
  return heading ? heading[1].trim() : norm(rel).split('/').pop().replace(/\.md$/i, '');
}

function groupOf(rel) {
  const p = norm(rel);
  if (ROOT_DOCS.has(p)) return 'root';
  if (p.startsWith('plugins/')) return 'plugins';
  const parts = p.split('/');
  return parts.length > 2 ? `docs/${parts[1]}` : 'docs';
}

function allowedPath(root, rel) {
  const clean = norm(rel).replace(/^\.\/+/, '');
  if (!clean || clean.startsWith('/') || clean.includes('\0') || clean.includes('..')) return null;
  if (!/\.md$/i.test(clean)) return null;
  const abs = resolve(root, clean);
  const docs = resolve(root, 'docs');
  const insideDocs = abs !== docs && abs.startsWith(docs + sep);
  if (!insideDocs && !ROOT_DOCS.has(clean) && !PLUGIN_DOCS.has(clean)) return null;
  let real;
  try { real = realpathSync(abs); } catch { return null; }
  const docsReal = realpathSync(docs);
  if (!ROOT_DOCS.has(clean) && !PLUGIN_DOCS.has(clean) && !real.startsWith(docsReal + sep)) return null;
  try {
    if (!statSync(real).isFile()) return null;
  } catch { return null; }
  return { abs: real, rel: relative(root, real).split(sep).join('/') };
}

function readEntry(root, rel) {
  const hit = allowedPath(root, rel);
  if (!hit) return null;
  let st;
  try { st = statSync(hit.abs); } catch { return null; }
  if (!st.isFile() || st.size > MAX_DOC_BYTES) return null;
  let markdown;
  try { markdown = readFileSync(hit.abs, 'utf8'); } catch { return null; }
  return {
    path: hit.rel,
    title: titleOf(markdown, hit.rel),
    markdown,
    bytes: st.size,
    mtime: st.mtimeMs,
  };
}

function walkDocs(root, out) {
  const docs = join(root, 'docs');
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (out.length >= MAX_DOCS) return;
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) { walk(abs); continue; }
      if (!ent.isFile() || !/\.md$/i.test(ent.name)) continue;
      const rel = relative(root, abs).split(sep).join('/');
      const hit = readEntry(root, rel);
      if (hit) out.push({ path: hit.path, title: hit.title, group: groupOf(hit.path), bytes: hit.bytes, mtime: hit.mtime });
    }
  };
  walk(docs);
}

export function docIndex(root) {
  const files = [];
  for (const rel of [...ROOT_DOCS, ...PLUGIN_DOCS]) {
    const hit = readEntry(root, rel);
    if (hit) files.push({ path: hit.path, title: hit.title, group: groupOf(hit.path), bytes: hit.bytes, mtime: hit.mtime });
  }
  walkDocs(root, files);
  files.sort((a, b) => {
    const ra = a.group === 'root' ? 0 : a.group === 'plugins' ? 1 : 2;
    const rb = b.group === 'root' ? 0 : b.group === 'plugins' ? 1 : 2;
    return ra - rb || a.path.localeCompare(b.path);
  });
  return { files, count: files.length };
}

export function readDoc(root, rel) {
  const hit = readEntry(root, rel);
  if (!hit) return null;
  return { path: hit.path, title: hit.title, markdown: hit.markdown, bytes: hit.bytes, mtime: hit.mtime };
}

const ASSET_MIME = Object.freeze({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
});
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

/** Read an image referenced by a documentation page. Only files under `docs/` are exposed. */
export function readDocAsset(root, rel) {
  const clean = norm(rel).replace(/^\.\/+/, '');
  if (!clean || clean.startsWith('/') || clean.includes('\0') || clean.includes('..')) return null;
  const ext = clean.slice(clean.lastIndexOf('.')).toLowerCase();
  const type = ASSET_MIME[ext];
  if (!type) return null;
  const abs = resolve(root, clean);
  const docs = resolve(root, 'docs');
  if (!abs.startsWith(docs + sep)) return null;
  let real;
  try { real = realpathSync(abs); } catch { return null; }
  const docsReal = realpathSync(docs);
  if (!real.startsWith(docsReal + sep)) return null;
  let st;
  try { st = statSync(real); } catch { return null; }
  if (!st.isFile() || st.size > MAX_ASSET_BYTES) return null;
  try { return { bytes: readFileSync(real), type }; } catch { return null; }
}
