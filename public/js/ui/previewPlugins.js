// ui/previewPlugins.js — the main interface's global plugin preview (owner 2026-10-24).
//
// The room's 插件 panel decides what a MATCH plays (the host's set). This one is personal and read-only for the main
// interface: switch on the content plugins whose operators / enemies / bosses you want to browse in 干员调配, the
// S.W.E.E.P report and the codex while you are NOT in a room. The server composes that set (/plugins/preview) and the
// page installs it through the same content-set path as a room's, so the screens read the composed data; a room's
// own set — or vanilla, in a room without plugins — always takes over the moment you enter one (content.js sync).
//
// The choice is this browser's (`sp.pref.previewPlugins`), like the personal cosmetic/UI plugin switches; it never
// changes a match, the stats or the host's room.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { createStore, loadPref, savePref, store, useStore } from '../store.js';
import { html, Button, Modal } from './components.js';
import { PluginCategoryTabs } from './pluginTabs.js';
import { catalog, installedCount, loadCatalog, pluginDescription, pluginName } from '../content.js';
import { pluginGroups } from '../../../shared/plugins/category.js';
import { net } from '../net.js';
import { t, tc } from '../../../shared/i18n.js';

/** localStorage key (`sp.pref.<key>`), a browser preference. */
export const PREVIEW_PREF = 'previewPlugins';
/** The most plugins one preview set may name (the server's endpoint has the same cap). */
export const PREVIEW_LIMIT = 8;

/** The preview state: `ids` (this browser's choice), the composed `cs`, and its status. */
export const previewStore = createStore({ ids: [], cs: null, status: 'idle', error: null });

/** This browser's saved preview ids (validated, capped). @returns {string[]} */
export function loadPreviewIds() {
  const raw = loadPref(PREVIEW_PREF, []);
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,31}$/.test(id)))].slice(0, PREVIEW_LIMIT);
}

/** Save the choice. @param {string[]} ids @returns {string[]} the list actually stored */
export function savePreviewIds(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,31}$/.test(id)))].slice(0, PREVIEW_LIMIT);
  savePref(PREVIEW_PREF, list);
  return list;
}

let request = 0;

/**
 * Ask the server to compose the preview set (`/plugins/preview?ids=…`) and publish its cs on the app store
 * (`ui.previewCs`), where content.js installs / drops it. An empty list restores vanilla.
 * @param {string[]} ids
 * @param {{ fetch?: typeof fetch }} [o]
 * @returns {Promise<string|null>} the cs, or null (vanilla / refused)
 */
