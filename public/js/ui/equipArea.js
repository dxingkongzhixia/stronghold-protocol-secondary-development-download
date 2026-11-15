// public/js/ui/equipArea.js — 规程's separate equipment area (m.private.equipHand, the server's PlayerState.equipHand):
// the five slots, and a click-to-equip picker (an item → a board / hand operator with a free slot → g.equip). The
// default 盟约 room has no equipHand, so this renders nothing there.
import { useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { Img } from './gameComponents.js';
import { itemIconUrl } from './assetUrls.js';
import { actions } from './gameActions.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Board / hand operators with a free equipment slot (规程: g.equip's targets for the equipment area). */
export function equipTargets(priv, perChess = 2) {
  return [...(Array.isArray(priv?.board) ? priv.board : []), ...(Array.isArray(priv?.hand) ? priv.hand : [])]
    .filter((p) => p && p.kind === 'chess' && (p.items?.length || 0) < perChess);
}

/** The equipment area's drawer (prep only; `editable` = the local player's own prep). */
export function EquipArea({ priv, gd, editable = true, busy = false }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(null);
  const area = Array.isArray(priv?.equipHand) ? priv.equipHand : null;
  if (!area || !area.length) return null;
  const items = area.filter(Boolean);
  const perChess = gd?.config?.economy?.equipPerChess ?? 2;
  const targets = equipTargets(priv, perChess);
  const equip = async (target) => {
    if (!pick || busy) return;
    const ok = await actions.equip(pick.uid, target.uid);
    if (ok) { setPick(null); setOpen(false); }
  };
  return html`<div class=${cx('equip', open && 'is-open')}>
    <button type="button" class="equip__toggle" aria-expanded=${open} aria-label=${t('装备')} onClick=${() => { setOpen(!open); setPick(null); }}>
      <${Icon} name="shield" /><span>${t('装备')}</span><b class="num">${items.length}<span aria-hidden="true">/</span>${area.length}</b>
    </button>
    ${open ? html`<div class="equip__panel" role="dialog" aria-label=${t('装备')}>
      <div class="equip__head">
        <b>${pick ? t('选择干员') : t('装备')}</b>
        <button type="button" class="equip__x" aria-label=${t('关闭')} onClick=${() => { setOpen(false); setPick(null); }}><${Icon} name="close" /></button>
      </div>
      ${pick ? html`<div class="equip__targets">
        ${targets.length ? targets.map((p) => html`<button key=${p.uid} type="button" class="equip__target" disabled=${busy} onClick=${() => equip(p)}>
          <b>${gd?.chess(p.id)?.name || p.id}</b>
          <span class="num t-dim">${(p.items?.length || 0)}/${perChess}</span>
        </button>`) : html`<p class="equip__empty">${t('无')}</p>`}
        <button type="button" class="equip__target equip__cancel" onClick=${() => setPick(null)}>${t('取消')}</button>
      </div>` : html`<div class="equip__slots">
        ${area.map((item, i) => html`<button key=${i} type="button" class=${cx('equip__slot', item && 'has-item')}
            disabled=${!item || !editable || busy} title=${item ? (gd?.item(item.id)?.name || item.id) : ''}
            onClick=${() => item && setPick(item)}>
          ${item ? html`<${Img} src=${itemIconUrl(gd?.m, gd?.item(item.id))} alt=${gd?.item(item.id)?.name || item.id}
            fallback=${html`<b>${[...(gd?.item(item.id)?.name || item.id || '?')][0]}</b>`} />` : null}
        </button>`)}
      </div>`}
    </div>` : null}
  </div>`;
}
