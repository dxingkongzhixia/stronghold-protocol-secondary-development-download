// render/board3d/theme.js — the per-battlefield colour grade of the official scenes (DESIGN §15).
//
// The official 3D board is Unity HDR lit and shown through the client's post FX, and each battlefield theme was
// graded differently: the sand battlefields are pale, soft, desaturated sandstone, the city/metro ones are bright
// sunny daylight, the industrial ones are darker and contrasty. Our port rendered every scene through one global
// exposure, so the sand read too red/dark and the city too dark/grey. This table carries the per-theme grade; the
// renderer reads it (BoardScene for the exposure, sceneMaterial for the ambient fill and the albedo tint) instead of
// hard-coding one value.
//
// Values are DERIVED from the owner's official screenshots of each battlefield sampled against our render at the same
// stage (region → official vs ours), not picked by eye; docs/ASSETS.md records the samples. Add a theme by giving it a
// row here and, if its albedo is a new one, a marker in THEME_MARKERS.
//
//   exposure  renderer.toneMappingExposure (the official's HDR exposure of that theme)
//   ambient   the neutral ambient/probe fill added to every scene material (0..1, linear)
//   tint      a multiplier on the material's albedo (a colour grade; [1,1,1] = none)
//   saturate  the final colour's saturation (<1 = the official's softer, desaturated look)
//   sun       a gain on the scene's key light (the sun term; default 1)
//   apron (optional) the surrounding-sand blend band: { texture?, tint?, uv?, width?, rings?, alpha?, z? }.
//             Rendered by scene.js `_buildApron`; omitted = none (the metal / procedural board keeps none — the
//             regression baseline).
export const SCENE_THEMES = Object.freeze({
  // The global default: the official's HDR tone/exposure with a lightly desaturated finish.
  default: Object.freeze({ exposure: 1.5, ambient: 0.12, tint: Object.freeze([1, 1, 1]), saturate: 0.94 }),
  // act1autochess (sand / desert): sampled official ground ~(151,125,94) vs ours (132,114,92) before the grade; the
  // official is a pale, soft, desaturated sandstone, ours was too red/dark (the removed _Color2 vertex tint). The
  // official (PRTS 战场#01) lays the field, the dunes and the rocks into ONE bright sand surface — it is NOT a raised
  // perimeter platform, so the earlier ring + lane 高台 geometry was a wrong read. The apron adds the surrounding sand
  // grain (the scene's own sand albedo, official UV scale) blending out from the field edge. VISUAL only.
  sand: Object.freeze({
    exposure: 2.05, ambient: 0.22, tint: Object.freeze([1.03, 1.0, 0.97]), saturate: 0.94, sun: 1.85,
    apron: Object.freeze({ texture: 'TX_AutochessSand_sand_A', tint: Object.freeze([1.10, 1.07, 1.02]), uv: 0.23, width: 2.2, rings: 5, alpha: 0.45, z: 0.014 }),
  }),
  // act2autochess m01/m02 (Syracuse metro / 叙拉古·城市): the official is bright sunny daylight, ours read dark/grey.
  city: Object.freeze({ exposure: 2.0, ambient: 0.20, tint: Object.freeze([1, 1, 1]), saturate: 0.94 }),
  // act2autochess m03 (KXMR / LMZ) and m04 (Doss shore): not sampled yet — the default finish, a touch brighter.
  kxmr: Object.freeze({ exposure: 1.6, ambient: 0.15, tint: Object.freeze([1, 1, 1]), saturate: 0.94 }),
  lmz: Object.freeze({ exposure: 1.6, ambient: 0.15, tint: Object.freeze([1, 1, 1]), saturate: 0.94 }),
});

// Albedo-texture marker → theme. The scene doc's material list is the official data: a battlefield's theme is the
// texture family its materials sample (TX_AutochessSand_* → sand, TX_Syracuse_metro_* → city, …).
export const THEME_MARKERS = Object.freeze([
  ['AutochessSand', 'sand'],
  ['Syracuse', 'city'],
  ['KXMR', 'kxmr'],
  ['LMZ', 'lmz'],
]);

/**
 * Theme row of a stage's scene. `stageId` falls back to the act (act1autochess → sand, act2autochess → city) and,
 * last, `default`. Never null.
 * @param {string} stageId
 * @param {{ materials?: object }|null} doc scene.json
 */
export function sceneTheme(stageId, doc) {
  const maps = Object.values(doc?.materials || {}).map((m) => (m && typeof m.map === 'string' ? m.map : ''));
  for (const [marker, theme] of THEME_MARKERS) if (maps.some((n) => n.includes(marker))) return SCENE_THEMES[theme];
  if (/^act1autochess/.test(stageId || '')) return SCENE_THEMES.sand;
  if (/^act2autochess/.test(stageId || '')) return SCENE_THEMES.city;
  return SCENE_THEMES.default;
}
