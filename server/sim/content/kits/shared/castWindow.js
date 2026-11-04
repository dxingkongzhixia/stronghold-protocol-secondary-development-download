// server/sim/content/kits/shared/castWindow.js — 冻河 S2's 「期间技能变为自动开启」: while the window lasts the holder's
// MANUAL skill casts like an AUTO one (no operation cooldown, AUTO_OP_COOLDOWN); its own trigger rule still decides when
// it opens. Engine side: server/sim/skills.js `_opCooling` reads the buff (constants.js CAST_AUTO_BUFF).
import { CAST_AUTO_BUFF } from '../../../constants.js';

/** Open `unit`'s cast window for `seconds`; returns the buff or null. */
export function openCastWindow(battle, unit, seconds) {
  if (!unit?.alive || !(seconds > 0)) return null;
  return battle.addBuff(unit, { key: CAST_AUTO_BUFF, duration: seconds, tags: ['skill'] });
}
