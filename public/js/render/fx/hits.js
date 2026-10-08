// public/js/render/fx/hits.js — the hand-authored normal-attack impact of OUR seven custom operators ONLY.
// Installed on FxSystem.prototype by ./system.js (a method container: never instantiated; `this` is the effect system).
//
// The official normal-attack impact is NOT one texture: each projectile prefab names a particle-system effect prefab in
// `_effectsWhenHit` (battle/prefabs/[uc]projectiles.ab), e.g. `aglna2_attack_hit_01` / `gdglow_hit_01` /
// `kalts2_skill_01_hit_01`, a cluster of ParticleSystems + materials + transforms in battle/prefabs/effects/<stem>.ab
// (docs/ASSETS.md "Battle effects"). We cannot render those faithfully yet (no particle-system importer), and the
// earlier "one signature Texture2D as a ground field" attempt was visibly wrong (wrong texture / ground anchor / ~2.4-tile
// scale). So the whole season roster keeps the procedural hit (render/fx/projectiles.js `_impact`, render/fx/numbers.js
// `damage`), and ONLY our seven custom operators get the distinctive, correctly-anchored effect below.
//
// Each entry is anchored at the IMPACT / body point (never a ground decal) at a sane scale (≈ one body) and is built
// from the read-out of the operator's own official `_*_hit_*` prefab (colour + dominant pieces), which is what makes
// each one read like its official impact. What is approximate: the official prefab is a multi-ParticleSystem cluster
// (bursts, ramps, material tints we cannot replay here), so a hand-authored single-shot composition approximates its
// colour and shape, not its exact frames. Where a hit-flash texture of the prefab is a plain same-bundle Texture2D that
// the manifest has (e.g. gdglow's `star_05`, kalts2's `star_118_7` / `char_kalts2_03`), a `local` layer draws that
// official picture as the core flash on top when the client has it loaded — local art preferred when provably right,
// procedural fallback otherwise, never blank, never a network dependency in the fallback (docs/ASSETS.md).
//
// No PIXI, no DOM at import time — Node tests import this file.

import { fxLocalSource } from './localart.js';

/**
 * Per-operator normal-attack impact of our custom operators (`charId` → spec). `shape` picks the procedural
 * composition (render/fx/hits.js `_opHitProc`); `c`/`c2`/`glow` are the colours read from the operator's official hit
 * prefab (the client materials' tints / textures); `local` optionally names a same-bundle official flash picture.
 */
