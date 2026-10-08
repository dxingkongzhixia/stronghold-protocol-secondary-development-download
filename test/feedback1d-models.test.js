// test/feedback1d-models.test.js — 灼热源石虫 / 炽焰源石虫 (enemy_1305_mhslim / _2, the ELEMENT faction's slugs, up to
// 10 a round) are drawn with the plain 源石虫's skeleton/texture, tinted toward their own colours (render/units.js
// ALIAS_TINT). Owner report after 0.2.0 ("they use the wrong art"): in the game these two are the ordinary 源石虫 —
// only their colour tells them apart. No community dump carries a model for them (Ark-Models lists them with an empty
// `assetList`), so the asset plan aliases them to enemy_1007_slime (`spineAliasOf`), and the client draws that web
// model. The plan does NOT attach the optional local-client `spineLocal` overlay for them (ENEMY_SPINE_NO_LOCAL), so
// the plain slug is what the game shows everywhere — with or without the local extraction. The metadata machinery
// (tools/assets/local-enemy-spines.json, findLocalEnemyModels, tools/local-extract ENEMY_SPINES) stays for other
// enemies; the tinted alias is the look here.
//
// Root cause (2026-10-04): Ark-Models *indexes* 1305_mhslim / 1305_mhslim_2 with an EMPTY `assetList` — registered,
// never uploaded — so `arkModel()` finds nothing and the alias chain drops to enemy_1007_slime. The last block below
// locks the mapping: only these two enemies borrow a different enemy's skeleton, and every asset source is a GitHub
// dump.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan, ENEMY_SPINE_ALIAS } from '../tools/assets/plan.mjs';
import { RAW } from '../tools/assets/sources.mjs';
import { resolveTemplate, collectLeaves } from '../tools/assets/manifest.mjs';
import { findLocalEnemyModels, localEnemySpineMeta, loadLocalEnemySpines, LOCAL_ENEMY_SPINES_FILE, localEnemySpineGroup } from '../tools/assets/spine.mjs';
import { indexAudio } from '../tools/assets/audio.mjs';
import { createAssets, spineEntry, validSpine } from '../public/js/assets.js';
import { installFakePixi, fakeViewCtx } from './render/fakepixi.js';
import { presetCamera } from '../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'public/assets');
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const SLUGS = ['enemy_1305_mhslim', 'enemy_1305_mhslim_2'];
const COMMITTED = readJson(LOCAL_ENEMY_SPINES_FILE).models;
const MANIFEST = readJson('data/assets.json');

/** The real research inputs; Ark-Models carries the plain slug only (its index lists the special ones empty). */
function plan(localEnemySpines) {
  const modelsData = { data: { '1007_slime': { assetList: { '.skel': 'enemy_1007_slime.skel', '.atlas': 'enemy_1007_slime.atlas', '.png': 'enemy_1007_slime.png' } },
    '1305_mhslim': { assetList: {} }, '1305_mhslim_2': { assetList: {} } } };
  return buildPlan({
    assets07: readJson('docs/research/07-assets.json'), ops03: readJson('docs/research/03-operators.json'),
    enemies05: readJson('docs/research/05-enemies.json'), maps05: readJson('docs/research/05-maps.json'),
    audio: indexAudio({}), modelsData, extraEnemyIds: SLUGS, localEnemySpines,
  });
}

/** A data/local-assets.json listing the extracted files of `ids` (extract.py's group layout). */
function localManifest(ids, drop = null) {
  const groups = {};
  for (const id of ids) {
    const g = groups[localEnemySpineGroup(id)] = {};
    const m = COMMITTED[id];
    for (const f of [m.skel, m.atlas, ...m.textures]) if (f !== drop) g[f] = { path: `/assets/local/spine/enemy/${id}/${f}`, kind: f.endsWith('.png') ? 'Texture2D' : 'TextAsset' };
  }
  return { version: 1, source: 'local-client', groups };
}

