// server/keel/content.js — the content half of a Keel room: read content modules and overlay their records on the
// data source a Battle uses. M2 covers enemy/operator/stage/mode/wave lookups; the full GameData graph is later.

import fs from 'node:fs';
import path from 'node:path';
import { expandGameplayRecords, reconcilePluginBonds, reconcilePluginTokens } from '../plugins/gameplayRecords.js';
import { expandTraitRecords } from '../plugins/operatorTraits.js';
import { expandFxRecords } from '../plugins/fxRecords.js';
import { validateDsl, validatePrepSpec } from '../sim/content/dsl/validate.js';
import { computeGroundPaths, computeDeployTiles } from '../sim/groundPaths.js';
import { applyPatches } from '../../shared/plugins/patch.js';

const TABLES = Object.freeze({
  enemies: 'enemies', enemy: 'enemies',
  operators: 'operators', operator: 'operators',
  stages: 'stages', stage: 'stages',
  modes: 'modes', mode: 'modes',
  waves: 'waves', wave: 'waves',
  bosses: 'bosses', boss: 'bosses',
  tokens: 'tokens', token: 'tokens',
  bands: 'bands', band: 'bands',
});

const ROLE_BY_FILE = Object.freeze({
  enemy: 'enemies', enemies: 'enemies',
  operator: 'operators', operators: 'operators',
  stage: 'stages', stages: 'stages',
  mode: 'modes', modes: 'modes',
  wave: 'waves', waves: 'waves',
  boss: 'bosses', bosses: 'bosses',
  token: 'tokens', tokens: 'tokens',
  band: 'bands', bands: 'bands',
});

/** The v2 record file a loaded table came from (the compiler reads `file`, not `table`). */
const FILE_OF_TABLE = Object.freeze({
  enemies: 'enemies', operators: 'operators', stages: 'stages', modes: 'modes',
  waves: 'waves', bosses: 'bosses', tokens: 'tokens', bands: 'bands',
});

const empty = () => ({ enemies: new Map(), operators: new Map(), stages: new Map(), modes: new Map(), waves: new Map(), bosses: new Map(), tokens: new Map(), bands: new Map(), patches: [] });

/**
 * Read `content` modules of a manifest. Records are `{ file, id, value }` entries (the v2 records shape); a plain
 * `{ "<id>": <value> }` table is accepted too.
 * @param {string} dir
 * @param {any} manifest
 */
