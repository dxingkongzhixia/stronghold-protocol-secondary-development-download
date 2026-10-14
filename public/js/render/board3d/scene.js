// render/board3d/scene.js — the official 卫戍协议 board as a real three.js scene (DESIGN §15), rendered on its own
// canvas UNDER the Pixi canvas (units, FX, highlights, HP bars stay in Pixi). One camera model drives both layers:
// render/projection.js `syncThreeCamera` makes the three.js PerspectiveCamera project exactly like the Pixi one.
//
//   const board = new BoardScene(THREE, pack, { canvas, quality })   (pack = load.js loadBoardPack)
//   board.setStage(stage)            geometry from the stage grid (layout.js) + devices + gates + terrain
//   board.setScenePack(id, pack)     the official scene of stage `id` (load.js loadScenePack): drawn instead of the
//                                    procedural tiles and background while that stage is set (null → procedural)
//   board.setArea(rects)             the built areas (layout.js AREAS / areaFor: normal field + pen, 联防, boss)
//   board.setFocus(rect)             the lit field (others fade, animated)
//   board.setBattleRect(rect|null)   crates / turrets inside a running battle are sim units: static ones hide
//   board.createDevice()             → handle { update(cam, { x, y, z, size, height, top, side, alpha, rot }), mesh: null, destroy() }
//                                      (render/units.js DeviceView boxes, drawn as the official crate mesh)
//   board.flashObjective(r, c)       leak flash of a blue objective box
//   board.render(cam, timeSec)       sync the camera, animate, draw
//   board.resize(w, h, dpr) · board.stats() · board.destroy()
//
// Draw calls: board (tiles + blocks + apron, merged, MT_autochess), the pen's glass hatches (glassMaterial),
// static crates (merged, same material),
// decals (MT_autochess_common), fence pipes, blowers (merged, unlit), gate boxes (additive + alpha, merged per
// material), cyan field edges, terrain overlays (≤ 4), background plane + its shadow catcher — ~12–16 in total.
// An official scene replaces the tiles, glass, decals, pipes and background (all but the device slabs, layout.js
// buckets.raised — GitHub #569) with one mesh per material and lightmap
// page of the parts the built areas show (load.js mergeSceneChunks), PLUS one more per bucket that carries standing
// props — the props of a bucket are split out of its terrain (load.js splitSceneProps) so each casts its own shadow on
// the ground instead of a degenerate self-shadow within one huge island. Devices, gates, edges and terrain stay.
// The key light's shadow map is rendered only when the geometry changes (autoUpdate off).

import { buildBoard, objToBoard, boxProjectUV, ROWS, COLS, DEVICE_H, AREAS } from './layout.js';
import { surfaceUV } from './atlas.js';
import {
  focusUniforms, makeTexture, boardMaterial, glassMaterial, decalMaterial, pipeMaterial, unlitMaterial, gateMaterial, glowMaterial,
  waterMaterial, mireMaterial, infectionMaterial, smogMaterial, dashTexture, environmentMap, sceneMaterial, sceneWaterMaterial,
} from './materials.js';
import { syncThreeCamera } from '../projection.js';
import { mergeSceneChunks, sceneMaterialKey, splitSceneProps } from './load.js';
import { sceneTheme } from './theme.js';

/** Lighting rig (tuned against the official screenshots: bright even tops, darker sides, soft shadows). */
export const LIGHTING = Object.freeze({
  key: { color: 0xfff1df, intensity: 2.6, dir: [-5.2, -3.4, 10] },
  hemi: { sky: 0xe4ecf4, ground: 0x4a5058, intensity: 0.6 },
  env: 1.0,
  emissive: 0.25,
  roughness: 0.78,
  shadow: { size: 2048, radius: 3, bias: -0.0004, normalBias: 0.025 },
  exposure: 1.5,
  // the clear colour is the fog colour: the far background fades into the void without a visible edge
  clear: 0x0c1114,
  fog: { color: 0x0c1114, near: 17, far: 36 },
  // S_Background_common (100 × 0.4316 = 43.16 tiles); `tiles` × `tiles` mirrored copies around it so no framing
  // (21:9, 4:3, portrait fit, camera flights) sees past its edge
  bg: { z: -8, size: 43.16, color: 0.713, dim: 0.8, tiles: 3 },
});

/** Additive gain of the gate boxes at the curve's mean (tuned against the official screenshots). */
export const GATE_GAIN = 0.6;

/** Gate pulse: the official clip's _TintColor.a curve (2 s loop, 0.134 → 0.229 → 0.134) scaled to our intensity. */
export function gatePulse(t, phase = 0) {
  const k = 0.5 - 0.5 * Math.cos(((t / 2 + phase) % 1) * Math.PI * 2);
  return 0.134 + (0.229 - 0.134) * k;
}

/**
 * Is a named part of an official scene (its ground rect [x0, y0, x1, y1]) shown with the built `areas`? The official
 * scene keeps each field as a sub-graphic it switches on (HIDDEN@n: the left / right normal field, the boss field);
 * a part is shown when its centre lies in one of the areas.
 */
export function sceneGroupVisible(rect, areas) {
  if (!Array.isArray(rect) || rect.length < 4) return true;
  const cx = (rect[0] + rect[2]) / 2, cy = (rect[1] + rect[3]) / 2;
  return (areas || []).some((a) => cx >= a.c0 - 0.5 && cx <= a.c1 + 0.5 && cy >= a.r0 - 0.5 && cy <= a.r1 + 0.5);
}

const areaKey = (list) => (list || []).map((a) => `${a.r0},${a.r1},${a.c0},${a.c1}`).sort().join(';');

const mergeInto = (list) => {
  // concatenate { position, normal, uv, color?, index } records
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.position.length / 3; ni += g.index.length; }
  const position = new Float32Array(nv * 3), normal = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), color = new Float32Array(nv * 3);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.position.length / 3;
    position.set(g.position, vo * 3);
    if (g.normal) normal.set(g.normal, vo * 3);
    if (g.uv) uv.set(g.uv, vo * 2);
    if (g.color) color.set(g.color, vo * 3); else color.fill(1, vo * 3, (vo + n) * 3);
    for (let i = 0; i < g.index.length; i++) index[io + i] = g.index[i] + vo;
    vo += n; io += g.index.length;
  }
  return { position, normal, uv, color, index };
};

/** Apply a 4×4-free transform (scale s, rotate about z by `rot` quarter turns, translate) to board-space data. */
function placeMesh(src, { x = 0, y = 0, z = 0, s = 1, sz = s, rot = 0 }) {
  const p = src.position, n = src.normal;
  const pos = new Float32Array(p.length), nrm = n ? new Float32Array(n.length) : null;
  const a = rot * Math.PI / 2, ca = Math.round(Math.cos(a)), sa = Math.round(Math.sin(a));
  for (let i = 0; i < p.length; i += 3) {
    const px = p[i] * s, py = p[i + 1] * s;
    pos[i] = x + px * ca - py * sa; pos[i + 1] = y + px * sa + py * ca; pos[i + 2] = z + p[i + 2] * sz;
    if (nrm) { nrm[i] = n[i] * ca - n[i + 1] * sa; nrm[i + 1] = n[i] * sa + n[i + 1] * ca; nrm[i + 2] = n[i + 2]; }
  }
  return { ...src, position: pos, normal: nrm };
}

