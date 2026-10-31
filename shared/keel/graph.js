// shared/keel/graph.js — the static module graph of one Keel plugin, and the order of several.
//
// M0 is read-only: the graph says what a plugin declares, which capabilities it asks for and which order hints it
// gives. It does not import plugin code and it does not touch a match.

import { readKeelManifest } from './manifest.js';

const union = (lists) => [...new Set(lists.flat())];

/**
 * Build the module graph of a manifest 3.
 * @param {unknown} raw the manifest (or a validated one)
 * @param {{ id?: string }} [opts]
 * @returns {{ graph: any, problems: string[], warnings: string[], issues: any[] }}
 */
export function buildKeelGraph(raw, opts = {}) {
  const checked = readKeelManifest(raw, opts);
  if (!checked.manifest) return { graph: null, problems: checked.problems, warnings: checked.warnings, issues: checked.issues };
  const m = checked.manifest;
  const problems = [...checked.problems];
  const warnings = [...checked.warnings];
  const issues = [...checked.issues];

  const modules = m.modules.map((mod, index) => ({
    index,
    id: `${mod.kind}:${mod.entry ?? mod.files?.[0] ?? index}`,
    kind: mod.kind,
    entry: mod.entry ?? null,
    files: [...(mod.files ?? [])],
    permissions: [...(mod.permissions ?? [])],
    provides: [...(mod.provides ?? [])],
    consumes: [...(mod.consumes ?? [])],
    slots: [...(mod.slots ?? [])],
  }));

  const permissions = union(modules.map((x) => x.permissions));
  const provides = union([...(m.provides ?? []), ...modules.map((x) => x.provides)]);
  const consumes = union([...(m.consumes ?? []), ...modules.map((x) => x.consumes)]);
  const kinds = union(modules.map((x) => [x.kind]));

  if (new Set(modules.map((x) => x.id)).size !== modules.length) {
    problems.push('two modules have the same id (kind + first path)');
  }
  if (m.loadAfter.includes(m.id) || m.loadBefore.includes(m.id) || Object.hasOwn(m.requires, m.id)) {
    problems.push(`"${m.id}" names itself in its order/dependency hints`);
  }
  if (m.trust === 'native') {
    warnings.push('native trust: review, lock pin and every player\'s consent are still required');
    if (!permissions.includes('native.execute')) warnings.push('native trust without "native.execute": the runtime would grant no native entry');
  }
  if (m.trust !== 'native' && permissions.includes('native.execute')) {
    problems.push('"native.execute" is only valid when "trust": "native"');
  }
  if (kinds.includes('sim') && !permissions.includes('sim.rng')) {
    warnings.push('a sim module without "sim.rng": the runtime will refuse Math.random and offer no stream');
  }
  const content = modules.filter((x) => x.kind === 'content');
  for (const mod of content) {
    if (!mod.files.length && !mod.entry) warnings.push(`${mod.id}: a content module with no files provides nothing`);
    if (!mod.permissions.length) warnings.push(`${mod.id}: a content module with no capability cannot write the content graph`);
  }
  if (m.compat?.manifest2 === true) warnings.push('compat.manifest2: generated from manifest 2; edit plugin.keel.json (plugin.json is ignored while it exists)');
  if (provides.length === 0 && content.length) warnings.push('the content module declares no "provides": Keel cannot attribute records to this plugin yet');

  const graph = {
    id: m.id,
    version: m.version,
    app: m.app,
    api: { ...m.api },
    trust: m.trust,
    scope: [...m.scope],
    modules,
    kinds,
    permissions,
    provides,
    consumes,
    order: {
      requires: Object.keys(m.requires),
      optional: Object.keys(m.optional),
      conflicts: Object.keys(m.conflicts),
      after: [...m.loadAfter],
      before: [...m.loadBefore],
      priority: m.priority,
    },
    ...(m.compat ? { compat: m.compat } : {}),
    ...(m.state ? { state: m.state } : {}),
    ...(m.legacy ? { legacy: m.legacy } : {}),
  };
  if (problems.length) return { graph: null, problems, warnings, issues };
  return { graph, problems, warnings, issues };
}

/**
 * Topologically order a set of graphs by `requires` + `loadAfter` (and the reverse `loadBefore`).
 * Missing dependencies are reported, not invented. A cycle is returned, not thrown.
 * @param {{ id: string, order?: { requires?: string[], after?: string[], before?: string[], priority?: number } }[]} graphs
 * @returns {{ order: string[], cycles: string[][], missing: { id: string, needs: string }[], problems: string[] }}
 */
export function orderPlugins(graphs) {
  const byId = new Map(graphs.map((g) => [g.id, g]));
  const missing = [];
  const problems = [];
  const edges = new Map(graphs.map((g) => [g.id, new Set()]));
  const indeg = new Map(graphs.map((g) => [g.id, 0]));

  const add = (from, to) => {
    if (!byId.has(to)) { missing.push({ id: from, needs: to }); return; }
    if (from === to) { problems.push(`"${from}" depends on itself`); return; }
    if (!edges.get(to).has(from)) { edges.get(to).add(from); indeg.set(from, indeg.get(from) + 1); }
  };
  for (const g of graphs) {
    for (const dep of g.order?.requires ?? []) add(g.id, dep);
    for (const dep of g.order?.after ?? []) add(g.id, dep);
    for (const dep of g.order?.before ?? []) add(dep, g.id);
  }

  const ready = graphs.filter((g) => indeg.get(g.id) === 0).map((g) => g.id);
  ready.sort((a, b) => (byId.get(b)?.order?.priority ?? 0) - (byId.get(a)?.order?.priority ?? 0) || a.localeCompare(b));
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const next of edges.get(id) ?? []) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) {
        ready.push(next);
        ready.sort((a, b) => (byId.get(b)?.order?.priority ?? 0) - (byId.get(a)?.order?.priority ?? 0) || a.localeCompare(b));
      }
    }
  }

  const cycles = [];
  if (order.length !== graphs.length) {
    const left = graphs.map((g) => g.id).filter((id) => !order.includes(id));
    cycles.push(left);
    problems.push(`dependency cycle among: ${left.join(', ')}`);
  }
  for (const miss of missing) problems.push(`"${miss.id}" requires missing plugin "${miss.needs}"`);
  return { order, cycles, missing, problems };
}
