// The admin documentation viewer's read-only data layer (server/docs.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docIndex, readDoc, readDocAsset } from '../server/docs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('docIndex lists the root, plugin and docs Markdown chain without exposing code files', () => {
  const index = docIndex(ROOT);
  assert.ok(index.count > 20, `documentation count: ${index.count}`);
  const paths = new Set(index.files.map((f) => f.path));
  for (const expected of ['README.md', 'AGENTS.md', 'docs/README.md', 'docs/PLUGINS.md', 'docs/PLUGIN-DEV-GUIDE.md']) {
    assert.ok(paths.has(expected), `${expected} is in the index`);
  }
  assert.ok(!paths.has('server/index.js'), 'code files are not documentation');
  const readme = index.files.find((f) => f.path === 'docs/README.md');
  assert.match(readme.title, /Documentation|文档/);
  assert.ok(index.files.every((f) => f.path.endsWith('.md')));
});

test('readDoc resolves the selected Markdown and rejects traversal / non-document paths', () => {
  const readme = readDoc(ROOT, 'docs/README.md');
  assert.ok(readme);
  assert.equal(readme.path, 'docs/README.md');
  assert.match(readme.markdown, /文档系统/);
  assert.match(readme.title, /Documentation|文档/);
  for (const bad of ['server/index.js', 'package.json', '../package.json', 'docs/../README.md', 'docs/missing.md', '']) {
    assert.equal(readDoc(ROOT, bad), null, `rejected: ${JSON.stringify(bad)}`);
  }
});

test('readDocAsset serves only images under docs and keeps their MIME type', () => {
  const image = readDocAsset(ROOT, 'docs/img/band-draft.jpg');
  assert.ok(image);
  assert.equal(image.type, 'image/jpeg');
  assert.ok(image.bytes.length > 0);
  assert.equal(readDocAsset(ROOT, 'docs/README.md'), null, 'Markdown is not an image');
  assert.equal(readDocAsset(ROOT, 'public/assets/icon.png'), null, 'only docs images');
  assert.equal(readDocAsset(ROOT, 'docs/../README.md'), null, 'no traversal');
});

test('the admin docs shell loads the local viewer and the client uses the token-gated API', () => {
  const shell = readFileSync(path.join(ROOT, 'server/adminDocs.js'), 'utf8');
  const client = readFileSync(path.join(ROOT, 'public/js/adminDocs.js'), 'utf8');
  assert.match(shell, /\/js\/adminDocs\.js/);
  assert.match(client, /\/admin\/api\/docs/);
  assert.match(client, /\/admin\/api\/docs\/file/);
  assert.ok(!shell.includes('PLUGINS.md'), 'the page does not embed or select a document');
});