export async function resolvePreview(ids, { fetch: doFetch = globalThis.fetch } = {}) {
  const list = [...new Set(ids)].slice(0, PREVIEW_LIMIT);
  const mine = ++request;
  if (!list.length) {
    store.patch('ui', { previewCs: null });
    previewStore.set({ ids: [], cs: null, status: 'idle', error: null });
    return null;
  }
  previewStore.set({ ids: list, cs: previewStore.get().cs, status: 'loading', error: null });
  try {
    const r = await doFetch(`/plugins/preview?ids=${encodeURIComponent(list.join(','))}`, { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || typeof body.cs !== 'string') throw new Error(body.error || `HTTP ${r.status}`);
    if (mine !== request) return null;
    store.patch('ui', { previewCs: body.cs });
    previewStore.set({ ids: list, cs: body.cs, status: 'ready', error: null });
    return body.cs;
  } catch (err) {
    if (mine !== request) return null;
    store.patch('ui', { previewCs: null });
    const error = String(err?.message || err).slice(0, 200);
    previewStore.set({ ids: list, cs: null, status: 'failed', error });
    console.warn('[plugins] preview set refused:', error);
    return null;
  }
}

/** Toggle the whole choice (the panel's switches). @param {string[]} ids @returns {string[]} */
export function setPreviewPlugins(ids) {
  const list = savePreviewIds(ids);
  void resolvePreview(list);
  return list;
}

/** Boot: restore this browser's preview and re-resolve after a reconnect (the server's in-memory set is gone then). */
export function initPreviewPlugins() {
  const ids = loadPreviewIds();
  void resolvePreview(ids);
  const off = typeof net?.on === 'function'
    ? net.on('welcome', () => { const again = loadPreviewIds(); if (again.length) void resolvePreview(again); })
    : null;
  return () => off?.();
}

/** The catalogue rows the preview can offer: loaded content plugins of room scope, compatible, no scripts. */
export function previewPlugins(plugins) {
  return (Array.isArray(plugins) ? plugins : [])
    .filter((p) => p && p.class === 'content' && p.status === 'loaded' && p.compatible !== false
      && Array.isArray(p.scope) && p.scope.includes('room'))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
}

/**
 * The main interface's 插件预览 dialog: the same five sections as the room panel, switches that are this browser's
 * choice. Nothing here touches a room, a match or the host's set.
 */
export function PreviewPluginPanel({ open, onClose }) {
  const cat = useStore((s) => s, Object.is, catalog);
  const state = useStore((s) => s, Object.is, previewStore);
  const installed = useStore(installedCount);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(null);
  useEffect(() => {
    if (!open) return;
    if (installed) loadCatalog({ force: true }).catch(() => {});
    if (state.ids.length && !state.cs && state.status !== 'loading' && state.status !== 'failed') void resolvePreview(state.ids);
    // one refresh per open (the state it reads is a snapshot at open time)
  }, [open]);
  const rows = previewPlugins(cat.plugins);
  const groups = pluginGroups(rows);
  const shown = groups.find((g) => g.id === group) || groups[0];
  const chosen = new Set(state.ids);
  const toggle = (id, on) => {
    const next = on ? [...state.ids, id] : state.ids.filter((x) => x !== id);
    setBusy(true);
    setPreviewPlugins(next.slice(0, PREVIEW_LIMIT));
    setTimeout(() => setBusy(false), 350);
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('插件预览')} micro="PLUGIN PREVIEW" width="7.4rem"
      actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>${t('完成')}<//>`}>
    <div class="plugpanel" data-testid="preview-plugins">
      <p class="plugpanel__lead">${t('这里的开关只影响主界面的预览（干员调配、S.W.E.E.P 等）；对局内容仍由房间创建者决定。')}</p>
      <p class="set-hint">${t('默认全部关闭 = 原版；开启后可以浏览插件里的干员、敌人和 Boss，离开房间也不会改变对局。')}</p>
      ${state.status === 'failed' ? html`<p class="set-hint is-warn">${t('预览内容加载失败：{error}', { error: state.error || '' })}</p>` : null}
      ${state.status === 'loading' ? html`<p class="set-hint">${t('正在准备预览内容…')}</p>` : null}
      ${installed && cat.status === 'loading' && !rows.length ? html`<p class="set-hint">${t('正在读取插件列表…')}</p>` : null}
      ${installed && cat.status === 'failed' && !rows.length ? html`<p class="set-hint is-warn">${t('无法读取插件列表')}</p>` : null}
      ${!installed ? html`<p class="set-hint">${t('本服务器没有可在房间中使用的插件')}</p>` : null}
      ${shown ? html`<${PluginCategoryTabs} groups=${groups} active=${shown.id} onPick=${setGroup} />` : null}
      ${shown && groups.length === 1 ? html`<h4 class="plugpanel__grouphead"><span>${t(shown.name)}</span><em>${shown.micro}</em><b class="num">${shown.rows.length}</b></h4>` : null}
      ${shown ? html`<ul class="plugpanel__list">${shown.rows.map((p) => {
        const on = chosen.has(p.id);
        const desc = pluginDescription(p);
        return html`<li key=${p.id} class=${`plugrow${on ? ' is-on' : ''}`} data-plugin=${p.id}>
          <button type="button" role="switch" aria-checked=${on ? 'true' : 'false'} class=${`set-toggle plugrow__switch${on ? ' is-on' : ''}`}
            disabled=${busy} aria-label=${pluginName(p)} onClick=${() => toggle(p.id, !on)}><i></i><span>${on ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>
          <div class="plugrow__body">
            <div class="plugrow__name"><b>${pluginName(p)}</b>${p.version ? html`<span class="num t-dim">v${p.version}</span>` : null}
              ${p.builtin ? html`<span class="plugrow__badge">${t('内置')}</span>` : null}<span class="plugrow__badge is-unofficial">${t('非官方')}</span></div>
            ${desc ? html`<p class="plugrow__desc">${desc}</p>` : null}
          </div>
        </li>`;
      })}</ul>` : null}
    </div>
  <//>`;
}
