#!/usr/bin/env node
// tools/refresh-anim-roles.mjs — re-resolve the animation ROLES of data/assets.json OFFLINE from each entry's own
// committed `animations` list (the skeleton's clip names + durations), without the network or the gamedata cache.
//
// data/assets.json is written by tools/fetch-assets.mjs, which resolves every model's roles from its skeleton
// (tools/assets/anim-roles.mjs) and applies the PREFAB_SPINE_ROLES / LOCAL_SPINE_ROLES fixes (tools/assets/spine.mjs).
// When only the ROLE RESOLUTION changes (a resolver rule, a fix table entry), the manifest can be rebuilt from itself:
// every entry already carries `animations` (name -> seconds), which is all resolveRoles reads. The URL plan, the hashes
// and every other field are left untouched.
//
//   node tools/refresh-anim-roles.mjs            dry run: list the entries whose role set would change
//   node tools/refresh-anim-roles.mjs --write    write data/assets.json (compact JSON + newline, as fetch-assets does)
//   node tools/refresh-anim-roles.mjs --verbose  print each changed entry's before/after roles
//
// The skill indices are reconstructed from the committed roles (the primary skill's `index` + the keys of `skills`), the
// same set the fetch resolved. A change to a model's SKELETON (new clips) still needs a real fetch-assets run.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoles } from './assets/anim-roles.mjs';
import { applyRoleFix, PREFAB_SPINE_ROLES, LOCAL_SPINE_ROLES } from './assets/spine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'data', 'assets.json');
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const VERBOSE = argv.includes('--verbose');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const changed = [];

/** Re-resolve one spine entry in place; records it when its roles move. */
function fix(entry, id, numbered, where) {
  if (!entry || !entry.animations || !entry.anims) return;
  const names = Object.keys(entry.animations);
  const a = entry.anims;
  const primary = Number.isInteger(a.skill?.index) ? a.skill.index : 0;
  const indices = [...new Set([primary, ...Object.keys(a.skills || {}).map(Number)])];
  const resolved = resolveRoles(names, { skillIndices: indices, numberedSkills: numbered, durations: entry.animations });
  const roles = applyRoleFix(resolved, PREFAB_SPINE_ROLES[id] ?? LOCAL_SPINE_ROLES[id], entry.animations).roles;
  if (JSON.stringify(roles) === JSON.stringify(a)) return;
  changed.push(`${where}:${id}`);
  if (VERBOSE) {
    console.log(`\n[${where}:${id}]`);
    console.log('  was:', JSON.stringify(a));
    console.log('  now:', JSON.stringify(roles));
  }
  entry.anims = roles;
}

for (const [id, rec] of Object.entries(manifest.chars || {})) {
  const sp = rec && rec.spine;
  if (!sp) continue;
  // a char's `spine` is the { front, back } wrapper; each model carries its own roles
  if (sp.front || sp.back) {
    fix(sp.front, id, false, 'chars.front');
    fix(sp.back, id, false, 'chars.back');
  } else fix(sp, id, false, 'chars');
}
for (const [id, rec] of Object.entries(manifest.enemies || {})) {
  if (rec && rec.spine) fix(rec.spine, id, true, 'enemies');
}
for (const [id, rec] of Object.entries(manifest.tokens || {})) {
  if (!rec) continue;
  if (rec.spine) fix(rec.spine, id, false, 'tokens');
  if (rec.spineLocal) fix(rec.spineLocal, id, false, 'tokens.local');
}

if (!changed.length) {
  console.log('anim roles: already up to date');
  process.exit(0);
}
console.log(`anim roles: ${changed.length} entr${changed.length === 1 ? 'y' : 'ies'} would change: ${changed.slice(0, 40).join(', ')}`);
if (!WRITE) {
  console.log('(dry run — pass --write to rewrite data/assets.json)');
  process.exit(0);
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest)}\n`);
console.log(`wrote ${path.relative(ROOT, MANIFEST)}`);