export const FX_HITS = Object.freeze({
  // 阿斯卡纶 (ascln): ascln_attack_hit_01 — a dark "fixed" core (flash / ring / galaxy / center / line / dot / glow /
  // baoshan), a void-violet implosion with a pale galaxy. The bundle's textures are muted mauve / white / grey, so the
  // violet is from the character's palette, not a sampled material tint [APPROX].
  char_4132_ascln: { shape: 'void', c: 0x8f6bd6, c2: 0xcfc2e8, glow: 0x5a2f9e },
  // 结城理 (makoto): makoto_attack_a/b_hit_01 — darkglow01 + glow01 + two slash frames + dot + glow_circle + jianci +
  // star. SEES blue/lavender (fx/makoto flow_294_color_01 blue, makoto_01 lavender, star_164_6 cyan).
  char_4217_makoto: { shape: 'slash', c: 0x9fb4ff, c2: 0xbfd0ff, glow: 0x3a4a86 },
  // 予愿安洁莉娜 (aglna2): aglna2_attack_hit_01 — baoci_01 + warm bg + core/envelop + ring_pink + star + fire_green +
  // orange. Warm peach, pink ring, green/orange sparks (fx/aglna2 char_aglna2_01 warm orange, char_aglna2_04 salmon,
  // char_aglna2_07 pale pink). The `char_aglna2_03` orange spark is a same-bundle flash → local core.
  char_1015_aglna2: {
    shape: 'bloom', c: 0xffd0b0, c2: 0xff9ec4, glow: 0xffd0b0,
    local: { group: 'fx/aglna2', tint: 0xffb060, dur: 0.22, layers: [{ name: 'char_aglna2_03', scale: 0.7 }] },
  },
  // 望 (wang): wang_attack_01_hit — hei_sz (black cross) + huan_huang / huan_bai / huan_hei (gold / white / black
  // rings) + bom + lizi2 + lines. Gold-white rings around a black core (fx/wang char_wang_05 gold, char_wang_01 dark).
  char_2027_wang: { shape: 'seal', c: 0xffd27a, c2: 0xffffff, glow: 0x1a1a1a },
  // 澄闪 (gdglow): gdglow_hit_01 — ring_01 ×2 + lighting_01 + baoshan + baodian ×2 + canliushandian (current) +
  // xingdian + suduxian + splash + tri. Electric violet/blue; `star_05` (mat star_05_add, the baodian flash) is a
  // same-bundle Texture2D → local core.
  char_377_gdglow: {
    shape: 'bolt', c: 0xb9c8ff, c2: 0xeaf2ff, glow: 0x7a8cff,
    local: { group: 'fx/gdglow', tint: 0xdfe8ff, dur: 0.22, layers: [{ name: 'star_05', scale: 0.75 }] },
  },
  // 娜仁图亚 (narant): narant_attack_01_hit — fg01 + baoshan_01 + bg_01 + baodian_01 + spark_add + spike01. Warm cream
  // burst with white sparks over a dusty bg (fx/narant star_304 tan, star_305 white, trail_335 pale cyan).
  char_4138_narant: { shape: 'sand', c: 0xfff2d8, c2: 0xffd9a0, glow: 0xffd9a0 },
  // 凯尔希·思衡托 (kalts2): kalts2_skill_01_hit_01 — her normal-attack HEAL impact: line_01_Add (star flash) + ray +
  // rainbow_ray ×2 + bg + side lines + flow_in + acrossStar. Green-white rays + a gold/white star (fx/kalts2 star_118_7
  // gold, char_kalts2_03 white, ray_135 white). Both flash textures are same-bundle → local core.
  char_1052_kalts2: {
    shape: 'heal', c: 0x9ff0b8, c2: 0xeafff0, glow: 0x62f08a,
    local: { group: 'fx/kalts2', tint: 0x9ff0b8, dur: 0.28, layers: [{ name: 'star_118_7', scale: 0.7 }, { name: 'char_kalts2_03', scale: 0.85 }] },
  },
});

/** The hit spec of our operator `opId` (a UnitView's `info.spine || info.defId`), or null (not one of ours). */
export function fxHitFor(opId) {
  return (typeof opId === 'string' && FX_HITS[opId]) || null;
}

