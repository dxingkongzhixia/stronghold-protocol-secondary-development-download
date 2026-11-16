// tools/versions/act3autochess-v3_1.mjs — 规程·序列Ⅰ (act3autochess V3_1) build profile (tools/versions/profiles.mjs).
export default {
  id: 'act3autochess@V3_1',
  season: 'act3autochess',
  // one entry per sub-version: activity.AUTOCHESS.act3autochess.V3_1
  section: ['AUTOCHESS', 'act3autochess', 'V3_1'],
  // 19×21 stage atlases of three pieces and road-only round templates (tools/versions/layouts.mjs)
  layout: 'regulation',
  // the official commit of the pinned gamedata cache (.cache/gamedata@6f63c14e/)
  pins: { default: '6f63c14e' },
  // the season's measured draft tables (tools/versions/tables/act3autochess-v3_1.mjs)
  tables: 'act3autochess-v3_1',
};
