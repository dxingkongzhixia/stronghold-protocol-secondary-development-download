// ui/musicPicker.js — 主界面音乐 (owner 2026-10-25): the Hub's music chip and picker. The player chooses one of the
// official 主界面音乐 tracks (manifest `audio.lobbyMusic`, tools/lobby-music.mjs, docs/ASSETS.md "Lobby music"); the
// choice is this browser's own (settings.lobbyMusic, localStorage) and only changes the Hub's BGM — the title screen,
// a room's lobby and every battle keep their own tracks, so a pick never affects what a party hears.
//
// The default row ('') is the mode's own `audio.bgm.lobby` theme. A manifest that predates the catalogue (or a server
// without the files) simply shows the default: resolveBgm falls back to `bgm.lobby` for an unknown id.

import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Icon, TextField, Tabs } from './components.js';
import { data, useData } from '../data.js';
import { updateSettings, useSettings } from './settings.js';
import { t, N_ } from '../../../shared/i18n.js';

/** Tab id → label (the manifest carries `group`; `all` is the picker's default). N_: module-level msgids. */
const GROUPS = ['all', 'theme', 'event', 'collab', 'contract'];
const GROUP_LABEL = {
  all: N_('全部'),
  theme: N_('主题'),
  event: N_('活动'),
  collab: N_('联动'),
  contract: N_('危机合约'),
  default: N_('默认'),
};

function library() {
  const m = data.get('assets');
  const lib = m?.audio?.lobbyMusic;
  return lib && typeof lib === 'object' ? lib : null;
}

/** The current 主界面音乐's name (the default row when nothing is chosen or the manifest lacks the pick). */
function currentTrackName(settings) {
  const lib = library();
  return (settings.lobbyMusic && lib?.[settings.lobbyMusic]?.name) || t('默认主题（卫戍协议）');
}

/**
 * The Hub topbar's music chip: the current track's name; clicking opens the picker.
 * @param {{ onClick: () => void }} props
 */
export function MusicButton({ onClick }) {
  useData('assets');
  const settings = useSettings();
  const name = currentTrackName(settings);
  return html`<button type="button" class="music-chip" onClick=${onClick}
    title=${t('主界面音乐：{name}', { name })} aria-label=${t('主界面音乐')}>
    <${Icon} name="music" />
    <span class="music-chip__text"><span class="music-chip__en">LOBBY MUSIC</span><b>${name}</b></span>
  </button>`;
}

/**
 * The picker modal: tabs by catalogue group, a search box, the official tracks and the default row.
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function MusicPanel({ open, onClose }) {
  useData('assets');
  const settings = useSettings();
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const lib = library();
  const current = settings.lobbyMusic || '';
  const rows = lib
    ? Object.entries(lib).map(([id, x]) => ({ id, name: String(x?.name || id), group: x?.group || 'theme' }))
    : [];
  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) => (group === 'all' || r.group === group)
    && (!needle || r.name.toLowerCase().includes(needle) || r.id.includes(needle)));
  const showDefault = group === 'all' || group === 'theme';
  const pick = (id) => updateSettings({ lobbyMusic: id });

  return html`<${Modal} open=${open} utility=${true} class="lobby-music-panel" title=${t('主界面音乐')} micro="LOBBY MUSIC"
    onClose=${onClose}>
    <div class="lobby-music">
      <div class="lobby-music__track">
        <span class="lobby-music__now"><${Icon} name="play" />${t('正在播放 · 主界面')}</span>
        <strong>${currentTrackName(settings)}</strong>
        <small>${t('进入作战后仍使用房间的对战音乐；选择只保存在当前浏览器。')}</small>
      </div>
      <${Tabs} size="sm" value=${group} onChange=${setGroup}
        items=${GROUPS.map((id) => ({ id, label: t(GROUP_LABEL[id]) }))} />
      <${TextField} icon="search" value=${q} onInput=${setQ} maxLength=${40}
        placeholder=${t('搜索曲目')} />
      ${lib ? html`<div class="lobby-music__list" role="list">
        ${showDefault ? html`<button type="button" role="listitem" aria-pressed=${current === ''}
          class=${`music-row${current === '' ? ' is-on' : ''}`} onClick=${() => pick('')}>
          <span class="music-row__idx num">00</span>
          <span class="music-row__main"><b>${t('默认主题（卫戍协议）')}</b>
            <em>${t('默认')} · ${t('原版主界面')}</em></span>
          <span class="music-row__mark"><${Icon} name=${current === '' ? 'play' : 'music'} /></span>
        </button>` : null}
        ${visible.map((r, i) => html`<button key=${r.id} type="button" role="listitem"
          aria-pressed=${current === r.id} class=${`music-row${current === r.id ? ' is-on' : ''}`}
          onClick=${() => pick(r.id)}>
          <span class="music-row__idx num">${String(i + 1).padStart(2, '0')}</span>
          <span class="music-row__main"><b>${r.name}</b><em>${t(GROUP_LABEL[r.group] || '主题')}</em></span>
          <span class="music-row__mark"><${Icon} name=${current === r.id ? 'play' : 'music'} /></span>
        </button>`)}
        ${visible.length || showDefault ? null : html`<p class="lobby-music__empty">${t('没有匹配的曲目')}</p>`}
      </div>` : html`<p class="lobby-music__empty">${t('资源清单尚未加载；请稍后再试。')}</p>`}
      <label class="bgset__slider lobby-music__vol"><span>${t('音乐音量')}</span>
        <input type="range" min="0" max="100" value=${Math.round((settings.bgm || 0) * 100)}
          onInput=${(e) => updateSettings({ bgm: Number(e.currentTarget.value) / 100 })} />
        <b class="num">${Math.round((settings.bgm || 0) * 100)}%</b></label>
      <p class="bgset__note">${t('曲目来自明日方舟游戏内「音乐鉴赏」的主界面音乐；版权归鹰角网络 / 塞壬唱片所有。')}</p>
    </div>
  <//>`;
}
