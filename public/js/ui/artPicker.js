// ui/artPicker.js — the seat card's 更换立绘 dialog (owner 2026-10-24). The choice is a raw operator charId, which the
// server stores on the session / account and every client draws from data/assets.json (the very art the shop card uses);
// null means the card's default look. Grid rows come from the visible operator roster, so names and rarity are the game's.
//
// The component is presentation only: the parent decides what a pick means (room.setArt for this seat, account.setArt
// for the logged-in default) and closes the dialog. `canSaveDefault` adds the "同时设为默认立绘" switch the room passes
// for a bound account.
import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { data, useData } from '../data.js';
import { charPortraitUrl } from './assetUrls.js';
import { html, Modal, Button, Icon, TextField } from './components.js';
import { t, N_ } from '../../../shared/i18n.js';

/** The rarity tabs of the picker (the same 6 / 5 / 4 split the reference room uses; every tier is in 全部). */
const RARITIES = Object.freeze([
  { id: 0, label: N_('全部') },
  { id: 6, label: '6★' },
  { id: 5, label: '5★' },
  { id: 4, label: '4★' },
]);

/**
 * @param {{
 *   open: boolean, current?: string|null, onPick: (art: string|null) => void, onClose: () => void,
 *   canSaveDefault?: boolean, saveDefault?: boolean, onSaveDefaultChange?: (v: boolean) => void, busy?: boolean,
 * }} props
 */
export function ArtPicker({ open, current = null, onPick, onClose, canSaveDefault = false, saveDefault = false, onSaveDefaultChange, busy = false }) {
  useData('chess', 'assets', 'backups');
  const [q, setQ] = useState('');
  const [rarity, setRarity] = useState(0);
  useEffect(() => { if (open) { setQ(''); setRarity(0); } }, [open]);
  const m = data.get('assets');
  const chess = data.list('chess');
  const backups = data.get('backups');
  const rows = useMemo(() => {
    const chars = m?.chars || {};
    // Names / rarity come from the game's own records: the shop roster (chess.json) and the 自选 stand-ins
    // (backups.units). Every character the asset manifest has art for is offered, like the reference picker.
    const meta = new Map();
    for (const c of chess) {
      if (c?.charId && c.name && !meta.has(c.charId)) meta.set(c.charId, { name: c.name, rarity: Number(c.rarity) || 0 });
    }
    for (const u of Object.values(backups?.units || {})) {
      if (u?.charId && u.name && !meta.has(u.charId)) meta.set(u.charId, { name: u.name, rarity: Number(u.rarity) || 0 });
    }
    const all = Object.keys(chars).filter((id) => meta.has(id)).map((charId) => ({
      charId,
      name: meta.get(charId).name,
      rarity: meta.get(charId).rarity,
      avatar: chars[charId].avatar || chars[charId].avatarE2 || charPortraitUrl(m, charId),
    }));
    const qq = q.trim().toLowerCase();
    return all
      .filter((c) => (!rarity || c.rarity === rarity) && (!qq || `${c.name} ${c.charId}`.toLowerCase().includes(qq)))
      .sort((a, b) => b.rarity - a.rarity || String(a.name).localeCompare(String(b.name), 'zh'));
  }, [m, chess, backups, q, rarity, open]);
  const choose = (art) => { if (!busy) onPick(art); };
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('更换立绘')} micro="SEAT CARD" width="8.4rem"
      actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>${t('完成')}<//>`}>
    <div class="artpick" data-testid="art-picker">
      <div class="artpick__bar">
        <${TextField} size="md" icon="search" value=${q} maxLength=${24} placeholder=${t('搜索干员')}
          onInput=${setQ} class="artpick__search" />
        <div class="artpick__tabs" role="tablist" aria-label=${t('星级')}>
          ${RARITIES.map((r) => html`<button key=${r.id} type="button" role="tab" aria-selected=${rarity === r.id ? 'true' : 'false'}
            class=${`artpick__tab${rarity === r.id ? ' is-on' : ''}`} data-rarity=${r.id} onClick=${() => setRarity(r.id)}>${t(r.label)}</button>`)}
        </div>
      </div>
      <div class="artpick__grid" role="listbox" aria-label=${t('干员立绘')}>
        <button type="button" role="option" aria-selected=${current == null ? 'true' : 'false'}
          class=${`artpick__tile artpick__tile--default${current == null ? ' is-on' : ''}`} data-art="" disabled=${busy}
          onClick=${() => choose(null)}>
          <span class="artpick__reset"><${Icon} name="refresh" /></span>
          <span class="artpick__name">${t('默认')}</span>
        </button>
        ${rows.map((c) => html`<button key=${c.charId} type="button" role="option" aria-selected=${current === c.charId ? 'true' : 'false'}
          class=${`artpick__tile${current === c.charId ? ' is-on' : ''}`} data-art=${c.charId} title=${c.name} disabled=${busy}
          onClick=${() => choose(c.charId)}>
          ${c.avatar ? html`<img class="artpick__img" src=${c.avatar} alt="" loading="lazy" draggable=${false} />` : html`<span class="artpick__glyph">${[...c.name][0] || '?'}</span>`}
          <span class="artpick__rarity num">${c.rarity || ''}${c.rarity ? '★' : ''}</span>
          <span class="artpick__name">${c.name}</span>
        </button>`)}
      </div>
      ${!rows.length ? html`<p class="set-hint">${t('没有符合条件的干员。')}</p>` : null}
      <div class="artpick__foot">
        <span class="set-hint">${t('选择后，同盟里的博士都会看到这张立绘。')}</span>
        ${canSaveDefault ? html`<label class="artpick__save"><input type="checkbox" checked=${saveDefault}
          onChange=${(e) => onSaveDefaultChange?.(e.currentTarget.checked)} /> ${t('同时设为我的默认立绘')}</label>` : null}
      </div>
    </div>
  <//>`;
}
