#!/usr/bin/env node
// tools/docs-index.mjs — documentation front-matter + the generated index (docs audit phase 3).
//
// Every maintained document carries one invisible marker right under its title:
//
//   # TITLE
//
//   <!-- doc: role=spec status=current -->
//
// `docs/INDEX.md` is generated from those markers (and the title), so the inventory cannot drift. `design/`,
// `history/` and `research/` are excluded: they have their own indexes (docs/DESIGN.md, docs/README.md) and
// docs/history/*.md is the DESIGN revision corpus with a strict heading format.
//
//   node tools/docs-index.mjs                regenerate docs/INDEX.md
//   node tools/docs-index.mjs --check        fail when a marker is missing/invalid or the index is stale
//   node tools/docs-index.mjs --write-markers   insert the marker into documents that lack one
//
// Exit codes: 0 ok, 1 stale/missing/invalid.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'docs/INDEX.md';
const SKIP_DIRS = ['docs/design', 'docs/history', 'docs/research', 'docs/img'];
const SKIP_FILES = new Set([INDEX]);
export const ROLES = new Set(['entry', 'rules', 'spec', 'engine', 'data', 'ops', 'guide', 'reference', 'decision', 'plan', 'history', 'archive']);
export const STATUSES = new Set(['current', 'reference', 'plan', 'history', 'archive']);

/** Explicit (role, status) per document; the rest fall back to `classify`'s defaults. */
const OVERRIDES = {
  'README.md': ['entry', 'current'],
  'AGENTS.md': ['entry', 'current'],
  'CONTRIBUTING.md': ['guide', 'current'],
  'CHANGELOG.md': ['history', 'history'],
  'NOTICE.md': ['reference', 'reference'],
  'THIRD-PARTY-NOTICES.md': ['reference', 'reference'],
  'docs/README.md': ['entry', 'current'],
  'docs/QUERY-INDEX.md': ['entry', 'current'],
  'docs/DEVELOPER.md': ['guide', 'current'],
  'docs/AI-AGENT.md': ['guide', 'current'],
  'docs/AI-WORKFLOW.md': ['ops', 'current'],
  'docs/RULES.md': ['rules', 'current'],
  'docs/TESTING.md': ['ops', 'current'],
  'docs/PROJECT-STATE.md': ['ops', 'current'],
  'docs/DEPLOYS.md': ['history', 'history'],
  'docs/HANDOVER.md': ['archive', 'archive'],
  'docs/HANDOVER-2026-10.md': ['archive', 'archive'],
  'docs/HANDOFF-2026-11-18.md': ['archive', 'archive'],
  'docs/HANDOFF-2026-11-19.md': ['archive', 'archive'],
  'docs/DESIGN.md': ['rules', 'current'],
  'docs/PLAYING.md': ['guide', 'current'],
  'docs/MATCHMAKING.md': ['decision', 'current'],
  'docs/UPSTREAM-MERGES.md': ['history', 'history'],
  'docs/UPSTREAM-DEV-TRIAGE.md': ['history', 'history'],
  'docs/UPSTREAM-REGULATION.md': ['decision', 'current'],
  'docs/UPSTREAM-BANDS.md': ['plan', 'plan'],
  'docs/OUR-FEATURES.md': ['decision', 'current'],
  'docs/FUTURE-FEATURES.md': ['plan', 'plan'],
};

const isSkipped = (rel) => SKIP_FILES.has(rel) || SKIP_DIRS.some((d) => rel.startsWith(`${d}/`));

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.md') && !isSkipped(rel)) out.push(rel);
  }
  return out;
};

/** The maintained documents: root files + docs/** minus design/history/research/img and the generated index. */
export function docsFiles() {
  const out = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'NOTICE.md', 'THIRD-PARTY-NOTICES.md']
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
  return [...out, ...walk('docs')].sort();
}

/** `[role, status]` for a document: explicit override, else the pattern defaults. */
export function classify(rel) {
  if (OVERRIDES[rel]) return OVERRIDES[rel];
  if (rel.startsWith('docs/PLUGIN')) return ['spec', 'current'];
  if (rel.startsWith('docs/keel/')) return ['spec', 'current'];
  if (rel.startsWith('docs/history/')) return ['history', 'history'];
  return ['reference', 'current'];
}

const MARKER = /^<!--\s*doc:\s*role=([a-z]+)\s+status=([a-z]+)\s*-->\s*$/m;

export function readMarker(text) {
  const m = MARKER.exec(text);
  return m ? [m[1], m[2]] : null;
}

/** The first H1 line, without the leading '# '. */
export function titleOf(text) {
  const m = /^#\s+(.+)$/m.exec(text);
  return m ? m[1].trim() : '';
}

export function renderIndex() {
  const rows = docsFiles().map((rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const marker = readMarker(text) || classify(rel);
    return { rel, title: titleOf(text), role: marker[0], status: marker[1] };
  });
  const lines = [
    '# 文档索引（自动生成）',
    '',
    '> `node tools/docs-index.mjs` 生成；**不要手改**。每篇维护中的文档在标题下带 `<!-- doc: role=… status=… -->`，',
    '> 由 `test/docs-facts.test.js` 检查（缺失/失效/过期都会红）。`design/`、`history/`、`research/` 不在此表',
    '> （设计版本与调研各自有索引）。',
    '',
    '| 文档 | 标题 | role | status |',
    '|---|---|---|---|',
    ...rows.map((r) => `| [\`${r.rel}\`](${r.rel.startsWith('docs/') ? r.rel.slice(5) : `../${r.rel}`}) | ${r.title} | ${r.role} | ${r.status} |`),
    '',
  ];
  return lines.join('\n');
}

function insertMarker(rel) {
  const p = path.join(ROOT, rel);
  const text = fs.readFileSync(p, 'utf8');
  if (readMarker(text)) return false;
  const lines = text.split('\n');
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1 < 0) return false;
  const [role, status] = classify(rel);
  lines.splice(h1 + 1, 0, '', `<!-- doc: role=${role} status=${status} -->`);
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
  return true;
}

const isMain = import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('docs-index.mjs');
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--write-markers')) {
    let n = 0;
    for (const rel of docsFiles()) if (insertMarker(rel)) { console.log('marker', rel); n++; }
    console.log(`${n} marker(s) written`);
    process.exit(0);
  }
  const problems = [];
  for (const rel of docsFiles()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const marker = readMarker(text);
    if (!marker) problems.push(`${rel}: no <!-- doc: role=… status=… --> marker`);
    else {
      if (!ROLES.has(marker[0])) problems.push(`${rel}: unknown role "${marker[0]}"`);
      if (!STATUSES.has(marker[1])) problems.push(`${rel}: unknown status "${marker[1]}"`);
    }
  }
  const next = renderIndex();
  const current = fs.existsSync(path.join(ROOT, INDEX)) ? fs.readFileSync(path.join(ROOT, INDEX), 'utf8') : '';
  if (current !== next) problems.push(`${INDEX}: stale — run node tools/docs-index.mjs`);
  if (argv.includes('--check')) {
    if (problems.length) { for (const p of problems) console.error(p); process.exit(1); }
    console.log(`docs: ${docsFiles().length} maintained documents, markers and ${INDEX} in sync`);
  } else {
    fs.writeFileSync(path.join(ROOT, INDEX), next);
    console.log(`${INDEX}: ${docsFiles().length} documents`);
    if (problems.length) for (const p of problems) console.error(p);
  }
}
