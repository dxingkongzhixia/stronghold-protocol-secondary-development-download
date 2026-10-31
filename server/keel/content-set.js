// server/keel/content-set.js — build one Keel content set through the shared content compiler.
//
// The compiler itself is not a plugin loader: it takes normalized plugin objects and returns the room's `cs`, data,
// i18n, offers and dsl. This adapter makes Keel plugins look like those objects, so dsl/offers/i18n/stage-wave stay in
// one implementation while the declaration source is manifest 3.

import { DATA_DIR } from '../data.js';
import { buildContentSet } from '../plugins/contentSet.js';
import { keelToV2 } from '../../shared/keel/legacy.js';

/**
 * @param {{ plugins: any[], dataDir?: string, settings?: Record<string, Record<string, unknown>> }} opts
 *   plugins: `loadKeelPlugin` results (folder or builtin shape)
 * @returns {{ cs?: string, data?: any, files?: any, i18n?: any, offers?: any[], dsl?: any, problems: any[] }}
 */
export function createKeelContentSet({ plugins = [], dataDir = DATA_DIR, settings = {} } = {}) {
  const map = new Map();
  for (const p of plugins) {
    if (!p?.id || !p.manifest) continue;
    const manifest = p.manifest.manifest === 3 ? keelToV2(p.manifest, { id: p.id }) : p.manifest;
    map.set(p.id, {
      id: p.id,
      class: manifest.class,
      status: 'loaded',
      supported: true,
      manifest,
      content: p.content,
      offers: p.offers ?? null,
      visual: p.visual ?? null,
    });
  }
  if (!map.size) return { problems: [] };
  const registry = {
    plugin: (id) => map.get(id) ?? null,
    contentDirs: { dataDir },
  };
  const built = buildContentSet({ registry, ids: [...map.keys()], settings });
  return built;
}

export { DATA_DIR };
