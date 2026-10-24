// tools/assets/lobby-music.mjs — the official 主界面音乐 the Hub's music picker offers (`audio.lobbyMusic` in
// data/assets.json; docs/ASSETS.md "Lobby music").
//
// The ids are the official `excel/audio_data.json` → `musics[]` ids of the game's 主界面音乐 catalogue; the Chinese
// name, intro and loop come from that table (tools/assets/audio.mjs indexAudio().music). `group` is only the picker's
// tab, not official data: theme = 主界面主题曲, event = 活动/地区主题, collab = 联动, contract = 危机合约.
//
// Order is the picker's order (主题 → 活动 → 联动 → 危机合约). Adding a track is one line here plus
// `node tools/lobby-music.mjs`; the plan then keeps the entry on every later `node tools/fetch-assets.mjs` run.
//
// Tracks missing from the audio dump are skipped with a note (an older audio_data must not break the build), and the
// client falls back to the default lobby theme when a selected id is absent from the manifest.

/** @typedef {{ id: string, group: 'theme'|'event'|'collab'|'contract' }} LobbyMusicEntry */

/** @type {ReadonlyArray<LobbyMusicEntry>} */
export const LOBBY_MUSIC = Object.freeze([
  // 主题曲 (the game's own main-interface themes)
  { id: 'music_bg_default', group: 'theme' },       // 生命流
  { id: 'music_bg_tech', group: 'theme' },          // 如我所见
  { id: 'music_bg_ddd', group: 'theme' },           // Ready？
  { id: 'music_bg_street', group: 'theme' },        // City
  { id: 'music_bg_loneliness', group: 'theme' },    // Loneliness
  { id: 'music_bg_yan', group: 'theme' },           // 敬属春山
  // 活动 / 地区
  { id: 'music_bg_iberia', group: 'event' },        // 暗潮
  { id: 'music_bg_laterano', group: 'event' },      // 圣城日常
  { id: 'music_bg_rhine', group: 'event' },         // 旅程
  { id: 'music_bg_office', group: 'event' },        // 走过漫漫时空
  { id: 'music_bg_act16mini', group: 'event' },     // 微茫
  { id: 'music_bg_dungeon', group: 'event' },       // 雀跃的炉火
  { id: 'music_bg_sui', group: 'event' },           // 赴大荒
  { id: 'music_bg_adastra', group: 'event' },       // Ad astra
  { id: 'music_bg_anniversary', group: 'event' },   // 大柏墟
  { id: 'music_bg_redvelvet_1', group: 'event' },   // 猩红孤钻
  // 联动
  { id: 'music_bg_rainbowsix', group: 'collab' },   // Translucent
  { id: 'music_bg_volcano_day', group: 'collab' },  // Misty Memory (Day Version)
  { id: 'music_bg_volcano_night', group: 'collab' }, // Misty Memory (Night Version)
  { id: 'music_bg_avemujica', group: 'collab' },    // Georgette Me, Georgette You (Piano)
  { id: 'music_bg_little_pony', group: 'collab' },  // My Little Pony Theme Song
  { id: 'music_bg_p3r_1', group: 'collab' },        // Aria of the Soul
  // 危机合约
  { id: 'music_bg_recalrune', group: 'contract' },  // Operation Blade
  { id: 'music_bg_recalrune2', group: 'contract' }, // Operation Ashring
]);

/** The picker's tabs, in order; `all` is the default. */
export const LOBBY_MUSIC_GROUPS = Object.freeze(['all', 'theme', 'event', 'collab', 'contract']);
