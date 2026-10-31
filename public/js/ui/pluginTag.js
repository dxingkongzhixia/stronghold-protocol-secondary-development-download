// ui/pluginTag.js — the room's plugin tag and the small facts the screens show of plugins (DESIGN §32 P1a): kept apart
// from the 插件 panel (ui/pluginPanel.js), which stays a lazy chunk — a room with plugins warms it on idle so the first
// tap opens it at once — so the title page and a room without plugins carry just this.
//
//   * PluginTag — the tag at the top of the room (screens/room.js): 「原版」, or 「插件 ×N」 once its host switched plugins
//     on — marked unofficial (「非官方」) when they change gameplay (a content set of its own, DESIGN §32.6); a tap loads
//     the panel (ui/pluginPanel.js PluginPanel) and opens it.
//   * roomPluginFacts — what the room's plugins are for this player; pluginTagText, sizeText, pluginMicro — their words.
//   * UnofficialMark — the small 「非官方」 / MOD mark of a match with gameplay plugins (the briefing, the HUD corner, the
//     result; DESIGN §32.6, the design study's §7.4); nothing for the original game (cosmetic plugins only included).
// Texts go through t() (docs/I18N.md).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { t } from '../../../shared/i18n.js';
import { rulePhrases } from '../../../shared/plugins/rules.js';
import { net } from '../net.js';
import { loadPref } from '../store.js';
import { catalog, loadCatalog, contentSet } from '../content.js';
import { toastError } from './toasts.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The panel is still a lazy chunk, but the tag starts it once the room is idle so the first tap opens it at once. */
let panelLoad = null;
const loadPanel = () => panelLoad || (panelLoad = import('./pluginPanel.js'));

/**
 * The ids a newly created room switches on for its host: the remembered selection, without one the server no longer
 * offers (a removed plugin would make room.setPlugins refuse the whole set) — and none when the host turned the memory off.
 * @param {{ ids?: string[], auto?: boolean } | null} pref the `roomPlugins` preference
 * @param {Set<string> | string[]} offered the catalogue's room plugins now
 * @returns {string[]}
 */
export function restoreChoice(pref, offered) {
  if (!pref || pref.auto === false || !Array.isArray(pref.ids)) return [];
  const available = offered instanceof Set ? offered : new Set(Array.isArray(offered) ? offered : []);
  return [...new Set(pref.ids.filter((id) => typeof id === 'string' && available.has(id)))];
}

