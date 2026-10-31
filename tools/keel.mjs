#!/usr/bin/env node
// tools/keel.mjs — the Keel CLI (M0: manifest 3 + manifest 2 → module graph).
//
// Usage:
//   node tools/keel.mjs list [--json]
//   node tools/keel.mjs graph <id|dir> [--json]
//   node tools/keel.mjs check <id|dir> [--strict] [--json]
//   node tools/keel.mjs explain <id|dir>
//   node tools/keel.mjs migrate <id|dir> [--write] [--force] [--json]
//   node tools/keel.mjs import <id|dir> [--write] [--json]
//   node tools/keel.mjs surface [--check] [--json]
//
// Exit codes: 0 clean, 1 problems, 2 usage or a missing plugin/manifest.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_VERSION, PLUGIN_API } from '../shared/constants.js';
import { readFxManifest } from '../server/plugins/fxAssets.js';
import { adaptV2, buildKeelGraph, isV2Manifest, readKeelManifest, KEEL_STABLE_POINTS, pointsByDomain, createFakeHost, createKeelRuntime, loadKeelModules, providesFromContent, withContentProvides } from '../shared/keel/index.js';
import { loadKeelPlugin } from '../server/keel/room-source.js';
import { readNativeCode } from '../server/keel/native-code.js';
import { loadKeelContent } from '../server/keel/content.js';
import { runKeelDemo } from '../server/keel/demo.js';
import { packPlugin, zipPlugin } from '../server/plugins/pack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS = path.join(ROOT, 'plugins');

const USAGE = `usage: node tools/keel.mjs <command> [options]

  list [--json]                     every plugins/<id> as a Keel graph
  graph <id|dir> [--json]           the module graph of one plugin
  check <id|dir> [--strict] [--json]  manifest + graph findings
  explain <id|dir>                  human-readable graph and order
  migrate <id|dir> [--write] [--force] [--json]  manifest 2 → 3 proposal
  import <id|dir> [--write] [--json]  a manifest 2 plugin as a draft (never overwrites)
  run <id|dir> [--seed N] [--frames N] [--json]  run the sim modules on the fake host
  demo <id|dir> [--seed N] [--rounds N] [--frames N] [--json]  run the headless mode loop
  new <template> <id> [--name <name>] [--dir <plugins>]  a plugin folder from a native template
  dev <id|dir>                      check + graph now, again after every change (Ctrl+C stops)
  test <id|dir> [--frames N] [--json]  check + a smoke run of the executable modules
  pack <id|dir> [--zip] [--out <path>]  write plugin.lock.json and check (a zip with --zip)
  exit [--dir <plugins>] [--json]   check the Keel-only migration (blockers, mixed folders)
  surface [--check] [--json]        the 24 stable extension points

A target is a folder path, or an id under plugins/.`;

const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.filter((a) => a.startsWith('--')));
const rest = args.slice(1).filter((a) => !a.startsWith('--'));
const json = flags.has('--json');

function flagValue(name, fallback) {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--')) return args[i + 1];
  return fallback;
}

function fail(message, code = 2) {
  console.error(`keel: ${message}`);
  process.exitCode = code;
  return { ok: false, exitCode: code };
}

function targetDir(target) {
  if (!target) return null;
  const direct = path.resolve(process.cwd(), target);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
  const underPlugins = path.join(PLUGINS, target);
  if (fs.existsSync(underPlugins) && fs.statSync(underPlugins).isDirectory()) return underPlugins;
  return null;
}

