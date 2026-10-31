// server/keel/native-code.js — read the executable entries of a native Keel plugin (sim / match / policy) and their
// lock state **without importing them**. `loadKeelPlugin` uses this to decide whether the owner's trust gate lets the
// code run before any module is evaluated.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import { nodeSha256 } from '../plugins/identity.js';

/** A syntax check of a native entry, without executing it (parse-only, D9/authorship). */
export function parseNativeSource(source) {
  try {
    parse(String(source ?? ''), { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
    return null;
  } catch (e) {
    return { line: e.loc?.line ?? null, column: e.loc?.column ?? null, message: String(e.message || e).slice(0, 300) };
  }
}

/** The module kinds whose entry is code. */
export const NATIVE_CODE_KINDS = Object.freeze(['sim', 'match', 'policy']);

/**
 * The entry paths of a manifest's executable modules (one per path, in declaration order).
 * @param {any} manifest
 * @returns {string[]}
 */
export function nativeEntries(manifest) {
  return [...new Set((manifest?.modules ?? [])
    .filter((m) => m && NATIVE_CODE_KINDS.includes(m.kind) && typeof m.entry === 'string')
    .map((m) => m.entry))];
}

/**
 * Read the entry sources and the lock state of a native code plugin.
 * @param {string} dir @param {any} manifest @param {{ rel: string, bytes?: number, link?: boolean }[]} listed
 * @returns {{ entries: string[], sources: Record<string, string>, files: Record<string, string>, lockHash: string | null,
 *   lockValid: boolean, lockedFiles: Record<string, { sha256?: string, bytes?: number }> }}
 */
export function readNativeCode(dir, manifest, listed = []) {
  const entries = nativeEntries(manifest);
  const sources = {};
  const files = {};
  for (const rel of entries) {
    try {
      const bytes = fs.readFileSync(path.join(dir, rel));
      sources[rel] = bytes.toString('utf8');
      files[rel] = nodeSha256(bytes);
    } catch { /* a missing entry is the manifest check's problem, not this read's */ }
  }
  let lockHash = null;
  let lockValid = false;
  let lockedFiles = {};
  const parseProblems = entries.map((rel) => {
    const problem = parseNativeSource(sources[rel]);
    return problem ? { entry: rel, ...problem } : null;
  }).filter(Boolean);
  try {
    const raw = fs.readFileSync(path.join(dir, 'plugin.lock.json'));
    lockHash = nodeSha256(raw);
    const lock = JSON.parse(raw);
    lockedFiles = lock.files || {};
    const actual = listed.filter((f) => f.rel !== 'plugin.lock.json');
    lockValid = Object.entries(files).every(([rel, hash]) => lockedFiles[rel]?.sha256 === hash)
      && lock.lock === 1 && lock.id === manifest.id && lock.version === manifest.version
      && actual.length === Object.keys(lock.files || {}).length
      && actual.every((f) => !f.link
        && lock.files?.[f.rel]?.bytes === f.bytes
        && lock.files[f.rel].sha256 === nodeSha256(fs.readFileSync(path.join(dir, f.rel))));
  } catch { /* absent or stale: execution refused (fail closed) */ }
  return { entries, sources, files, lockHash, lockValid, lockedFiles, parseProblems };
}
