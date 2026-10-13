// public/js/ui/assetMode.js — the two UI surfaces of the local asset cache (js/assetCache.js + public/sw.js):
//   * <AssetModePrompt/> — the first-visit modal that asks "网页加载 / 缓存到本地" (default: cache);
//   * <AssetCacheSection/> — the 设置 row (mode switch + what is cached + 立即缓存 / 清除缓存).
// `syncAssetCache()` runs the pre-cache in the background (progress in a toast), so the next boot fetches nothing.
// docs/OUR-FEATURES.md "local asset cache".

import { useState, useEffect } from '../../vendor/hooks.module.js';
import { html, Modal, Button, MicroLabel } from './components.js';
import { t } from '../../../shared/i18n.js';
import { toast } from './toasts.js';
import { data } from '../data.js';
import { collectArtUrls } from '../preload.js';
import {
  getAssetMode, setAssetMode, assetCacheSupported, assetCacheInfo,
  assetCacheUsage, clearAssetCache, fetchAssetIndex, ensureAssets,
} from '../assetCache.js';

/** Human bytes for the settings row (GB / MB / KB). */
export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1 << 30) return `${(v / (1 << 30)).toFixed(2)} GB`;
  if (v >= 1 << 20) return `${(v / (1 << 20)).toFixed(1)} MB`;
  if (v >= 1 << 10) return `${Math.round(v / (1 << 10))} KB`;
  return `${v} B`;
}

/** The boot-art image set the pre-cache fetches (the default, ~104 MB): mirrors main.js preloadArt. */
async function bootArtUrls() {
  let manifest = data.get('assets');
  if (!manifest) { try { await data.load('assets'); } catch { /* ignore */ } manifest = data.get('assets'); }
  return collectArtUrls(manifest, 'all');
}

/**
 * Bring the local cache up to the server's art revision in the background, with a toast for progress. Safe to call
 * at any time; when the cache is already current it does nothing.
 */
export async function syncAssetCache() {
  if (!assetCacheSupported()) { toast(t('此浏览器不支持本地缓存')); return { ok: false }; }
  toast(t('正在缓存…'));
  try {
    const [urls, index] = await Promise.all([bootArtUrls(), fetchAssetIndex()]);
    const r = await ensureAssets({ urls, index });
    if (r && r.ok && r.skipped) toast(t('本地缓存已是最新'));
    else if (r && r.ok) toast(t('已缓存美术资源'));
    else toast(t('缓存失败，请稍后重试'));
    return r;
  } catch { toast(t('缓存失败，请稍后重试')); return { ok: false }; }
}

/**
 * The first-visit modal: asks how art should load, defaulting to the local cache. Rendered only until the player has
 * chosen (assetCacheSupported + no stored mode). Choosing 缓存到本地 also starts the pre-cache.
 */
export function AssetModePrompt() {
  const [open, setOpen] = useState(() => assetCacheSupported() && getAssetMode() == null);
  const [mode, setModeChoice] = useState('cache');
  if (!open) return null;
  const choose = () => {
    setAssetMode(mode);
    setOpen(false);
    if (mode === 'cache') void syncAssetCache();
  };
  const option = (id, title, desc) => html`<button type="button" role="radio" aria-checked=${mode === id ? 'true' : 'false'}
    class=${`asset-opt${mode === id ? ' is-on' : ''}`} data-testid=${`asset-mode-${id}`} onClick=${() => setModeChoice(id)}>
    <span class="asset-opt__title">${title}</span><span class="asset-opt__desc">${desc}</span></button>`;
  return html`<${Modal} open=${open} onClose=${choose} title=${t('美术资源')} micro="ART ASSETS" width="7.4rem"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${choose}>${t('使用此方式')}<//>`}>
    <div class="asset-prompt">
      <p class="set-hint">${t('首次进入，请选择美术资源的加载方式（可随时在设置里更改）：')}</p>
      <div class="asset-opts" role="radiogroup" aria-label=${t('美术资源')}>
        ${option('cache', t('缓存到本地（推荐）'), t('首次下载后存到本机，之后不再占用服务器'))}
        ${option('stream', t('网页加载（不缓存）'), t('每次从服务器加载，占用磁盘最少'))}
      </div>
    </div>
  <//>`;
}

/** The 设置 row: mode switch, what is cached, and 立即缓存 / 清除缓存. */
export function AssetCacheSection() {
  const supported = assetCacheSupported();
  const [mode, setModeState] = useState(() => getAssetMode() || 'stream');
  const [usage, setUsage] = useState(null);
  const [info, setInfo] = useState(() => assetCacheInfo());
  const refresh = () => { setInfo(assetCacheInfo()); assetCacheUsage().then(setUsage, () => setUsage(null)); };
  useEffect(() => { refresh(); }, []);
  const pick = (m) => { setAssetMode(m); setModeState(m); if (m === 'cache') void syncAssetCache().then(refresh); };
  const clear = () => { void clearAssetCache().then(() => { refresh(); toast(t('已清除本地缓存')); }); };
  const seg = (id, label) => html`<button type="button" role="radio" aria-checked=${mode === id ? 'true' : 'false'}
    class=${mode === id ? 'is-on' : ''} data-testid=${`asset-cache-${id}`} onClick=${() => pick(id)}>${label}</button>`;
  return html`<div class="set-asset" data-testid="asset-cache">
    <div class="set-row">
      <span class="set-row__label">${t('美术资源缓存')}<${MicroLabel}>ASSET CACHE<//></span>
      <div class="set-seg" role="radiogroup" aria-label=${t('加载方式')}>
        ${seg('stream', t('网页加载'))}${seg('cache', t('缓存到本地'))}
      </div>
    </div>
    ${!supported
      ? html`<p class="set-hint">${t('此浏览器不支持本地缓存')}</p>`
      : html`<p class="set-hint">${info.files ? t('已缓存 {size}（{n} 个文件）', { size: formatBytes(usage ? usage.usage : 0), n: info.files }) : t('未缓存')}${usage ? ` · ${formatBytes(usage.usage)} / ${formatBytes(usage.quota)}` : ''}<br/>${t('位置：浏览器站点数据（默认在系统盘）')}</p>
        <div class="set-row set-row--actions">
          <${Button} variant="secondary" size="sm" onClick=${() => void syncAssetCache().then(refresh)}>${t('立即缓存')}<//>
          <${Button} variant="secondary" size="sm" onClick=${clear}>${t('清除缓存')}<//>
        </div>`}
  </div>`;
}