/** Read one folder into { id, source, raw, manifest, v2, graph, problems, warnings, error }. */
export function readKeelFolder(dir) {
  const id = path.basename(dir);
  const keelFile = path.join(dir, 'plugin.keel.json');
  const file = fs.existsSync(keelFile) ? keelFile : path.join(dir, 'plugin.json');
  if (!fs.existsSync(file)) return { id, dir, error: `no plugin.json or plugin.keel.json in ${dir}` };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { id, dir, error: `plugin.json is not JSON: ${e.message}` }; }
  if (raw?.manifest === 3) {
    const checked = readKeelManifest(raw, { id });
    if (!checked.manifest) return { id, dir, raw, source: 'v3', problems: checked.problems, warnings: checked.warnings };
    const built = buildKeelGraph(checked.manifest, { id });
    const native = readNativeCode(dir, checked.manifest);
    const parse = (native.parseProblems ?? []).map((p) => `KEEL_PARSE: ${p.entry}:${p.line ?? '?'}: ${p.message}`);
    return { id, dir, raw, source: 'v3', manifest: checked.manifest, graph: built.graph, problems: [...built.problems, ...parse], warnings: built.warnings };
  }
  if (!isV2Manifest(raw)) return { id, dir, raw, error: `"manifest": ${raw?.manifest} is neither 2 nor 3` };
  const checked = readFxManifest(raw, { id, app: APP_VERSION, api: PLUGIN_API });
  if (!checked.manifest) return { id, dir, raw, source: 'v2', problems: checked.problems, warnings: checked.warnings };
  const adapted = adaptV2(checked.manifest);
  const built = buildKeelGraph(adapted.manifest, { id });
  return {
    id, dir, raw, source: 'v2', manifest2: checked.manifest, manifest: adapted.manifest,
    graph: built.graph, problems: [...built.problems], warnings: [...checked.warnings, ...adapted.warnings, ...built.warnings],
  };
}

