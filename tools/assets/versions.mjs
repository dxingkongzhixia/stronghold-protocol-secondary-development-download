// tools/assets/versions.mjs — the official-version presentation union and its asset gap planner (P4).
//
// Assets are keyed by art identity, never by chess id: seasons reuse chess ids for different operators (docs/DATA.md
// "Official versions"). The union covers every non-default version's chess, backups, tokens, enemies, items, bands,
// bonds, bosses and stages; `versionAssetGaps` then checks each record against the web manifest (data/assets.json) and
// the committed local-client manifest (data/local-assets.committed.json + public/assets/local).
//
//   node tools/assets/versions.mjs --check          per-version gaps; exit 1 when a record lacks required art
//   node tools/assets/versions.mjs --json           the same as JSON
//   node tools/assets/versions.mjs --junctions      only the records missing art (for the fetch/local-extract plan)
//
// `presentationUnion` and `versionAssetData` are the fetch-assets side's planning input; the CLI is the CI/authoring
// audit. Local-client art is preferred: a record whose files exist under public/assets/local needs no download.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VERSIONS } from '../../shared/versions.js';

/** Gameplay tables whose presentation the client draws. */
export const PRESENTATION_TABLES = ['chess', 'backups', 'tokens', 'enemies', 'items', 'bands', 'bonds', 'bosses', 'stages'];

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** One entry per registered non-default version that has built data. @param {string} root */
export function versionAssetData(root) {
  return VERSIONS.filter((v) => v.dir && existsSync(join(root, 'data', v.dir, 'chess.json'))).map((version) => ({
    version,
    ...Object.fromEntries(PRESENTATION_TABLES.map((name) => [name,
      read(join(root, 'data', version.dir, `${name}.json`))])),
  }));
}

/**
 * Every art identity of one or more versions, first record wins (the default data need not be included: its manifest is
 * the base). Operators carry their skills and module type icons; bands/items keep the record that names their icons.
 * @param {Array<Record<string, any>>} sets versionAssetData() rows
 */
export function presentationUnion(sets) {
  const operators = {}, enemies = {}, tokens = {}, bands = {}, items = {}, bonds = {};
  const modules = new Set();
  const addOperator = (id, rec, forms) => {
    if (typeof id !== 'string' || !id) return;
    const o = operators[id] ??= { name: rec?.name ?? id, skills: [], moduleTypes: [] };
    for (const form of forms) {
      for (const sk of [...(form?.skills || []), ...(form?.skill ? [form.skill] : [])]) {
        if (!sk || !sk.iconId || o.skills.some((s) => s.iconId === sk.iconId)) continue;
        o.skills.push({ index: Number.isInteger(sk.index) ? sk.index : 0, skillId: sk.skillId || sk.iconId, iconId: sk.iconId });
      }
      for (const m of form?.modules || []) if (m?.typeIcon) { modules.add(m.typeIcon); if (!o.moduleTypes.includes(m.typeIcon)) o.moduleTypes.push(m.typeIcon); }
    }
    o.skills.sort((a, b) => a.index - b.index);
  };
  for (const d of sets) {
    for (const [id, rec] of Object.entries(d.enemies || {})) enemies[id] ??= rec;
    for (const [id, rec] of Object.entries({ ...(d.backups?.tokens || {}), ...(d.tokens || {}) })) tokens[id] ??= rec;
    for (const [id, rec] of Object.entries(d.bands || {})) bands[id] ??= rec;
    for (const [id, rec] of Object.entries(d.bonds || {})) bonds[id] ??= rec;
    for (const rec of Object.values(d.items || {})) if (rec?.iconId || rec?.trapId) items[rec.iconId || rec.trapId] ??= rec;
    for (const rec of Object.values(d.chess || {})) addOperator(rec.charId, rec, [rec]);
    for (const [charId, rec] of Object.entries(d.backups?.units || {})) addOperator(charId, rec, Object.values(rec.forms || {}));
  }
  return { operators, enemies, tokens, bands, items, bonds, moduleTypes: [...modules].sort() };
}

/** Add-only merge: keeps existing values (arrays/null included), admits new keys. */
export function addManifestEntries(previous, next) {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return previous;
  if (!next || typeof next !== 'object' || Array.isArray(next)) return previous;
  const out = { ...previous };
  for (const [k, v] of Object.entries(next)) out[k] = Object.hasOwn(previous, k) ? addManifestEntries(previous[k], v) : v;
  return out;
}

