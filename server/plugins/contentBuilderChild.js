// server/plugins/contentBuilderChild.js — a child process that builds a room's content set OFF the server's event loop.
// The lobby sends { type: 'build', id, ids, settings, allowIncompatible }; the child scans the installed plugins once,
// builds with the same builder the main process uses (server/plugins/contentSet.js) and returns the C1 set plus its
// served bodies. The parent registers those bodies with contentSet.js (registerContentSetFiles) before adopting the set.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginRegistry } from './registry.js';
import { buildContentSet, contentSetFiles } from './contentSet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS = {
  publicDir: path.join(ROOT, 'public'),
  dataDir: path.join(ROOT, 'data'),
  packsDir: path.join(ROOT, 'packs'),
  pluginsDir: path.join(ROOT, 'plugins'),
};
const log = { info() {}, warn() {}, error() {}, debug() {} };
let registry = null;

function getRegistry() {
  if (registry) return registry;
  registry = createPluginRegistry(DIRS, { app: process.env.SP_APP || '0.4.0', log });
  registry.refresh(true);
  registry.contentDirs = {
    dataDir: DIRS.dataDir,
    simDir: path.join(ROOT, 'server/sim'),
    sharedDir: path.join(ROOT, 'shared'),
  };
  return registry;
}

process.on('message', (m) => {
  if (!m || m.type !== 'build') return;
  try {
    const set = buildContentSet({ registry: getRegistry(), ids: m.ids, settings: m.settings, allowIncompatible: m.allowIncompatible });
    const files = [...contentSetFiles(set)].map(([rel, f]) => [rel, f.body]);
    process.send({ type: 'built', id: m.id, set, files });
  } catch (e) {
    process.send({ type: 'failed', id: m.id, error: String(e?.stack || e?.message || e) });
  }
});
process.on('disconnect', () => process.exit(0));