function readTarget(target) {
  const dir = targetDir(target);
  if (!dir) return { error: `no plugin folder or id "${target}"` };
  return readKeelFolder(dir);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function summary(record) {
  const g = record.graph;
  return {
    id: record.id,
    source: record.source,
    version: g?.version ?? record.manifest2?.version ?? null,
    class: record.manifest2?.class ?? g?.legacy?.class ?? null,
    trust: g?.trust ?? null,
    kinds: g?.kinds ?? [],
    modules: g?.modules?.length ?? 0,
    permissions: g?.permissions ?? [],
    problems: record.problems ?? [],
    warnings: record.warnings ?? [],
    ...(record.error ? { error: record.error } : {}),
  };
}

function humanGraph(record) {
  const s = summary(record);
  if (s.error) { console.log(`${s.id}: ${s.error}`); return; }
  console.log(`${s.id} ${s.version ?? ''} · ${s.source}${s.class ? ` (${s.class})` : ''} · trust ${s.trust ?? '?'} · ${s.modules} module(s)`);
  for (const mod of record.graph?.modules ?? []) {
    const where = mod.entry ?? (mod.files.length ? mod.files.join(', ') : '(no file)');
    console.log(`  ${mod.kind.padEnd(7)} ${where}${mod.permissions.length ? `  [${mod.permissions.join(', ')}]` : ''}`);
  }
  if (s.permissions.length) console.log(`  capabilities: ${s.permissions.join(', ')}`);
  if (s.warnings.length) for (const w of s.warnings) console.log(`  warning: ${w}`);
  if (s.problems.length) for (const p of s.problems) console.log(`  problem: ${p}`);
}

function commandList() {
  const rows = [];
  if (!fs.existsSync(PLUGINS)) return fail(`no plugins directory at ${PLUGINS}`);
  for (const name of fs.readdirSync(PLUGINS).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const dir = path.join(PLUGINS, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(path.join(dir, 'plugin.json'))) continue;
    rows.push(summary(readKeelFolder(dir)));
  }
  if (json) { printJson(rows); return; }
  for (const r of rows) {
    const mark = r.problems.length ? '!' : r.warnings.length ? '~' : ' ';
    console.log(`${mark} ${r.id.padEnd(28)} ${String(r.source).padEnd(3)} ${String(r.trust ?? '-').padEnd(7)} ${r.kinds.join(',') || '-'}`);
  }
  console.log(`\n${rows.length} plugin(s); ! problem, ~ warning`);
}

function commandGraph(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  if (json) { printJson(summary(record)); return; }
  humanGraph(record);
  if (record.problems?.length) process.exitCode = 1;
}

function commandCheck(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  const problems = record.problems ?? [];
  const warnings = record.warnings ?? [];
  if (json) { printJson({ ...summary(record), ok: !problems.length && !(flags.has('--strict') && warnings.length) }); }
  else {
    humanGraph(record);
    console.log(problems.length ? `\n${problems.length} problem(s)` : '\nno problems');
    console.log(warnings.length ? `${warnings.length} warning(s)` : 'no warnings');
  }
  if (problems.length || (flags.has('--strict') && warnings.length)) process.exitCode = 1;
}

function commandExplain(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  const g = record.graph;
  if (!g) { humanGraph(record); process.exitCode = 1; return; }
  console.log(`${g.id} ${g.version} (${record.source})`);
  console.log(`trust: ${g.trust}; scope: ${g.scope.join(', ')}; api: ${Object.entries(g.api).map(([k, v]) => `${k}@${v}`).join(', ')}`);
  console.log('\nmodules:');
  for (const mod of g.modules) {
    console.log(`  ${mod.kind.padEnd(7)} ${mod.entry ?? '(files)'} ${mod.permissions.length ? `[${mod.permissions.join(', ')}]` : ''}`);
    if (mod.files.length) for (const f of mod.files) console.log(`          ${f}`);
    if (mod.slots.length) console.log(`          slots: ${mod.slots.join(', ')}`);
  }
  console.log('\norder:');
  console.log(`  requires: ${g.order.requires.join(', ') || '-'}`);
  console.log(`  optional: ${g.order.optional.join(', ') || '-'}`);
  console.log(`  conflicts: ${g.order.conflicts.join(', ') || '-'}`);
  console.log(`  after: ${g.order.after.join(', ') || '-'}`);
  console.log(`  before: ${g.order.before.join(', ') || '-'}`);
  console.log(`  priority: ${g.order.priority}`);
  if (g.provides.length) console.log(`\nprovides: ${g.provides.join(', ')}`);
  if (g.consumes.length) console.log(`consumes: ${g.consumes.join(', ')}`);
  if (record.warnings?.length) console.log(`\nwarnings:\n${record.warnings.map((w) => `  - ${w}`).join('\n')}`);
}

function withProvides(dir, manifest) {
  if (!manifest) return manifest;
  try {
    const content = loadKeelContent(dir, manifest);
    return withContentProvides(manifest, providesFromContent(content));
  } catch { return manifest; }
}

function commandMigrate(target, { draft = false } = {}) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  if (record.source === 'v3') {
    // An import never replaces a Keel manifest, not even with --force.
    if (draft && flags.has('--write')) return fail(`${record.id} already has plugin.keel.json; import never overwrites it`);
    // Re-generate a migrated file from the v2 source when both exist and the author asks to overwrite.
    const v2File = path.join(record.dir, 'plugin.json');
    if (flags.has('--write') && flags.has('--force') && fs.existsSync(v2File)) {
      try {
        const raw = JSON.parse(fs.readFileSync(v2File, 'utf8'));
        const checked = readFxManifest(raw, { id: record.id, app: APP_VERSION, api: PLUGIN_API });
        if (checked.manifest) {
          const adapted = adaptV2(checked.manifest);
          const manifest = withProvides(record.dir, adapted.manifest);
          const out = path.join(record.dir, 'plugin.keel.json');
          fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          if (json) printJson({ id: record.id, source: 'v2', manifest, warnings: adapted.warnings });
          else console.log(`wrote ${path.relative(process.cwd(), out)}`);
          return;
        }
      } catch { /* fall through to "already manifest 3" */ }
    }
    if (json) { printJson({ id: record.id, source: 'v3', manifest: record.manifest }); return; }
    console.log(`${record.id} is already manifest 3`);
    return;
  }
  if (!record.manifest) return fail(`${record.id}: manifest 2 did not validate`);
  // V2 of the compatibility line: a trusted plugin's server / page code does not run on the Keel path (only entry.sim /
  // entry.meta do). Writing plugin.keel.json would silently drop it, so the plugin stays on the legacy loader.
  if (flags.has('--write') && record.manifest2?.class === 'trusted' && (record.manifest2.entry?.server || record.manifest2.entry?.client)) {
    return fail(`${record.id}: a trusted server/page entry does not run on the Keel path; keep it on the legacy loader (nothing was written)`);
  }
  const manifest = withProvides(record.dir, record.manifest);
  if (json) { printJson({ id: record.id, source: 'v2', ...(draft ? { draft: true } : {}), manifest, warnings: record.warnings }); }
  else {
    console.log(JSON.stringify(manifest, null, 2));
    if (record.warnings?.length) console.error(`\n${record.warnings.length} warning(s):\n${record.warnings.map((w) => `  - ${w}`).join('\n')}`);
    if (draft && flags.has('--write')) console.error('import writes a draft: review modules, permissions and assets before packing; the studio does not edit it');
  }
  if (flags.has('--write')) {
    const out = path.join(record.dir, 'plugin.keel.json');
    // An import is a starting point, never a migration promise: it never overwrites an existing Keel manifest.
    if (fs.existsSync(out) && (draft || !flags.has('--force'))) {
      return fail(`${out} exists; ${draft ? 'import never overwrites it' : 'pass --force to overwrite'}`);
    }
    fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.error(`wrote ${path.relative(process.cwd(), out)}`);
  }
}

