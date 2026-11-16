// tools/versions/sources.mjs — where an official version's pinned gamedata files come from. The pin itself is in the
// profile (tools/versions/profiles.mjs pinnedShaOf): the Kengxxiao mirror at that commit by default, overridable through
// SP_GAMEDATA_BASE (the CN gh-proxy is the usual value when raw.githubusercontent.com is unreachable).
export const GAMEDATA_BASE = process.env.SP_GAMEDATA_BASE
  || 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/';

/** The base URL of the files a version profile reads (the same mirror; a profile may name another source later). */
export function sourceFor(_profile) {
  return GAMEDATA_BASE;
}
