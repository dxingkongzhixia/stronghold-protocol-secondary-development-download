// test/check-upstream.test.js — tools/check-upstream.mjs.
//
// The parsing/classification rules on synthetic input (no git, no network), plus one offline run of `check()` against
// a ref of this repository (`--upstream HEAD`). The network path is deliberately not tested: it needs the owner's
// proxy and the mainline to be reachable.
// Run: node --test test/check-upstream.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEVER_MERGE_WATCH, check, formatReport, neverMergeHits, parseMergeTree, parseNameStatus,
} from '../tools/check-upstream.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parseNameStatus reads add / modify / delete / rename rows and ignores blank lines', () => {
  const rows = parseNameStatus([
    'A\tpublic/js/ui/codex.js',
    'M\tserver/lobby.js',
    'D\tserver/sim/content/kits/ops/op-clemnt.js',
    'R100\tserver/old.js\tpublic/js/screens/game.js',
    '',
  ].join('\n'));
  assert.deepEqual(rows, [
    { status: 'A', path: 'public/js/ui/codex.js' },
    { status: 'M', path: 'server/lobby.js' },
    { status: 'D', path: 'server/sim/content/kits/ops/op-clemnt.js' },
    { status: 'R100', path: 'public/js/screens/game.js' }, // a rename reports its new path
  ]);
});

test('parseMergeTree: a clean merge is just a tree; a conflicted one lists each file once', () => {
  const clean = parseMergeTree('6bd1da082f388b151ba0d109d9a31cdfe3945fcb\n');
  assert.equal(clean.tree, '6bd1da082f388b151ba0d109d9a31cdfe3945fcb');
  assert.deepEqual(clean.conflicts, []);
  assert.deepEqual(clean.messages, []);

  const conflicted = parseMergeTree([
    'bf3f08ff0964793a2486596a8d7d42de16282e62',
    '100644 115ab9f684b4006dce26042c06c32cd55dbb3c71 1\tREADME.md',
    '100644 4411d08f8370d9ede911aa4dd031597f0ffec3e6 2\tREADME.md',
    '100644 2e6829b0847cd5a5848b5c1f44f346b15ce2efb2 3\tREADME.md',
    '100644 ae2a59029c142b93363326fd8362e84fffb61086 1\tserver/lobby.js',
    '100644 2eb10d043f7a8398254d218af7f639c9c19e3f9d 2\tserver/lobby.js',
    '',
    'Auto-merging README.md',
    'CONFLICT (content): Merge conflict in README.md',
    'CONFLICT (modify/delete): server/lobby.js deleted in HEAD and modified in upstream',
  ].join('\n'));
  assert.equal(conflicted.tree, 'bf3f08ff0964793a2486596a8d7d42de16282e62');
  assert.deepEqual(conflicted.conflicts, ['README.md', 'server/lobby.js'], 'the stage rows repeat, the list does not');
  assert.equal(conflicted.messages.length, 2);
});

test('neverMergeHits flags a file we deleted and each NEVER_MERGE_WATCH row, and nothing else', () => {
  const hits = neverMergeHits(
    ['server/sim/content/kits/ops/op-clemnt.js', 'public/js/screens/game.js', 'server/match/bondsMeta.js',
      'shared/potential.js', 'public/js/ui/settings.js', 'server/match/Match.js', 'server/community.js'],
    ['server/sim/content/kits/ops/op-clemnt.js'],
  );
  const by = Object.fromEntries(hits.map((h) => [h.path, h.item]));
  assert.match(by['server/sim/content/kits/ops/op-clemnt.js'], /we deleted/);
  assert.match(by['public/js/screens/game.js'], /#149/);
  assert.match(by['server/match/bondsMeta.js'], /本局禁用/);
  assert.match(by['shared/potential.js'], /R21P/);
  assert.match(by['public/js/ui/settings.js'], /DIAGNOSTICS/);
  assert.match(by['server/match/Match.js'], /itemPool/);
  assert.equal(by['server/community.js'], undefined, 'an ordinary file is not a §0 hit');
  assert.equal(hits.length, 6);
  assert.deepEqual(neverMergeHits(['shared/loadoutRecord.js'], []), [{ path: 'shared/loadoutRecord.js', item: NEVER_MERGE_WATCH[3].item }]);
});

test('the watch list stays well formed (each row names a path or RegExp and the §0 row it projects)', () => {
  assert.ok(NEVER_MERGE_WATCH.length > 0);
  for (const r of NEVER_MERGE_WATCH) {
    assert.ok(typeof r.match === 'string' || r.match instanceof RegExp, 'a path or a RegExp');
    assert.ok(typeof r.item === 'string' && r.item.length > 0, 'and the §0 row it stands for');
  }
});

test('formatReport: nothing new says so; new work lists commits and stops on a §0 hit', () => {
  const quiet = formatReport({
    upstream: 'u', baseline: 'b', tip: 't', tipSubject: '', ahead: 3,
    commits: [], upstreamPaths: [], overlap: [], neverMerge: [], mergeTree: null, showCommits: 15, showPaths: 20,
  });
  assert.match(quiet, /Nothing to merge/);
  assert.doesNotMatch(quiet, /STOP/, 'no §0 hit, no stop');

  const busy = formatReport({
    upstream: 'u', baseline: 'b', tip: 't', tipSubject: 'x', ahead: 3,
    commits: [{ sha: 'a'.repeat(40), subject: 'upstream thing' }],
    upstreamPaths: ['p', 'q'], overlap: ['p'],
    neverMerge: [{ path: 'public/js/screens/game.js', item: '#149 盟约收起' }],
    mergeTree: { tree: 'T', conflicts: ['p'], messages: [] }, showCommits: 15, showPaths: 20,
  });
  assert.match(busy, /1 commit\(s\) we do not have/);
  assert.match(busy, /never-merge surface \(§0\): 1/);
  assert.match(busy, /STOP/);
  assert.match(busy, /1 conflicted file\(s\)/);
});

test('check() runs offline against a ref of this repository and finds nothing to merge', () => {
  const m = check({ root: ROOT, upstream: 'HEAD', fetch: false, mergeTree: false });
  assert.equal(m.fetchError, undefined);
  assert.deepEqual(m.commits, []);
  assert.equal(m.baseline, m.tip);
  assert.equal(m.mergeTree, null);
  assert.match(formatReport(m), /Nothing to merge/);
});