function commandSurface() {
  const ids = KEEL_STABLE_POINTS.map((p) => p.id);
  const duplicate = ids.filter((id, i) => ids.indexOf(id) !== i);
  const problems = [];
  if (KEEL_STABLE_POINTS.length !== 24) problems.push(`expected 24 stable points, found ${KEEL_STABLE_POINTS.length}`);
  if (duplicate.length) problems.push(`duplicate ids: ${[...new Set(duplicate)].join(', ')}`);
  for (const p of KEEL_STABLE_POINTS) {
    for (const key of ['id', 'domain', 'point', 'readable', 'writable', 'capability', 'budget', 'stability']) {
      if (!p[key]) problems.push(`${p.id}: missing ${key}`);
    }
  }
  const doc = path.join(ROOT, 'docs/keel/CONTRACTS.md');
  if (fs.existsSync(doc)) {
    const text = fs.readFileSync(doc, 'utf8');
    const documented = new Set([...text.matchAll(/^\|\s*\*{0,2}([A-Z]\d+)\*{0,2}\s*\|/gm)].map((m) => m[1]));
    const missing = ids.filter((id) => !documented.has(id));
    const extra = [...documented].filter((id) => !ids.includes(id));
    if (missing.length) problems.push(`docs/keel/CONTRACTS.md is missing: ${missing.join(', ')}`);
    if (extra.length) problems.push(`docs/keel/CONTRACTS.md has unknown ids: ${extra.join(', ')}`);
  } else if (flags.has('--check')) {
    problems.push('docs/keel/CONTRACTS.md does not exist');
  }
  if (json) { printJson({ stable: KEEL_STABLE_POINTS.length, byDomain: pointsByDomain().map((d) => ({ domain: d.domain, count: d.points.length })), problems }); }
  else {
    for (const { domain, points } of pointsByDomain()) {
      console.log(`${domain} (${points.length})`);
      for (const p of points) console.log(`  ${p.id.padEnd(4)} ${p.point.padEnd(22)} ${p.capability.padEnd(20)} ${p.budget}`);
    }
    console.log(`\n${KEEL_STABLE_POINTS.length} stable points`);
  }
  if (problems.length) { for (const p of problems) console.error(`keel: ${p}`); process.exitCode = 1; }
}

