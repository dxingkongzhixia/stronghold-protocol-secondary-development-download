// ui/musicPicker.js — 主界面音乐 (owner 2026-10-25): the Hub's music chip and picker. The player chooses from the
// committed 24 official tracks (`audio.lobbyMusic`, tools/lobby-music.mjs) plus, when the optional pack is present, the
// rest of the 218-recording 音乐鉴赏 catalogue (`ui/musicLibrary.js`, tools/local-extract/music.py, docs/ASSETS.md
// "Music pack"); the choice is this browser's own (settings.lobbyMusic, localStorage) and only changes the Hub's BGM —
// the title screen, a room's lobby and every battle keep their own tracks, so a pick never affects what a party hears.
//
// The default row ('') is the mode's own `audio.bgm.lobby` theme. A manifest that predates the catalogue (or a server
// without the files) simply shows the default: resolveBgm falls back to `bgm.lobby` for an unknown id.

import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Icon, TextField, Tabs } from './components.js';
import { useData } from '../data.js';
import { musicTrack, useMusicLibrary } from './musicLibrary.js';
import { updateSettings, useSettings } from './settings.js';
import { t, N_ } from '../../../shared/i18n.js';

/** Tab id → label (the pack's `group`; `all` is the picker's default). N_: module-level msgids. */
const GROUPS = ['all', 'theme', 'event', 'collab', 'contract', 'rogue', 'sandbox', 'story', 'other'];
const GROUP_LABEL = {
  all: N_('全部'),
  theme: N_('主题'),
  event: N_('活动'),
  collab: N_('联动'),
  contract: N_('危机合约'),
  rogue: N_('肉鸽'),
  sandbox: N_('生息演算'),
  story: N_('剧情'),
  other: N_('其他'),
  default: N_('默认'),
};

/** A catalogue title, or '' for an id-like / empty name (never show `music_act…` to a player). */
function cleanName(x) {
  const name = String(x?.name || '').trim();
  return name && !/^music_/i.test(name) ? name : '';
}

/** The current 主界面音乐's name (the default row when nothing is chosen). */
function currentTrackName(settings) {
  if (!settings.lobbyMusic) return t('默认主题（卫戍协议）');
  const entry = musicTrack(settings.lobbyMusic);
  return cleanName(entry) || t('未命名曲目');
}

/**
 * The Hub topbar's music chip: the current track's name; clicking opens the picker.
 * @param {{ onClick: () => void }} props
 */
export function MusicButton({ onClick }) {
  useData('assets');
  useMusicLibrary();
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
  const entries = useMusicLibrary();
  const settings = useSettings();
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const current = settings.lobbyMusic || '';
  const rows = Object.entries(entries || {}).map(([id, x]) => ({ id, name: cleanName(x), group: x?.group || 'theme' }));
  const present = new Set(rows.map((r) => r.group));
  const tabIds = GROUPS.filter((id) => id === 'all' || present.has(id));
  const active = tabIds.includes(group) ? group : 'all';
  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) => (active === 'all' || r.group === active)
    && (!needle || r.name.toLowerCase().includes(needle) || r.id.includes(needle)));
  const showDefault = active === 'all' || active === 'theme';
  const pick = (id) => updateSettings({ lobbyMusic: id });

  return html`<${Modal} open=${open} utility=${true} class="lobby-music-panel" title=${t('主界面音乐')} micro="LOBBY MUSIC"
    onClose=${onClose}>
    <div class="lobby-music">
      <div class="lobby-music__track">
        <span class="lobby-music__now"><${Icon} name="play" />${t('正在播放 · 主界面')}</span>
        <strong>${currentTrackName(settings)}</strong>
        <small>${t('进入作战后仍使用房间的对战音乐；选择只保存在当前浏览器。')}</small>
        <small>${t('仅点选时加载当前曲目（约 2–6 MB），不会预载全部音乐。')}</small>
        ${rows.length > 24 ? html`<small>${t('已加载本地音乐包：共 {n} 首', { n: rows.length })}</small>` : null}
      </div>
      <${Tabs} size="sm" value=${active} onChange=${setGroup}
        items=${tabIds.map((id) => ({ id, label: t(GROUP_LABEL[id]) }))} />
      <${TextField} icon="search" value=${q} onInput=${setQ} maxLength=${40}
        placeholder=${t('搜索曲目')} />
      ${rows.length ? html`<div class="lobby-music__list" role="list">
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
          <span class="music-row__main"><b>${r.name || `${t(GROUP_LABEL[r.group] || '其他')} ${i + 1}`}</b>
            <em>${t(GROUP_LABEL[r.group] || '主题')}</em></span>
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
