// Generic, declarative plugin HUD slots. A gameplay/content plugin publishes its read-only
// `pluginView` through ctx.setView; this file draws only the small, bounded component vocabulary
// the platform accepts. It never executes plugin code and never trusts plugin URLs.
import { html } from './components.js';

export const PLUGIN_HUD_SLOTS = Object.freeze(['top', 'boss', 'overlay']);
export const PLUGIN_HUD_LIMITS = Object.freeze({ blocks: 8, items: 8, text: 120, bars: 8 });

const str = (v) => (typeof v === 'string' ? v.slice(0, PLUGIN_HUD_LIMITS.text) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Normalise the `hud[slot]` arrays of every plugin in `pub.pluginView`. Unknown plugin data and
 * malformed blocks are ignored; the result is only the supported, bounded vocabulary.
 * @param {any} pub
 * @param {'top'|'boss'|'overlay'} slot
 * @returns {{ pluginId: string, type: string, label: string|null, text: string|null, value: number|null, max: number|null, items: string[] }[]}
 */
export function pluginHudBlocks(pub, slot = 'overlay', hud = null) {
  if (!PLUGIN_HUD_SLOTS.includes(slot)) return [];
  // `pub.pluginView` is match state; `hud.pluginView` is the live battle snapshot and wins for the
  // same plugin (the battle view is newer while a field runs).
  const views = { ...(pub && typeof pub === 'object' ? pub.pluginView || {} : {}), ...(hud && typeof hud === 'object' ? hud.pluginView || {} : {}) };
  const out = [];
  for (const [pluginId, view] of Object.entries(views)) {
    if (!view || typeof view !== 'object' || Array.isArray(view)) continue;
    const blocks = view.hud && view.hud[slot];
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks.slice(0, PLUGIN_HUD_LIMITS.blocks)) {
      if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
      const type = String(b.type || '');
      const base = { pluginId, type, label: b.label == null ? null : str(b.label), text: null, value: null, max: null, items: [] };
      if (type === 'text') {
        base.text = str(b.text ?? b.value ?? '');
        if (!base.label && !base.text) continue;
      } else if (type === 'bar') {
        base.value = num(b.value);
        base.max = num(b.max);
        if (base.value == null || base.max == null || base.max <= 0) continue;
      } else if (type === 'countdown') {
        base.value = num(b.seconds);
        if (base.value == null) continue;
      } else if (type === 'list') {
        base.items = (Array.isArray(b.items) ? b.items : []).slice(0, PLUGIN_HUD_LIMITS.items).map(str).filter(Boolean);
        if (!base.label && !base.items.length) continue;
      } else continue;
      out.push(base);
      if (out.length >= PLUGIN_HUD_LIMITS.blocks * PLUGIN_HUD_SLOTS.length) return out;
    }
  }
  return out;
}

function Block({ b }) {
  const label = b.label ? html`<span class="plugin-hud__label">${b.label}</span>` : null;
  if (b.type === 'bar') {
    const k = Math.max(0, Math.min(1, b.value / b.max));
    return html`<div class="plugin-hud__block plugin-hud__block--bar">
      ${label}<span class="plugin-hud__bar"><i style=${`width:${(k * 100).toFixed(1)}%`}></i></span>
    </div>`;
  }
  if (b.type === 'countdown') {
    return html`<div class="plugin-hud__block">${label}<b class="num">${Math.max(0, Math.ceil(b.value))}</b></div>`;
  }
  if (b.type === 'list') {
    return html`<div class="plugin-hud__block plugin-hud__block--list">${label}
      <ul>${b.items.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul>
    </div>`;
  }
  return html`<div class="plugin-hud__block">${label}${b.text ? html`<span>${b.text}</span>` : null}</div>`;
}

/** Draw one bounded plugin HUD slot; null when no plugin published anything for it. */
export function PluginHud({ pub, hud = null, slot = 'overlay' }) {
  const blocks = pluginHudBlocks(pub, slot, hud);
  if (!blocks.length) return null;
  return html`<div class=${`plugin-hud plugin-hud--${slot}`} data-testid=${`plugin-hud-${slot}`} role="status">
    ${blocks.map((b, i) => html`<${Block} key=${`${b.pluginId}:${i}`} b=${b} />`)}
  </div>`;
}
