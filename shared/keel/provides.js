// shared/keel/provides.js — what a content module actually contributes, as `<kind>:<id>` strings.
//
// Keel's graph warning ("cannot attribute records to this plugin") is only useful while `provides` is empty. This
// helper reads the records a content loader already produced, including `add` patch operations, and names them.

const PREFIX = Object.freeze({
  enemies: 'enemy', enemy: 'enemy',
  bosses: 'boss', boss: 'boss',
  waves: 'wave', wave: 'wave',
  stages: 'stage', stage: 'stage',
  modes: 'mode', mode: 'mode',
  operators: 'operator', operator: 'operator',
  tokens: 'token', token: 'token',
  bands: 'band', band: 'band',
});

function prefixOf(file, path) {
  if (file === 'config' && Array.isArray(path) && path[0] === 'modes') return 'mode';
  return PREFIX[file] ?? null;
}

/**
 * @param {{ records?: { table: string, id: string }[], patches?: { ops?: any[] }[] }} content
 * @returns {string[]} sorted, unique `<kind>:<id>` strings
 */
export function providesFromContent(content) {
  const out = new Set();
  for (const record of content?.records ?? []) {
    const prefix = prefixOf(record?.table, null);
    if (prefix && typeof record.id === 'string') out.add(`${prefix}:${record.id}`);
  }
  for (const patch of content?.patches ?? []) {
    for (const op of patch?.ops ?? []) {
      if (op?.op !== 'add' || typeof op.id !== 'string') continue;
      const prefix = prefixOf(op.file, op.path);
      if (prefix) out.add(`${prefix}:${op.id}`);
    }
  }
  return [...out].sort();
}

/** Add `provides` to the content module of a manifest (a copy). */
export function withContentProvides(manifest, provides) {
  if (!manifest || !Array.isArray(manifest.modules) || !provides?.length) return manifest;
  return {
    ...manifest,
    modules: manifest.modules.map((mod) => mod.kind === 'content'
      ? { ...mod, provides: [...new Set([...(mod.provides ?? []), ...provides])] }
      : mod),
  };
}
