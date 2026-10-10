// public/js/render/fx/localart.js — the optional local-client art tier of an fx kind (docs/ASSETS.md "Battle effects").
//
// A kind opts in with `spec.local` (render/fx/kinds.js):
//   { group, layers: [{ name, scale? }], tint?, dur?, bySkill?, byOp? }
// and, for a kind shared by many operators, attributes its layers per skill label (`bySkill: { <extra.skill>: local }`)
// or per operator (`byOp: { <spine|defId>: local }`) — fxLocalFor picks the entry of the event (render/fx/simfx.js).
// Each layer names a picture of the local-client manifest (`data/local-assets.json`, group + name). At render time the
// official tier is used only when the client lists EVERY layer AND its picture has loaded: FxSystem then draws the
// layers as ground fields (render/fx/rings.js) instead of the procedural archetype. When any layer is missing — no
// local client, `node tools/setup.mjs` never ran, the manifest/join has not loaded yet, a load failed — the
// procedural tier is drawn.
//
// So the local tier never blocks or blanks an effect and never adds a network dependency to the fallback: a connected
// client without the art simply sees the procedural version (the same effect at another quality), the owner's
// Minecraft-shader-style graceful degradation. The lookup order is the project's usual "local → mirror → neutral":
// the local picture first, then the procedural drawing (fx kinds have no mirrored/raster web copy).
//
// No PIXI, no DOM at import time — Node tests import this file.

import { FX_OFFICIAL } from './official.js';

const str = (v) => (typeof v === 'string' && v ? v : null);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The one-line kill switch of the whole local official-art tier. Default ON: the local-client pictures
 * (render/fx/official.js and the hand-wired `spec.local` maps) are drawn when the client has them, else the procedural
 * archetype. Set this to `false` (a single edit; no other change) and every operator falls back to the procedural
 * tier — `fxLocalFor` / `fxLocalSource` return null, nothing is resolved and nothing is fetched (docs/ASSETS.md
 * "Battle effects"). It is a source-level pref, distinct from the per-client `ctx.settings.localFx === false`
 * (render/fx/simfx.js, render/fx/hits.js), which opts a single client out at run time.
 */
export const LOCAL_ART_ENABLED = true;

/**
 * The largest radius (tiles) one official layer may cover. An official picture is an in-place effect AT the anchor
 * (≈ one body), never a board-wide ground field: render/fx/simfx.js `_fxLocal` scales the layer set's drawn radii
 * (`r × layer.scale`) down together so the largest is at most this (ratios kept), and render/fx/hits.js `_opHitLocal`
 * caps its body-anchored flash to it too. Before this cap the archetype's own area radius (a 'tide' r=2, an 'aoe'
 * behind a wide skill) multiplied a layer scale of 1.5 into a 3-tile field — the "big flat picture pasted on the board"
 * the owner reported.
 */
export const LOCAL_FX_MAX_R = 1.1;

/**
 * The data-driven official-art entry of an operator (`render/fx/official.js` `FX_OFFICIAL`): the season roster's
 * per-operator default ({ group, kinds, layers }) the generated table carries. `kind` filters it to the fx kinds that
 * operator's kit actually emits, so an effect the operator never draws is never given their art. Null when the
 * operator is not listed (or the kind is not theirs) — the caller keeps the procedural tier.
 */
export function fxOfficialFor(opId, kind = null) {
  if (!LOCAL_ART_ENABLED) return null;
  const e = opId && isObj(FX_OFFICIAL) ? FX_OFFICIAL[opId] : null;
  if (!isObj(e)) return null;
  if (kind && Array.isArray(e.kinds) && e.kinds.length && !e.kinds.includes(kind)) return null;
  return e;
}

/** A resolved `local` of a registry entry, inheriting `tint` / `dur` of the kind's own spec when it names them. */
function officialLocal(off, base) {
  const b = isObj(base) ? base : {};
  const out = { group: off.group, layers: off.layers };
  const tint = b.tint != null ? b.tint : (off.tint != null ? off.tint : null);
  const dur = b.dur != null ? b.dur : (off.dur != null ? off.dur : null);
  if (tint != null) out.tint = tint;
  if (dur != null) out.dur = dur;
  return out;
}

