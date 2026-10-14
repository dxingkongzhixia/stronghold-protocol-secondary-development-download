// test/check-delivery.test.js — tools/check-delivery.mjs, the pure parts.
//
// The live checks need a browser and the deployed origins, so this covers what can be checked in Node: the config it
// reads, the shapes it probes per origin, the sample path, and the report it renders.
// Run: node --test test/check-delivery.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SITE, SAMPLE_IMAGE, formatReport, parseMirrorConfig, routeShapes } from '../tools/check-delivery.mjs';
import { isMirrorable } from '../public/js/assetMirror.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('it reads the same origin list the client does, order preserved', () => {
  const cfg = parseMirrorConfig(JSON.parse(readFileSync(path.join(ROOT, 'public/asset-mirrors.json'), 'utf8')));
  assert.ok(cfg.sources.length >= 2, 'the relay plus at least one CDN mirror');
  assert.equal(cfg.sources[0], 'http://123.57.150.185', 'the relay stays first');
  assert.ok(cfg.fullSources.includes(cfg.sources[0]), 'and is declared a full origin (it answers the routes)');
  for (const s of cfg.sources.slice(1)) assert.equal(cfg.fullSources.includes(s), false, 'the CDNs are plain-file only');
  assert.deepEqual(parseMirrorConfig(null), { sources: [], fullSources: [] });
  assert.deepEqual(parseMirrorConfig({ sources: ['a', 2, '', 'b'], fullSources: ['b', 3] }), { sources: ['a', 'b'], fullSources: ['b'] });
});

test('every origin is probed for the four shapes, and the routes only where they can exist', () => {
  const shapes = routeShapes('http://x');
  assert.deepEqual(shapes.map((s) => s.name), ['image', 'audio', 'scene', 'clip']);
  assert.equal(shapes.find((s) => s.name === 'image').full, false);
  for (const n of ['audio', 'scene', 'clip']) assert.equal(shapes.find((s) => s.name === n).full, true, `${n} needs a full origin`);
  for (const s of shapes) assert.ok(s.url.startsWith('http://x/'), 'absolute, so HEAD works cross-origin');
});

test('the sample image is a real manifest path (a hashed one, the form the client rewrites)', () => {
  assert.match(SAMPLE_IMAGE, /^\/assets\/~[0-9a-f]{16}\//);
  assert.ok(isMirrorable(SAMPLE_IMAGE), 'and the mirror would take it');
});

test('the report names the order, the installed origin and the cache verdict', () => {
  const model = {
    sources: ['http://relay', 'https://gh'], fullSources: ['http://relay'], installed: 'http://relay',
    chains: { image: ['http://relay/a.png', '/a.png'], audio: ['http://relay/media/x', '/media/x'], scene: ['http://relay/scene/1/bin'], clip: ['http://relay/clip/boot'] },
    probes: [{ origin: 'http://relay', results: [{ name: 'image', status: 200 }, { name: 'audio', status: 200 }] }],
    live: { cold: { total: 2456, cached: 0, relay: 2456, github: 0, server: 0 }, warm: { total: 10, cached: 9, relay: 1, github: 0, server: 0 }, ok: true },
  };
  const out = formatReport(model);
  assert.match(out, /1\. http:\/\/relay\s+\(full origin/);
  assert.match(out, /installed\s+http:\/\/relay/);
  assert.match(out, /image:200/);
  assert.match(out, /CACHE-FIRST OK/);
  const bad = formatReport({ ...model, live: { ...model.live, ok: false } });
  assert.match(bad, /CACHE-FIRST FAILING/);
  assert.ok(DEFAULT_SITE.startsWith('http://'), 'the game server is the default target');
});
