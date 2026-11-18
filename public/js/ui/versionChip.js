// versionChip.js — the hub's official-version switch: the chip in the top bar (right of the utility plates, before
// 登录/注册) and the picker it opens.
//
// The chip appears only when the server enables more than one version (welcome.versions, public/js/versions.js): it
// shows the version the hub wears (this browser's stored choice, else the server's default) and opens a list of the
// offered ones. A pick is this browser's choice at once — the page reloads, and versions.js hubVersion() boots the data
// (content.js) and the hub's season look from it. A server that enables one version shows it as a plain tag.
//
// Ported from the mainline's ui/versionPicker.js (VersionSwitch — the chip), simplified to a reload on pick: the fork
// loads a version's set at boot (content.js), so switching by reload keeps one loading path.
import { useState, useEffect } from '../../vendor/hooks.module.js';
import { html, Modal, MicroLabel } from './components.js';
import { useStore } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { hubVersion, setLobbyVersion, storedLobbyVersion, versionById } from '../versions.js';
import { REGULATION } from './regulationBackdrop.js';

/** The registry label of a version id (a msgid), else the id. */
const labelOf = (id) => t(versionById(id)?.label || id);

/** The season tag of a version: 规程 / 盟约. */
const seasonTag = (v) => (String(v?.family || (versionById(v?.id)?.family)) === 'regulation' ? 'REGULATION' : 'ALLIANCE');

export function VersionChip() {
  const list = useStore((s) => s.versions);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState('');
  useEffect(() => {
    if (!hint) return undefined;
    const id = setTimeout(() => setHint(''), 2400);
    return () => clearTimeout(id);
  }, [hint]);
  if (!Array.isArray(list) || list.length === 0) return null;
  const current = hubVersion(list);
  const reg = String(versionById(current)?.family) === 'regulation';
  const only = list.length === 1;
  const pick = (id) => {
    if (id === current) { setOpen(false); return; }
    setLobbyVersion(id);
    setOpen(false);
    // the page boots the version's own data and season (main.js welcome → content.js → versions.js hubVersion)
    location.reload();
  };
  return html`<span class="ver-chip" data-season=${reg ? REGULATION : 'alliance'}>
    <button type="button" class=${'ver-chip__btn' + (only ? ' is-static' : '')} disabled=${only}
      title=${only ? t('本服务器只启用了一个官方版本') : t('切换官方版本')} onClick=${() => setOpen(true)}>
      <${MicroLabel} tone="mint">${seasonTag(versionById(current))}<//>
      <b class="ver-chip__name">${labelOf(current)}</b>
      <svg class="ver-chip__glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.4 8 10.4 12 6.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <${Modal} open=${open} title=${t('切换官方版本')} micro="OFFICIAL VERSION" onClose=${() => setOpen(false)}>
      <div class="ver-pick">
        ${list.map((v) => {
          const on = v.id === current;
          return html`<button type="button" class=${'ver-pick__row' + (on ? ' is-on' : '')} onClick=${() => pick(v.id)}>
            <span class="ver-pick__tag">${seasonTag(v)}</span>
            <span class="ver-pick__text">
              <b class="ver-pick__name">${labelOf(v.id)}</b>
              <em class="ver-pick__meta">${v.default ? t('服务器默认') : (v.id === storedLobbyVersion() ? t('本机选择') : '')}</em>
            </span>
            ${on ? html`<span class="ver-pick__on">${t('当前')}</span>` : null}
          </button>`;
        })}
      </div>
    <//>
    ${hint ? html`<span class="ver-chip__hint">${hint}</span>` : null}
  </span>`;
}
