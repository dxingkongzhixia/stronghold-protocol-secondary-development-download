// 核心皮肤 (docs/SKINS.md): the skin catalogue is part of the project, not a cosmetic plugin. The server serves
// skins/catalogue.json (tracked metadata) and /skins/sets/… (local extraction, never committed); this module loads the
// catalogue once and lays it under every room / personal cosmetic layer through cosmetics.setCore.
//
// It is deliberately tiny and independent of plugin loading: a missing catalogue (a fresh checkout without local art)
// resolves to null and the UI simply has no 皮肤 section, exactly like an installation without skins.

import { cosmetics } from './cosmetics.js';

export const CORE_SKINS_URL = '/skins/catalogue.json';
let pending = null;

/**
 * Load and apply the core skin catalogue. Safe to call more than once: the same promise is returned while a fetch is in
 * flight and a loaded catalogue is applied only once.
 * @param {{ fetch?: typeof fetch }} [opts]
 * @returns {Promise<{ chars: Record<string, any> } | null>}
 */
export function installCoreSkins(opts = {}) {
  if (pending) return pending;
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return Promise.resolve(null);
  pending = (async () => {
    try {
      const res = await fetchImpl(CORE_SKINS_URL, { cache: 'no-cache' });
      if (!res.ok) return null;
      const doc = await res.json();
      if (!doc || typeof doc !== 'object' || !doc.chars || typeof doc.chars !== 'object') return null;
      cosmetics.setCore(doc.chars);
      return doc;
    } catch {
      return null;
    }
  })();
  return pending;
}
