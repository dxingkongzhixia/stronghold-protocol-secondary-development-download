// server/sim/battle/traps.js — Battle method for 古雕伥's own close-mouth skill (规程 boss 后兽's traps).
// Installed on Battle.prototype by server/sim/Battle.js (a method container: never instantiated; `this` is the battle).
//
// The skill is the player's counter to an active 古雕伥: 20 DP, 150 s, one use per battle (client `sktok_rgcssm`).
// The rules live in content/traps.js; this module is only the action entry point the client HUD / E2E calls.

import { closeTrap, trapState } from '../content/traps.js';

export class BattleTraps {
  /** Close trap `unitOrId` (enemy unit or its id). False when it is missing, already used, or the player lacks 20 DP. */
  closeTrap(unitOrId) {
    const u = unitOrId && typeof unitOrId === 'object'
      ? unitOrId
      : this.enemies.find((e) => e && e.alive && e.id === unitOrId);
    return closeTrap(this, u || null);
  }

  /** `{ active, closed, used }` of a trap unit, or null. */
  trapState(unitOrId) {
    const u = unitOrId && typeof unitOrId === 'object'
      ? unitOrId
      : this.enemies.find((e) => e && e.alive && e.id === unitOrId);
    const a = u ? trapState(u) : null;
    return a ? { active: !!a.active, closed: !!a.closed, used: !!a.used } : null;
  }
}
