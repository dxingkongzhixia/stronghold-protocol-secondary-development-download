// render/spineRoles.js — the animation roles of a Spine model the local client supplied (spine/char/<id>/<face>, a
// version-only operator). data/assets.json has no charpack table for those operators, so localCharSpineEntry
// (assets.js) offers only generic clip names ('Attack', 'Skill'); a skeleton whose skill clips are Skill_2_Loop /
// Skill_1_Attack then plays no attack animation while its skill runs. The skeleton is already parsed by pixi-spine when
// this runs, so the same by-name resolver the tools use for the web models (shared/animRoles.js) gives it the roles
// 盟约's operators have, and its OnAttack events give the strike times (entry.hits, the release frame of a shot).
//
// [ASSUMED] The three shop skill slots (S1–S3), like every operator in the mode: resolveRoles names them Skill /
// Skill_2 / Skill_3 (or Skill_1 …) by the clip names; a slot with no clip of its own borrows the normal attack, which
// is what the official client's Default mode does for an instant skill.

import { resolveRoles } from '../../../shared/animRoles.js';

/** The shop's three skill slots, as resolveRoles' 0-based indices. */
const SKILL_SLOTS = Object.freeze([0, 1, 2]);
const resolved = new WeakMap(); // spineData → { anims, animations, hits }

/**
 * Clip durations, events and OnAttack times of a parsed skeleton. `hits` maps an animation to the seconds of its
 * OnAttack events (the official release frame; spine.js _hitTime), which pixi-spine keeps in the event timelines.
 * @param {any} spineData PIXI.spine skeleton data
 */
export function spineTiming(spineData) {
  const animations = {};
  const hits = {};
  for (const anim of Array.isArray(spineData?.animations) ? spineData.animations : []) {
    if (!anim || typeof anim.name !== 'string') continue;
    if (Number.isFinite(anim.duration)) animations[anim.name] = anim.duration;
    for (const timeline of Array.isArray(anim.timelines) ? anim.timelines : []) {
      if (!Array.isArray(timeline?.events)) continue;
      for (const event of timeline.events) {
        if (event?.data?.name !== 'OnAttack' || !Number.isFinite(event.time)) continue;
        (hits[anim.name] ||= []).push(event.time);
      }
    }
  }
  for (const list of Object.values(hits)) list.sort((a, b) => a - b);
  return { animations, hits };
}

/**
 * The roles, durations and strike times of a local-client character skeleton: `{ anims, animations, hits }`, cached
 * per parsed skeleton. Null when the skeleton has no animations.
 * @param {any} spineData PIXI.spine skeleton data
 * @returns {{ anims: any, animations: Record<string, number>, hits: Record<string, number[]> }|null}
 */
export function localSpineRoles(spineData) {
  if (!spineData || typeof spineData !== 'object') return null;
  const cached = resolved.get(spineData);
  if (cached !== undefined) return cached;
  const names = (Array.isArray(spineData?.animations) ? spineData.animations : []).map((a) => a?.name).filter((n) => typeof n === 'string');
  if (!names.length) {
    resolved.set(spineData, null);
    return null;
  }
  const { animations, hits } = spineTiming(spineData);
  const anims = resolveRoles(names, { skillIndices: SKILL_SLOTS, durations: animations });
  const out = { anims, animations, hits };
  resolved.set(spineData, out);
  return out;
}
