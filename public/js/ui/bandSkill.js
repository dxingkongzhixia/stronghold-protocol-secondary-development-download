// public/js/ui/bandSkill.js — 规程's active strategy skill (m.private.bandSkill, the server's bandSkillView): the band's
// official active skill as a prep button (effect name, cost, uses left this round / this match / cooldown), and the
// target picker its `targetType` asks for (g.bandSkill): NO_TARGET fires at once, COMMON_CHESS / SHOP_SLOT / MAP_TILE
// open a picker. The default 盟约 bands have no active skill (bandSkill is null), so this renders nothing there.
import { useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { Img } from './gameComponents.js';
import { bandIconUrl, chessAvatarUrl } from './assetUrls.js';
import { actions } from './gameActions.js';
import { GEO } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The COMMON_CHESS targets of g.bandSkill: the board operators, then the hand's and temp's (the server's ps.find). */
export function bandSkillChessTargets(priv) {
  const board = Array.isArray(priv?.board) ? priv.board : [];
  const bench = [...(Array.isArray(priv?.hand) ? priv.hand : []), ...(Array.isArray(priv?.temp) ? priv.temp : [])];
  return [...board, ...bench].filter((p) => p && p.kind === 'chess');
}

/** The SHOP_SLOT targets: the shop's unsold slots, with their index. */
export function bandSkillShopTargets(priv) {
  const slots = Array.isArray(priv?.shop?.slots) ? priv.shop.slots : [];
  return slots.map((s, slot) => ({ slot, slotInfo: s })).filter((x) => x.slotInfo && !x.slotInfo.sold);
}

/** What the button reads for the skill's remaining uses: a per-round / per-match count, or a cooldown in rounds. */
export function bandSkillUsesText(bs) {
  if (!bs) return '';
  if (bs.cooldown > 0) return `${t('冷却')} ${bs.cooldown}`;
  return bs.usesLeft == null ? '' : `×${bs.usesLeft}`;
}

/**
 * 规程 追随者们: this prep's instruction offer (m.private.bandChoice), while unpicked. The picked instruction becomes the
 * band skill button's skill (g.bandSkillChoose); the strategy's own passive does not change.
 */
function BandSkillChoice({ offer, gd, busy, onPick }) {
  if (!offer || offer.pick != null || !Array.isArray(offer.candidates) || !offer.candidates.length) return null;
  return html`<div class="bskill__offer" role="group" aria-label=${t('更换指令')}>
    <span class="bskill__offer-title">${t('更换指令')}</span>
    ${offer.candidates.map((id) => {
      const band = gd?.band(id);
      return html`<button key=${id} type="button" class="bskill__option" disabled=${busy} onClick=${() => onPick(id)}>
        ${bandIconUrl(gd?.m, id) ? html`<${Img} src=${bandIconUrl(gd.m, id)} alt="" />` : html`<${Icon} name="sword" />`}
        <b>${band?.effectName || band?.name || id}</b>
        <span class="t-dim">${band?.name || ''}</span>
      </button>`;
    })}
  </div>`;
}

/** The 规程 active strategy skill's button and target picker (prep only; `editable` = the local player's own prep). */
export function BandSkill({ priv, gd, editable = true, busy = false }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [row, setRow] = useState(10);
  const [col, setCol] = useState(6);
  const bs = priv?.bandSkill;
  const offer = priv?.bandChoice;
  if (!editable || (!bs && !offer)) return null;
  const blocked = busy || sending || !bs?.available || (bs?.cost || 0) > (priv.funds ?? 0);
  const fire = async (target) => {
    if (blocked) return;
    setSending(true);
    const ok = await actions.bandSkill(target);
    setSending(false);
    if (ok) setOpen(false);
  };
  const choose = async (id) => {
    if (busy || sending) return;
    setSending(true);
    await actions.bandSkillChoose(id);
    setSending(false);
  };
  const targetType = bs?.targetType;
  const toggle = () => {
    if (blocked) return;
    if (targetType === 'NO_TARGET' || targetType == null) fire();
    else setOpen(!open);
  };
  const chessTargets = targetType === 'COMMON_CHESS' ? bandSkillChessTargets(priv) : [];
  const shopTargets = targetType === 'SHOP_SLOT' ? bandSkillShopTargets(priv) : [];
  return html`<div class=${cx('bskill', open && 'is-open')}>
    <${BandSkillChoice} offer=${offer} gd=${gd} busy=${busy || sending} onPick=${choose} />
    ${bs ? html`<button type="button" class="bskill__btn" disabled=${blocked} aria-expanded=${open}
        title=${bs.desc || bs.name} onClick=${toggle}>
      ${bandIconUrl(gd?.m, bs.bandId)
        ? html`<${Img} src=${bandIconUrl(gd.m, bs.bandId)} alt="" />`
        : html`<${Icon} name="sword" />`}
      <span class="bskill__name">${bs.name}</span>
      ${bs.cost > 0 ? html`<b class="bskill__cost num">${bs.cost}</b>` : null}
      <b class="bskill__uses num">${bandSkillUsesText(bs)}</b>
    </button>` : null}
    ${open && bs ? html`<div class="bskill__panel" role="dialog" aria-label=${bs.name}>
      <div class="bskill__head">
        <b>${targetType === 'MAP_TILE' ? t('选择地块') : t('选择目标')}</b>
        <button type="button" class="bskill__x" aria-label=${t('关闭')} onClick=${() => setOpen(false)}><${Icon} name="close" /></button>
      </div>
      ${targetType === 'COMMON_CHESS' ? html`<div class="bskill__targets">
        ${chessTargets.length ? chessTargets.map((p) => html`<button key=${p.uid} type="button" class="bskill__target"
            disabled=${blocked} onClick=${() => fire({ kind: 'chess', uid: p.uid })}>
          ${chessAvatarUrl(gd?.m, gd?.chess(p.id) || { id: p.id })
            ? html`<${Img} src=${chessAvatarUrl(gd.m, gd.chess(p.id) || { id: p.id })} alt="" />` : null}
          <b>${gd?.chess(p.id)?.name || p.id}</b>
          <span class="num t-dim">${p.row != null && p.col != null ? `${p.row + 1},${p.col + 1}` : ''}</span>
        </button>`) : html`<p class="bskill__empty">${t('无')}</p>`}
      </div>` : null}
      ${targetType === 'SHOP_SLOT' ? html`<div class="bskill__targets">
        ${shopTargets.length ? shopTargets.map(({ slot, slotInfo }) => html`<button key=${slot} type="button" class="bskill__target"
            disabled=${blocked} onClick=${() => fire({ slot })}>
          <span class="bskill__slot num">${slot + 1}</span>
          <b>${(slotInfo.kind === 'item' ? gd?.item(slotInfo.id)?.name : gd?.chess(slotInfo.id)?.name) || slotInfo.id}</b>
        </button>`) : html`<p class="bskill__empty">${t('无')}</p>`}
      </div>` : null}
      ${targetType === 'MAP_TILE' ? html`<div class="bskill__tile">
        <label><span>${t('行')}</span>
          <select class="bskill__sel" disabled=${blocked} value=${String(row)} onChange=${(e) => setRow(Number(e.target.value))}>
            ${Array.from({ length: GEO.ROWS }, (_, i) => html`<option key=${i} value=${String(i)}>${i + 1}</option>`)}
          </select>
        </label>
        <label><span>${t('列')}</span>
          <select class="bskill__sel" disabled=${blocked} value=${String(col)} onChange=${(e) => setCol(Number(e.target.value))}>
            ${Array.from({ length: GEO.COLS }, (_, i) => html`<option key=${i} value=${String(i)}>${i + 1}</option>`)}
          </select>
        </label>
        <button type="button" class="bskill__confirm" disabled=${blocked} onClick=${() => fire({ row, col })}>${t('确认')}</button>
      </div>` : null}
    </div>` : null}
  </div>`;
}
