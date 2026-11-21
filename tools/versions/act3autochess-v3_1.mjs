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
  // base chess ids whose 简易通讯机 may recruit their own normal form above the shop level (暴躁铁皮)
  recruitTierExempt: Object.freeze(['chess_char_5_22_a']),
  // 规程 income measured on official recordings (round 84): R1–R8 4…11, R9+ 11 (the 下半 default is the [ASSUMED]
  // min(3 + round, 12)); 极速模拟 runs its own min(5 + round, 11). tools/build-data.mjs writes both curves.
  economy: Object.freeze({
    incomeBase: 3,
    incomeCap: 11,
    modeIncome: Object.freeze({ mode_single_funny: Object.freeze({ base: 5, cap: 11 }) }),
  }),
};
