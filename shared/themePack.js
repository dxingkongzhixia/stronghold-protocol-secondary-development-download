// shared/themePack.js — the local interface theme packs (spTheme/1), read by the browser's settings screen and the
// client's applier (public/js/themePacks.js). A pack is a theme.json plus a few pictures; nothing here touches the DOM,
// the network or the server. The vocabulary follows the plugin model (docs/PLUGINS.md §9.1): colours are the same
// validated design tokens a cosmetic plugin may set, and the image slots are named after our screens, not the mainline's
// prefab HUD.
//
// A pack never carries CSS, HTML, script, or a URL: every image value is a relative path inside the pack folder. The
// browser turns it into a blob URL after checking the file. Unknown keys are warnings; a broken slot is dropped alone.

import { acceptColour } from './plugins/theme.js';

export const THEME_PACK_FORMAT = 'spTheme/1';

/** [ASSUMED] pack limits; a change belongs in docs/THEMES.md. */
export const THEME_PACK_LIMITS = Object.freeze({
  files: 120,
  image: 8 * 1024 * 1024,
  pack: 32 * 1024 * 1024,
  name: 40,
  author: 40,
  description: 240,
  id: 32,
});

/** A pack's colour keys → the CSS token they set. Same grammar as shared/plugins/theme.js. */
export const THEME_PACK_COLORS = Object.freeze({
  accent: '--mint-500',
  accentSoft: '--mint-700',
  accentBright: '--mint-400',
  glow: '--mint-glow',
  bg0: '--bg-0',
  bg1: '--bg-1',
  bg2: '--bg-2',
  line: '--line',
  line2: '--line-2',
  text: '--text-hi',
  textDim: '--text-lo',
});

/**
 * The image slots. `css` is the custom property the client writes; `screens` is documentation for the settings preview.
 * `title.bg`, `lobby.bg`, `room.bg`, `brief.bg`, `shop.bg`, `shop.card` and `banner` are P1; `slices` (P2) and
 * `character` (P3) are declared here so a pack can carry them without a later format bump.
 */
export const THEME_PACK_SLOTS = Object.freeze({
  'title.bg': { css: '--tp-title-bg', screens: 'title' },
  'lobby.bg': { css: '--tp-lobby-bg', screens: 'lobby' },
  'room.bg': { css: '--tp-room-bg', screens: 'room' },
  'brief.bg': { css: '--tp-brief-bg', screens: 'briefing' },
  'shop.bg': { css: '--tp-shop-bg', screens: 'shop' },
  'shop.card': { css: '--tp-shop-card', screens: 'shop-card' },
  banner: { css: '--tp-banner', screens: 'banner' },
  'character.image': { css: '--tp-character', screens: 'title-character' },
});

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const AUDIO_RE = /\.(ogg|mp3)$/i;
const DATA_RE = /\.(skel|json|atlas)$/i;
const PATH_BAD = /(^\/|^\\|:\/\/|(^|[\\/])\.\.([\\/]|$)|[\0-\x1f])/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A path inside the pack folder, or null. */
export function acceptPackPath(v) {
  if (typeof v !== 'string') return null;
  const p = v.trim().replace(/\\/g, '/');
  if (!p || p.length > 160 || PATH_BAD.test(p) || !IMAGE_RE.test(p)) return null;
  return p;
}

/** An audio path inside the pack folder (.ogg / .mp3), or null. */
export function acceptAudioPath(v) {
  if (typeof v !== 'string') return null;
  const p = v.trim().replace(/\\/g, '/');
  if (!p || p.length > 160 || PATH_BAD.test(p) || !AUDIO_RE.test(p)) return null;
  return p;
}

/** A Spine data path inside the pack folder (.skel / .json / .atlas), or null. */
export function acceptDataPath(v) {
  if (typeof v !== 'string') return null;
  const p = v.trim().replace(/\\/g, '/');
  if (!p || p.length > 160 || PATH_BAD.test(p) || !DATA_RE.test(p)) return null;
  return p;
}

/**
 * Check a theme.json. `files` (optional) is the set of paths the pack carries, so a referenced picture is known to
 * exist; when omitted only the manifest is checked (the settings preview / a unit test).
 * @param {any} doc parsed theme.json
 * @param {Set<string>|null} files
 * @returns {{ ok: boolean, pack: any|null, errors: { code: string, path: string, message: string }[],
 *   warnings: { code: string, path: string, message: string }[] }}
 */
