// P0 mobile guards (docs/MOBILE-UI.md §7): the one viewport matrix, and the CSS height unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIEWPORTS, MIN_VIEWPORT } from './matrix.mjs';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('M0.1: the viewport matrix is one source, unique, and covers the promised minimum (640×360)', () => {
  assert.ok(VIEWPORTS.length >= 5);
  const names = new Set(VIEWPORTS.map((v) => v.name));
  assert.equal(names.size, VIEWPORTS.length, 'unique names');
  assert.ok(VIEWPORTS.some((v) => v.w === MIN_VIEWPORT.w && v.h === MIN_VIEWPORT.h), 'the smallest promised screen is in the matrix');
  for (const v of VIEWPORTS) {
    assert.ok(v.w >= MIN_VIEWPORT.w && v.h >= MIN_VIEWPORT.h, `${v.name}: ${v.w}×${v.h} is below the promise`);
  }
  assert.deepEqual([...names], ['se1', 'android-s', 'iphone14', 'pixel7', 'tablet']);
});

test('M0.2: public/css never uses 100vh (the app height unit is 100dvh / --sp-vh)', () => {
  const dir = join(ROOT, 'public', 'css');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const files = walk(dir).filter((f) => f.endsWith('.css'));
  assert.ok(files.length > 10, `found ${files.length} stylesheets`);
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      // 100vh but not 100dvh / 100svh / 100lvh: a plain viewport-height unit is the toolbar bug
      if (/(?<![dsl])100vh\b/.test(line)) bad.push(`${f.replace(ROOT, '')}: ${line.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(bad, [], 'replace 100vh with 100dvh (or --sp-vh inside the match HUD)');
});