export function loadKeelContent(dir, manifest) {
  const content = empty();
  const records = [];
  const permissions = new Set();
  const documents = {};
  const dsl = [];
  const i18n = [];
  const dslProblems = [];
  for (const mod of manifest?.modules ?? []) {
    if (mod.kind !== 'content') continue;
    for (const p of mod.permissions ?? []) permissions.add(p);
    const partOf = new Map();
    for (const [part, files] of Object.entries(mod.parts ?? {})) for (const f of files) partOf.set(f, part);
    for (const rel of mod.files ?? []) {
      const declared = partOf.get(rel);
      let json;
      try { json = JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')); } catch { continue; }
      documents[rel] = json;
      if (declared === 'dsl') {
        const checked = validatePrepSpec(json, manifest?.id ?? null);
        if (!checked.ok) for (const p of checked.problems) dslProblems.push(`${rel}${p.path ? `.${p.path}` : ''}: ${p.zh ?? p.message ?? p.code}`);
        else dsl.push({ rel, pluginId: manifest?.id ?? null, spec: json });
        continue;
      }
      if (declared === 'offers') continue;
      if (declared === 'i18n') {
        if (json?.version === 1 && typeof json.lang === 'string' && json.files && typeof json.files === 'object') i18n.push({ rel, lang: json.lang, doc: json });
        else dslProblems.push(`${rel}: a translation needs version:1, lang and files`);
        continue;
      }
      // Other declared parts (theme, fx) have their own consumers and are not record tables.
      if (declared && !['data', 'operators', 'enemies', 'modes', 'stages'].includes(declared)) continue;
      // A patch document that changes existing records (e.g. config.modes) is not an add table: keep it for merge time.
      if (json && json.patch === 1 && Array.isArray(json.ops) && json.ops.some((op) => op?.op !== 'add')) {
        content.patches.push({ rel, ops: json.ops });
        continue;
      }
      const entries = Array.isArray(json)
        ? json
        : Array.isArray(json?.entries)
          ? json.entries
          : Array.isArray(json?.ops)
            ? json.ops.filter((op) => op?.op === 'add').map((op) => ({ file: op.file, id: op.id, value: op.value }))
            : json && typeof json === 'object' && (json.charId || json.tokenId || json.bandId)
              ? [{ file: json.charId ? 'operators' : json.tokenId ? 'tokens' : 'bands', id: json.charId ?? json.tokenId ?? json.bandId, value: json }]
              : Object.entries(json ?? {}).map(([id, value]) => ({ file: path.basename(rel, '.json'), id, value }));
      for (const e of entries) {
        const role = e?.file ?? declared ?? ROLE_BY_FILE[path.basename(rel, '.json')] ?? 'enemies';
        const table = TABLES[role] ?? null;
        const value = e?.value ?? e?.set;
        if (!table || typeof e?.id !== 'string' || value === undefined) continue;
        content[table].set(e.id, value);
        records.push({
          table, id: e.id, value,
          ...(e?.base !== undefined ? { base: e.base } : {}),
          ...(e?.set !== undefined ? { set: e.set } : {}),
        });
      }
    }
  }
  return { ...content, records, permissions: [...permissions], documents, dsl, i18n, dslProblems, pluginId: manifest?.id ?? null };
}

/**
 * Merge records into the raw tables `GameData` reads. Every record goes through the same compiler the v2 content set
 * uses (enemies/bosses/waves/modes/tokens/bands, plus operator → chess), then patch documents are applied. It returns a
 * new object; the input object is never mutated.
 * @param {any} data
 * @param {ReturnType<typeof loadKeelContent>} content
 * @param {{ settings?: Record<string, unknown>, onProblem?: (problems: any[]) => void }} [opts]
 */
export function mergeKeelData(data, content, opts = {}) {
  if (!data || !content || (!content.records?.length && !content.patches?.length)) return data;
  let out = { ...data };
  const records = (content.records ?? []).map((r) => r.table === 'operators'
    ? r.value
    : {
      file: FILE_OF_TABLE[r.table] ?? r.table,
      id: r.id,
      ...(r.base !== undefined ? { base: r.base } : {}),
      ...(r.set !== undefined ? { set: r.set } : {}),
      value: r.value,
    });
  if (records.length) {
    const expanded = expandTraitRecords(out, records, {
      pluginId: content.pluginId ?? null,
      permissions: content.permissions ?? [],
      validateDsl,
    }, (d, rs, opts) => expandFxRecords(d, rs, opts, expandGameplayRecords));
    if (expanded.problems.length) {
      if (typeof opts.onProblem === 'function') opts.onProblem(expanded.problems);
      else throw new Error(`Keel content ${content.pluginId ?? '?'} did not compile: ${expanded.problems[0]?.message ?? expanded.problems[0]?.code ?? 'unknown problem'}`);
    } else out = reconcilePluginTokens(reconcilePluginBonds(expanded.data));
  }
  for (const patch of content.patches ?? []) {
    const applied = applyPatches(out, patch.ops, { pluginId: content.pluginId ?? null, settings: opts.settings ?? {} });
    if (applied.problems.length) {
      if (typeof opts.onProblem === 'function') opts.onProblem(applied.problems);
      else throw new Error(`Keel content ${content.pluginId ?? '?'} patch ${patch.rel} failed: ${applied.problems[0]?.message ?? 'unknown problem'}`);
    } else out = applied.data;
  }
  // A stage record owns its derived ground paths / deploy tiles; a changed wave also re-derives the stages its modes use.
  const stageIds = new Set(content.stages?.keys?.() ?? []);
  for (const patch of content.patches ?? []) for (const op of patch.ops ?? []) if (op?.file === 'stages' && typeof op.id === 'string') stageIds.add(op.id);
  const changedWaves = new Set();
  for (const [id, wave] of Object.entries(out.waves ?? {})) {
    const before = data.waves?.[id];
    if (!before
      || JSON.stringify(before.routes ?? []) !== JSON.stringify(wave.routes ?? [])
      || JSON.stringify(before.extraRoutes ?? []) !== JSON.stringify(wave.extraRoutes ?? [])) changedWaves.add(id);
  }
  const routeStages = new Set();
  if (changedWaves.size) for (const mode of Object.values(out.config?.modes ?? {})) {
    if (!wavesUsedByMode(mode).some((id) => changedWaves.has(id))) continue;
    for (const sid of mode.stages ?? []) routeStages.add(sid);
  }
  if (stageIds.size || routeStages.size) {
    const routes = Object.values(out.waves ?? {}).flatMap((w) => [...(w.routes ?? []), ...(w.extraRoutes ?? [])]);
    out.stages = { ...(out.stages ?? {}) };
    for (const id of stageIds) {
      const stage = out.stages[id];
      if (stage) out.stages[id] = { ...stage, ...computeGroundPaths(stage, routes), deployTiles: computeDeployTiles(stage) };
    }
    for (const id of routeStages) {
      if (stageIds.has(id)) continue;
      const stage = out.stages[id];
      if (stage) out.stages[id] = { ...stage, ...computeGroundPaths(stage, routes) };
    }
  }
  return out;
}

/** Wave ids a mode can field: each round's template, plus any bossTemplates. */
function wavesUsedByMode(mode) {
  const ids = [];
  for (const rd of Object.values(mode?.rounds ?? {})) {
    if (typeof rd?.template === 'string') ids.push(rd.template);
    for (const id of Object.values(rd?.bossTemplates ?? {})) if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

/**
 * Wrap a data source so `getEnemy` / `getOperator` / … prefer the Keel records. The wrapper is a Proxy: it keeps every
 * other method and property of the original source.
 * @param {any} data
 * @param {ReturnType<typeof loadKeelContent>} content
 */
export function overlayData(data, content) {
  if (!data || !content || !content.records?.length) return data;
  const maps = {
    getEnemy: content.enemies,
    getOperator: content.operators,
    getStage: content.stages,
    getMode: content.modes,
    getWave: content.waves,
    getBoss: content.bosses,
    getToken: content.tokens,
    getBand: content.bands,
  };
  return new Proxy(data, {
    get(target, key, receiver) {
      const map = maps[key];
      if (map && map.size) {
        return (id) => map.get(id) ?? (typeof target[key] === 'function' ? target[key](id) : undefined);
      }
      return Reflect.get(target, key, receiver);
    },
  });
}