async function commandDemo(target) {
  const dir = targetDir(target);
  if (!dir) return fail(`no plugin folder or id "${target}"`);
  const plugin = await loadKeelPlugin(dir);
  if (!plugin || !plugin.manifest) return fail(`${path.basename(dir)}: no valid manifest 3`);
  if (plugin.v2) return fail(`${plugin.id}: v2 setup(sp) is not a headless demo; use the legacy loader or a manifest-3 module`);
  const rounds = Number(flagValue('--rounds', '10'));
  const frames = Number(flagValue('--frames', '60'));
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) return fail('--rounds is an integer 1–100');
  if (!Number.isInteger(frames) || frames < 1 || frames > 10000) return fail('--frames is an integer 1–10000');
  const out = runKeelDemo({ plugin, rounds, framesPerRound: frames, seed: flagValue('--seed', '1') });
  const summary = {
    id: plugin.id,
    played: out.played,
    finished: out.finished,
    errors: out.errors,
    views: out.views,
    state: out.snapshot.state,
    history: out.history,
    hash: out.hash,
  };
  if (json) printJson(summary);
  else {
    console.log(`${plugin.id} · played ${out.played} round(s) · finished ${JSON.stringify(out.finished)}`);
    console.log(`  views: ${JSON.stringify(out.views)}`);
    console.log(`  state: ${JSON.stringify(out.snapshot.state)}`);
    console.log(`  hash: ${out.hash}`);
    for (const e of out.errors) console.log(`  error: ${e.module} ${e.hook} ${e.code} ${e.message}`);
  }
  if (out.errors.length) process.exitCode = 1;
}

async function commandRun(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  if (!record.manifest) return fail(`${record.id}: the manifest did not validate`);
  const modules = await loadKeelModules(record.manifest, {
    urlOf: (rel) => pathToFileURL(path.join(record.dir, rel)).href,
  });
  if (!modules.length) {
    if (json) printJson({ id: record.id, source: record.source, modules: [], note: 'no executable modules (content/asset/lang only)' });
    else console.log(`${record.id}: no executable modules (content/asset/lang only)`);
    return;
  }
  const seed = flagValue('--seed', '1');
  const frames = Number(flagValue('--frames', '60'));
  if (!Number.isInteger(frames) || frames < 0 || frames > 100000) return fail('--frames is an integer 0–100000');
  const host = createFakeHost({ seed, units: [{ id: 'target', side: 'enemy', hp: 100, maxHp: 100, x: 0, y: 0 }] });
  const runtime = createKeelRuntime({ manifest: record.manifest, modules, host, seed });
  runtime.run({ frames });
  const snap = runtime.snapshot();
  const out = {
    id: record.id,
    source: record.source,
    seed,
    frames,
    modules: runtime.modules,
    state: snap.state,
    commands: snap.commands,
    disabled: snap.disabled,
    errors: runtime.errors,
    logs: runtime.logs,
    hash: runtime.hash(),
    host: host.snapshot(),
  };
  if (json) printJson(out);
  else {
    console.log(`${record.id} · ${runtime.modules.length} executable module(s) · seed ${seed} · ${frames} frame(s)`);
    for (const mod of runtime.modules) console.log(`  ${mod.kind.padEnd(5)} ${mod.entry ?? ''} ${mod.disabled ? '(disabled)' : ''}`);
    console.log(`  state: ${JSON.stringify(snap.state)}`);
    console.log(`  commands: ${JSON.stringify(snap.commands)}`);
    console.log(`  errors: ${runtime.errors.length}`);
    for (const e of runtime.errors) console.log(`    ${e.module} ${e.hook}: ${e.code} ${e.message}`);
    console.log(`  hash: ${out.hash}`);
  }
  if (runtime.errors.length) process.exitCode = 1;
}

/** A native template folder under plugins/_template/ (accepts `content` or `keel-content`). */
function findTemplate(name) {
  if (!name) return null;
  for (const n of [name, `keel-${name}`]) {
    const dir = path.join(ROOT, 'plugins/_template', n);
    const file = fs.existsSync(path.join(dir, 'plugin.keel.json')) ? path.join(dir, 'plugin.keel.json') : path.join(dir, 'plugin.json');
    if (!fs.existsSync(file)) continue;
    try {
      if (JSON.parse(fs.readFileSync(file, 'utf8')).manifest === 3) return dir;
    } catch { /* try the next name */ }
  }
  return null;
}