/**
 * Grow a textured plane `k`× about (cx, cy) keeping its texel density: positions scale by k, UVs scale by k about
 * the texture centre (0..1 → (1−k)/2..(1+k)/2), so a MirroredRepeat texture tiles seamlessly around the original.
 */
export function extendPlane(src, cx, cy, k = 1) {
  if (!(k > 1) || !src || !src.position) return src;
  const p = src.position, pos = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { pos[i] = cx + (p[i] - cx) * k; pos[i + 1] = cy + (p[i + 1] - cy) * k; pos[i + 2] = p[i + 2]; }
  let uv = src.uv;
  if (uv) { uv = new Float32Array(src.uv.length); for (let i = 0; i < uv.length; i++) uv[i] = 0.5 + (src.uv[i] - 0.5) * k; }
  return { ...src, position: pos, uv };
}

/** Quarter turns (counter-clockwise about +z) that point the wind device's outlet (−x in the mesh) along `dir`. */
export const DIR_TURNS = Object.freeze({ LEFT: 0, DOWN: 1, RIGHT: 2, UP: 3 });

export class BoardScene {
  /**
   * @param {any} THREE three.js module
   * @param {any} pack load.js loadBoardPack result
   * @param {{ canvas?: HTMLCanvasElement, quality?: string, antialias?: boolean, renderer?: any }} [opts]
   */
  constructor(THREE, pack, opts = {}) {
    this.THREE = THREE;
    this.pack = pack;
    this.opts = opts;
    this.destroyed = false;
    this.lost = false;
    // split the official scene's standing props out of the merged terrain (PROP_SPLIT); off → one mesh per material
    this.splitProps = opts.splitProps !== false;
    this.propSplit = opts.propSplit || null;   // splitSceneProps tuning override (PROP_SPLIT by default)
    const T = THREE;
    this.renderer = opts.renderer || new T.WebGLRenderer({
      canvas: opts.canvas, antialias: opts.antialias ?? true, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });
    const R = this.renderer;
    R.outputColorSpace = T.SRGBColorSpace;
    // The official board is lit by Unity's HDR pipeline and shown through a filmic tonemapper (the client's post FX):
    // a plain NoToneMapping renders the dark baked albedo (TX_AutochessSand_A's tiles are ~(69,56,35)) as a mud-brown
    // lattice, where the official's lifted-shadow grade shows the light sandstone ~(140,125,100). ACES + exposure
    // matches the sampled official ground without washing the highlights.
    R.toneMapping = T.ACESFilmicToneMapping;
    R.toneMappingExposure = LIGHTING.exposure;
    R.setClearColor(LIGHTING.clear, 1);
    R.shadowMap.enabled = opts.shadows !== false;
    R.shadowMap.type = T.PCFShadowMap;
    R.shadowMap.autoUpdate = false;
    this.canvas = R.domElement;
    this._onLost = (e) => { e.preventDefault?.(); this.lost = true; };
    this.canvas.addEventListener?.('webglcontextlost', this._onLost);

    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(LIGHTING.fog.color, LIGHTING.fog.near, LIGHTING.fog.far);
    this.camera = new T.PerspectiveCamera(40, 16 / 9, 0.5, 120);
    this.focus = focusUniforms(T);
    this.envRT = null;
    if (opts.environment !== false) {
      try {
        this.envMap = environmentMap(T, R);
        this.envRT = this.envMap?.__rt || null;
        if (this.envMap) {
          this.scene.environment = this.envMap;
          this.scene.environmentIntensity = LIGHTING.env;
          this.scene.environmentRotation?.set?.(-Math.PI / 2, 0, 0);
        }
      } catch { this.envMap = null; }
    }
    this.focusTarget = null;
    const aniso = Math.min(8, R.capabilities?.getMaxAnisotropy?.() || 1);
    const img = pack?.images || {};
    this.tex = {
      D: makeTexture(T, img.D, { aniso }), N: makeTexture(T, img.N, { srgb: false, aniso }), R: makeTexture(T, img.R, { srgb: false, aniso }),
      E: makeTexture(T, img.E, { aniso }), common: makeTexture(T, img.common, { aniso }), commonE: makeTexture(T, img.commonE, { aniso }),
      BG: makeTexture(T, img.BG, { aniso }), wind: makeTexture(T, img.wind, { aniso }), gate: makeTexture(T, img.gate, {}),
      waterN: makeTexture(T, img.waterN, { srgb: false, repeat: true }), caustics: makeTexture(T, img.caustics, { srgb: false, repeat: true }),
      noise: makeTexture(T, img.noise, { srgb: false, repeat: true }),
    };
    if (this.tex.BG) { this.tex.BG.wrapS = T.MirroredRepeatWrapping; this.tex.BG.wrapT = T.MirroredRepeatWrapping; }
    this.mat = {
      board: boardMaterial(T, this.tex, this.focus, { emissive: LIGHTING.emissive, roughness: LIGHTING.roughness }),
      glass: glassMaterial(T, this.tex, this.focus, { emissive: LIGHTING.emissive, roughness: LIGHTING.roughness }),
      decal: this.tex.common ? decalMaterial(T, this.tex, this.focus) : null,
      pipe: pipeMaterial(T, this.focus),
      bg: this.tex.BG ? unlitMaterial(T, this.tex.BG, new T.Color().setScalar(LIGHTING.bg.color * LIGHTING.bg.dim)) : new T.MeshBasicMaterial({ color: 0x1a1d1f }),
      wind: this.tex.wind ? unlitMaterial(T, this.tex.wind) : null,
      gateStartAdd: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: true }) : null,
      gateEndAdd: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: true }) : null,
      gateEndAb: this.tex.gate ? gateMaterial(T, this.tex.gate, { additive: false }) : null,
      edge: glowMaterial(T, dashTexture(T)),
      water: waterMaterial(T, this.tex, this.focus),
      mire: mireMaterial(T, this.tex, this.focus),
      infection: infectionMaterial(T, this.tex, this.focus),
      smog: smogMaterial(T, this.tex, this.focus),
      shadowCatcher: new T.ShadowMaterial({ opacity: 0.32, color: 0x000000 }),
    };
    this.mat.crateFade = null;
    // lights
    const hemi = new T.HemisphereLight(LIGHTING.hemi.sky, LIGHTING.hemi.ground, LIGHTING.hemi.intensity);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const key = new T.DirectionalLight(LIGHTING.key.color, LIGHTING.key.intensity);
    key.castShadow = R.shadowMap.enabled;
    key.shadow.mapSize.set(LIGHTING.shadow.size, LIGHTING.shadow.size);
    key.shadow.radius = LIGHTING.shadow.radius;
    key.shadow.bias = LIGHTING.shadow.bias;
    key.shadow.normalBias = LIGHTING.shadow.normalBias;
    this.scene.add(key, key.target);
    this.key = key;
    this.hemi = hemi;
    // static board geometry (rebuilt by setStage / setArea) and the battle device meshes (owned by render/units.js
    // DeviceView handles: they must survive a rebuild — a camera flight between areas rebuilds mid-battle)
    this.root = new T.Group();
    this.dynamic = new T.Group();
    this.scene.add(this.root, this.dynamic);
    this.stageKey = null;
    this.stage = null;
    this.scenePacks = new Map();   // stage id → official scene pack (setScenePack)
    this.sceneRes = new Map();     // pack key → { tex, lm, mats } GPU resources (kept across rebuilds)
    this.official = null;
    this.sceneWater = [];
    this.area = AREAS.normal;
    this.areaKey = areaKey(AREAS.normal);
    this.battleRect = null;
    this.devices = new Set();
    this.flashes = [];
    this.time = 0;
    this.size = { w: 1, h: 1, dpr: 1 };
    this.camVersion = -1;
    this.camRef = null;
    this.frames = 0;
    this.lastMs = 0;
    this._crateGeom = null;
  }

  // ---- geometry ----------------------------------------------------------------------------------------------

  _geometry(data) {
    const T = this.THREE;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(data.position, 3));
    if (data.normal) g.setAttribute('normal', new T.BufferAttribute(data.normal, 3));
    if (data.uv) g.setAttribute('uv', new T.BufferAttribute(data.uv, 2));
    if (data.color) g.setAttribute('color', new T.BufferAttribute(data.color, 3));
    g.setIndex(new T.BufferAttribute(data.index, 1));
    if (!data.normal) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  _mesh(data, material, { cast = true, receive = true, order = 0 } = {}) {
    if (!data || !material || !(data.index?.length > 0)) return null;
    const m = new this.THREE.Mesh(this._geometry(data), material);
    m.castShadow = cast; m.receiveShadow = receive; m.renderOrder = order;
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.root.add(m);
    return m;
  }

  _clear() {
    for (const ch of [...this.root.children]) {
      this.root.remove(ch);
      ch.traverse?.((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.meshes = {};
  }

  /** The crate mesh in board space (s_common_box_01 when loaded, else a unit chamfer-free box), UVs on D. */
  crateGeometry() {
    if (this._crateGeom) return this._crateGeom;
    const uv = this.pack?.uv || {};
    const obj = this.pack?.meshes?.crate;
    let base;
    if (obj && obj.normal) base = objToBoard(obj, 0.01);
    else base = boxData(0.9, 0.675);
    this._crateGeom = boxProjectUV(base, uv.crateTop || { src: 'D', rect: [1222, 1938, 134, 108] }, uv.crateSide || { src: 'D', rect: [1087, 1938, 134, 108] });
    this._crateGeom.color = null;
    return this._crateGeom;
  }

  /** Built areas (inclusive tile rects): rebuilds when they change. */
  setArea(rects) {
    const list = Array.isArray(rects) && rects.length ? rects : AREAS.normal;
    const k = areaKey(list);
    if (k === this.areaKey) return false;
    this.area = list;
    this.areaKey = k;
    if (this.stage) { this.stageKey = null; this.setStage(this.stage); }
    return true;
  }

  /** Rebuild everything for a stage (no-op when the same stage object/grid is set again). */
  setStage(stage) {
    if (this.destroyed) return;
    const official = stage ? this.scenePacks.get(stage.id) || null : null;
    const key = stage ? `${stage.id || ''}|${official ? official.key : ''}|${(stage.rows || []).join('/')}|${JSON.stringify((stage.devices || []).map((d) => [d.key, d.pos, d.active, d.dir]))}` : '';
    if (key === this.stageKey) return;
    this.stageKey = key;
    this.stage = stage || null;
    this._clear();
    if (!stage) return;
    const board = buildBoard(stage, { uv: this.pack?.uv || null, area: this.area });
    this.board = board;
    const M = this.meshes = {};
    this.official = official && this._buildScene(official) ? official : null;
    if (!this.official) {
      this.theme = null;
      this.renderer.toneMappingExposure = LIGHTING.exposure;   // the procedural board's grade
      M.board = this._mesh(board.buckets.board, this.mat.board);
      M.glass = this._mesh(board.buckets.glass, this.mat.glass);
      M.decal = this._mesh(board.buckets.decal, this.mat.decal, { cast: false });
      M.pipe = this._mesh(board.buckets.pipe, this.mat.pipe);
    } else {
      // the scene has no device slabs: the 射击台 / 特制水上平台 / 封印的地面 slabs stay drawn on it (units stand
      // on them at tiles.js heightAt; GitHub #569), with the procedural board's material. A theme colouring them
      // (the `slab` key that existed briefly) painted the official 高台 flat sand — act2autochess_m02's look is the
      // reference the owner pointed at instead.
      M.raised = this._mesh(board.buckets.raised, this.mat.board);
      M.raisedDecal = this._mesh(board.buckets.raisedDecal, this.mat.decal, { cast: false });
    }
    this._buildDevices(board);
    this._buildGates(board);
    // The remake's cyan field-edge strips (glowMaterial, additive) saturate to pure white over a bright official scene,
    // so each read as a white line along the field's edge (the owner's 白线); the official battlefield delimits its own
    // field anyway. Procedural boards still get them.
    if (!this.official) this._buildEdges(board);
    this._buildTerrain(board);
    if (!this.official) this._buildBackground(board);
    this._fitShadow(board);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Use (or drop, with null) the official scene of stage `id`; rebuilds when that stage is the current one. */
  setScenePack(id, pack) {
    if (this.destroyed || typeof id !== 'string' || !id) return false;
    const prev = this.scenePacks.get(id) || null;
    if (prev === (pack || null)) return false;
    if (prev) this._disposeScene(prev);
    if (pack) this.scenePacks.set(id, pack); else this.scenePacks.delete(id);
    if (this.stage && this.stage.id === id) { this.stageKey = null; this.setStage(this.stage); }
    return true;
  }

  /** Textures and materials of a scene pack (created once per pack, kept across rebuilds). */
  _sceneResources(pack) {
    let res = this.sceneRes.get(pack.key);
    if (res) return res;
    const T = this.THREE;
    const aniso = Math.min(8, this.renderer.capabilities?.getMaxAnisotropy?.() || 1);
    // a material's normal / roughness maps are linear data maps; the albedo and emission maps are sRGB. The scene's
    // tiling/offset per slot is identity, so every map samples on uv0.
    const linear = new Set();
    for (const m of Object.values(pack.doc?.materials || {})) {
      if (!m || typeof m !== 'object') continue;
      if (typeof m.normalMap === 'string') linear.add(m.normalMap);
      if (typeof m.metalGlossMap === 'string') linear.add(m.metalGlossMap);
    }
    const tex = {}, lm = [];
    for (const [name, img] of Object.entries(pack.images?.tex || {})) tex[name] = makeTexture(T, img, { aniso, repeat: true, srgb: !linear.has(name) });
    for (const img of pack.images?.lm || []) lm.push(img ? makeTexture(T, img, { srgb: false }) : null);
    res = { tex, lm, mats: new Map() };
    this.sceneRes.set(pack.key, res);
    return res;
  }

  _disposeScene(pack) {
    const res = this.sceneRes.get(pack.key);
    if (!res) return;
    for (const m of res.mats.values()) m.dispose();
    res.apronMat?.dispose?.();
    res.platformMat?.dispose?.();
    for (const t of [...Object.values(res.tex), ...res.lm]) t?.dispose?.();
    this.sceneRes.delete(pack.key);
  }

  /**
   * The official scene's meshes: the base plus the fields of the built areas, one mesh per material and lightmap
   * page (`mergeSceneChunks`). A switched-off HIDDEN part is left out before the merge.
   */
  _buildScene(pack) {
    const T = this.THREE;
    const res = this._sceneResources(pack);
    const infos = pack.doc?.materials || {};
    // the battlefield theme's grade (theme.js): its HDR exposure + the ambient/tint sceneMaterial applies
    const theme = this.theme = sceneTheme(pack.stage, pack.doc);
    this.renderer.toneMappingExposure = theme.exposure;
    this.sceneWater = [];
    const buckets = new Map();
    for (const c of pack.chunks || []) {
      if (c.group && !sceneGroupVisible(pack.groups?.[c.group], this.area)) continue;
      const info = infos[c.material] || null;
      const mk = sceneMaterialKey(c, info);
      let bucket = buckets.get(mk);
      if (!bucket) { bucket = { info, chunks: [] }; buckets.set(mk, bucket); }
      bucket.chunks.push(c);
    }
    let n = 0;
    for (const [mk, bucket] of buckets) {
      const c = mergeSceneChunks(bucket.chunks);
      const info = bucket.info;
      const water = info?.kind === 'water';
      let mat = res.mats.get(mk);
      if (!mat) {
        mat = water
          ? sceneWaterMaterial(T, this.tex, this.focus, info, theme)
          : sceneMaterial(T, {
            map: res.tex[info?.map] || null, lightMap: c.lightmap >= 0 ? (res.lm[c.lightmap] || null) : null,
            normalMap: res.tex[info?.normalMap] || null, roughnessMap: res.tex[info?.metalGlossMap] || null,
            emissionMap: res.tex[info?.emissionMap] || null, info, theme,
            light: pack.doc?.light || null, lightRange: pack.doc?.lightRange,
          }, this.focus);
        res.mats.set(mk, mat);
      }
      if (water) this.sceneWater.push(mat);
      const order = water ? 1 : mat.userData.blend === 'blend' ? 2 : mat.userData.blend === 'cutout' ? -3 : -4;
      // Terrain stays merged (the draw-call win); the standing props of a bucket (rocks / crates / cacti / tufts) split
      // into their own mesh, so a chunk whose ground and props share a material no longer fuses them into one island.
      // The terrain does NOT cast the realtime shadow: its shadow is already in the lightmap's baked shadowmask, and
      // re-casting it shadow-acnes the whole field and cancels the sun. Only the props cast — that is exactly the crisp
      // prop-on-ground shadow the bake is too low-res to hold. Everything still receives.
      const parts = (water || this.splitProps === false) ? { ground: c, props: null } : splitSceneProps(c, this.propSplit || undefined);
      for (const [part, cast] of [[parts.ground, false], [parts.props, true]]) {
        if (!part || !part.index || part.index.length === 0) continue;
        const mesh = this._sceneMesh(part, mat, order, water ? false : cast);
        this.root.add(mesh);
        this.meshes[`scene${n++}`] = mesh;
      }
    }
    this._buildApron(theme, res, pack);
    this._buildPlatforms(theme, res, pack);
    return n > 0;
  }

  /**
   * One scene mesh of a bucket (its merged terrain or its split-out props). Position / uv / aLm / aColor / normal are
   * the part's compact buffers. `cast` — the realtime shadow caster flag: the props cast, the terrain does not (its
   * shadow is baked in the lightmap's shadowmask; re-casting it shadow-acnes the field). Everything receives.
   */
  _sceneMesh(part, mat, order, cast) {
    const T = this.THREE;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(part.position, 3));
    g.setAttribute('normal', new T.BufferAttribute(part.normal, 4, true));
    g.setAttribute('uv', new T.BufferAttribute(part.uv, 2));
    g.setAttribute('aLm', new T.BufferAttribute(part.uv1, 2));
    g.setAttribute('aColor', new T.BufferAttribute(part.color, 4, true));
    g.setIndex(new T.BufferAttribute(part.index, 1));
    if (mat.userData.normalMap) { try { g.computeTangents(); } catch { /* a degenerate chunk keeps its vertex normals */ } }
    g.computeBoundingSphere();
    const mesh = new T.Mesh(g, mat);
    mesh.castShadow = !!cast; mesh.receiveShadow = true;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  }

  /**
   * The battlefield's sand apron: a soft, flat band of the scene's own sand texture laid around the built area
   * (`this.area`), so the playable field blends into the surrounding sand instead of ending in a hard rectangular
   * edge. The official desert board (PRTS 战场#01) lays the field, the dunes and the rocks into ONE bright sand
   * surface — it is NOT a raised perimeter platform — so the earlier ring + lane `platforms` geometry (theme.js) was a
   * wrong read of the reference and is gone. Every apron ring lies outside the built area's bounding box, so no
   * vertex is on a playable tile; the band is flat, at a fixed low z, and its alpha fades from `alpha` at the field
   * edge to 0 outward, so it reads as more sand grain around the field rather than a slab. Visible only in the
   * focus-lit scene path (the procedural board has none).
   * @param {{ apron?: { texture?: string, tint?: number[], uv?: number, width?: number, rings?: number, alpha?: number, z?: number } }} theme
   * @param {{ tex: object, apronMat?: any }} res the scene textures / material cache
   * @param {{ doc?: object }} pack
   */
  _buildApron(theme, res, pack) {
    const spec = theme?.apron;
    if (!spec || !Array.isArray(this.area) || !this.area.length) return;
    const T = this.THREE;
    const map = res.tex[spec.texture] || res.tex[this._apronFallbackTexture(pack)] || null;
    if (!map) return;
    const area = this.area.reduce((a, r) => (a
      ? { r0: Math.min(a.r0, r.r0), r1: Math.max(a.r1, r.r1), c0: Math.min(a.c0, r.c0), c1: Math.max(a.c1, r.c1) }
      : { ...r }), null);
    const width = Number.isFinite(spec.width) ? spec.width : 2.4;
    const rings = Math.max(1, Math.round(Number.isFinite(spec.rings) ? spec.rings : 4));
    const s = Number.isFinite(spec.uv) ? spec.uv : 0.23;
    const tint = Array.isArray(spec.tint) ? spec.tint : [1, 1, 1];
    const z = Number.isFinite(spec.z) ? spec.z : 0.014;
    // `gap` (tiles) keeps the band clear of the field edge so it can never tint the last playable row; the fade starts
    // at the gap, entirely outside the play area
    const gap = Number.isFinite(spec.gap) && spec.gap > 0 ? spec.gap : 0;
    const a0 = Number.isFinite(spec.alpha) ? spec.alpha : 0.92;
    const pos = [], uv = [], nrm = [], col = [], idx = [];
    // rings[j] = the rectangle `j` steps out from the built area: d_j tiles out, flat at z, alpha fading to 0
    const expand = (d) => ({ r0: area.r0 - 0.5 - gap - d, r1: area.r1 + 0.5 + gap + d, c0: area.c0 - 0.5 - gap - d, c1: area.c1 + 0.5 + gap + d });
    const dOf = (j) => (j / rings) * width;
    const aOf = (j) => a0 * Math.max(0, 1 - j / rings);
    const aoOf = (j) => 1 - 0.10 * (j / rings);
    const quad = (a, b, c, d, aa, ab, ac, ad) => {
      const o = pos.length / 3;
      for (const p of [a, b, c, d]) { pos.push(p[0], p[1], z); nrm.push(0, 0, 1); }
      uv.push(a[0] * s, a[1] * s, b[0] * s, b[1] * s, c[0] * s, c[1] * s, d[0] * s, d[1] * s);
      for (const p of [aa, ab, ac, ad]) col.push(p[0], p[0], p[0], p[1]);   // rgb = AO, a = the blend
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    for (let j = 0; j < rings; j++) {
      const i0 = expand(dOf(j)), i1 = expand(dOf(j + 1)), a1 = aOf(j), a2 = aOf(j + 1);
      const ao1 = aoOf(j), ao2 = aoOf(j + 1), k1 = [ao1, a1], k2 = [ao2, a2];
      // the four strips of the ring, each wound CCW (facing +z); every ring lies outside the built area's
      // bounding box, so no vertex is on a playable tile
      quad([i1.c0, i1.r0], [i1.c1, i1.r0], [i0.c1, i0.r0], [i0.c0, i0.r0], k2, k2, k1, k1);   // top (outer first)
      quad([i0.c0, i0.r1], [i0.c1, i0.r1], [i1.c1, i1.r1], [i1.c0, i1.r1], k1, k1, k2, k2);   // bottom
      quad([i1.c0, i0.r0], [i0.c0, i0.r0], [i0.c0, i0.r1], [i1.c0, i0.r1], k2, k1, k1, k2);   // left
      quad([i0.c1, i0.r0], [i1.c1, i0.r0], [i1.c1, i0.r1], [i0.c1, i0.r1], k1, k2, k2, k1);   // right
    }
    if (!pos.length) return;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(col), 4));
    g.setIndex(new T.BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    if (!res.apronMat) {
      res.apronMat = new T.MeshBasicMaterial({
        map, vertexColors: true, transparent: true, depthWrite: false,
        color: new T.Color(tint[0], tint[1], tint[2]),
      });
    }
    const mesh = new T.Mesh(g, res.apronMat);
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 0;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.root.add(mesh);
    this.meshes.apron = mesh;
  }

  /** The theme apron texture fallback: the scene's first lit material's ground albedo. */
  _apronFallbackTexture(pack) {
    for (const m of Object.values(pack?.doc?.materials || {})) if (m && typeof m.map === 'string') return m.map;
    return '';
  }

  /**
   * The battlefield's 高台: the official's raised SANDSTONE BLOCKS (`theme.platforms.blocks`), built as flat-topped
   * boxes with lit / shaded sides, sharing the field's albedo and the scene's own key light (`sceneMaterial`) so they
   * read as the same sandstone as the ground. The rects are the localised blocks the battlefield's official PRTS map
   * shows — the earlier ring / lane `platforms` (a bright rectangular frame around the whole field, a wrong read) is
   * gone. Every rect lies OUTSIDE the deploy field, so a block never covers a deploy highlight / the direction wheel.
   * VISUAL only: the sim's tiles / heights / deployTiles are untouched. Visible only in the focus-lit scene path.
   * @param {{ platforms?: { texture?: string, tint?: number[], uv?: number, blocks?: Array<{r0:number,r1:number,c0:number,c1:number,h:number,base?:number}> } }} theme
   * @param {{ tex: object, mats: Map, platformMat?: any }} res
   * @param {{ doc?: object }} pack
   */
  _buildPlatforms(theme, res, pack) {
    const spec = theme?.platforms;
    const blocks = Array.isArray(spec?.blocks) ? spec.blocks : null;
    if (!spec || !blocks || !blocks.length) return;
    const T = this.THREE;
    const map = res.tex[spec.texture] || res.tex[this._apronFallbackTexture(pack)] || null;
    if (!map) return;
    const s = Number.isFinite(spec.uv) ? spec.uv : 0.23;
    const pos = [], uv = [], nrm = [], lm = [], idx = [];
    const push = (x, y, z, nx, ny, nz) => {
      pos.push(x, y, z); nrm.push(nx, ny, nz);
      // world-space UV per face so the sandstone grain keeps a constant density across top and sides
      if (ny !== 0) uv.push(x * s, z * s); else if (nx !== 0) uv.push(y * s, z * s); else uv.push(x * s, y * s);
      lm.push(0, 0);
    };
    const quad = (a, b, c, d, n) => {
      const o = pos.length / 3;
      for (const p of [a, b, c, d]) push(p[0], p[1], p[2], n[0], n[1], n[2]);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    for (const b of blocks) {
      if (!b) continue;
      const r0 = Math.min(b.r0, b.r1), r1 = Math.max(b.r0, b.r1), c0 = Math.min(b.c0, b.c1), c1 = Math.max(b.c0, b.c1);
      const top = Number.isFinite(b.h) ? b.h : 0.42;
      const base = Number.isFinite(b.base) ? b.base : 0;
      if (!(top > base)) continue;
      const x0 = c0 - 0.5, x1 = c1 + 0.5, y0 = r0 - 0.5, y1 = r1 + 0.5;
      quad([x0, y0, top], [x1, y0, top], [x1, y1, top], [x0, y1, top], [0, 0, 1]);             // top
      quad([x0, y0, base], [x0, y0, top], [x1, y0, top], [x1, y0, base], [0, -1, 0]);          // front (-y)
      quad([x1, y0, base], [x1, y0, top], [x1, y1, top], [x1, y1, base], [1, 0, 0]);           // right (+x)
      quad([x1, y1, base], [x1, y1, top], [x0, y1, top], [x0, y1, base], [0, 1, 0]);           // back (+y)
      quad([x0, y1, base], [x0, y1, top], [x0, y0, top], [x0, y0, base], [-1, 0, 0]);          // left (-x)
    }
    if (!pos.length) return;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('aLm', new T.BufferAttribute(new Float32Array(lm), 2));
    g.setIndex(new T.BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    if (!res.platformMat) {
      const tint = Array.isArray(spec.tint) ? spec.tint : [1, 1, 1];
      res.platformMat = new T.MeshStandardMaterial({ map, color: new T.Color(tint[0], tint[1], tint[2]), roughness: 0.92, metalness: 0 });
    }
    const mesh = new T.Mesh(g, res.platformMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.renderOrder = -3;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.root.add(mesh);
    this.meshes.platforms = mesh;
    this.renderer.shadowMap.needsUpdate = true;
  }



  _buildDevices(board) {
    const crates = [], blowers = [];
    this.staticCrates = [];
    const wind = this.pack?.meshes?.blower ? objToBoard(this.pack.meshes.blower, 1) : null;
    for (const d of board.devices) {
      if (d.kind === 'crate') this.staticCrates.push(d);
      else if (d.kind === 'blower' && wind && this.mat.wind) blowers.push(placeMesh(wind, { x: d.c, y: d.r, z: d.z0 + 0.078, rot: DIR_TURNS[d.dir] ?? 0 }));
      else if (d.kind === 'blower' || d.kind === 'turret') crates.push(placeMesh(boxWithTop(this.pack?.uv, d.kind), { x: d.c, y: d.r, z: d.z0 }));
      else if (d.kind === 'mound') crates.push(placeMesh(this.crateGeometry(), { x: d.c, y: d.r, z: d.z0, s: 0.95, sz: 0.55 }));
      else if (d.kind === 'bush') crates.push(placeMesh(bushData(), { x: d.c, y: d.r, z: d.z0 }));
    }
    if (blowers.length) this.meshes.blowers = this._mesh(mergeInto(blowers), this.mat.wind, { receive: false });
    if (crates.length) this.meshes.props = this._mesh(mergeInto(crates), this.mat.board);
    this._rebuildCrates();
  }

  _rebuildCrates() {
    if (this.meshes.crates) { this.root.remove(this.meshes.crates); this.meshes.crates.geometry.dispose(); this.meshes.crates = null; }
    const R = this.battleRect;
    const inside = (d) => !!R && d.r >= R.r0 && d.r <= R.r1 && d.c >= R.c0 && d.c <= R.c1;
    const list = (this.staticCrates || []).filter((d) => !inside(d)).map((d) => placeMesh(this.crateGeometry(), { x: d.c, y: d.r, z: d.z0 }));
    if (list.length) this.meshes.crates = this._mesh(mergeInto(list), this.mat.board);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Battle rect (null in prep): static crates inside it are hidden (the sim spawns them as device units). */
  setBattleRect(rect) {
    const next = rect ? { r0: rect.r0, r1: rect.r1, c0: rect.c0, c1: rect.c1 } : null;
    if (JSON.stringify(next) === JSON.stringify(this.battleRect)) return;
    this.battleRect = next;
    if (this.board) this._rebuildCrates();
  }

  _buildGates(board) {
    const G = this.pack?.meshes?.gate || {};
    if (!this.tex.gate) return;
    const place = (slot) => {
      const rec = G[slot];
      if (!rec) return null;
      return objToBoard(rec.mesh, 0.01);
    };
    const parts = { startDown: place('startDown'), startUp: place('startUp'), startBack: place('startBack'), endDown: place('endDown'), endUp: place('endUp') };
    const startAdd = [], endAdd = [], endAb = [];
    for (const g of board.gates) {
      // the tile effect's prefab rotation (0, .707, −.707, 0) maps the mesh to (x', −z', y') of the exported OBJ:
      // objToBoard's frame turned half a turn — the warning glyph on the top face points north (the official look)
      const at = { x: g.c, y: g.r, z: g.z + 0.5 + 0.003, rot: 2 };
      if (g.kind === 'start') for (const k of ['startDown', 'startUp', 'startBack']) { if (parts[k]) startAdd.push(placeMesh(parts[k], at)); }
      else {
        if (parts.endDown) endAdd.push(placeMesh(parts.endDown, at));
        if (parts.endUp) endAb.push(placeMesh(parts.endUp, at));
      }
    }
    const opt = { cast: false, receive: false, order: 5 };
    if (startAdd.length) this.meshes.gateStart = this._mesh(mergeInto(startAdd), this.mat.gateStartAdd, opt);
    if (endAdd.length) this.meshes.gateEndAdd = this._mesh(mergeInto(endAdd), this.mat.gateEndAdd, opt);
    if (endAb.length) this.meshes.gateEndAb = this._mesh(mergeInto(endAb), this.mat.gateEndAb, { ...opt, order: 4 });
  }

  _buildEdges(board) {
    const pos = [], uv = [], idx = [];
    const w = 0.085, e = 0.018;
    for (const s of board.edges) {
      const x0 = s.c - 0.5, x1 = s.c + 0.5, y0 = s.r - 0.5, y1 = s.r + 0.5, z = s.z + 0.006;
      let q;
      switch (s.dir) {
        case 'S': q = [[x0, y0 + e, z], [x1, y0 + e, z], [x1, y0 + e + w, z], [x0, y0 + e + w, z]]; break;
        case 'N': q = [[x1, y1 - e, z], [x0, y1 - e, z], [x0, y1 - e - w, z], [x1, y1 - e - w, z]]; break;
        case 'E': q = [[x1 - e, y0, z], [x1 - e, y1, z], [x1 - e - w, y1, z], [x1 - e - w, y0, z]]; break;
        default: q = [[x0 + e, y1, z], [x0 + e, y0, z], [x0 + e + w, y0, z], [x0 + e + w, y1, z]]; break;
      }
      const b = pos.length / 3;
      for (const p of q) pos.push(...p);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      // winding: all strips face up
      const n = [(q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0])];
      if (n[0] >= 0) idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    if (!pos.length) return;
    const nrm = new Float32Array(pos.length); for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1;
    this.meshes.edges = this._mesh({ position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) }, this.mat.edge, { cast: false, receive: false, order: 3 });
  }

  _buildTerrain(board) {
    const quads = (tiles, z, inset = 0) => {
      const pos = [], uv = [], idx = [];
      for (const [r, c] of tiles) {
        const a = 0.5 - inset, b = pos.length / 3;
        pos.push(c - a, r - a, z, c + a, r - a, z, c + a, r + a, z, c - a, r + a, z);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const nrm = new Float32Array(pos.length); for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1;
      return { position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) };
    };
    const T = board.terrain;
    const opt = { cast: false, receive: false, order: 2 };
    if (T.water.length) this.meshes.water = this._mesh(quads(T.water, -0.035), this.mat.water, opt);
    if (T.mire.length) this.meshes.mire = this._mesh(quads(T.mire, 0.006, 0.02), this.mat.mire, opt);
    if (T.infection.length) this.meshes.infection = this._mesh(quads(T.infection, 0.007, 0.02), this.mat.infection, opt);
    if (T.smog.length) {
      // two crossed haze cards per grille tile, standing up
      const pos = [], uv = [], idx = [];
      for (const [r, c] of T.smog) {
        for (const [dx, dy] of [[1, 0], [0.7, 0.7]]) {
          const b = pos.length / 3, h = 0.95, w = 0.55;
          pos.push(c - dx * w, r - dy * w, 0.02, c + dx * w, r + dy * w, 0.02, c + dx * w, r + dy * w, h, c - dx * w, r - dy * w, h);
          uv.push(0, 0, 1, 0, 1, 1, 0, 1);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
      const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = -1;
      this.meshes.smog = this._mesh({ position: new Float32Array(pos), normal: nrm, uv: new Float32Array(uv), color: null, index: new Uint16Array(idx) }, this.mat.smog, { ...opt, order: 6 });
    }
  }

  _buildBackground() {
    const T = this.THREE;
    const B = LIGHTING.bg;
    const cx = (COLS - 1) / 2, cy = (ROWS - 1) / 2;
    let plane = null;
    const obj = this.pack?.meshes?.bgPlane;
    if (obj) plane = objToBoard(obj, B.size / 100);
    const data = plane || { position: new Float32Array([-B.size / 2, -B.size / 2, 0, B.size / 2, -B.size / 2, 0, B.size / 2, B.size / 2, 0, -B.size / 2, B.size / 2, 0]), normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), index: new Uint16Array([0, 1, 2, 0, 2, 3]) };
    const placed = extendPlane(placeMesh(data, { x: cx, y: cy, z: B.z }), cx, cy, B.tiles);
    // the plane may face either way after the axis swap: make it face up
    if (placed.normal && placed.normal[2] < 0) {
      for (let i = 0; i < placed.normal.length; i++) placed.normal[i] = -placed.normal[i];
      const ix = placed.index;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    this.meshes.bg = this._mesh({ ...placed, color: null }, this.mat.bg, { cast: false, receive: false, order: -2 });
    // the key light's shadow of the island on the ground far below (S_Background_shadow's role)
    const s = B.size;
    const q = { position: new Float32Array([cx - s / 2, cy - s / 2, B.z + 0.02, cx + s / 2, cy - s / 2, B.z + 0.02, cx + s / 2, cy + s / 2, B.z + 0.02, cx - s / 2, cy + s / 2, B.z + 0.02]), normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), color: null, index: new Uint16Array([0, 1, 2, 0, 2, 3]) };
    this.meshes.bgShadow = this._mesh(q, this.mat.shadowCatcher, { cast: false, receive: true, order: -1 });
    void T;
  }

  _fitShadow(board) {
    const k = this.key;
    const b = board.bounds;
    // An empty stage (no tile classified `drawn`) leaves bounds at ±Infinity; that would make the shadow box NaN and
    // poison the whole light-space transform. Fall back to a fixed box centred on the origin.
    const finite = Number.isFinite(b.x0) && Number.isFinite(b.x1) && Number.isFinite(b.y0) && Number.isFinite(b.y1);
    const cx = finite ? (b.x0 + b.x1) / 2 : 0, cy = finite ? (b.y0 + b.y1) / 2 : 0;
    // The shadow-casting light has to sit on the same side as the sun the materials shade with: an official scene
    // lights itself with its own `light.dir` (sceneMaterial's uLightDir, e.g. (0.36, 0.45, 0.82) on the sand), while
    // this rig's direction (LIGHTING.key.dir) is on the other side — every prop then cast its shadow straight behind
    // itself, where the camera cannot see it, and the board read as if nothing cast anything (the owner's 「阴影要搞下」).
    // The procedural board keeps the rig's direction.
    const s = this.official && this.official.doc ? this.official.doc.light : null;
    const d = s && Array.isArray(s.dir) && s.dir.length === 3 ? s.dir : LIGHTING.key.dir;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const dist = 30;
    k.position.set(cx + (d[0] / len) * dist, cy + (d[1] / len) * dist, (d[2] / len) * dist);
    k.target.position.set(cx, cy, 0);
    k.target.updateMatrixWorld();
    const cam = k.shadow.camera;
    // light-space box covering the island and its shadow on the background plane
    const half = (finite ? Math.max(b.x1 - b.x0, b.y1 - b.y0) : 30) / 2 + 9;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = dist + 30;
    cam.updateProjectionMatrix();
    k.updateMatrixWorld();
  }

  // ---- dynamic devices (battle) ------------------------------------------------------------------------------

  /** A crate / device box driven by render/units.js DeviceView (see header). */
  createDevice() {
    const T = this.THREE;
    const self = this;
    const geom = this._geometry({ ...this.crateGeometry(), color: null });
    const mat = this.mat.board.clone();
    mat.transparent = true;
    mat.vertexColors = false;
    // keep the focus falloff on the clone
    mat.onBeforeCompile = this.mat.board.onBeforeCompile;
    const mesh = new T.Mesh(geom, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.dynamic.add(mesh);
    const bx = this.crateGeometry().bounds || { x0: -0.45, x1: 0.45, z0: 0, z1: 0.675 };
    const baseSize = Math.max(0.01, bx.x1 - bx.x0), baseH = Math.max(0.01, bx.z1 - bx.z0);
    let dead = false;
    const h = {
      mesh: null,
      board: this,
      get destroyed() { return dead; },
      update(cam, b) {
        if (!b || dead) return;
        mesh.visible = (b.alpha ?? 1) > 0.01;
        mesh.position.set(b.x, b.y, b.z);
        const s = (b.size || baseSize) / baseSize;
        mesh.scale.set(s, s, Math.max(0.001, (b.height ?? baseH) / baseH));
        mat.opacity = Math.max(0, Math.min(1, b.alpha ?? 1));
        mat.depthWrite = mat.opacity > 0.98;
      },
      destroy() {
        if (dead) return;
        dead = true;
        self.dynamic.remove(mesh); geom.dispose(); mat.dispose(); self.devices.delete(h);
        if (!self.destroyed) self.renderer.shadowMap.needsUpdate = true;
      },
    };
    this.devices.add(h);
    this.renderer.shadowMap.needsUpdate = true;
    return h;
  }

  /** Red leak flash on the objective box at (r, c). */
  flashObjective(r, c) {
    this.flashes.push({ r, c, t: 0 });
    if (this.flashes.length > 8) this.flashes.shift();
  }

  // ---- view ------------------------------------------------------------------------------------------------------

  /** The lit field rect ({ r0, r1, c0, c1 } tiles; null = everything lit). Animated in render(). */
  setFocus(rect) {
    this.focusTarget = rect ? [rect.c0 - 0.5, rect.r0 - 0.5, rect.c1 + 0.5, rect.r1 + 0.5] : [-50, -50, 70, 70];
  }

  /** Settings quality change: 'low' drops the key light's shadow (antialias is fixed at context creation). */
  setQuality(q) {
    const on = q !== 'low';
    const R = this.renderer;
    if (R.shadowMap.enabled === on && this.key.castShadow === on) return false;
    R.shadowMap.enabled = on;
    this.key.castShadow = on;
    R.shadowMap.needsUpdate = true;
    return true;
  }

  resize(w, h, dpr = 1) {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    if (W === this.size.w && H === this.size.h && dpr === this.size.dpr) return;
    this.size = { w: W, h: H, dpr };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    this.camVersion = -1;
  }

  /** Draw a frame with projection camera `cam` at time `t` (seconds). */
  render(cam, t = 0) {
    if (this.destroyed || this.lost || !cam) return false;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = Math.max(0, Math.min(0.1, t - this.time));
    this.time = t;
    if (cam !== this.camRef || cam.version !== this.camVersion) {
      this.camRef = cam; this.camVersion = cam.version;
      syncThreeCamera(cam, this.camera, this.size.w, this.size.h, { near: Math.max(0.3, cam.dist * 0.08), far: cam.dist + 70 });
    }
    // focus falloff (eased)
    const F = this.focus.uFocus.value;
    if (this.focusTarget) {
      const k = Math.min(1, dt * 5);
      const tg = this.focusTarget;
      if (Math.abs(F.x - tg[0]) + Math.abs(F.y - tg[1]) + Math.abs(F.z - tg[2]) + Math.abs(F.w - tg[3]) > 40) F.set(tg[0], tg[1], tg[2], tg[3]);
      else F.set(F.x + (tg[0] - F.x) * k, F.y + (tg[1] - F.y) * k, F.z + (tg[2] - F.z) * k, F.w + (tg[3] - F.w) * k);
    }
    // gate pulses (official 2 s curve → additive intensity), objective leak flashes
    const pulse = gatePulse(t);
    if (this.mat.gateStartAdd) this.mat.gateStartAdd.uniforms.uPulse.value = GATE_GAIN * pulse / 0.18;
    if (this.mat.gateEndAdd) this.mat.gateEndAdd.uniforms.uPulse.value = GATE_GAIN * gatePulse(t, 0.5) / 0.18;
    if (this.mat.gateEndAb) this.mat.gateEndAb.uniforms.uPulse.value = 0.9;
    let flash = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > 1.2) this.flashes.splice(i, 1); else flash = Math.max(flash, 1 - f.t / 1.2); }
    for (const m of [this.mat.gateEndAdd, this.mat.gateEndAb]) if (m) m.uniforms.uFlash.value.setRGB(flash, flash * 0.12, flash * 0.1);
    for (const k of ['water', 'mire', 'infection', 'smog']) this.mat[k].uniforms.uTime.value = t;
    if (this.official) for (const m of this.sceneWater || []) m.uniforms.uTime.value = t;
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (t0) this.lastMs = this.lastMs * 0.9 + ((typeof performance !== 'undefined' ? performance.now() : t0) - t0) * 0.1;
    return true;
  }

  stats() {
    const info = this.renderer.info;
    return { calls: info?.render?.calls ?? 0, triangles: info?.render?.triangles ?? 0, textures: info?.memory?.textures ?? 0, geometries: info?.memory?.geometries ?? 0, frames: this.frames, cpuMs: Math.round(this.lastMs * 100) / 100, lost: this.lost };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const d of [...this.devices]) d.destroy();
    this._clear();
    for (const p of [...this.scenePacks.values()]) this._disposeScene(p);
    this.scenePacks.clear();
    this.mat.edge?.map?.dispose?.(); // canvas dash texture (not in this.tex)
    for (const m of Object.values(this.mat)) m?.dispose?.();
    for (const t of Object.values(this.tex)) t?.dispose?.();
    this.envMap?.dispose?.();
    this.envRT?.dispose?.(); // the PMREM render target's framebuffer/depth buffer (not freed by the texture's dispose)
    this.envRT = null;
    this.canvas.removeEventListener?.('webglcontextlost', this._onLost);
    try { this.renderer.dispose(); } catch { /* ignore */ }
    try { this.renderer.forceContextLoss?.(); } catch { /* ignore */ }
  }
}

// ---- small procedural meshes (fallbacks / rare devices) ------------------------------------------------------------

/** Axis-aligned box on the ground, centred on the origin: size × size × height. */
export function boxData(size, height) {
  const a = size / 2, pos = [], nrm = [], uv = [], idx = [];
  const faces = [
    [[0, 0, 1], [[-a, -a, height], [a, -a, height], [a, a, height], [-a, a, height]]],
    [[0, -1, 0], [[-a, -a, 0], [a, -a, 0], [a, -a, height], [-a, -a, height]]],
    [[1, 0, 0], [[a, -a, 0], [a, a, 0], [a, a, height], [a, -a, height]]],
    [[0, 1, 0], [[a, a, 0], [-a, a, 0], [-a, a, height], [a, a, height]]],
    [[-1, 0, 0], [[-a, a, 0], [-a, -a, 0], [-a, -a, height], [-a, a, height]]],
  ];
  for (const [n, q] of faces) {
    const b = pos.length / 3;
    for (const p of q) { pos.push(...p); nrm.push(...n); }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { position: new Float32Array(pos), normal: new Float32Array(nrm), uv: new Float32Array(uv), index: new Uint16Array(idx) };
}

/** Device box with an atlas top (blower fallback ▶▶ hatch, turret target plate) and grey sides. */
function boxWithTop(uvTable, kind) {
  const size = kind === 'turret' ? 0.72 : 0.86, h = kind === 'turret' ? 0.34 : DEVICE_H.platform;
  const b = boxData(size, h);
  const top = surfaceUV(uvTable?.mech || { src: 'D', rect: [1088, 708, 356, 310] });
  const side = surfaceUV(uvTable?.graySide || { src: 'D', rect: [272, 1664, 272, 120] });
  const uv = new Float32Array(b.uv.length);
  for (let f = 0; f < 5; f++) uv.set(f === 0 ? top : side, f * 8);
  return { ...b, uv, color: null };
}

/** Low green blob (act1 m07 bushes: inactive in 盟约, kept for completeness). */
function bushData() {
  const b = boxData(0.7, 0.32);
  return { ...b, uv: new Float32Array(b.uv.length).fill(0.02), color: new Float32Array((b.position.length / 3) * 3).fill(0).map((_, i) => [0.25, 0.48, 0.22][i % 3]) };
}
