// shared/uiTheme.js — the official UI theme packs (P3): one entry per official version that ships a theme bundle. Pure
// data, read by the server tools and the browser. Only the version build's `config.version.id` selects a theme, so the
// default 盟约 UI never changes.
//
//   act3autochess  the 规程 key visual (ui_zone_home_theme_act3autochess, extracted to public/assets/local/theme/
//                  act3autochess/act3autochess.png) and its red/black accent. Applied by public/js/uiTheme.js as
//                  `<html data-ui-theme="act3autochess">`; public/css/ui-theme.css maps it to the accent variables and
//                  the room-screen art. tools/theme-template.mjs --check validates every path here.

export const UI_THEMES = Object.freeze({
  act3autochess: Object.freeze({
    id: 'act3autochess',
    version: 'act3autochess@V3_1',
    /** the official season key visual (1024×858), also the room-screen backdrop */
    art: '/assets/local/theme/act3autochess/act3autochess.png',
    /** the official entry-screen art used as the briefing's static backdrop (3D 简报图's static fallback) */
    entryArt: '/assets/local/ui/activity/act3autochess/stage_act_entry_act3autochess.png',
    /** the season emblem watermark on the briefing */
    logo: '/assets/local/ui/activity/act3autochess/entry_anim_season_logo.png',
    /** the accent the theme's CSS replaces the mint tokens with (sampled from the key visual) */
    accent: '#cf4a40',
    accentSoft: '#8f2f29',
    glow: '#ff6f61',
  }),
});

/**
 * The theme of a version id (`config.version.id` / `m.public.version`), or null for the default 盟约 data.
 * @param {unknown} version
 */
export function uiThemeForVersion(version) {
  if (typeof version !== 'string' || !version) return null;
  for (const theme of Object.values(UI_THEMES)) if (theme.version === version) return theme;
  return null;
}
