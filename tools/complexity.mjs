#!/usr/bin/env node
// tools/complexity.mjs — the function-size budget (the same idea as the lint warning budget): the codebase may keep
// the large functions it already has, but a change may not add or grow one past the limit.
//
//   node tools/complexity.mjs            report the offenders and the budget state
//   node tools/complexity.mjs --check    exit 1 when a function over the limit is not in the budget or grew
//   node tools/complexity.mjs --write    rewrite tools/complexity-budget.json from the current tree
//
// Metric: a function's OWN lines — the lines of its body minus the bodies of the functions nested in it (so a
// factory/screen full of small closures is not counted as one giant function). Default limit: 300 own lines.
//
// The policy is global: server/, shared/, public/js/ and tools/ (vendor excluded). Tests are excluded: a test's setup
// is often legitimately long, and the suite already has its own budgets. The budget file is the record of the
// exemptions; shrinking one of them is welcome, growing one (or adding a new one) needs a refactor, not a budget edit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = 'tools/complexity-budget.json';
const LIMIT = 300;
const WARN = 150;
const ROOTS = ['server', 'shared', 'public/js', 'tools'];
const SKIP = [/\/vendor\//, /\/node_modules\//, /\/public\/assets\//];
const require = createRequire(path.join(ROOT, 'package.json'));
const acorn = require('acorn');

const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (SKIP.some((re) => re.test(rel))) continue;
    if (e.isDirectory()) walk(rel);
    else if (/\.(js|mjs)$/.test(e.name)) files.push(rel);
  }
};
for (const r of ROOTS) walk(r);

const eachChild = (node, fn) => {
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const c = node[k];
    if (Array.isArray(c)) { for (const y of c) if (y && typeof y.type === 'string') fn(y); }
    else if (c && typeof c === 'object' && typeof c.type === 'string') fn(c);
  }
};
/** The functions nested directly in a body (their spans are excluded from the parent's own length). */
const nestedFunctions = (node) => {
  const out = [];
  (function visit(x) {
    if (FN.has(x.type)) { out.push(x); return; }
    eachChild(x, visit);
  })(node.body);
  return out;
};

/** Every function's own line count: `{ file, line, name, own }`. */
export function scan() {
  const rows = [];
  for (const file of files) {
    let ast;
    try { ast = acorn.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true }); } catch { continue; }
    (function visit(node, ctx) {
      if (!node || typeof node.type !== 'string') return;
      let next = ctx;
      if (node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
        next = { ...ctx, key: node.key?.name ?? node.key?.value ?? ctx.key };
      } else if (node.type === 'VariableDeclarator' && node.id?.name) {
        next = { ...ctx, key: node.id.name };
      }
      if (FN.has(node.type)) {
        const nested = nestedFunctions(node);
        const total = node.loc.end.line - node.loc.start.line + 1;
        const inner = nested.reduce((s, n) => s + (n.loc.end.line - n.loc.start.line + 1), 0);
        const name = node.id?.name || next.key || `@${node.loc.start.line}`;
        rows.push({ file, line: node.loc.start.line, name, own: Math.max(0, total - inner) });
        next = { ...next, key: null };
      }
      eachChild(node, (c) => visit(c, next));
    })(ast, { key: null });
  }
  return rows;
}

/** The stable budget key of a function: `file::name`. */
export const keyOf = (r) => `${r.file}::${r.name}`;

const readBudget = () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, BUDGET), 'utf8')); } catch { return { limit: LIMIT, functions: {} }; }
};

const offenders = (rows) => rows.filter((r) => r.own > LIMIT).sort((a, b) => b.own - a.own);

const isMain = import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('complexity.mjs');
if (isMain) {
  const rows = scan();
  const over = offenders(rows);
  const warn = rows.filter((r) => r.own > WARN && r.own <= LIMIT).length;
  if (process.argv.includes('--write')) {
    const functions = {};
    for (const r of over) functions[keyOf(r)] = r.own;
    fs.writeFileSync(path.join(ROOT, BUDGET), JSON.stringify({ limit: LIMIT, functions }, null, 2) + '\n');
    console.log(`${BUDGET}: ${over.length} function(s) over ${LIMIT} own lines`);
    process.exit(0);
  }
  const budget = readBudget();
  const known = budget.functions || {};
  const problems = [];
  for (const r of over) {
    const k = keyOf(r);
    if (!(k in known)) problems.push(`new over-budget function: ${k} (${r.own} > ${LIMIT}) — refactor it or split it`);
    else if (r.own > known[k]) problems.push(`over-budget function grew: ${k} (${known[k]} → ${r.own})`);
  }
  const seen = new Set(over.map(keyOf));
  const stale = Object.keys(known).filter((k) => !seen.has(k));
  for (const k of stale) console.warn(`[complexity] stale budget entry (renamed or shrunk — run --write): ${k}`);
  console.log(`[complexity] ${files.length} files; ${rows.length} functions; >${LIMIT} own lines: ${over.length}; ${WARN}–${LIMIT}: ${warn}`);
  for (const r of over.slice(0, 8)) console.log(`  ${String(r.own).padStart(5)}L  ${r.file}:${r.line}  ${r.name}`);
  if (process.argv.includes('--check')) {
    if (problems.length) { for (const p of problems) console.error(`[complexity] ${p}`); process.exit(1); }
    console.log(`[complexity] within budget (limit ${LIMIT})`);
  } else if (problems.length) {
    for (const p of problems) console.warn(`[complexity] ${p}`);
  }
}