describe('D3: the two ELEMENT slugs draw the plain 源石虫, with no local overlay', () => {
  test('plan: the web model is the 源石虫 alias; the local metadata never becomes a spineLocal overlay', () => {
    for (const localEnemySpines of [undefined, COMMITTED]) {
      const p = plan(localEnemySpines);
      for (const id of SLUGS) {
        assert.equal(p.template.enemies[id].spineAliasOf, 'enemy_1007_slime', `${id}: the web model (works without the local client)`);
        assert.equal(p.template.enemies[id].spineLocal, undefined, `${id}: no overlay (ENEMY_SPINE_NO_LOCAL)`);
      }
      assert.ok(!collectLeaves(p.template).some((l) => /spineLocal/.test(l.path)), 'no spineLocal leaf');
    }
    const p = plan(COMMITTED);
    const slime = { skel: '/assets/spine/enemy/enemy_1007_slime/enemy_1007_slime.skel', atlas: '/assets/spine/enemy/enemy_1007_slime/enemy_1007_slime.atlas', textures: [], anims: {} };
    const tmp = mkdtempSync(path.join(tmpdir(), 'sp-plan-'));
    try {
      const { value } = resolveTemplate({ enemies: Object.fromEntries(SLUGS.map((id) => [id, p.template.enemies[id]])) },
        { root: tmp, spine: new Map([['enemy:enemy_1007_slime', slime]]) });
      for (const id of SLUGS) {
        const e = value.enemies[id];
        assert.equal(e.spineAliasOf, 'enemy_1007_slime', `${id}: the plain 源石虫`);
        assert.equal(e.spine, slime, `${id}: its skeleton/texture`);
        assert.equal(e.spineLocal, undefined, `${id}: no overlay`);
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    assert.ok(p.notes.some((n) => n.includes('enemy_1305_mhslim') && /aliased/.test(n)),
      'the plan says the web model is an alias, so a run is explainable');
  });

  test('the committed metadata: both ELEMENT slugs, file names of their extract.py group, roles resolved', () => {
    assert.deepEqual(Object.keys(COMMITTED).sort(), SLUGS);
    for (const id of SLUGS) {
      const m = COMMITTED[id];
      assert.equal(m.skel, `${id}.skel`);
      assert.equal(m.atlas, `${id}.atlas`, 'next to the skeleton (pixi-spine finds the atlas by its name)');
      assert.deepEqual(m.textures, [`${id}.png`]);
      assert.equal(m.pma, true, 'premultiplied pages (extract.py merge_alpha)');
      for (const role of ['idle', 'die']) assert.ok(m.anims[role] in m.animations, `${id} ${role}`);
      assert.ok(m.anims.move.loop in m.animations && m.anims.attack.loop in m.animations, `${id} move / attack`);
      assert.ok(m.hits.Attack?.length, `${id}: the OnAttack frame`);
    }
  });

  test('data/assets.json: no spineLocal overlay for the slugs; the plain 源石虫 is the resolved model', () => {
    const urls = [];
    const walk = (n) => { if (typeof n === 'string') { if (n.includes('/assets/local/')) urls.push(n); } else if (n && typeof n === 'object') Object.values(n).forEach(walk); };
    walk(MANIFEST);
    assert.deepEqual(urls, [], 'setup / doctor / the manifest tests count every /assets/ URL as required');
    for (const id of SLUGS) {
      assert.ok(validSpine(spineEntry(MANIFEST, id)), `${id}: a web model`);
      assert.equal(MANIFEST.enemies[id].spineAliasOf, 'enemy_1007_slime');
      assert.equal(MANIFEST.enemies[id].spineLocal, undefined, `${id}: no overlay`);
      assert.deepEqual(spineEntry(MANIFEST, id), MANIFEST.enemies.enemy_1007_slime.spine, `${id}: the plain 源石虫`);
    }
    assert.ok(!Object.values(MANIFEST.enemies).some((e) => e.spineLocal), 'no enemy carries a spineLocal overlay');
  });

  test('the committed metadata is what the extracted models parse to', { skip: !SLUGS.every((id) => existsSync(path.join(ASSETS, 'local/spine/enemy', id))) && 'enemy models not extracted (tools/local-extract)' }, async () => {
    const found = await findLocalEnemyModels(ASSETS);
    const { meta, problems } = await localEnemySpineMeta(ASSETS, found);
    assert.deepEqual(problems, []);
    for (const id of SLUGS) assert.deepEqual(meta[id], COMMITTED[id], `${id}: re-run node tools/fetch-assets.mjs --local-spines`);
  });

  test('localEnemySpineMeta parses an extracted model like the pipeline and writes nothing', { skip: !existsSync(path.join(ASSETS, 'spine/enemy/enemy_1007_slime')) && 'public/assets not downloaded' }, async () => {
    // the plain slug's fetched files stand in for an extraction (same layout: <id>.skel / .atlas / page PNGs)
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-meta-'));
    try {
      const src = path.join(ASSETS, 'spine/enemy/enemy_1007_slime');
      const dst = path.join(dir, 'local/spine/enemy/enemy_9999_slime');
      mkdirSync(dst, { recursive: true });
      for (const f of ['enemy_1007_slime.skel', 'enemy_1007_slime.atlas', 'enemy_1007_slime.png']) copyFileSync(path.join(src, f), path.join(dst, f));
      const atlasBefore = readFileSync(path.join(dst, 'enemy_1007_slime.atlas'));
      const mtime = statSync(path.join(dst, 'enemy_1007_slime.atlas')).mtimeMs;
      const { meta, problems } = await localEnemySpineMeta(dir, await findLocalEnemyModels(dir));
      assert.deepEqual(problems, []);
      const web = MANIFEST.enemies.enemy_1007_slime.spine;
      assert.deepEqual(meta.enemy_9999_slime, {
        skel: 'enemy_1007_slime.skel', atlas: 'enemy_1007_slime.atlas', textures: ['enemy_1007_slime.png'], pma: true,
        anims: web.anims, animations: web.animations, events: web.events, hits: web.hits, bounds: web.bounds,
      });
      assert.ok(readFileSync(path.join(dst, 'enemy_1007_slime.atlas')).equals(atlasBefore), 'read only');
      assert.equal(statSync(path.join(dst, 'enemy_1007_slime.atlas')).mtimeMs, mtime);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('loadLocalEnemySpines: the models of the committed file, {} when it is missing or bad', async () => {
    assert.deepEqual(await loadLocalEnemySpines(path.join(ROOT, LOCAL_ENEMY_SPINES_FILE)), COMMITTED);
    assert.deepEqual(await loadLocalEnemySpines(path.join(ROOT, 'no-such-file.json')), {});
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-lse-'));
    try {
      writeFileSync(path.join(dir, 'a.json'), '{"models":[1]}');
      assert.deepEqual(await loadLocalEnemySpines(path.join(dir, 'a.json')), {});
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('findLocalEnemyModels: skeleton + same-stem atlas + page PNGs under local/spine/enemy/<id>/', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-local-'));
    try {
      const put = (rel, body = 'x') => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), body); };
      put('local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim.skel');
      put('local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim.atlas');
      put('local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim.png');
      put('local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim_2.png');
      put('local/spine/enemy/enemy_x_noatlas/enemy_x_noatlas.skel');
      put('local/spine/enemy/enemy_x_nopng/enemy_x_nopng.skel');
      put('local/spine/enemy/enemy_x_nopng/enemy_x_nopng.atlas');
      put('local/spine/enemy/not-an-enemy/a.skel');
      const found = await findLocalEnemyModels(dir);
      assert.deepEqual(Object.keys(found), ['enemy_1305_mhslim']);
      assert.deepEqual(found.enemy_1305_mhslim, {
        dir: 'local/spine/enemy/enemy_1305_mhslim/', skel: 'local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim.skel',
        atlas: 'local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim.atlas',
        pngs: ['local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim.png', 'local/spine/enemy/enemy_1305_mhslim/enemy_1305_mhslim_2.png'],
      });
      assert.deepEqual(await findLocalEnemyModels(path.join(dir, 'missing')), {});
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('D3 root cause: only the two slugs borrow a different enemy\'s skeleton, and no non-GitHub source is added', () => {
  test('plan: ENEMY_SPINE_ALIAS covers exactly the two slugs (Ark-Models indexes them with an empty assetList)', () => {
    const p = plan(undefined);
    assert.deepEqual(Object.keys(ENEMY_SPINE_ALIAS).sort(), [...SLUGS].sort(), 'exactly the slugs are aliased by hand');
    for (const id of SLUGS) assert.equal(ENEMY_SPINE_ALIAS[id], 'enemy_1007_slime', `${id}: the plain 源石虫`);
    assert.ok(p.notes.some((n) => n.includes('enemy_1305_mhslim') && /aliased/.test(n)),
      'the plan says so in its notes, so a run without the model is explainable');
  });

  test('data/assets.json: every other spineAliasOf stays inside its own variant family', () => {
    const borrowed = [];
    for (const [id, e] of Object.entries(MANIFEST.enemies)) {
      if (!e.spineAliasOf) continue;
      const base = /^(enemy_\d+_[a-z0-9]+?)_\d+$/i.exec(id);   // enemy_2001_duckmi_2 → enemy_2001_duckmi
      if (!SLUGS.includes(id) && (!base || base[1] !== e.spineAliasOf)) borrowed.push(`${id} → ${e.spineAliasOf}`);
    }
    assert.deepEqual(borrowed, [],
      'the six _2 aliases draw the base enemy their own prefab uses; only the two slugs borrow a different enemy');
  });

  test('every asset source stays a GitHub dump (no third-party mirror for two models)', () => {
    for (const [name, url] of Object.entries(RAW)) {
      assert.match(url, /^https:\/\/raw\.githubusercontent\.com\//, `RAW.${name} is a raw.githubusercontent.com URL`);
    }
    assert.ok(!/prts|torappu/i.test(JSON.stringify(RAW)), 'no community-wiki host among the download sources');
  });
});

describe('D3 client: the slugs always draw the plain 源石虫 (no local overlay)', () => {
  const webOf = (id) => MANIFEST.enemies[id].spine;   // the plain 源石虫's model (spineAliasOf enemy_1007_slime)

  test('assets.js spineEntry: the plain 源石虫 whatever the local manifest lists', () => {
    const local = localManifest(SLUGS);
    for (const id of SLUGS) {
      const web = webOf(id);
      assert.equal(spineEntry(MANIFEST, id, { local }), web, 'a listing is ignored (no spineLocal)');
      assert.equal(spineEntry(MANIFEST, id), web, 'no local manifest');
      assert.equal(spineEntry(MANIFEST, id, { local: localManifest([]) }), web, 'nothing extracted');
      assert.equal(spineEntry(MANIFEST, id, { local: localManifest([id], `${id}.png`) }), web, 'a page missing');
    }
    assert.equal(spineEntry(MANIFEST, 'enemy_1007_slime', { local }), webOf('enemy_1007_slime'), 'other enemies unchanged');
    const store = createAssets({ manifest: MANIFEST, localManifest: local });
    assert.equal(store.spineEntry(SLUGS[0]), webOf(SLUGS[0]), 'the store hands out the web model too');
    assert.equal(createAssets({ manifest: MANIFEST }).spineEntry(SLUGS[0]), webOf(SLUGS[0]), 'without local(): the web model');
  });

  test('render/app.js waits for the local manifest with the asset manifest before building unit views', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
    assert.match(src, /await withTimeout\(Promise\.all\(\[assets\.ready \? assets\.ready\(\) : null, assets\.local \? assets\.local\(\) : null\]/);
  });

  describe('UnitView', () => {
    let fake, UnitView;
    let ALIAS_TINT, UF;
    before(async () => {
      fake = installFakePixi();
      ({ UnitView, ALIAS_TINT } = await import('../public/js/render/units.js'));
      ({ UF } = await import('../shared/constants.js'));
    });
    after(() => fake.restore());
    const tick = () => new Promise((r) => setImmediate(r));
    const cam = () => presetCamera('normal', { width: 1280, height: 720 });
    const info = (id) => ({ id: 3, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x: 6, y: 10, maxHp: 1000 });

    test('a slug whose local manifest lists its own files still draws the plain 源石虫 (no overlay)', async () => {
      const local = localManifest(SLUGS);
      const asked = [];
      const store = {
        picture: () => null, image: async () => null,
        spineEntry: (id) => spineEntry(MANIFEST, id, { local }),
        spine: { acquire: async (e) => { asked.push(e.skel); return { animations: Object.keys(e.animations).map((name) => ({ name })) }; }, release() {} },
      };
      const id = SLUGS[0];
      const v = new UnitView(fakeViewCtx(fake.P, { assets: store, cam }), info(id));
      for (let i = 0; i < 3; i++) await tick();
      assert.equal(v.actor?.entry, webOf(id), 'the plain 源石虫 skeleton');
      assert.deepEqual(asked, [webOf(id).skel], 'the local files are never requested');
      assert.equal(v.entry, webOf(id));
    });

    test('the slugs are drawn tinted toward their own colours; the plain 源石虫 itself is not', async () => {
      const store = (local) => ({
        picture: () => null, image: async () => null,
        spineEntry: (id) => spineEntry(MANIFEST, id, local ? { local } : undefined),
        spine: { acquire: async (e) => ({ animations: Object.keys(e.animations).map((name) => ({ name })) }), release() {} },
      });
      const local = localManifest(SLUGS);
      const mk = (id, st) => new UnitView(fakeViewCtx(fake.P, { assets: st, cam }), info(id));
      const withLocal = mk(SLUGS[0], store(local)), withoutLocal = mk(SLUGS[1], store(null));
      const plain = mk('enemy_1007_slime', store(local));
      for (let i = 0; i < 4; i++) await tick();
      const all = [withLocal, withoutLocal, plain];
      for (const v of all) v.update(1 / 60, cam(), 0);
      assert.equal(withLocal.actor.entry, webOf(SLUGS[0]), 'the plain 源石虫 even with a local manifest');
      assert.equal(withLocal.actor.spine.tint, ALIAS_TINT[SLUGS[0]], '灼热源石虫: orange');
      assert.equal(withoutLocal.actor.spine.tint, ALIAS_TINT[SLUGS[1]], '炽焰源石虫: red-orange');
      assert.notEqual(ALIAS_TINT[SLUGS[0]], ALIAS_TINT[SLUGS[1]], 'the two read apart');
      assert.equal(plain.actor.spine.tint, 0xffffff, 'the plain 源石虫 itself');
      withLocal.flags = UF.FROZEN;
      withLocal.update(1 / 60, cam(), 1 / 60);
      assert.equal(withLocal.actor.spine.tint, 0x9fd4ff, 'a status tint wins (frozen)');
      for (const v of all) v.destroy?.();
    });
  });
});

const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);
describe('D3: tools/local-extract/extract.py enemy Spine job (no UnityPy needed)', { skip: !PY && 'no python3' }, () => {
  const TOOL = path.join(ROOT, 'tools/local-extract');
  const ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  const py = (body) => {
    const o = spawnSync(PY, ['-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(TOOL)})\nimport extract as e\n${body}`], { encoding: 'utf8', env: ENV });
    assert.equal(o.status, 0, o.stderr);
    return JSON.parse(o.stdout);
  };

  test('--print-jobs lists the enemy models; container matching and --only selection', () => {
    const r = spawnSync(PY, [path.join(TOOL, 'extract.py'), '--print-jobs'], { encoding: 'utf8', env: ENV });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).enemySpines, { bundles: 'refs/arts/enm_art_*.ab', sub: 'spine/enemy', ids: SLUGS });
    const out = py(`W = set(e.ENEMY_SPINES)\n`
      + `print(json.dumps([e.enemy_spine_id('Assets/Torappu/Arts/Enemies/Spines/enemy_1305_mhslim/2/enemy_1305_mhslim_2_SkeletonData.asset', W),`
      + ` e.enemy_spine_id('Assets/Torappu/Arts/Enemies/Spines/enemy_1305_mhslim/1/enemy_1305_mhslim_SkeletonData.asset', W),`
      + ` e.enemy_spine_id('Assets/Torappu/Arts/Enemies/Spines/enemy_1007_slime/enemy_1007_slime_SkeletonData.asset', W),`
      + ` e.enemy_spine_id('Assets/Torappu/Arts/Enemies/Spines/enemy_1305_mhslim/1/enemy_1305_mhslim_Material.mat', W),`
      + ` [e.wants_sub(o, 'spine/enemy') for o in ([], ['spine'], ['spine/enemy'], ['spine/enemy/enemy_1305_mhslim'], ['spine/token_x'], ['map'])]]))`);
    assert.deepEqual(out, ['enemy_1305_mhslim_2', 'enemy_1305_mhslim', null, null, [true, true, true, true, false, false]]);
  });

  test('normalize_atlas: the real page size and pma: true, like the fetched enemy atlases (the client loads it as is)', async () => {
    const { normalizeAtlas } = await import('../tools/assets/atlas.mjs');
    // the client's atlas text of 灼热源石虫 (leading blank line, size, no pma), shortened
    const raw = '\nenemy_1305_mhslim.png\nsize: 256,256\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nC_Body_1\n  rotate: false\n  xy: 2, 159\n  size: 55, 64\n  orig: 55, 64\n  offset: 0, 0\n  index: -1\n';
    const sized = py(`print(json.dumps(e.normalize_atlas(${JSON.stringify(raw)}, {'enemy_1305_mhslim.png': (256, 256)})))`);
    assert.equal(sized, normalizeAtlas(raw, { pageSize: () => ({ width: 256, height: 256 }), pma: true }).text, 'the same text as tools/assets/atlas.mjs');
    assert.match(sized, /repeat: none\npma: true\nC_Body_1\n {2}rotate: false\n {2}xy: 2, 159\n {2}size: 55, 64/, 'region fields untouched');
    const noSize = raw.replace('size: 256,256\n', '');
    const fixed = py(`print(json.dumps(e.normalize_atlas(${JSON.stringify(noSize)}, {'enemy_1305_mhslim.png': (512, 256)})))`);
    assert.match(fixed, /\nenemy_1305_mhslim\.png\nsize: 512,256\nformat: RGBA8888/);
    assert.equal(py(`print(json.dumps(e.normalize_atlas(${JSON.stringify(sized)}, {'enemy_1305_mhslim.png': (256, 256)})))`), sized, 'idempotent');
  });
});
