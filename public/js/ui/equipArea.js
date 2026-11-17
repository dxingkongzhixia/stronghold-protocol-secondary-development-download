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

/** Board / hand operators with a free equipment slot (规程: g.equip's targets for the equipment area). `slotsOf` is the
 * slot count (a number) or a function of the piece (a per-chess `equipSlots`). */
export function equipTargets(priv, slotsOf = 2) {
  const cap = typeof slotsOf === 'function' ? slotsOf : () => slotsOf;
  return [...(Array.isArray(priv?.board) ? priv.board : []), ...(Array.isArray(priv?.hand) ? priv.hand : [])]
    .filter((p) => p && p.kind === 'chess' && (p.items?.length || 0) < cap(p));
}

/**
 * The board's equipment row (tile_acbag, the five slots an operator's equipment goes in) as screen coordinates:
 * `{ left, top, width, height }` in the game view's client space, or null when the stage / view has none. The official
 * 规程 shows the equipment area ON those map tiles (beside the hand row), not as a side drawer.
 * @param {any} stage the own stage record
 * @param {any} view the field view (tileScreen)
 */
export function equipRowRect(stage, view) {
  const rows = Array.isArray(stage?.rows) ? stage.rows : [];
  const legend = stage?.tiles && typeof stage.tiles === 'object' ? stage.tiles : {};
  const isBag = (g) => g && legend[g]?.tileKey === 'tile_acbag';
  let row = -1, c0 = -1, c1 = -1;
  for (let r = 0; r < rows.length && row < 0; r++) {
    const line = typeof rows[r] === 'string' ? rows[r] : '';
    let start = -1;
    for (let c = 0; c <= line.length; c++) {
      if (isBag(line[c])) { if (start < 0) start = c; c1 = c; }
      else if (start >= 0) { row = r; c0 = start; break; }
    }
    if (start >= 0 && row < 0) { row = r; c0 = start; }
  }
  if (row < 0 || typeof view?.tileScreen !== 'function') return null;
  let a, b;
  try { a = view.tileScreen(row, c0); b = view.tileScreen(row, c1); } catch { return null; }
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return null;
  const s = Number.isFinite(a.s) && a.s > 0 ? a.s : 0;
  const left = a.x - s / 2, top = a.y - s / 2;
  return { left, top, width: b.x + s / 2 - left, height: s, row, c0, c1 };
}

/** The equipment area's drawer (prep only; `editable` = the local player's own prep). */
export function EquipArea({ priv, gd, editable = true, busy = false, view = null, stage = null }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(null);
  const area = Array.isArray(priv?.equipHand) ? priv.equipHand : null;
  if (!area || !area.length) return null;
  const items = area.filter(Boolean);
  const slotsOf = (p) => gd?.equipSlotsOf?.(p.id) ?? (gd?.config?.economy?.equipPerChess ?? 2);
  const targets = equipTargets(priv, slotsOf);
  const rect = equipRowRect(stage, view);
  const style = rect
    ? `left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px; bottom:auto; transform:none;`
    : '';
  const equip = async (target) => {
    if (!pick || busy) return;
    const ok = await actions.equip(pick.uid, target.uid);
    if (ok) { setPick(null); setOpen(false); }
  };
  const slot = (item, i) => html`<button key=${i} type="button" class=${cx('equip__slot', item && 'has-item')}
      disabled=${!item || !editable || busy} title=${item ? (gd?.item(item.id)?.name || item.id) : ''}
      onClick=${() => { if (!item) return; setPick(item); setOpen(true); }}>
      ${item ? html`<${Img} src=${itemIconUrl(gd?.m, gd?.item(item.id))} alt=${gd?.item(item.id)?.name || item.id}
        fallback=${html`<b>${[...(gd?.item(item.id)?.name || item.id || '?')][0]}</b>`} />` : null}
    </button>`;
  const picker = () => html`<div class="equip__panel equip__panel--pick" role="dialog" aria-label=${t('装备')}>
    <div class="equip__head">
      <b>${t('选择干员')}</b>
      <button type="button" class="equip__x" aria-label=${t('关闭')} onClick=${() => { setOpen(false); setPick(null); }}><${Icon} name="close" /></button>
    </div>
    <div class="equip__targets">
      ${targets.length ? targets.map((p) => html`<button key=${p.uid} type="button" class="equip__target" disabled=${busy} onClick=${() => equip(p)}>
        <b>${gd?.chess(p.id)?.name || p.id}</b>
        <span class="num t-dim">${(p.items?.length || 0)}/${slotsOf(p)}</span>
      </button>`) : html`<p class="equip__empty">${t('无')}</p>`}
      <button type="button" class="equip__target equip__cancel" onClick=${() => setPick(null)}>${t('取消')}</button>
    </div>
  </div>`;
  if (rect) {
    // the five slots sit ON the map's equipment row (the official 规程 lay-out), not in a side drawer
    return html`<div class=${cx('equip', 'equip--onrow', pick && 'is-open')} style=${style}>
      ${pick ? picker() : null}
      <div class="equip__row" role="group" aria-label=${t('装备')}>${area.map(slot)}</div>
    </div>`;
  }
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
          <span class="num t-dim">${(p.items?.length || 0)}/${slotsOf(p)}</span>
        </button>`) : html`<p class="equip__empty">${t('无')}</p>`}
        <button type="button" class="equip__target equip__cancel" onClick=${() => setPick(null)}>${t('取消')}</button>
      </div>` : html`<div class="equip__slots">
        ${area.map(slot)}
      </div>`}
    </div>` : null}
  </div>`;
}
