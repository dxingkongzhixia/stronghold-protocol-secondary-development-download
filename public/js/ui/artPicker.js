// ui/artPicker.js — the seat card's 更换立绘 dialog (owner 2026-10-24). Two steps, like the reference room:
//   1. the operator grid (search + 全部 / 6★ / 5★ / 4★), the operator's avatar as the tile, a 默认 tile to clear;
//   2. that operator's illustrations: the default full-body art plus every core skin (skins/catalogue.json, merged into
//      `chars[charId].skins` — docs/SKINS.md), each drawn with its own `illust`.
// The value sent to the server is a charId (default art) or a skin key (`charId@skin`); the server validates the charId.
//
// Presentation only: the parent decides what a pick means (room.setArt for this seat, account.setArt for the logged-in
// default) and closes the dialog. `canSaveDefault` adds the "同时设为默认立绘" switch the room passes for an account.
import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { data, useData } from '../data.js';
import { seatArtUrl } from './assetUrls.js';
import { html, Modal, Button, Icon, TextField } from './components.js';
import { t, N_ } from '../../../shared/i18n.js';

/** The rarity tabs of the operator step (the same 6 / 5 / 4 split the reference room uses; every tier is in 全部). */
const RARITIES = Object.freeze([
  { id: 0, label: N_('全部') },
  { id: 6, label: '6★' },
  { id: 5, label: '5★' },
  { id: 4, label: '4★' },
]);

/** The charId part of an art choice (a charId, or `charId@skin`). */
const charOf = (art) => (typeof art === 'string' && art ? art.split('@')[0] : null);

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
  const [charId, setCharId] = useState(null);
  useEffect(() => { if (open) { setQ(''); setRarity(0); setCharId(null); } }, [open]);
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
    const all = Object.keys(chars).filter((id) => meta.has(id)).map((id) => ({
      charId: id,
      name: meta.get(id).name,
      rarity: meta.get(id).rarity,
      avatar: chars[id].avatar || chars[id].avatarE2 || seatArtUrl(m, id),
      skins: Object.keys(chars[id].skins || {}).length,
    }));
    const qq = q.trim().toLowerCase();
    return all
      .filter((c) => (!rarity || c.rarity === rarity) && (!qq || `${c.name} ${c.charId}`.toLowerCase().includes(qq)))
      .sort((a, b) => b.rarity - a.rarity || String(a.name).localeCompare(String(b.name), 'zh'));
  }, [m, chess, backups, q, rarity, open]);
  const picked = charId ? rows.find((c) => c.charId === charId) : null;
  const entry = charId ? m?.chars?.[charId] : null;
  const skins = useMemo(() => Object.entries(entry?.skins || {}).map(([key, skin]) => ({
    key, name: skin?.name || key, group: skin?.group || '', art: seatArtUrl(m, key),
  })).filter((s) => s.art), [entry, m]);
  const choose = (art) => { if (!busy) onPick(art); };
  const title = t('更换立绘');
  return html`<${Modal} open=${open} onClose=${onClose} title=${title} micro="SEAT CARD" width="8.4rem"
      actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>${t('完成')}<//>`}>
    <div class="artpick" data-testid="art-picker" data-step=${charId ? 'arts' : 'operators'}>
      ${charId ? html`<div class="artpick__head">
        <button type="button" class="artpick__back" onClick=${() => setCharId(null)}>
          <${Icon} name="chevronLeft" />${t('返回干员列表')}</button>
        <b>${picked?.name || charId}</b><span>${t('选择立绘')}</span>
      </div>` : html`<div class="artpick__bar">
        <${TextField} size="md" icon="search" value=${q} maxLength=${24} placeholder=${t('搜索干员')}
          onInput=${setQ} class="artpick__search" />
        <div class="artpick__tabs" role="tablist" aria-label=${t('星级')}>
          ${RARITIES.map((r) => html`<button key=${r.id} type="button" role="tab" aria-selected=${rarity === r.id ? 'true' : 'false'}
            class=${`artpick__tab${rarity === r.id ? ' is-on' : ''}`} data-rarity=${r.id} onClick=${() => setRarity(r.id)}>${t(r.label)}</button>`)}
        </div>
      </div>`}
      ${charId ? html`<div class="artpick__arts" role="listbox" aria-label=${t('干员立绘')}>
        <button type="button" role="option" aria-selected=${current === charId ? 'true' : 'false'}
          class=${`artpick__art${current === charId ? ' is-on' : ''}`} data-art=${charId} disabled=${busy} onClick=${() => choose(charId)}>
          ${seatArtUrl(m, charId) ? html`<img class="artpick__artimg" src=${seatArtUrl(m, charId)} alt="" loading="lazy" draggable=${false} />` : html`<span class="artpick__artglyph">${[...(picked?.name || '?')][0]}</span>`}
          <span class="artpick__artname">${t('默认立绘')}</span>
        </button>
        ${skins.map((s) => html`<button key=${s.key} type="button" role="option" aria-selected=${current === s.key ? 'true' : 'false'}
          class=${`artpick__art${current === s.key ? ' is-on' : ''}`} data-art=${s.key} title=${s.group || s.name} disabled=${busy}
          onClick=${() => choose(s.key)}>
          <img class="artpick__artimg" src=${s.art} alt="" loading="lazy" draggable=${false} />
          <span class="artpick__artname">${s.name}</span>
          ${s.group ? html`<span class="artpick__artgroup">${s.group}</span>` : null}
        </button>`)}
      </div>
      ${!skins.length ? html`<p class="set-hint">${t('暂无可用的皮肤立绘')}</p>` : null}`
      : html`<div class="artpick__grid" role="listbox" aria-label=${t('干员立绘')}>
        <button type="button" role="option" aria-selected=${current == null ? 'true' : 'false'}
          class=${`artpick__tile artpick__tile--default${current == null ? ' is-on' : ''}`} data-art="" disabled=${busy}
          onClick=${() => choose(null)}>
          <span class="artpick__reset"><${Icon} name="refresh" /></span>
          <span class="artpick__name">${t('默认')}</span>
        </button>
        ${rows.map((c) => html`<button key=${c.charId} type="button" role="option" aria-selected=${charOf(current) === c.charId ? 'true' : 'false'}
          class=${`artpick__tile${charOf(current) === c.charId ? ' is-on' : ''}`} data-art=${c.charId} title=${c.name} disabled=${busy}
          onClick=${() => { setCharId(c.charId); }}>
          ${c.avatar ? html`<img class="artpick__img" src=${c.avatar} alt="" loading="lazy" draggable=${false} />` : html`<span class="artpick__glyph">${[...c.name][0] || '?'}</span>`}
          <span class="artpick__rarity num">${c.rarity || ''}${c.rarity ? '★' : ''}</span>
          <span class="artpick__name">${c.name}</span>
        </button>`)}
      </div>`}
      ${!charId && !rows.length ? html`<p class="set-hint">${t('没有符合条件的干员。')}</p>` : null}
      <div class="artpick__foot">
        <span class="set-hint">${t('选择后，同盟里的博士都会看到这张立绘。')}</span>
        ${canSaveDefault ? html`<label class="artpick__save"><input type="checkbox" checked=${saveDefault}
          onChange=${(e) => onSaveDefaultChange?.(e.currentTarget.checked)} /> ${t('同时设为我的默认立绘')}</label>` : null}
      </div>
    </div>
  <//>`;
}
