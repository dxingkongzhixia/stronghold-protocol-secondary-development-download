// test/first-paint.test.js — tools/first-paint.mjs: the cold first-paint estimate covers the entry HTML, every linked
// stylesheet, the static module graph, the boot manifests, fonts and icons, and reports both raw and gzip sizes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the first-paint estimate covers the entry, CSS, static JS, manifests, fonts and icons', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'first-paint.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  for (const g of ['html', 'css', 'js', 'data', 'fonts', 'images']) assert.ok(j.groups[g]?.files.length > 0, `no ${g}`);
  assert.ok(j.groups.js.files.some((f) => f.path === '/js/main.js'), 'the module entry is in the graph');
  assert.ok(j.groups.css.files.some((f) => f.path === '/css/theme.css'), 'the theme stylesheet');
  assert.ok(j.groups.data.files.some((f) => f.path === '/data/assets.json'), 'the asset manifest');
  assert.ok(j.total.raw >= j.total.gzip && j.total.gzip > 0);
  assert.ok(j.estimates.seconds > 0 && j.estimates.seconds4g < j.estimates.seconds, 'a slower link takes longer');
});
