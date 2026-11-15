// public/js/uiTheme.js — applies an official UI theme pack (shared/uiTheme.js) to the document. The version build's id
// (`room.version` / `m.public.version` / the lobby's version tab) selects it; the default 盟约 id has no theme, so the
// attribute is removed and every token is the usual mint/green. CSS: public/css/ui-theme.css.
import { useEffect } from '../vendor/hooks.module.js';
import { uiThemeForVersion } from '../../shared/uiTheme.js';

/**
 * The `data-ui-theme` value for a version id ('' = none).
 * @param {unknown} version
 * @returns {string}
 */
export function uiThemeAttr(version) {
  return uiThemeForVersion(version)?.id || '';
}

/**
 * Apply the version's UI theme while this screen is mounted. Passing no version (or the default) clears the attribute;
 * unmount restores what was there before (another screen's theme, normally nothing).
 * @param {unknown} version
 * @returns {string} the applied theme id ('' for none)
 */
export function useUiTheme(version) {
  const id = uiThemeAttr(version);
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.uiTheme || '';
    if (id) root.dataset.uiTheme = id;
    else delete root.dataset.uiTheme;
    return () => {
      if (prev) root.dataset.uiTheme = prev;
      else delete root.dataset.uiTheme;
    };
  }, [id]);
  return id;
}
