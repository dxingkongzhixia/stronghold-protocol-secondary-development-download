// Player settings (BGM/SFX volume, mute, damage numbers, render quality): a tiny observable store
// persisted in localStorage (`sp.pref.settings`), applied to the audio manager on every change, plus
// the settings modal.

import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, MicroLabel } from './components.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { sanitizeSettings } from './gameLogic.js';
import { audio } from '../audio.js';
import { detectFeatures } from './device.js';

/** Settings store: { bgm, sfx, muted, damageNumbers, quality }. */
export const settingsStore = createStore(sanitizeSettings(loadPref('settings', null)));

settingsStore.subscribe((s) => {
  savePref('settings', sanitizeSettings(s));
  audio.setVolumes(s);
});
audio.setVolumes(settingsStore.get());

/** @param {Partial<ReturnType<typeof sanitizeSettings>>} patch */
export function updateSettings(patch) {
  settingsStore.set(sanitizeSettings({ ...settingsStore.get(), ...patch }));
}

/** Preact hook: current settings. */
export const useSettings = () => useStore((s) => s, Object.is, settingsStore);

let _gpu = null;
/**
 * Hardware acceleration of this browser (WebGL2/WebGL). The renderer string comes from WEBGL_debug_renderer_info when
 * the browser exposes it; software rasterisers (SwiftShader / llvmpipe / Microsoft Basic Render / ANGLE-Sw) are flagged
 * as not accelerated. Cached (one throwaway context); safe outside a browser (returns a "no WebGL" record).
 */