/**
 * Per-version presentation gaps. A record is `missing` only when neither the web manifest nor the local-client manifest
 * can draw the required parts; `icons` still lists absent optional icons (a boss/summon with no handbook icon).
 * @param {string} root
 * @returns {{ versions: Array<{ id: string, label: string, records: number, missing: number, gaps: Array<{kind:string,id:string,missing:string[]}> }> }}
 */
export function versionAssetGaps(root) {
  const assets = read(join(root, 'data', 'assets.json'));
  const localPath = existsSync(join(root, 'data', 'local-assets.committed.json'))
    ? join(root, 'data', 'local-assets.committed.json') : join(root, 'data', 'local-assets.json');
  const local = existsSync(localPath) ? read(localPath) : { groups: {} };
  const file = (url) => typeof url === 'string' && url && existsSync(join(root, 'public', url.replace(/^\//, '')));
  const group = (g) => !!(local.groups?.[g] && Object.keys(local.groups[g]).length);
  const anyGroup = (...gs) => gs.some(group);
  const NO_MODEL = new Set(['enemy_9016_acstmr', 'enemy_9036_acweb']);
  const versions = [];
  for (const d of versionAssetData(root)) {
    const all = presentationUnion([d]);
    const gaps = [];
    const add = (kind, id, missing) => { if (missing.length) gaps.push({ kind, id, missing }); };
    for (const id of Object.keys(all.operators)) {
      const c = assets.chars?.[id];
      const missing = [];
      if (!((c?.avatar && file(c.avatar)) || (c?.avatarE2 && file(c.avatarE2)) || group(`char/avatar/${id}`))) missing.push('avatar');
      if (!((c?.spine?.front?.skel && file(c.spine.front.skel)) || anyGroup(`spine/char/${id}/front`, `spine/char/${id}/back`))) missing.push('spine');
      add('operator', id, missing);
    }
    for (const id of Object.keys(all.enemies)) {
      const e = assets.enemies?.[id];
      const missing = [];
      if (!((e?.icon && file(e.icon)) || group('enemy/icon') && local.groups['enemy/icon'][id])) missing.push('icon');
      if (!((e?.spine?.skel && file(e.spine.skel)) || group(`spine/enemy/${id}`))) missing.push('spine');
      // projectile / marker records have no battle Spine (their effect draws them)
      if (NO_MODEL.has(id)) { const at = missing.indexOf('spine'); if (at >= 0) missing.splice(at, 1); }
      add('enemy', id, missing);
    }
    for (const id of Object.keys(d.bands || {})) {
      if (!((assets.bands?.[id] && file(assets.bands[id])) || group(`band/${id}`))) add('band', id, ['icon']);
    }
    for (const [id] of Object.entries(d.bonds || {})) {
      if (!((assets.bonds?.[id] && file(assets.bonds[id])) || group(`bond/${id}`))) add('bond', id, ['icon']);
    }
    for (const [iconId] of Object.entries(all.items)) {
      if (!((assets.items?.[iconId] && file(assets.items[iconId])) || group(`item/${iconId}`))) add('item', iconId, ['icon']);
    }
    for (const [id, rec] of Object.entries(d.bosses || {})) {
      const e = assets.enemies?.[rec.enemyKey];
      const missing = [];
      if (!((e?.icon && file(e.icon)) || (local.groups?.['enemy/icon'] || {})[rec.enemyKey])) missing.push('icon');
      if (!((e?.spine?.skel && file(e.spine.skel)) || group(`spine/enemy/${rec.enemyKey}`))) missing.push('spine');
      add('boss', id, missing);
    }
    for (const [id, rec] of Object.entries(d.stages || {})) {
      if (rec.kind !== 'unite' && !existsSync(join(root, 'public', 'assets', 'local', 'scene', id))) add('stage', id, ['scene']);
    }
    versions.push({ id: d.version.id, label: d.version.label, records: Object.keys(all.operators).length + Object.keys(all.enemies).length, missing: gaps.length, gaps });
  }
  return { versions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : fileURLToPath(new URL('../..', import.meta.url)));
  const result = versionAssetGaps(root);
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (args.includes('--junctions')) {
    for (const v of result.versions) for (const g of v.gaps) console.log(`${v.id}\t${g.kind}\t${g.id}\t${g.missing.join(',')}`);
  } else {
    for (const v of result.versions) {
      console.log(`${v.label}: ${v.records} records, ${v.missing} with gaps`);
      if (args.includes('--check')) for (const g of v.gaps) console.error(`  ${g.kind} ${g.id}: ${g.missing.join(', ')}`);
    }
  }
  process.exitCode = args.includes('--check') && result.versions.some((v) => v.missing) ? 1 : 0;
}
