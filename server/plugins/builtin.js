// server/plugins/builtin.js — the project's BUILT-IN content plugins (owner's 阵营加强, 2026-10-24).
// (i18n-ignore-file: the faction names and descriptions below are bilingual catalogue *data* — `{ zh, en }` read by the
// manifest's localized name/description fields, exactly like a plugin.json — not UI msgids; the panel shows the current
// language's entry, and the server never calls t(). docs/I18N.md.)
//
// The 8 self-made shop operators are not part of the vanilla game: the generated data keeps their records with
// `visible: false` and without bond membership (`tools/build-data.mjs` splitCustomShop). Each faction ships a built-in
// plugin here — no `plugins/` folder, no install, no files of its own — whose data patch restores that faction's
// operators when the room's host switches it on. Off (the default: `plugins/config.json` `default: []`) they only exist
// as the official 自选 picks, exactly like the original game.
//
// The plugin shape is the registry's (`server/plugins/registry.js`): a normalized manifest plus the content snapshot
// `{ documents, files, hash }` the content-set composer reads, so the rest of the plugin pipeline (catalogue, room
// choice, policy, `cs`, the 非官方 mark) needs no special case. Only `builtin: true` and `source: 'builtin'` are added.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { APP_VERSION, PLUGIN_API } from '../../shared/constants.js';
import { readPluginManifest } from '../../shared/plugins/manifest.js';

/**
 * The factions, in the panel's order. `operators` is only for the description a player reads (the ids in the patch are
 * the source of truth); keep the text in sync with `CUSTOM_CHESS` in tools/build-data.mjs.
 */
export const BUILTIN_FACTIONS = Object.freeze([
  { id: 'rhodes', name: { zh: '罗德岛', en: 'Rhodes Island' }, operators: { zh: '阿斯卡纶、予愿安洁莉娜、凯尔希·思衡托', en: "Ascalon, Virtuosa, Kal'tsit the Shaper" } },
  { id: 'laterano', name: { zh: '拉特兰', en: 'Laterano' }, operators: { zh: '结城理', en: 'Makoto Yuki' } },
  { id: 'yan', name: { zh: '炎', en: 'Yan' }, operators: { zh: '望', en: 'Wang' } },
  { id: 'victoria', name: { zh: '维多利亚', en: 'Victoria' }, operators: { zh: '澄闪', en: 'Goldenglow' } },
  { id: 'sargon', name: { zh: '萨尔贡', en: 'Sargon' }, operators: { zh: '娜仁图亚', en: 'Narantuya' } },
  { id: 'egir', name: { zh: '阿戈尔', en: 'Ægir' }, operators: { zh: '克莱门莎', en: 'Clementia' } },
]);

/** The built-in plugin id of a faction (`faction-rhodes`). */
export const builtinId = (faction) => `faction-${faction}`;

/**
 * Read the generated `data/builtin/faction-*.json` patches and shape them as plugins. A missing or unreadable file
 * skips that faction (a server whose data predates the split simply has no built-in plugins), never throws.
 * @param {{ dataDir?: string, app?: string, log?: { warn?: Function } }} [o]
 * @returns {any[]}
 */
export function builtinPlugins({ dataDir = 'data', app = APP_VERSION, log = console } = {}) {
  const out = [];
  for (const faction of BUILTIN_FACTIONS) {
    const id = builtinId(faction.id);
    const rel = `builtin/faction-${faction.id}.json`;
    const abs = path.join(dataDir, ...rel.split('/'));
    let doc;
    try {
      doc = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      if (existsSync(abs)) log.warn?.(`[plugins] builtin ${id}: ${rel} is not readable JSON`);
      continue;
    }
    if (!doc || doc.patch !== 1 || !Array.isArray(doc.ops)) {
      log.warn?.(`[plugins] builtin ${id}: ${rel} is not a data patch`);
      continue;
    }
    const name = { zh: `阵营加强：${faction.name.zh}`, en: `Faction boost: ${faction.name.en}` };
    const description = {
      zh: `内置阵营加强：开启后${faction.operators.zh}以商店干员加入本房间（含专属整备与召唤物）；关闭时他们只作为自选干员，商店与随机盟约都不含他们。`,
      en: `Built-in faction boost: switch it on to add ${faction.operators.en} to this room as shop operators (with their traits and summons). Switch it off and they exist only as 自选 picks — never in the shop or a random bond ban.`,
    };
    const raw = {
      manifest: 2, id, version: app, app: '*', api: PLUGIN_API.current,
      class: 'content', category: 'faction', scope: ['room'],
      name, description, authors: ['Stronghold Protocol'], license: 'GPL-3.0-or-later',
      permissions: ['data.patch'], data: [rel],
    };
    const read = readPluginManifest(raw, { id, app, api: PLUGIN_API });
    if (!read.manifest || read.problems.length) {
      log.warn?.(`[plugins] builtin ${id}: manifest refused (${read.problems.join('; ')})`);
      continue;
    }
    const body = JSON.stringify(doc);
    const hash = createHash('sha256').update(body).digest('hex');
    out.push({
      id, type: 'data', class: 'content', status: 'loaded', supported: true,
      source: 'builtin', builtin: true, layout: 'builtin', where: `builtin:${id}`,
      manifest: read.manifest, files: {}, count: 1, bytes: body.length,
      content: { documents: { [rel]: doc }, files: { [rel]: hash }, hash },
    });
  }
  return out;
}