export class FxHits {
  /**
   * The custom normal-attack impact of `opId` at screen point (x, y), s px per tile: false when `opId` is not one of
   * ours (the caller keeps the procedural hit). `o.melee` / `o.dir` (screen angle of the blow) tune the composition.
   */
  _opHit(opId, x, y, s, o = {}) {
    const h = fxHitFor(opId);
    if (!h || !(s > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    this._opHitLocal(h, x, y, s);
    this._opHitProc(h, x, y, s, o);
    return true;
  }

  /**
   * The optional official-art core of a hit: each `local` layer the client has listed AND loaded is drawn as a
   * body-anchored additive flash (NEVER a ground field — the earlier ground-decal anchor was the defect). A layer still
   * loading is prefetched; a layer the manifest does not list is not fetched at all (the fallback stays offline).
   * Returns true when at least one layer was drawn; the procedural composition below is always drawn as well (the
   * official hit is a multi-ParticleSystem cluster, so the extracted picture is its core, not the whole effect).
   */
  _opHitLocal(h, x, y, s) {
    const local = h.local;
    if (!local) return false;
    if (this.ctx.settings && this.ctx.settings.localFx === false) return false;
    const src = fxLocalSource(this.ctx.assets, local);
    if (!src) return false;
    const dur = Number.isFinite(local.dur) ? local.dur : 0.24;
    for (const ly of src) {
      const tex = this._fxLocalTex(ly.url, ly.image);
      const w = (tex && tex.width) || 128;
      const size = (s * (Number.isFinite(ly.scale) ? ly.scale : 1) * 0.9) / w;   // ≤ ~0.9 tile, at the impact
      this.particle(tex, x, y, {
        tint: ly.tint ?? local.tint ?? 0xffffff, life: dur, s0: size * 0.7, s1: size, a0: 0.95, a1: 0,
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 6,
      });
    }
    return true;
  }

  /** The hand-authored procedural composition of a hit (see the FX_HITS header): the guaranteed, offline fallback. */
  _opHitProc(h, x, y, s, o) {
    const c = h.c, c2 = h.c2, glow = h.glow;
    const k = s / 128;                 // atlas frames are 128² (dot 32², spark/plus 64² — see below)
    const dir = Number.isFinite(o && o.dir) ? o.dir : 0;
    const rich = this.rich;
    switch (h.shape) {
      case 'void': {                   // 阿斯卡纶: a dark violet implosion + a pale galaxy ring
        this.particle('glow', x, y, { tint: glow, life: 0.24, s0: k * 1.0, s1: k * 1.5, a0: 0.95, a1: 0 });
        this.particle('ring', x, y, { tint: glow, life: 0.3, s0: k * 0.5, s1: k * 1.25, a0: 0.9, a1: 0, spin: 2 });
        this.particle('ring', x, y, { tint: c2, life: 0.26, s0: k * 0.34, s1: k * 0.9, a0: 0.85, a1: 0, spin: -3 });
        this.burst(x, y, s, rich ? 5 : 3, c, { speed: 2.0, life: 0.3, tex: 'dot', size: 0.34 });
        if (rich) for (let i = 0; i < 3; i++) {
          this.particle('dot', x + (Math.random() - 0.5) * s * 0.7, y + (Math.random() - 0.5) * s * 0.6,
            { tint: c2, vx: (Math.random() - 0.5) * s * 0.7, vy: (Math.random() - 0.5) * s * 0.7, drag: 2, life: 0.5, s0: (s / 32) * 0.16, s1: 0, a0: 0.85, a1: 0, fadeIn: 0.06 });
        }
        break;
      }
      case 'slash': {                  // 结城理: two crossed blue crescents over a dark glow + a star point
        this.particle('glow', x, y, { tint: glow, life: 0.2, s0: k * 0.7, s1: k * 1.15, a0: 0.85, a1: 0 });
        const a = dir + Math.PI / 2, flip = Math.random() < 0.5 ? -1 : 1;
        const s1 = this.particle('slash', x, y, { tint: c, life: 0.2, s0: k * 1.0, s1: k * 1.3, a0: 1, a1: 0, rot: a + 0.45 });
        s1.sx = flip;
        const s2 = this.particle('slash', x, y, { tint: c2, life: 0.16, s0: k * 0.85, s1: k * 1.1, a0: 0.9, a1: 0, rot: a - 0.5 });
        s2.sx = -flip;
        this.particle('flare', x, y, { tint: c2, life: 0.16, s0: k * 0.8, s1: k * 0.2, a0: 1, a1: 0, rot: Math.random() * Math.PI });
        this.burst(x, y, s, rich ? 5 : 3, c, { speed: 2.4, life: 0.3, tex: 'dot', size: 0.36 });
        break;
      }
      case 'bloom': {                  // 予愿安洁莉娜: a pink ring + warm glow + green & orange sparks
        this.particle('glow', x, y, { tint: c, life: 0.22, s0: k * 0.55, s1: k * 1.1, a0: 0.95, a1: 0 });
        this.particle('ring', x, y, { tint: c2, life: 0.3, s0: k * 0.4, s1: k * 1.1, a0: 0.9, a1: 0, spin: 2 });
        this.burst(x, y, s, rich ? 4 : 2, 0x8fe07a, { speed: 1.8, life: 0.3, tex: 'dot', size: 0.3 });
        this.burst(x, y, s, rich ? 4 : 2, 0xffb060, { speed: 2.4, life: 0.26, tex: 'dot', size: 0.3 });
        break;
      }
      case 'seal': {                   // 望: gold + white rings around a black core
        this.particle('glow', x, y, { tint: glow, life: 0.22, s0: k * 0.7, s1: k * 0.15, a0: 0.8, a1: 0 });
        this.particle('ring', x, y, { tint: c, life: 0.28, s0: k * 0.45, s1: k * 1.2, a0: 0.95, a1: 0, spin: 1.6 });
        this.particle('ring', x, y, { tint: c2, life: 0.24, s0: k * 0.3, s1: k * 0.85, a0: 0.85, a1: 0, spin: -1.6 });
        this.burst(x, y, s, rich ? 5 : 3, c, { speed: 2.6, life: 0.3, tex: 'dot', size: 0.4 });
        break;
      }
      case 'bolt': {                   // 澄闪: an electric violet flare + ring + a couple of current streaks
        this.particle('flare', x, y, { tint: c2, life: 0.14, s0: k * 0.85, s1: k * 0.25, a0: 1, a1: 0, rot: Math.random() * Math.PI });
        this.particle('glow', x, y, { tint: c, life: 0.2, s0: k * 0.6, s1: k * 1.15, a0: 0.9, a1: 0 });
        this.particle('ring', x, y, { tint: c, life: 0.24, s0: k * 0.4, s1: k * 1.05, a0: 0.9, a1: 0, spin: 3 });
        if (rich) for (let i = 0; i < 2; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.particle('streak', x, y, { tint: c2, vx: Math.cos(ang) * s * 3, vy: Math.sin(ang) * s * 3, drag: 3, life: 0.16, s0: k * 0.55, s1: 0, a0: 0.95, a1: 0, rot: ang });
        }
        this.burst(x, y, s, rich ? 5 : 3, c, { speed: 2.6, life: 0.28, tex: 'dot', size: 0.36 });
        break;
      }
      case 'sand': {                   // 娜仁图亚: a warm cream burst with white sparks
        this.particle('glow', x, y, { tint: c, life: 0.2, s0: k * 0.6, s1: k * 1.2, a0: 0.95, a1: 0 });
        this.particle('shock', x, y, { tint: c2, life: 0.22, s0: k * 0.2, s1: k * 0.9, a0: 0.9, a1: 0 });
        this.burst(x, y, s, rich ? 5 : 3, c, { speed: 2.6, life: 0.3, tex: 'dot', size: 0.42 });
        if (rich) for (let i = 0; i < 2; i++) {
          this.particle('dot', x + (Math.random() - 0.5) * s * 0.5, y + (Math.random() - 0.5) * s * 0.4,
            { tint: c2, vx: (Math.random() - 0.5) * s * 0.8, vy: -s * 0.5, drag: 2, life: 0.5, s0: (s / 32) * 0.16, s1: 0, a0: 0.8, a1: 0, fadeIn: 0.06 });
        }
        break;
      }
      case 'heal': {                   // 凯尔希·思衡托: the normal-attack HEAL impact — green-white rays + a star
        this.particle('glow', x, y, { tint: c, life: 0.28, s0: k * 0.6, s1: k * 1.15, a0: 0.95, a1: 0 });
        this.particle('flare', x, y, { tint: c2, life: 0.2, s0: k * 0.9, s1: k * 0.3, a0: 1, a1: 0, rot: Math.random() * Math.PI });
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + 0.4;
          this.particle('streak', x, y, { tint: c, vx: Math.cos(ang) * s * 1.6, vy: Math.sin(ang) * s * 1.6, drag: 3, life: 0.22, s0: k * 0.5, s1: 0, a0: 0.9, a1: 0, rot: ang });
        }
        for (let i = 0; i < (rich ? 3 : 1); i++) {
          this.particle('plus', x + (Math.random() - 0.5) * s * 0.4, y - Math.random() * s * 0.2,
            { tint: 0xbfffcf, vy: -s * 0.8, life: 0.55, s0: (s / 64) * 0.26, s1: (s / 64) * 0.14, a0: 0.95, a1: 0, fadeIn: 0.05 });
        }
        break;
      }
      default:
        this.particle('flare', x, y, { tint: c, life: 0.12, s0: k * 0.6, s1: k * 0.2, a0: 1, a1: 0, rot: Math.random() * Math.PI });
    }
  }
}