/** Replace a template's id (dashed and underscored) in its text files, so content ids stay in the new namespace. */
function rewriteTemplateIds(dir, fromId, toId) {
  const TEXT = new Set(['.json', '.js', '.mjs', '.md', '.txt', '.html', '.css']);
  const subs = new Map([[fromId, toId], [fromId.replaceAll('-', '_'), toId.replaceAll('-', '_')]]);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name === 'plugin.lock.json' || !TEXT.has(path.extname(e.name).toLowerCase())) continue;
      const before = fs.readFileSync(p, 'utf8');
      let after = before;
      for (const [a, b] of subs) after = after.split(a).join(b);
      if (after !== before) fs.writeFileSync(p, after);
    }
  };
  walk(dir);
}

function commandNew(template, id) {
  if (!template || !id) return fail('usage: keel new <template> <id> [--name <name>] [--dir <plugins>]');
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) return fail(`"${id}" is not a plugin id (lowercase letters, digits, '-')`);
  const src = findTemplate(template);
  if (!src) return fail(`no native template "${template}" under plugins/_template/ (keel-content, keel-lang, keel-policy, keel-multi-module, keel-reference, ...)`);
  const outDir = path.resolve(process.cwd(), flagValue('--dir', PLUGINS));
  const dir = path.join(outDir, id);
  if (fs.existsSync(dir)) return fail(`${dir} already exists`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(src, dir, { recursive: true });
  rewriteTemplateIds(dir, path.basename(src), id);
  const keelFile = path.join(dir, 'plugin.keel.json');
  const file = fs.existsSync(keelFile) ? keelFile : path.join(dir, 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.id = id;
  const name = flagValue('--name', id);
  manifest.name = typeof manifest.name === 'object' ? { ...manifest.name, zh: name, en: name } : { zh: name, en: name };
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  // a copied lock pins the template's id and file hashes: make a fresh one for the new folder
  let lock = null;
  if ((manifest.modules ?? []).some((m) => ['sim', 'match', 'policy'].includes(m.kind))) {
    const packed = packPlugin(dir, { dataDir: path.join(ROOT, 'data') });
    lock = packed.wrote === true;
    if (!lock) for (const i of packed.build?.issues ?? []) console.error(`  ${i.code ?? 'issue'}: ${i.message ?? i.code ?? ''}`);
  }
  const out = { id, dir: path.relative(process.cwd(), dir) || dir, template: path.basename(src), manifest: path.basename(file), ...(lock != null ? { lock } : {}) };
  if (json) printJson(out);
  else {
    console.log(`created ${out.dir} from ${out.template}`);
    if (lock != null) console.log(`  ${lock ? 'wrote' : 'did not write'} plugin.lock.json`);
    console.log(`next: node tools/keel.mjs check ${out.dir} --strict`);
    console.log(`      node tools/keel.mjs run ${out.dir} --frames 60`);
  }
  return out;
}

function commandDev(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  const dir = record.dir;
  const once = () => {
    const r = readKeelFolder(dir);
    if (json) printJson(summary(r));
    else humanGraph(r);
    process.exitCode = (r.problems?.length ?? 0) || (flags.has('--strict') && (r.warnings?.length ?? 0)) ? 1 : 0;
  };
  once();
  if (json) console.error('keel dev: --json is printed on every change; watching');
  let timer = null;
  const watcher = fs.watch(dir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n[${new Date().toISOString()}] change detected`);
      once();
    }, 150);
  });
  console.log(`watching ${path.relative(process.cwd(), dir) || dir} (Ctrl+C stops)`);
  process.on('SIGINT', () => { watcher.close(); process.exit(0); });
  return new Promise(() => {});
}

async function commandTest(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  if (!record.manifest) return fail(`${record.id}: the manifest did not validate`);
  const problems = record.problems ?? [];
  const warnings = record.warnings ?? [];
  const out = { id: record.id, source: record.source, problems, warnings, modules: [], errors: [], hash: null };
  if (!problems.length) {
    const modules = await loadKeelModules(record.manifest, { urlOf: (rel) => pathToFileURL(path.join(record.dir, rel)).href });
    out.modules = modules.map((m) => m.kind);
    if (modules.length) {
      const frames = Number(flagValue('--frames', '60'));
      if (!Number.isInteger(frames) || frames < 0 || frames > 100000) return fail('--frames is an integer 0–100000');
      const host = createFakeHost({ seed: '1', units: [{ id: 'target', side: 'enemy', hp: 100, maxHp: 100, x: 0, y: 0 }] });
      const runtime = createKeelRuntime({ manifest: record.manifest, modules, host, seed: '1' });
      runtime.run({ frames });
      out.errors = runtime.errors;
      out.hash = runtime.hash();
    }
  }
  if (json) printJson(out);
  else {
    console.log(`${out.id} · ${out.source} · ${out.modules.length} executable module(s)`);
    for (const p of problems) console.log(`  problem: ${p}`);
    for (const w of warnings) console.log(`  warning: ${w}`);
    for (const e of out.errors) console.log(`  error: ${e.module} ${e.hook}: ${e.code} ${e.message}`);
    if (!problems.length && !out.errors.length) console.log(`  ok${out.hash ? ` · ${out.hash}` : ''}`);
  }
  if (problems.length || out.errors.length) process.exitCode = 1;
  return out;
}

function commandPack(target) {
  const record = readTarget(target);
  if (record.error) return fail(record.error);
  const packed = packPlugin(record.dir, { dataDir: path.join(ROOT, 'data') });
  const issues = [...(packed.build?.issues ?? []), ...(packed.check?.issues ?? [])];
  const problems = [...(packed.build?.problems ?? []), ...(packed.check?.problems ?? [])];
  const out = { id: record.id, wrote: packed.wrote === true, files: Object.keys(packed.lock?.files ?? {}).length, problems, issues };
  if (json) printJson(out);
  else {
    for (const i of issues) console.log(`  ${i.level ?? 'problem'} ${i.code ?? ''}: ${i.message ?? ''}`);
    console.log(`${out.id}: ${out.wrote ? `wrote plugin.lock.json (${out.files} file${out.files === 1 ? '' : 's'})` : 'did not write plugin.lock.json'}`);
    if (packed.check) console.log(packed.check.problems.length ? `  check: ${packed.check.problems.length} problem(s)` : '  check: ok');
  }
  if (!out.wrote || problems.length) process.exitCode = 1;
  if (flags.has('--zip')) {
    const z = zipPlugin(record.dir);
    const rawOut = flagValue('--out', path.join(PLUGINS, '_dist', z.name));
    let to = path.resolve(process.cwd(), rawOut);
    if (/[\\/]$/.test(rawOut) || (fs.existsSync(to) && fs.statSync(to).isDirectory())) to = path.join(to, z.name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, z.body);
    if (!json) console.log(`  zip: ${path.relative(process.cwd(), to)} (${z.files.length} files)`);
    out.zip = path.relative(process.cwd(), to);
  }
  return out;
}

/**
 * N5 preflight: what still blocks dropping the manifest-2 loader. A folder with a manifest-3 descriptor is Keel and
 * survives the cutover; a folder with only a manifest-2 plugin.json is a blocker (migrate it first). A folder with both
 * is Keel (the old file is a leftover). Folders starting with '_' (templates, backups) are not plugins.
 */
function commandExit() {
  const dir = path.resolve(process.cwd(), flagValue('--dir', PLUGINS));
  const rows = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* no plugins folder: ready */ }
  for (const name of names.sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const folder = path.join(dir, name);
    let st;
    try { st = fs.statSync(folder); } catch { continue; }
    if (!st.isDirectory()) continue;
    const keelFile = path.join(folder, 'plugin.keel.json');
    const plain = path.join(folder, 'plugin.json');
    let keel = false;
    let legacy = false;
    let raw = null;
    if (fs.existsSync(keelFile)) {
      keel = true;
      try { raw = JSON.parse(fs.readFileSync(keelFile, 'utf8')); } catch { /* broken manifest: the check reports it */ }
    }
    if (fs.existsSync(plain)) {
      try {
        const m = JSON.parse(fs.readFileSync(plain, 'utf8'));
        if (m?.manifest === 3) { keel = true; raw ??= m; } else legacy = true;
      } catch { legacy = true; }
    }
    if (!keel && !legacy) continue;
    rows.push({
      id: name, keel, legacy,
      trust: raw?.trust ?? null,
      kinds: Array.isArray(raw?.modules) ? raw.modules.map((m) => m.kind) : [],
      trusted: raw?.trust === 'trusted' || raw?.trust === 'native' || raw?.legacy?.class === 'trusted',
      v2Script: !!raw?.compat?.v2Script,
    });
  }
  const blockers = rows.filter((r) => !r.keel);
  const mixed = rows.filter((r) => r.keel && r.legacy);
  const keelOnly = rows.filter((r) => r.keel && !r.legacy);
  const out = { dir: path.relative(process.cwd(), dir) || dir, total: rows.length, keel: keelOnly.length + mixed.length, keelOnly: keelOnly.length, mixed: mixed.map((r) => r.id), blockers: blockers.map((r) => ({ id: r.id, kinds: r.kinds, trusted: r.trusted, v2Script: r.v2Script })), rows };
  if (json) printJson(out);
  else {
    console.log(`keel exit: ${out.total} plugin folder(s) — ${out.keel} Keel, ${blockers.length} manifest 2 only`);
    for (const r of rows) {
      const flags = [r.keel ? 'keel' : 'manifest 2', r.keel && r.legacy ? 'also plugin.json' : '', r.trusted ? 'trusted/native' : '', r.v2Script ? 'v2 script' : ''].filter(Boolean);
      console.log(`  ${r.keel ? 'ok  ' : 'STOP'} ${r.id}  (${flags.join(', ')})`);
    }
    if (mixed.length) console.log(`\nmixed folders keep the Keel descriptor; the leftover plugin.json can be removed after review: ${mixed.map((r) => r.id).join(', ')}`);
    if (blockers.length) {
      console.log(`\n${blockers.length} blocker(s): migrate them first (node tools/keel.mjs import <id> --write, then check --strict).`);
      console.log('These folders are not loaded until migrated; see docs/keel/EXIT.md.');
    } else console.log('\nno blocker: every plugin folder is Keel (the manifest-2 loader is gone; see docs/keel/EXIT.md).');
  }
  process.exitCode = blockers.length ? 1 : 0;
  return out;
}

function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') { console.log(USAGE); return; }
  if (command === 'list') return commandList();
  if (command === 'graph') return commandGraph(rest[0]);
  if (command === 'check') return commandCheck(rest[0]);
  if (command === 'explain') return commandExplain(rest[0]);
  if (command === 'migrate') return commandMigrate(rest[0]);
  if (command === 'import') return commandMigrate(rest[0], { draft: true });
  if (command === 'run') return commandRun(rest[0]);
  if (command === 'demo') return commandDemo(rest[0]);
  if (command === 'new') return commandNew(rest[0], rest[1]);
  if (command === 'dev') return commandDev(rest[0]);
  if (command === 'test') return commandTest(rest[0]);
  if (command === 'pack') return commandPack(rest[0]);
  if (command === 'exit') return commandExit();
  if (command === 'surface') return commandSurface();
  return fail(`unknown command "${command}"\n${USAGE}`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  Promise.resolve(main()).catch((e) => {
    console.error(`keel: ${e?.message ?? e}`);
    process.exitCode = 1;
  });
}
