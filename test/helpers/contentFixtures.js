import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { ROOT } from '../../server/data.js';
import { keelManifestOf } from './keelFixture.js';
export function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp1b-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const registry = createPluginRegistry({ publicDir: path.join(dir, 'public'), packsDir: path.join(dir, 'packs'), pluginsDir: path.join(dir, 'plugins'), dataDir: path.join(ROOT, 'data') });
  const put = (id, manifest = {}, documents = {}) => {
    const root = path.join(dir, 'plugins', id); fs.mkdirSync(root, { recursive: true });
    // A bare string was the old shorthand for a one-file sim script.
    const script = typeof manifest === 'string';
    const m = { manifest: 2, id, name: id, version: '1.0.0', app: '>=0.3.0 <0.5.0', api: 1, class: script ? 'script' : 'content', scope: ['room'], permissions: script ? ['sim.code'] : ['data.patch', 'data.add'], ...(script ? { entry: { sim: 'sim/index.js' } } : {}), ...(script ? {} : manifest) };
    if (script) documents = { 'sim/index.js': script };
    for (const [file, doc] of Object.entries(documents)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), typeof doc === 'string' ? doc : JSON.stringify(doc));
    }
    const three = keelManifestOf(m, id);
    // A negative fixture (the schema itself is invalid) stays manifest 2: the loader's only answer is the legacy gate.
    // The original plugin.json stays beside a converted descriptor, like a real mixed folder.
    if (three) {
      fs.writeFileSync(path.join(root, 'plugin.keel.json'), JSON.stringify(three));
      fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify(m));
    } else fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify(m));
    registry.rescan(); return root;
  };
  return { dir, registry, put };
}
export const guard = () => JSON.parse(fs.readFileSync(new URL('../fixtures/keel/guard.json', import.meta.url), 'utf8'));
export const bondPatch = (value = 0.3) => ({ patch: 1, ops: [['bb', 'base_def'], ['buffs', 0, 'bb', 'base_def']].map(path => ({ op: 'set', file: 'bonds', id: 'deputShip', path, value })) });
