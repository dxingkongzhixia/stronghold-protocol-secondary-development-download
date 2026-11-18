// versionChip.js — the hub's official-version switch: the chip in the top bar (before 登录/注册) and the picker it opens.
//
// The chip appears only when the server enables more than one version (welcome.versions, public/js/versions.js): it
// shows the version the hub wears (this browser's stored choice, else the server's default) and opens a list of the
// offered ones. A pick is this browser's choice at once — the page reloads, and versions.js hubVersion() boots the data
// (content.js) and the hub's season look from it. A server that enables one version shows it as a plain tag.
//
// Styled as the hub's own top-bar buttons (Button variant secondary size sm) so it sits in the same row as 默认主题 /
// 设置; the only own marks are the season dot (mint 盟约 / red 规程) and the caret. Ported from the mainline's
// ui/versionPicker.js (VersionSwitch), simplified to a reload on pick: the fork loads a set at boot, one path.
import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { useStore } from '../store.js';
import { t } from '../../../shared/i18n.js';
import { hubVersion, setLobbyVersion, storedLobbyVersion, versionById } from '../versions.js';
import { REGULATION } from './regulationBackdrop.js';

/** The registry label of a version id (a msgid), else the id. */
const labelOf = (id) => t(versionById(id)?.label || id);
/** 规程 / 盟约 of a version id. */
const isReg = (id) => String(versionById(id)?.family) === 'regulation';
/** The season tag of a picker row. */
const seasonTag = (id) => (isReg(id) ? 'REGULATION' : 'ALLIANCE');

export function VersionChip() {
  const list = useStore((s) => s.versions);
  const [open, setOpen] = useState(false);
  if (!Array.isArray(list) || list.length === 0) return null;
  const current = hubVersion(list);
  const reg = isReg(current);
  const only = list.length === 1;
  const pick = (id) => {
    setOpen(false);
    if (id === current) return;
    setLobbyVersion(id);
    // the page boots the version's own data and season (main.js welcome → content.js → versions.js hubVersion)
    location.reload();
  };
  return html`<span class="ver-chip" data-season=${reg ? REGULATION : 'alliance'}>
    <${Button} variant="secondary" size="sm" class="ver-chip__btn" disabled=${only} active=${open}
      title=${only ? t('本服务器只启用了一个官方版本') : t('切换官方版本')} onClick=${() => setOpen(true)}>
      <i class=${'ver-chip__dot' + (reg ? ' is-reg' : '')} aria-hidden="true"></i>${labelOf(current)}<i class="ver-chip__caret" aria-hidden="true">▾</i>
    <//>
    <${Modal} open=${open} title=${t('切换官方版本')} micro="OFFICIAL VERSION" onClose=${() => setOpen(false)}>
      <div class="ver-pick">
        ${list.map((v) => {
          const on = v.id === current;
          return html`<button type="button" class=${'ver-pick__row' + (on ? ' is-on' : '')} onClick=${() => pick(v.id)}>
            <i class=${'ver-pick__dot' + (isReg(v.id) ? ' is-reg' : '')} aria-hidden="true"></i>
            <span class="ver-pick__text">
              <b class="ver-pick__name">${labelOf(v.id)}</b>
              <em class="ver-pick__meta">${seasonTag(v.id)}${v.default ? ' · ' + t('服务器默认') : (v.id === storedLobbyVersion() ? ' · ' + t('本机选择') : '')}</em>
            </span>
            ${on ? html`<span class="ver-pick__on">${t('当前')}</span>` : null}
          </button>`;
        })}
      </div>
    <//>
  </span>`;
}
