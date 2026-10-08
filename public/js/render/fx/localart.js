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

const str = (v) => (typeof v === 'string' && v ? v : null);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The `local` spec a kind uses for one fx event: the plain `spec.local` when it carries its own layers, else the entry
 * its `bySkill` / `byOp` map holds. This is what makes official art attributable: a generic kind ('aoe', 'strike', …)
 * is shared by many operators, so its layers live per skill label (`extra.skill`, e.g. 'makoto_sluggish') or per
 * operator id (`opId`, the emitting unit's `spine` / `defId` — the sim always anchors an fx on its caster, `id`, or
 * names it in `src`). A `byOp` / `bySkill` entry merges over the base (`{ ...local, ...entry }`), so it may inherit
 * `group` / `tint` / `dur` and override only `layers`. `null` when nothing matches: the caller draws the procedural
 * tier (never a fetch, never a blank frame — the same graceful degradation as a client without the art).
 * @param {object} local the fx spec's `local` record ({ group, layers, tint?, dur?, bySkill?, byOp? })
 * @param {object} [extra] the fx event's extra record (`extra.skill`)
 * @param {string} [opId] the emitting operator's rendered id (UnitView.info.spine || .defId)
 */
export function fxLocalFor(local, extra = {}, opId = null) {
  if (!isObj(local)) return null;
  const hasBase = Array.isArray(local.layers) || !!str(local.name);
  const skill = str(extra && extra.skill);
  const skillSel = skill && isObj(local.bySkill) ? local.bySkill[skill] : null;
  const opSel = !skillSel && opId && isObj(local.byOp) ? local.byOp[opId] : null;
  const sel = isObj(skillSel) ? skillSel : (isObj(opSel) ? opSel : null);
  if (!sel) return hasBase ? local : null;
  const out = { ...local, ...sel };
  delete out.bySkill; delete out.byOp;
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
