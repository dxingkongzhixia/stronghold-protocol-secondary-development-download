// public/js/ui/equipRow.js — 规程's equipment area, drawn where the official mode has it: row 8's five tile_acbag pads
// (cols 4–8, GEO.TEMP_ROW / TEMP_C0 / TEMP_SIZE). The pieces themselves are drawn by the board renderer (render/app.js
// setPrep `equip`: m.private.equipHand in the temp row's geometry), like 盟约 draws its temp row; this module only adds
// the slot frames (so empty slots are visible too) and the operator picker a tap on an item opens (g.equip).
//
// The default 盟约 room has no equipHand (gd.config.economy.equipHandSize 0): the game passes `area` null and nothing is
// drawn. Dropping an item onto an operator still equips directly (render/drag.js pieceDrop → g.equip).

import { html, Modal, Button } from './components.js';
import { useTileScreen } from './facingWheel.js';
import { GEO } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The five equipment pads of row 8, left to right (GEO.TEMP_C0..GEO.TEMP_C0 + GEO.TEMP_SIZE − 1). */
export const EQUIP_SLOT_COLS = Object.freeze(Array.from({ length: GEO.TEMP_SIZE }, (_, i) => GEO.TEMP_C0 + i));

/** The item of `priv.equipHand` with this uid, or null (规程 only; 盟约 has an empty area). */
export function equipItemOf(priv, uid) {
  if (!Number.isInteger(uid) || !Array.isArray(priv?.equipHand)) return null;
  return priv.equipHand.find((p) => p && p.uid === uid) || null;
}

/**
 * Board / hand operators with a free equipment slot (g.equip's targets). `slotsOf` is the slot count (a number) or a
 * function of the piece (a per-chess `equipSlots`).
 */
export function equipTargets(priv, slotsOf = 2) {
  const cap = typeof slotsOf === 'function' ? slotsOf : () => slotsOf;
  return [...(Array.isArray(priv?.board) ? priv.board : []), ...(Array.isArray(priv?.hand) ? priv.hand : [])]
    .filter((p) => p && p.kind === 'chess' && (p.items?.length || 0) < cap(p));
}

/**
 * Frames of the five equipment pads, over the board (view.tileScreen, so they follow the camera and the Final Assault
 * prep's mirrored half). Purely decorative: never takes the pointer, the item under it stays draggable.
 * @param {{ view: any, area: Array<any>|null }} props area = m.private.equipHand
 */
export function EquipRow({ view, area }) {
  const g0 = useTileScreen(view, GEO.TEMP_ROW, EQUIP_SLOT_COLS[0]);
  const g1 = useTileScreen(view, GEO.TEMP_ROW, EQUIP_SLOT_COLS[1]);
  const g2 = useTileScreen(view, GEO.TEMP_ROW, EQUIP_SLOT_COLS[2]);
  const g3 = useTileScreen(view, GEO.TEMP_ROW, EQUIP_SLOT_COLS[3]);
  const g4 = useTileScreen(view, GEO.TEMP_ROW, EQUIP_SLOT_COLS[4]);
  if (!Array.isArray(area) || !area.length) return null;
  const cells = [g0, g1, g2, g3, g4];
  return html`<div class="eqrow" data-testid="equip-row" aria-hidden="true">
    ${cells.map((g, i) => (g
      ? html`<span key=${i} class=${cx('eqrow__slot', area[i] && 'is-filled')}
          style=${`left:${g.x}px;top:${g.y}px;width:${Math.max(16, g.s * 1.12)}px;height:${Math.max(16, g.s * 1.12)}px`} />`
      : null))}
  </div>`;
}

/**
 * The operator picker of an equipment item (the official 选择干员 step after tapping equipment): lists the board / hand
 * operators with a free slot; a pick sends g.equip {itemUid, targetUid}.
 * @param {{ open: boolean, itemUid: number|null, priv: any, gd: any, busy?: boolean, onPick: (target: any) => void, onClose: () => void }} props
 */
export function EquipPicker({ open, itemUid, priv, gd, busy = false, onPick, onClose }) {
  const item = equipItemOf(priv, itemUid);
  const slotsOf = (p) => gd?.equipSlotsOf?.(p.id) ?? (gd?.config?.economy?.equipPerChess ?? 2);
  const targets = open ? equipTargets(priv, slotsOf) : [];
  const name = item ? (gd?.item(item.id)?.name || t('装备')) : t('装备');
  return html`<${Modal} open=${open && !!item} title=${t('选择干员')} micro=${name} width="5.4rem" onClose=${onClose}
      actions=${html`<${Button} variant="secondary" icon="close" onClick=${onClose}>${t('取消')}<//>`}>
    <div class="eqpick" data-testid="equip-picker">
      <div class="eqpick__list">
        ${targets.length ? targets.map((p) => html`<button key=${p.uid} type="button" class="eqpick__target" disabled=${busy}
            onClick=${() => onPick?.(p)}>
          <b>${gd?.chess(p.id)?.name || p.id}</b>
          <span class="num">${(p.items?.length || 0)}/${slotsOf(p)}</span>
        </button>`) : html`<p class="eqpick__empty">${t('没有符合条件的干员')}</p>`}
      </div>
    </div>
  <//>`;
}

