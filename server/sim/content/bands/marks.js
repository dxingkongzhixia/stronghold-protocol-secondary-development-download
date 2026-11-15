// server/sim/content/bands/marks.js — marks an active band skill puts on ONE operator for its next battle
// (PlayerBattleInput units[].marks; the server side is bands/meta.js `skill_mark_char_inst_tag`, PlayerState.bandMarks).
//
//   revive            eff_band12 意志鼓舞   at battle start the operator is knocked down and revived at once
//                                             (`startDead`), then the battle's first `count` knock-downs revive it too
//   shield_on_attack  eff_band17/18 药枚实验 every attack has `prob` to gain a shield layer (cap 1; 35 % from R7)
//   knockdown_summon  eff_band22 消解空间   the first damage it takes knocks it down and deploys the bench operator
//                                             the server resolved into `summon` (the hand's rightmost)
//   battle_upgrade    eff_band14 全场聚焦   server-side only: battleInput() fields the elite form (round.js)
//
// Marks are read once, at the battle's start; an operator that never deploys never fires them.

import { num, isOp, fxOn } from '../support/index.js';
import { addShieldLayer, PRIO_RESPAWN, reviveNow } from '../items/battle.js';
import { findSummonTile } from '../tokens.js';

/** 'death' priority of a mark's revive: with 埃芒加德's band revive, after the operator's own savers. */
const PRIO_MARK_REVIVE = PRIO_RESPAWN - 1;
const markKey = (part) => `bandmark:${part}`;

/** Install the marks every marked operator carries into this battle. */
export function installMarks(battle) {
  const marked = battle.allyUnits.filter((u) => u && isOp(u) && Array.isArray(u.marks) && u.marks.length);
  if (!marked.length) return;
  battle.on('battleStart', () => {
    for (const u of marked) {
      if (!u.alive || u.removed) continue;
      for (const m of u.marks) applyMark(battle, u, m);
    }
  });
}

function applyMark(battle, u, m) {
  if (!m || typeof m.tag !== 'string') return;
  if (m.tag === 'shield_on_attack') shieldOnAttack(battle, u, m);
  else if (m.tag === 'revive') reviveMark(battle, u, m);
  else if (m.tag === 'knockdown_summon') knockdownSummon(battle, u, m);
}

function shieldOnAttack(battle, u, m) {
  const p = Math.max(0, Math.min(1, num(m.prob, 0)));
  if (!(p > 0)) return;
  const cap = Math.max(1, Math.floor(num(m.cap, 1)));
  const key = markKey('shield');
  battle.on('attack', (c) => {
    if (c.attacker !== u || !u.alive) return;
    if (!(p >= 1 || battle.rng() < p)) return;
    if (addShieldLayer(battle, u, key, cap)) fxOn(battle, 'shield', u, key, 'band');
  });
}

function reviveMark(battle, u, m) {
  // "下次战斗开始时立即击倒并复活": the start knock-down comes first; the extra revives are counted after it
  if (m.startDead) {
    battle.kill(u);
    if (!u.alive) reviveNow(battle, { unit: u, reason: 'killed' }, 'band');
    if (!u.alive) return;
  }
  let left = Math.max(0, Math.floor(num(m.count, 0)));
  if (!(left > 0)) return;
  const key = markKey('revive');
  battle.on('death', (c) => {
    if (left <= 0 || c.unit !== u || !reviveNow(battle, c, 'band')) return;
    left--;
    fxOn(battle, 'revive', u, key, 'band', { left });
  }, { priority: PRIO_MARK_REVIVE });
}

function knockdownSummon(battle, u, m) {
  let fired = false;
  battle.on('damaged', (c) => {
    if (fired || c.target !== u || !u.alive) return;
    fired = true;
    const input = m.summon;
    const tile = findSummonTile(battle, u, 'adjacent') || findSummonTile(battle, u, 'plus');
    battle.kill(u);
    if (!input || !input.chessId || !tile) return;
    const spawned = battle.spawnOperator(u.ownerId, input, tile[0], tile[1]);
    if (spawned) fxOn(battle, 'summon', spawned, markKey('summon'), 'band');
  });
}
