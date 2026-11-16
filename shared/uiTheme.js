// shared/uiTheme.js — the official UI theme packs (P3): one entry per official version that ships a theme bundle. Pure
// data, read by the server tools and the browser. Only the version build's `config.version.id` selects a theme, so the
// default 盟约 UI never changes.
//
// No version ships a theme today. 规程·序列Ⅰ briefly had one (the red/black accent of
// ui_zone_home_theme_act3autochess); the owner asked for the 盟约 look instead (2026-11-17), so the registry is empty
// and every room — regulation included — keeps the default mint/green tokens. The mechanism stays for a future
// version: public/js/uiTheme.js applies `<html data-ui-theme="<id>">`, public/css/ui-theme.css styles it, and
// tools/theme-template.mjs --check validates each registered theme's art and CSS block.

export const UI_THEMES = Object.freeze({});

/**
 * The theme of a version id (`config.version.id` / `m.public.version`), or null for the default 盟约 data.
 * @param {unknown} version
 */
export function uiThemeForVersion(version) {
  if (typeof version !== 'string' || !version) return null;
  for (const theme of Object.values(UI_THEMES)) if (theme.version === version) return theme;
  return null;
}
