#!/usr/bin/env node
// tools/test-inventory.mjs — the generated test inventory (docs/TEST-INVENTORY.md) and its freshness check.
//
// The user's rule: the tests must follow the code. A hand-written list of files/counts rots the first time a suite is
// split, renamed or added — so the inventory is generated from the tree, and `--check` (run by `npm test` through
// test/docs-facts.test.js, and by `npm run docs:check`) fails when it is stale.
//
//   node tools/test-inventory.mjs            write docs/TEST-INVENTORY.md
//   node tools/test-inventory.mjs --check    exit 1 when the file is stale
//
// Lanes (what a change must run) are derived from the files themselves plus the existing sources of truth:
//   fast      test/fast.list (tools/test-fast.mjs)
//   golden    test/golden*.test.js + test/golden/*.json
//   browser   *.e2e.test.js / *.browser.test.js / test/e2e/*
//   native    native-room* (SP_NATIVE_E2E=1)
//   studio    test/studio/ (pure functions, no Chrome)
//   unit      everything else
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS } from './browser-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'docs/TEST-INVENTORY.md';

/** The browser smoke files — the runner's own RUNS (the generated list cannot drift from what CI runs) — and the asset
 * lane (tools/e2e-assets.mjs FILES). */
export const SMOKE = RUNS.flat().filter((s) => s.endsWith('.js'));
export const ASSETS = [
  'test/ui/standin.e2e.test.js',
  'test/ui/spectator.e2e.test.js',
  'test/ui/teammate-loadout.e2e.test.js',
  'test/ui/leftovers.e2e.test.js',
  'test/ui/watch-bonds.e2e.test.js',
];

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(test\.js|e2e\.mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
};

const countTests = (rel) => {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return (text.match(/^\s*(?:test|it)\(/gm) || []).length;
};

/** The inventory text, the file list and the per-lane counts. */
export function renderInventory() {
  const files = walk('test');
  if (fs.existsSync(path.join(ROOT, 'plugins/_template'))) files.push(...walk('plugins/_template'));
  const goldenLane = new Set(['test/golden.test.js', 'test/golden-versions.test.js', 'test/golden-diy.test.js', 'test/golden-standins.test.js']);
  const fast = new Set(fs.readFileSync(path.join(ROOT, 'test', 'fast.list'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  const goldenFiles = fs.readdirSync(path.join(ROOT, 'test', 'golden')).filter((f) => f.endsWith('.json')).sort();
  const laneOf = (rel) => {
    if (goldenLane.has(rel)) return 'golden tests';
    if (fast.has(rel)) return 'fast';
    if (/native-room/.test(rel)) return 'native (opt-in)';
    if (rel.startsWith('test/studio/')) return 'studio';
    if (/\.(e2e|browser)\.test\.js$/.test(rel) || rel.startsWith('test/e2e/')) return 'browser (opt-in)';
    return 'unit / integration';
  };
  const lanes = new Map();
  for (const rel of files.sort()) {
    const lane = laneOf(rel);
    const row = lanes.get(lane) || { files: 0, tests: 0 };
    row.files += 1;
    row.tests += countTests(rel);
    lanes.set(lane, row);
  }
  const laneOrder = ['unit / integration', 'fast', 'golden tests', 'browser (opt-in)', 'studio', 'native (opt-in)'];
  const lines = [
    '# 测试清单（自动生成）',
    '',
    '<!-- doc: role=reference status=reference -->',
    '> `node tools/test-inventory.mjs` 生成；**不要手改**。`test/docs-facts.test.js` 与 `npm run docs:check` 会检查本页',
    '> 是否过期（新增/拆分/改名一个测试文件后重新生成即可）。计数来自源码里的 `test(` / `it(`，是清单不是断言数量。',
    '',
    '| 层 | 文件 | 用例（静态计数） |',
    '|---|---:|---:|',
    ...laneOrder.filter((l) => lanes.has(l)).map((l) => `| ${l} | ${lanes.get(l).files} | ${lanes.get(l).tests} |`),
    `| **合计** | **${files.length}** | **${[...lanes.values()].reduce((n, x) => n + x.tests, 0)}** |`,
    '',
    '## golden 语料文件',
    '',
    ...goldenFiles.map((f) => `- \`test/golden/${f}\``),
    '',
    '## 浏览器 smoke（`npm run test:browser:smoke`，CI `browser-smoke` job）',
    '',
    ...SMOKE.map((f) => `- \`${f}\``),
    '',
    '## 素材 e2e（`npm run test:e2e:assets`，opt-in）',
    '',
    ...ASSETS.map((f) => `- \`${f}\``),
    '',
    '## native-room（`SP_NATIVE_E2E=1`，`npm run test:e2e:assets -- --native`）',
    '',
    ...files.filter((f) => /native-room/.test(f)).map((f) => `- \`${f}\``),
    '',
  ];
  return { text: lines.join('\n'), files, lanes };
}

const isMain = import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('test-inventory.mjs');
if (isMain) {
  const next = renderInventory();
  const current = fs.existsSync(path.join(ROOT, OUT)) ? fs.readFileSync(path.join(ROOT, OUT), 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (current !== next.text) {
      console.error(`${OUT} is stale — run node tools/test-inventory.mjs`);
      process.exit(1);
    }
    console.log(`${OUT} is fresh (${next.files.length} files)`);
  } else {
    fs.writeFileSync(path.join(ROOT, OUT), next.text);
    console.log(`${OUT}: ${next.files.length} files, ${next.lanes.size} lanes`);
  }
}
