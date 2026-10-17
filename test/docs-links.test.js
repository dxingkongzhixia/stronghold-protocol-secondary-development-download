// Every relative Markdown link in the repository resolves to something that exists.
//
// Why a separate guard: `docs-paths.test.js` validates the links in docs/ARCHITECTURE.md and CONTRIBUTING.md only and
// also reads inline code as paths, so it cannot be pointed at every document (code spans are full of partial paths).
// Links rot in the other direction: a file moves, or a README is copied one directory too deep, and nothing notices.
// This test walks every tracked `.md` (node_modules / .git / dot-directories skipped), ignores fenced code, external
// URLs and `#anchors`, and requires every remaining target to exist.
//
// Targets that resolve OUTSIDE the repository are skipped on purpose: `../../releases/latest` in
// THIRD-PARTY-NOTICES.md is a GitHub-relative URL (it means `https://github.com/<owner>/<repo>/releases/latest`), and
// a checker cannot tell it from a typo. Everything that stays inside the tree is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git']);
const FENCE = /^\s*(?:```|~~~)/;
/** `[text](target "title")` and `![alt](src)` — inline links/images; reference-style definitions are not used here. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Every Markdown file in the repository. */
function markdownFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) markdownFiles(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** `[line, target]` for every inline link outside a fenced block. */
function linksIn(text) {
  const out = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (FENCE.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    for (const m of line.matchAll(LINK)) out.push([i + 1, m[1]]);
  });
  return out;
}

test('every relative Markdown link resolves inside the repository', () => {
  const files = markdownFiles(ROOT);
  assert.ok(files.length > 40, `expected the repository's Markdown files, found ${files.length}`);
  const bad = [];
  let checked = 0;
  for (const file of files) {
    for (const [line, raw] of linksIn(readFileSync(file, 'utf8'))) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(raw)) continue;   // http:, mailto:, data:, #anchor
      const target = decodeURIComponent(raw.split('#')[0]);
      if (!target) continue;
      const abs = resolve(dirname(file), target);
      if (relative(ROOT, abs).startsWith('..')) continue;      // GitHub-relative, not a repository path
      checked++;
      if (!existsSync(abs)) bad.push(`${relative(ROOT, file).split(sep).join('/')}:${line}  ->  ${raw}`);
    }
  }
  assert.ok(checked > 400, `checked ${checked} relative links (an extraction that finds nothing must fail)`);
  assert.deepEqual(bad, [], `broken relative links:\n${bad.join('\n')}`);
});
