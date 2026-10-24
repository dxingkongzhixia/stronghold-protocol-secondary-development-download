// shared/plugins/category.js — the five sections of the plugin list (the owner's 2026-10-24 request: 外观音乐 /
// 阵营加强 / 新增策略 / 新增敌人 / 新增玩法).
//
// A plugin's `category` is what the player sees it as, which is not the same axis as `class` (how the game loads it:
// cosmetic / content / script / trusted / ui / lang). One `class: content` plugin may add enemies (PRTS, 不死的黑蛇),
// another a strategy (PRTS 凯尔希), another operators and bonds (阵营加强); a cosmetic plugin is 外观音乐. The field is
// optional so older plugins keep loading: without it the class decides (cosmetic/ui/lang → appearance, everything that
// changes the room → gameplay), which is exactly how the panel grouped them before. No engine behaviour reads this —
// it only orders and labels the list.
//
// Kept free of Node and DOM imports: the manifest reader, the registry catalogue and the browser panel all use it.
import { N_ } from '../i18n.js';

/** The five categories, in the panel's order. `name` is a msgid (shared/i18n.js), `micro` the English caption. */
export const PLUGIN_CATEGORIES = Object.freeze([
  { id: 'appearance', name: N_('外观音乐'), micro: 'APPEARANCE & AUDIO' },
  { id: 'faction', name: N_('阵营加强'), micro: 'FACTION' },
  { id: 'strategy', name: N_('新增策略'), micro: 'STRATEGY' },
  { id: 'enemy', name: N_('新增敌人'), micro: 'ENEMY' },
  { id: 'gameplay', name: N_('新增玩法'), micro: 'GAMEPLAY' },
]);

/** The ids, in display order. */
export const PLUGIN_CATEGORY_IDS = Object.freeze(PLUGIN_CATEGORIES.map((c) => c.id));

/** The fallback for a plugin that declares none (see the header). @param {{ class?: string }} [p] */
export function defaultPluginCategory(p) {
  const cls = p?.class;
  if (cls === 'cosmetic' || cls === 'ui' || cls === 'lang') return 'appearance';
  return 'gameplay';
}

/** A declared category, or null when the value is not one of the five. @param {unknown} value */
export function parsePluginCategory(value) {
  return typeof value === 'string' && PLUGIN_CATEGORY_IDS.includes(value) ? value : null;
}

/**
 * Where a plugin appears in the list: its declared `category`, else the class fallback. Accepts a catalogue entry, a
 * manifest, or a room row (`{ id, class }`).
 * @param {{ category?: string, class?: string } | null | undefined} p
 */
export function pluginCategory(p) {
  return parsePluginCategory(p?.category) || defaultPluginCategory(p);
}

/** The category definition (name/micro) for an id. @param {string} id */
export function pluginCategoryInfo(id) {
  return PLUGIN_CATEGORIES.find((c) => c.id === id) || PLUGIN_CATEGORIES[PLUGIN_CATEGORIES.length - 1];
}