export function validateThemePack(doc, files = null) {
  const errors = [];
  const warnings = [];
  const err = (code, path, message) => errors.push({ code, path, message });
  const warn = (code, path, message) => warnings.push({ code, path, message });
  if (!isObj(doc)) {
    err('THEME_SHAPE', 'theme.json', 'theme.json must be a JSON object');
    return { ok: false, pack: null, errors, warnings };
  }
  if (doc.format !== THEME_PACK_FORMAT) err('THEME_FORMAT', 'format', `format must be "${THEME_PACK_FORMAT}"`);
  const id = str(doc.id, THEME_PACK_LIMITS.id);
  if (!ID_RE.test(id)) err('THEME_ID', 'id', 'id: 1–32 lowercase letters, digits, - or _');
  const name = str(doc.name, THEME_PACK_LIMITS.name);
  if (!name) err('THEME_NAME', 'name', 'name is required');
  const author = str(doc.author, THEME_PACK_LIMITS.author);
  const description = str(doc.description, THEME_PACK_LIMITS.description);
  const version = Number.isInteger(doc.version) && doc.version > 0 ? doc.version : 1;

  const colors = {};
  if (doc.colors != null && !isObj(doc.colors)) err('THEME_COLORS_SHAPE', 'colors', 'colors must be an object');
  else {
    for (const [key, raw] of Object.entries(doc.colors || {})) {
      if (!(key in THEME_PACK_COLORS)) { warn('THEME_COLOR_UNKNOWN', `colors.${key}`, `unknown colour key ${key}`); continue; }
      const v = acceptColour(raw);
      if (!v) { err('THEME_COLOR_VALUE', `colors.${key}`, 'a colour literal (hex / rgb / hsl)'); continue; }
      colors[key] = v;
    }
  }

  const images = {};
  if (doc.images != null && !isObj(doc.images)) err('THEME_IMAGES_SHAPE', 'images', 'images must be an object');
  else {
    for (const [key, raw] of Object.entries(doc.images || {})) {
      const slot = THEME_PACK_SLOTS[key];
      if (!slot) { warn('THEME_SLOT_UNKNOWN', `images.${key}`, `unknown image slot ${key}`); continue; }
      const p = acceptPackPath(raw);
      if (!p) { err('THEME_IMAGE_PATH', `images.${key}`, 'a relative .png / .jpg / .webp path inside the pack'); continue; }
      if (files && !files.has(p)) { err('THEME_IMAGE_MISSING', `images.${key}`, `${p} is not in the pack`); continue; }
      images[key] = p;
    }
  }

  const slices = {};
  if (doc.slices != null && !isObj(doc.slices)) warn('THEME_SLICES_SHAPE', 'slices', 'slices must be an object');
  else {
    for (const [key, raw] of Object.entries(doc.slices || {})) {
      if (!(key in THEME_PACK_SLOTS)) { warn('THEME_SLOT_UNKNOWN', `slices.${key}`, `unknown slice slot ${key}`); continue; }
      const inset = Number(raw?.inset);
      if (!Number.isFinite(inset) || inset < 0 || inset > 128) { warn('THEME_SLICE_VALUE', `slices.${key}.inset`, 'inset 0–128'); continue; }
      slices[key] = { inset };
    }
  }

  const character = isObj(doc.character) ? {
    skel: acceptDataPath(doc.character.skel),
    atlas: acceptDataPath(doc.character.atlas),
    idle: str(doc.character.idle, 64) || 'Idle',
  } : null;
  if (character && (!character.skel || !character.atlas)) warn('THEME_CHARACTER_SHAPE', 'character', 'skel + atlas are required');

  let voice = null;
  if (doc.voice != null) {
    voice = acceptAudioPath(doc.voice);
    if (!voice) err('THEME_VOICE_PATH', 'voice', 'a relative .ogg / .mp3 path inside the pack');
    else if (files && !files.has(voice)) err('THEME_VOICE_MISSING', 'voice', `${voice} is not in the pack`);
  }

  const pack = { format: THEME_PACK_FORMAT, id, name, author, description, version, colors, images, slices, character, voice };
  return { ok: errors.length === 0, pack: errors.length ? null : pack, errors, warnings };
}

/** The CSS custom properties a validated pack writes, before the browser turns images into blob URLs. */
export function themePackVariables(pack, imageUrl = null) {
  const out = {};
  for (const [key, value] of Object.entries(pack?.colors || {})) out[THEME_PACK_COLORS[key]] = value;
  for (const [key, path] of Object.entries(pack?.images || {})) {
    const url = imageUrl ? imageUrl(path) : null;
    if (url) out[THEME_PACK_SLOTS[key].css] = `url("${url}")`;
  }
  const slice = pack?.slices?.['shop.card']?.inset;
  if (Number.isFinite(slice)) out['--tp-shop-card-slice'] = String(slice);
  return out;
}
