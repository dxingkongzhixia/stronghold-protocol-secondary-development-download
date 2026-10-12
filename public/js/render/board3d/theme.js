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
//   apron (optional) the surrounding-sand blend band: { texture?, tint?, uv?, width?, gap?, rings?, alpha?, z? }.
//             Rendered by scene.js `_buildApron`; `gap` keeps its inner edge clear of the field (never tints the last
//             playable row). Omitted = none (the metal / procedural board keeps none — the regression baseline).
//   platforms (optional) the official's 高台 (raised sandstone blocks): { texture?, tint?, uv?, blocks: [{ r0, r1,
//             c0, c1, h, base? }] }. Each `block` is a flat-topped sandstone box over that tile rect (board coords),
//             `h` = the top height in tiles, `base` = where its sides start (default 0). Rendered by scene.js
//             `_buildPlatforms`; the rects are the LOCALISED blocks the battlefield's official PRTS map shows (the
//             field's left-middle terrace + the corner blocks), never a perimeter frame. Omitted = none.
export const SCENE_THEMES = Object.freeze({
  // The global default: the official's HDR tone/exposure with a lightly desaturated finish.
  default: Object.freeze({ exposure: 1.5, ambient: 0.12, tint: Object.freeze([1, 1, 1]), saturate: 0.94 }),
  // act1autochess (sand / desert): sampled official ground ~(151,125,94) vs ours (132,114,92) before the grade; the
  // official is a pale, soft, desaturated sandstone, ours was too red/dark (the removed _Color2 vertex tint). The
  // official (PRTS 战场#01) lays the field, the dunes and the rocks into ONE bright sand surface — it is NOT a raised
  // perimeter platform, so the earlier ring + lane 高台 geometry was a wrong read. The apron adds the surrounding sand
  // grain (the scene's own sand albedo, official UV scale) blending out from the field edge. VISUAL only.
  sand: Object.freeze({
    exposure: 2.5, ambient: 0.20, tint: Object.freeze([1.0, 1.0, 0.99]), saturate: 0.78, sun: 3.4,
    apron: Object.freeze({ texture: 'TX_AutochessSand_sand_A', tint: Object.freeze([1.08, 1.06, 1.02]), uv: 0.23, width: 1.6, gap: 0.5, rings: 4, alpha: 0.34, z: 0.014 }),
    // The official's 高台: the raised sandstone block at the field's LEFT-MIDDLE (the owner's pointer; the PRTS
    // 战场#01 map steps the deploy terrace up there) plus the localised blocks the map shows at the field's other
    // edge. These ARE the official blocks (a list of rects), NOT the earlier ring / perimeter frame (a wrong read,
    // gone). VISUAL only: the sim's tiles / heights / deployTiles are untouched, and every rect sits OUTSIDE the
    // deploy field (cols 0-2 / 19-20, rows 14-15), so a block never covers a deploy highlight / the direction wheel.
    platforms: Object.freeze({
      texture: 'TX_AutochessSand_A', tint: Object.freeze([1.02, 1.0, 0.98]), uv: 0.23,
      blocks: Object.freeze([
        // left-middle: the owner's 高台 (cols 0-2, rows 9-11) - the block the deploy highlight sits against
        Object.freeze({ r0: 9, r1: 11, c0: 0, c1: 2, h: 0.42 }),
        // the same terrace one row further back (row 12, cols 1-2): the map steps it up again
        Object.freeze({ r0: 12, r1: 12, c0: 1, c1: 2, h: 0.62 }),
        // bottom-left corner of the field (rows 14-15, cols 0-2): the raised blocks above the bench plank
        Object.freeze({ r0: 14, r1: 15, c0: 0, c1: 2, h: 0.42 }),
        // the right field's mirrored left-middle block (cols 19-20, rows 9-11)
        Object.freeze({ r0: 9, r1: 11, c0: 19, c1: 20, h: 0.42 }),
      ]),
    }),
  }),
  // act2autochess m01 (Syracuse metro / 叙拉古·城市): the official is bright sunny daylight — a high sun, crisp cast
  // shadows on the pavement; ours read dark/grey. Same treatment as the sand (a strong sun gain, low ambient).
  city: Object.freeze({ exposure: 2.45, ambient: 0.15, tint: Object.freeze([1, 1, 1]), saturate: 0.95, sun: 3.0 }),
  // act2autochess m03 (KXMR / LMZ): the official is a grittier, higher-contrast industrial shore — a touch darker than
  // the sand/city, but still clearly sunlit. m03 carries both TX_KXMR and TX_LMZ materials; THEME_MARKERS resolves it to
  // `kxmr` (the first family in the list), so `lmz` is the row for a TX_LMZ-only scene (same grade).
  kxmr: Object.freeze({ exposure: 2.0, ambient: 0.13, tint: Object.freeze([1, 1, 1]), saturate: 0.94, sun: 2.4 }),
  lmz: Object.freeze({ exposure: 2.0, ambient: 0.13, tint: Object.freeze([1, 1, 1]), saturate: 0.94, sun: 2.4 }),
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