export function gpuInfo() {
  if (_gpu) return _gpu;
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    const gl = gl2 || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return (_gpu = { webgl: false, webgl2: false, hardware: false, renderer: '无 WebGL', vendor: '' });
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String((dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
    const vendor = String((dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) || '');
    const software = /swiftshader|llvmpipe|software|basic render|microsoft basic|angle \(software/i.test(renderer);
    return (_gpu = { webgl: true, webgl2: !!gl2, hardware: !software, renderer, vendor });
  } catch { return (_gpu = { webgl: false, webgl2: false, hardware: false, renderer: '检测失败', vendor: '' }); }
}

/** A short, human name from a WebGL renderer string ("ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 (0x…) Direct3D11 …)"). */
export function shortGpu(renderer) {
  const s = String(renderer || '').replace(/\s+/g, ' ').trim();
  const m = /(NVIDIA GeForce[^,()]*|GeForce[^,()]*|AMD Radeon[^,()]*|Radeon[^,()]*|Intel\(R\)[^,()]*|Arc [A-Z][^,()]*|Apple M\d[^,()]*|Adreno[^,()]*|Mali[^,()]*|NVIDIA[^,()]*|AMD[^,()]*|Intel[^,()]*|Apple[^,()]*)/i.exec(s);
  return ((m ? m[1] : s) || '未知').trim().slice(0, 44);
}

/**
 * The GPU this browser renders with (a short name; "软件渲染" when it is not accelerated) — for the main screens.
 * @param {{ class?: string }} props
 */
export function GpuLabel({ class: cls = '' }) {
  const gpu = gpuInfo();
  if (!gpu.webgl) return html`<span class=${cls} title="此浏览器没有可用的 WebGL">渲染：无 WebGL</span>`;
  return html`<span class=${cls} title=${gpu.renderer}>GPU：${shortGpu(gpu.renderer)}${gpu.hardware ? '' : '（软件渲染）'}</span>`;
}

function Slider({ label, micro, value, onInput, icon }) {
  const pct = Math.round(value * 100);
  return html`<label class="set-row">
    <span class="set-row__label"><${Icon} name=${icon} />${label}<${MicroLabel}>${micro}<//></span>
    <input class="set-range" type="range" min="0" max="100" step="5" value=${pct} style=${`--pct:${pct}%`}
      onInput=${(e) => onInput(Number(e.currentTarget.value) / 100)} />
    <span class="set-row__val num">${pct}</span>
  </label>`;
}

function Toggle({ label, micro, value, onChange }) {
  return html`<div class="set-row">
    <span class="set-row__label">${label}<${MicroLabel}>${micro}<//></span>
    <button type="button" class=${`set-toggle${value ? ' is-on' : ''}`} role="switch" aria-checked=${value ? 'true' : 'false'}
      onClick=${() => onChange(!value)}><i></i><span>${value ? '开启' : '关闭'}</span></button>
  </div>`;
}

const QUALITY = [['high', '高'], ['medium', '中'], ['low', '低']];

/**
 * Settings modal.
 * @param {{ open: boolean, onClose: Function }} props
 */
export function SettingsModal({ open, onClose }) {
  const s = useSettings();
  const [tested, setTested] = useState(false);
  const [touchUi] = useState(() => detectFeatures().coarse && !detectFeatures().fine);
  const gpu = gpuInfo();
  return html`<${Modal} open=${open} onClose=${onClose} title="设置" micro="SETTINGS" width="7.4rem"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>完成<//>`}>
    <div class="set-list">
      <${Slider} label="背景音乐" micro="BGM" icon="play" value=${s.bgm} onInput=${(v) => updateSettings({ bgm: v })} />
      <${Slider} label="音效" micro="SFX" icon="signal" value=${s.sfx}
        onInput=${(v) => { updateSettings({ sfx: v }); if (!tested) { setTested(true); setTimeout(() => setTested(false), 400); audio.sfx('click'); } }} />
      <${Toggle} label="静音" micro="MUTE" value=${s.muted} onChange=${(v) => updateSettings({ muted: v })} />
      <${Toggle} label="显示伤害数字" micro="DAMAGE NUMBERS" value=${s.damageNumbers} onChange=${(v) => updateSettings({ damageNumbers: v })} />
      <div class="set-row">
        <span class="set-row__label">画面质量<${MicroLabel}>QUALITY<//></span>
        <div class="set-seg" role="radiogroup">
          ${QUALITY.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${s.quality === id ? 'true' : 'false'}
            class=${s.quality === id ? 'is-on' : ''} onClick=${() => updateSettings({ quality: id })}>${label}</button>`)}
        </div>
      </div>
      <div class="set-row">
        <span class="set-row__label">硬件加速<${MicroLabel}>GPU ACCELERATION<//></span>
        <span class="set-row__val" style=${`color:${gpu.hardware ? '#4ed8af' : '#ff7a5c'}`}>${gpu.hardware ? '已开启' : '未开启'}</span>
      </div>
      <p class="set-hint">渲染器：${gpu.renderer || '未知'} · WebGL2：${gpu.webgl2 ? '支持' : '不支持'}${gpu.hardware ? '' : ' · 请在浏览器设置里开启「使用硬件加速」，否则画面会明显卡顿'}</p>
      ${touchUi
        ? html`<p class="set-hint">触屏操作：点击单位选中（撤退 / 出售）· 长按单位或卡牌查看详情 · 拖动部署后滑动选择朝向</p>`
        : html`<p class="set-hint">快捷键：<kbd>R</kbd> 刷新 · <kbd>F</kbd> 冻结 · <kbd>D</kbd> 升级 · <kbd>Space</kbd> 准备就绪 · <kbd>Esc</kbd> 关闭弹窗 · 右键查看详情</p>`}
    </div>
  <//>`;
}

/**
 * A settings entry point for screens without one (the title / the lobby): a gear button that owns its modal. The game
 * screen keeps its own gear in the HUD.
 * @param {{ class?: string, variant?: string, size?: string, label?: string }} props
 */
export function SettingsButton({ class: cls = '', variant = 'secondary', size = 'sm', label = '设置' }) {
  const [open, setOpen] = useState(false);
  return html`<${Button} variant=${variant} size=${size} icon="gear" class=${cls} title="设置" onClick=${() => setOpen(true)}>${label}<//>
    <${SettingsModal} open=${open} onClose=${() => setOpen(false)} />`;
}