/**
 * The `local` spec a kind uses for one fx event: the plain `spec.local` when it carries its own layers, else the entry
 * its `bySkill` / `byOp` map holds, else the operator's generated official-art entry (`render/fx/official.js`). This is
 * what makes official art attributable: a generic kind ('aoe', 'strike', …) is shared by many operators, so its layers
 * live per skill label (`extra.skill`, e.g. 'makoto_sluggish'), per operator id (`opId`, the emitting unit's `spine` /
 * `defId` — the sim always anchors an fx on its caster, `id`, or `src`), or, for the season roster, in the data table.
 * A `byOp` / `bySkill` entry merges over the base (`{ ...local, ...entry }`), so it may inherit `group` / `tint` /
 * `dur` and override only `layers`. The registry is consulted only when the kind carries no layers of its own (or
 * marks itself `official: true`) so a kind with a fixed spec (kalts2Heal / kalts2Damage) is never overridden. `null`
 * when nothing matches: the caller draws the procedural tier (never a fetch, never a blank frame — the same graceful
 * degradation as a client without the art).
 * @param {object} local the fx spec's `local` record ({ group, layers, tint?, dur?, bySkill?, byOp?, official? })
 * @param {object} [extra] the fx event's extra record (`extra.skill`)
 * @param {string} [opId] the emitting operator's rendered id (UnitView.info.spine || .defId)
 * @param {string} [kind] the fx kind, to filter a generated registry entry to the operator's own effects
 */
export function fxLocalFor(local, extra = {}, opId = null, kind = null) {
  if (!LOCAL_ART_ENABLED) return null; // the kill switch: every operator falls back to procedural
  if (!isObj(local)) return null;
  const hasBase = Array.isArray(local.layers) || !!str(local.name);
  const skill = str(extra && extra.skill);
  const skillSel = skill && isObj(local.bySkill) ? local.bySkill[skill] : null;
  const opSel = !skillSel && opId && isObj(local.byOp) ? local.byOp[opId] : null;
  const sel = isObj(skillSel) ? skillSel : (isObj(opSel) ? opSel : null);
  if (!sel) {
    // the generated operator table (a kind with its own base layers opts in with `official: true`)
    if (!hasBase || local.official === true) {
      const off = fxOfficialFor(opId, kind);
      if (off) return officialLocal(off, local);
    }
    return hasBase ? local : null;
  }
  const out = { ...local, ...sel };
  delete out.bySkill; delete out.byOp; delete out.official;
  if (!str(out.group) && str(local.group)) out.group = local.group;
  if (out.tint == null && local.tint != null) out.tint = local.tint;
  if (out.dur == null && local.dur != null) out.dur = local.dur;
  if (!Array.isArray(out.layers) && !str(out.name) && Array.isArray(local.layers)) out.layers = local.layers;
  return out;
}

/** Normalised layers of a `spec.local` (`{ group, layers: [...] }` or one `{ group, name }`); [] when unusable. */
export function fxLocalLayers(local) {
  if (!local || typeof local !== 'object') return [];
  const group = str(local.group);
  if (!group) return [];
  const raw = Array.isArray(local.layers) ? local.layers : (local.name ? [local] : []);
  const baseTint = Number.isFinite(local.tint) ? local.tint : null;
  const out = [];
  for (const ly of raw) {
    const name = str(ly && ly.name);
    if (!name) continue;
    out.push({
      group: str(ly.group) || group,
      name,
      scale: Number.isFinite(ly.scale) ? ly.scale : 1,
      tint: Number.isFinite(ly.tint) ? ly.tint : baseTint,
    });
  }
  return out;
}

/**
 * The official-art layers of `spec.local` the client can draw right now: `{ group, name, url, image, scale, tint }[]`
 * when the local manifest lists every layer AND every picture has loaded; null otherwise (the caller draws the
 * procedural tier). A listed but not-yet-loaded layer is prefetched through `assets.image(url)` so a later event uses
 * it; a layer the manifest does not list is not fetched at all — the fallback never touches the network. Never throws.
 * @param {{ localUrl?: Function, image?: Function, imageNow?: Function }} assets public/js/assets.js store
 * @param {object} local the fx spec's `local` record
 */
export function fxLocalSource(assets, local) {
  if (!LOCAL_ART_ENABLED) return null; // the kill switch: never resolve (or fetch) an official picture
  const layers = fxLocalLayers(local);
  if (!layers.length || !assets || typeof assets.localUrl !== 'function') return null;
  const out = [];
  let complete = true;
  for (const ly of layers) {
    let url = null;
    try { url = str(assets.localUrl(ly.group, ly.name)); } catch { url = null; }
    if (!url) return null; // not listed: no local tier, draw procedural (no fetch)
    let img = null;
    try { img = typeof assets.imageNow === 'function' ? assets.imageNow(url) : null; } catch { img = null; }
    if (!img) {
      complete = false;
      try { if (typeof assets.image === 'function') assets.image(url).catch(() => {}); } catch { /* optional art */ }
    }
    out.push({ group: ly.group, name: ly.name, url, image: img || null, scale: ly.scale, tint: ly.tint });
  }
  return complete ? out : null; // any layer still loading: procedural now, the official layers once they are there
}
