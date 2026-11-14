// shared/versions.js — the official versions this remake can play (the mainline's version-system chapter, its §35.22;
// ported 2026-11-15 for 规程, owner decision of that date: route A, the versions coexist and the default stays 盟约). Pure ESM, no Node APIs:
// the server, the browser and the tools read the same table.
//
//   id         the official activity id, plus `@<versionInfoDict id>` for a sub-version (autoChessData.versionInfoDict)
//   season     the activity id the build reads (`config.season` of the built data)
//   family     'covenant' (盟约, AUTOCHESS_SEASON) or 'regulation' (规程, activity.AUTOCHESS: one entry per sub-version,
//              序列Ⅰ = V3_1 from 2026-11-08 16:00): the build adapters and the rule switches of one engine
//   label      a msgid (public/i18n/*.json): the maintainer's names by period (2026-10-22) — 第一期 is act1autochess,
//              the official 「卫戍协议：盟约」 上半期活动, 第二期 act2autochess, its 下半期活动. 规程·序列Ⅰ is the official
//              name of 「卫戍协议·规程」's first sequence (act3autochess V3_1)
//   roomModes  the room modes the version offers
//   dir        where the built data lives under data/: '' for the default (data/*.json, unchanged), otherwise
//              versions/<slug>/ — lowercase and safe on every OS (no '@'); a path or a file name uses versionSlug()
//
// Our registry lists two entries, not the mainline's five: the default (第二期下半, data/*.json) and 规程·序列Ⅰ
// (data/versions/act3autochess-v3_1/). The mainline's three historical data directories (第一期上/下, 第二期上) are not
// ported — each is 16 files plus 6 golden files and nobody plays them here; adding one later is a registry row plus its
// build profile (tools/versions/<slug>.mjs). Their absence is a deliberate fork divergence, not an omission.
//
// The default is a code constant, never a server setting: data, rooms and logs without a version mean act2autochess.
// LOBBY_DEFAULT_VERSION is what a server preselects in the lobby when its configuration names none. The mainline sets
// it to the running official season (规程·序列Ⅰ, owner 2026-11-09); our owner kept the lobby on 盟约 (2026-11-15), so it
// equals DEFAULT_VERSION here — SP_VERSION_DEFAULT / the `versions.default` option still override it per server.

import { N_ } from './i18n.js';
import { modeIdFor } from './constants.js';

/** The version every record without one means (today's 第二期下半: act2autochess V2_2). */
export const DEFAULT_VERSION = 'act2autochess';

/** The version a server preselects in the lobby when its configuration names none (ours: the default, 盟约). */
export const LOBBY_DEFAULT_VERSION = DEFAULT_VERSION;

/**
 * @typedef {{ id: string, season: string, family: 'covenant' | 'regulation', label: string,
 *   roomModes: readonly string[], dir: string }} OfficialVersion
 */

/** @type {readonly OfficialVersion[]} */
export const VERSIONS = Object.freeze([
  { id: 'act2autochess', season: 'act2autochess', family: 'covenant', label: N_('第二期下半'), roomModes: ['solo', 'coop'], dir: '' },
  { id: 'act3autochess@V3_1', season: 'act3autochess', family: 'regulation', label: N_('规程·序列Ⅰ'), roomModes: ['solo', 'coop'], dir: 'versions/act3autochess-v3_1/' },
].map((v) => /** @type {OfficialVersion} */ (Object.freeze({ ...v, roomModes: Object.freeze(v.roomModes) }))));

/**
 * The registry entry of a version id.
 * @param {unknown} id
 * @returns {OfficialVersion | null}
 */
export function versionById(id) {
  return VERSIONS.find((v) => v.id === id) || null;
}

/**
 * The file-system name of a version: the last segment of its dir, or its id for the default ('act2autochess').
 * @param {OfficialVersion} entry
 */
export function versionSlug(entry) {
  if (!entry.dir) return entry.id;
  const parts = entry.dir.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

/**
 * The version a loaded data set belongs to: config.version.id of a non-default build, else the default.
 * @param {{ config?: { version?: { id?: unknown } } } | null | undefined} data
 */
export function versionOfData(data) {
  const id = data?.config?.version?.id;
  return typeof id === 'string' ? id : DEFAULT_VERSION;
}

/**
 * The official mode a room mode plays at a difficulty on a data set (config.modes): its `mode_<type>_<difficulty>` when
 * the config has it with the room mode's type, else the first mode of that type and difficulty in sortId order — 规程's
 * solo ladder (险境 → 规程等级5); a config mode id passes through. null when the config has none. The lobby keeps such a
 * room's mode itself (server/lobby.js ladderMode); tools and benches name a difficulty or a mode id.
 * @param {{ modes?: Record<string, { type?: string, difficulty?: string, sortId?: number }> } | null | undefined} config
 * @param {'solo' | 'coop'} roomMode
 * @param {string} difficultyOrId
 * @returns {string | null}
 */
export function officialModeId(config, roomMode, difficultyOrId) {
  const modes = config?.modes && typeof config.modes === 'object' ? config.modes : {};
  const type = roomMode === 'solo' ? 'SINGLE' : 'MULTI';
  if (modes[difficultyOrId]?.type === type) return difficultyOrId;
  const plain = modeIdFor(roomMode, String(difficultyOrId));
  const list = Object.entries(modes).filter(([, m]) => m?.type === type).sort(([a, x], [b, y]) => (x.sortId ?? 0) - (y.sortId ?? 0) || (a < b ? -1 : 1));
  const laddered = list.some(([id, m]) => id !== modeIdFor(roomMode, String(m.difficulty)));
  if (!laddered && modes[plain]?.type === type) return plain;
  return list.find(([, m]) => m.difficulty === String(difficultyOrId).toUpperCase())?.[0] ?? null;
}