/** A size in KB / MB. @param {number} n */
export const sizeText = (n) => (!Number.isFinite(n) ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * What the room's plugins are for this player: `count` (0 = the original art), the ids switched on and those switched on
 * automatically, whether this player may change them (the host, outside a match), the room's warnings.
 * @param {any} room room.state payload
 * @param {any} myId
 */
export function roomPluginFacts(room, myId) {
  const list = Array.isArray(room?.content?.plugins) ? room.content.plugins.filter((p) => p && typeof p.id === 'string') : [];
  const c = room?.content;
  return {
    count: list.length,
    plugins: list,
    on: new Set(list.map((p) => p.id)),
    auto: new Set(list.filter((p) => p.auto).map((p) => p.id)),
    chosen: list.filter((p) => !p.auto).map((p) => p.id),
    editable: room?.hostId != null && room.hostId === myId && !room.inMatch,
    inMatch: !!room?.inMatch,
    warnings: Array.isArray(c?.warnings) ? c.warnings.filter((w) => w && typeof w.code === 'string') : [],
    vs: typeof c?.vs === 'string' ? c.vs : null,
    // gameplay plugins (DESIGN §32.6): the room plays a content set of its own — unofficial
    modded: !!c && c.vanilla === false,
    cs: typeof c?.cs === 'string' ? c.cs : null,
    modes: Array.isArray(c?.modes) ? c.modes.filter((m) => m && typeof m.id === 'string') : [],
    modeId: typeof c?.modeId === 'string' ? c.modeId : null,
    dataBytes: Number.isFinite(c?.dataBytes) ? c.dataBytes : 0,
    rules: c?.rules && typeof c.rules === 'object' && !Array.isArray(c.rules) ? c.rules : null,
  };
}

/**
 * The active non-default rules in words, or '' when the room plays the official options.
 * @param {Record<string, string>|null|undefined} rules
 */
export function ruleLine(rules) {
  const phrases = rulePhrases(rules);
  if (!phrases.length) return '';
  return t('规则：{text}', { text: phrases.map((p) => t(p)).join('、') });
}

/** Does the room play gameplay plugins (a content set of its own: unofficial — DESIGN §32.6)? @param {any} room */
export const isModdedRoom = (room) => !!room?.content && room.content.vanilla === false;

/**
 * The small unofficial mark of a match with gameplay plugins (see the header): 「非官方」 (or the HUD's MOD), nothing for
 * the original game. @param {{ room: any, compact?: boolean, class?: string }} props
 */
export function UnofficialMark({ room, compact = false, class: cls = '' }) {
  if (!isModdedRoom(room)) return null;
  const n = roomPluginFacts(room, null).count;
  const tip = t('非官方：本局使用了改变玩法的插件（{n} 个），不计入统计总览', { n });
  return html`<span class=${cx('modmark', compact && 'modmark--compact', cls)} title=${tip} aria-label=${tip} data-testid="unofficial-mark">
    ${compact ? 'MOD' : t('非官方')}
  </span>`;
}

/** What the tag says: 「插件 ×N」 or 「原版」. @param {any} room */
export const pluginTagText = (room) => { const n = roomPluginFacts(room, null).count; return n ? t('插件 ×{n}', { n }) : t('原版'); };

/** A label for a catalogue entry's micro line in 设置 (ui/settings.js). @param {any} p */
export const pluginMicro = (p) => [p?.id, p?.version ? `v${p.version}` : null, Number.isFinite(p?.artBytes) ? sizeText(p.artBytes) : null].filter(Boolean).join(' · ');

/** The tag at the top of the room: 「原版」 or 「插件 ×N」; a tap loads the panel and opens it. */
export function PluginTag({ room, myId }) {
  // the panel's component once loaded (a function in state: set through an updater)
  const [Panel, setPanel] = useState(null);
  // A room whose held content set carries native code modules: the tag keeps a red mark through the match (the consent
  // bar only appears until this browser accepts).
  const [nativeCode, setNativeCode] = useState(false);
  useEffect(() => {
    const read = () => {
      const s = contentSet.get();
      setNativeCode(s.cs === room?.content?.cs && Array.isArray(s.native) && s.native.length > 0);
    };
    read();
    return contentSet.subscribe(read);
  }, [room?.content?.cs]);
  const f = roomPluginFacts(room, myId);
  const rulesText = ruleLine(f.rules);
  // A host who switched plugins on in an earlier room gets the same set here once (「新房间自动开启上次的插件」,
  // the panel's checkbox): one request instead of opening the panel and switching each one on again.
  const restored = useRef('');
  useEffect(() => {
    const pref = loadPref('roomPlugins', null);
    if (!pref || pref.auto === false || !Array.isArray(pref.ids) || !pref.ids.length) return undefined;
    if (!f.editable || f.count || room?.auto === true) return undefined;
    // A fresh room of the host's own: not one they were handed as host after a migration (then others are seated already).
    const humans = Array.isArray(room?.seats) ? room.seats.filter((s) => s && !s.isBot && typeof s.playerId === 'string').length : 0;
    if (humans > 1) return undefined;
    const code = String(room?.code ?? '');
    if (!code || restored.current === code) return undefined;
    restored.current = code;
    let alive = true;
    (async () => {
      let panel;
      try { [panel] = await Promise.all([loadPanel(), loadCatalog()]); } catch { return; }
      if (!alive) return;
      const offered = new Set(panel.roomPlugins(catalog.get().plugins).map((p) => p.id));
      const ids = restoreChoice(pref, offered);
      if (!ids.length) return;
      // The room's own entry has just spent the heavy request bucket (g.watch, room.skins): a retry keeps the restore
      // from being lost to a "too frequent" refusal.
      for (let attempt = 0; ; attempt++) {
        try { await net.request('room.setPlugins', { plugins: ids.map((id) => ({ id })) }); break; }
        catch (err) {
          if (err?.code !== 'RATE' || attempt >= 2) { if (alive) toastError(err); break; }
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        }
      }
    })();
    return () => { alive = false; };
  }, [room?.code, room?.auto, f.editable, f.count, room?.seats]);
  // A plugin room will very likely open this panel: warm its chunk and the small catalogue on idle, so the first tap
  // does not wait for a dozen module requests. The code is still loaded only in a room that has plugins.
  useEffect(() => {
    if (!f.count) return undefined;
    let alive = true;
    const go = () => { loadPanel().then((m) => { if (alive) m.preloadPluginPanel?.(); }).catch(() => {}); };
    if (typeof globalThis.requestIdleCallback === 'function') {
      const id = globalThis.requestIdleCallback(go, { timeout: 2500 });
      return () => { alive = false; globalThis.cancelIdleCallback?.(id); };
    }
    const id = setTimeout(go, 800);
    return () => { alive = false; clearTimeout(id); };
  }, [f.count]);
  const open = () => {
    loadPanel().then((m) => setPanel(() => m.PluginPanel), (err) => console.warn('[plugins] the panel did not load', err));
  };
  return html`<button type="button" class=${cx('plugtag', f.count && 'is-modded', f.modded && 'is-unofficial', rulesText && 'plugtag--rules')} data-testid="plugin-tag" onClick=${open}
      title=${f.modded ? t('本房间使用了改变玩法的插件（非官方）') : t('插件')} aria-label=${f.count ? t('插件 ×{n}', { n: f.count }) : t('原版')}>
    <${Icon} name=${f.count ? 'edit' : 'check'} />${f.count ? t('插件 ×{n}', { n: f.count }) : t('原版')}${f.modded ? html`<b class="plugtag__mod">${t('非官方')}</b>` : null}${nativeCode ? html`<b class="plugtag__native" data-testid="native-code-mark">${t('原生代码')}</b>` : null}${rulesText ? html`<span class="plugtag__rules" data-testid="plugin-rules">${rulesText}</span>` : null}
  </button>
  ${Panel ? html`<${Panel} open=${true} room=${room} myId=${myId} onClose=${() => setPanel(null)} />` : null}`;
}
