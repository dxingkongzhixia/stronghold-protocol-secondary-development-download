// tools/versions/profiles.mjs — the build profile of an official version (shared/versions.js; docs/UPSTREAM-REGULATION.md).
// A profile is tools/versions/<slug>.mjs:
//   { id, season, section?, layout?, pins?, adapters?, tables?, expect? }
//   section   the path of the season's tables under activity_table `activity` (omitted = AUTOCHESS_SEASON.<season>, every
//             盟约 build; 规程 keeps one entry per sub-version: ['AUTOCHESS', 'act3autochess', 'V3_1'])
//   layout    'regulation' (规程: stage atlases of three pieces, road-only templates — the 盟约 19×21 levels,
//             tools/versions/layouts.mjs); omitted = the levels are already 盟约's
//   pins      null (master, .cache/gamedata/) or { default: <sha>, <group>: <sha> … } — the commit of each file group
//             (pinGroupOf), cached in .cache/gamedata@<sha>/
//   adapters  names in tools/versions/adapters.mjs, applied in this order to the loaded activity_table
//   tables    the version's measured draft tables module id (tools/versions/tables/<id>.mjs) or null
import { VERSIONS, versionById, versionSlug } from '../../shared/versions.js';

/** The official commit a file is read from groups files that change together (pins[group] ?? pins.default). */
const PIN_GROUPS = Object.freeze({
  'excel/activity_table.json': 'activity',
  'excel/character_table.json': 'character',
  'excel/char_patch_table.json': 'character',
  'excel/skill_table.json': 'character',
  'excel/uniequip_table.json': 'character',
  'excel/battle_equip_table.json': 'character',
  'excel/range_table.json': 'range',
  'excel/enemy_handbook_table.json': 'enemy',
  'levels/enemydata/enemy_database.json': 'enemy',
});

/**
 * The pin group of a gamedata path (relative to zh_CN/gamedata/), or null for a file no group names.
 * @param {string} rel
 * @returns {string | null}
 */
export function pinGroupOf(rel) {
  if (Object.hasOwn(PIN_GROUPS, rel)) return PIN_GROUPS[rel];
  if (rel.startsWith('levels/activities/')) return 'levels';
  return null;
}

/**
 * The commit a profile reads a gamedata file from, or null for master.
 * @param {{ pins?: Record<string, string> | null }} profile
 * @param {string} rel
 * @returns {string | null}
 */
export function pinnedShaOf(profile, rel) {
  if (!profile || !profile.pins) return null;
  const group = pinGroupOf(rel);
  return (group && profile.pins[group]) || profile.pins.default || null;
}

/**
 * The registry entry and the build profile of a version id. Throws on an unknown id or a profile that does not match
 * its entry.
 * @param {string} id
 * @returns {Promise<{ entry: import('../../shared/versions.js').OfficialVersion, profile: any, slug: string }>}
 */
export async function loadProfile(id) {
  const entry = versionById(id);
  if (!entry) throw new Error(`unknown version ${JSON.stringify(id)} (valid: ${VERSIONS.map((v) => v.id).join(', ')})`);
  const slug = versionSlug(entry);
  const profile = (await import(`./${slug}.mjs`)).default;
  if (!profile || profile.id !== entry.id || profile.season !== entry.season) {
    throw new Error(`tools/versions/${slug}.mjs: id / season ${profile?.id} / ${profile?.season} do not match ${entry.id} / ${entry.season}`);
  }
  return { entry, profile, slug };
}
