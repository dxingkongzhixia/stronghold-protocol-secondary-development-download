// ui/pluginTabs.js — the in-game plugin lists' category tabs (the admin console's tabbed pattern, owner 2026-10-24):
// one tab per non-empty section (外观音乐 / 阵营加强 / 新增策略 / 新增敌人 / 新增玩法) with its count, the active tab's rows
// below. Replaces the stacked section heads in the room's 插件 panel and the main interface's 插件预览.
import { html } from './components.js';
import { t } from '../../../shared/i18n.js';

/**
 * @param {{ groups: { id: string, name: string, micro: string, rows: any[] }[], active: string, onPick: (id: string) => void }} props
 */
export function PluginCategoryTabs({ groups, active, onPick }) {
  if (!Array.isArray(groups) || groups.length < 2) return null;
  return html`<div class="plugtabs" role="tablist" aria-label=${t('插件分类')}>
    ${groups.map((g) => html`<button key=${g.id} type="button" role="tab" aria-selected=${g.id === active ? 'true' : 'false'}
        class=${`plugtabs__tab${g.id === active ? ' is-on' : ''}`} data-category=${g.id} onClick=${() => onPick(g.id)}>
      <span>${t(g.name)}</span><em>${g.micro}</em><b class="num">${g.rows.length}</b>
    </button>`)}
  </div>`;
}
