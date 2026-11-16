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

import { num, isOp, playerOps, fxOn, unitBonds } from '../support/index.js';
import { addShieldLayer, installItem, PRIO_RESPAWN, reviveNow } from '../items/battle.js';
import { findSummonTile } from '../tokens.js';
import { hypot } from '../../detmath.js';

/** 'death' priority of a mark's revive: with 埃芒加德's band revive, after the operator's own savers. */
const PRIO_MARK_REVIVE = PRIO_RESPAWN - 1;
const markKey = (part) => `bandmark:${part}`;

/** Install the marks every marked operator carries into this battle, and the player-level ones (`bandMarks`). */
export function installMarks(battle) {
  const marked = battle.allyUnits.filter((u) => u && isOp(u) && Array.isArray(u.marks) && u.marks.length);
  const globals = [];
  for (const ps of battle.players) {
    for (const m of ps.input?.bandMarks ?? []) if (m && typeof m.tag === 'string') globals.push([ps, m]);
  }
  if (!marked.length && !globals.length) return;
  battle.on('battleStart', () => {
    for (const u of marked) {
      if (!u.alive || u.removed) continue;
      for (const m of u.marks) applyMark(battle, u, m);
    }
    for (const [ps, m] of globals) applyGlobal(battle, ps, m);
  });
}

function applyMark(battle, u, m) {
  if (!m || typeof m.tag !== 'string') return;
  if (m.tag === 'shield_on_attack') shieldOnAttack(battle, u, m);
  else if (m.tag === 'revive') reviveMark(battle, u, m);
  else if (m.tag === 'knockdown_summon') knockdownSummon(battle, u, m);
}

/** Player-level marks (bands/meta.js → PlayerState.bandGlobal → PlayerBattleInput bandMarks). */
function applyGlobal(battle, ps, m) {
  if (m.tag === 'fear_tile') fearTile(battle, m);
  else if (m.tag === 'treasure') treasure(battle, ps, m);
  else if (m.tag === 'lend_equip') lendEquip(battle, ps, m);
  else if (m.tag === 'egir_bench') egirBench(battle, ps, m);
}

/** 溃心领域: the first enemy to pass the tile after the battle starts is feared (`fear` seconds). */
function fearTile(battle, m) {
  const row = Math.round(num(m.row, -1)), col = Math.round(num(m.col, -1));
  const fear = Math.max(0.1, num(m.fear, 3));
  if (!(row >= 0 && col >= 0)) return;
  let fired = false;
  battle.on('tick', () => {
    if (fired) return;
    for (const e of battle.enemies) {
      if (!e.alive || e.hidden) continue;
      if (Math.abs(e.x - col) > 0.5 || Math.abs(e.y - row) > 0.5) continue;
      fired = true;
      battle.applyStatus(e, 'fear', { duration: fear, source: null });
      return;
    }
  });
}

/**
 * 宝藏探机: a “模拟宝藏” enemy on the tile. It never counts, never leaks and never holds the field open
 * (`mem.noFinish`); an enemy touching its tile makes it vanish; one still there at the battle's end pays `coin`
 * (battle coins reach the player's next prep through settle()).
 */
function treasure(battle, ps, m) {
  const row = Math.round(num(m.row, -1)), col = Math.round(num(m.col, -1));
  if (!(row >= 0 && col >= 0)) return;
  const chest = battle.spawnEnemy(m.enemyId || 'enemy_9038_achest', { pos: [row, col], countInTotal: false, ownerPlayerId: ps.playerId });
  if (!chest) return;
  chest.mem = chest.mem || {};
  chest.mem.noLeak = true;
  chest.mem.noFinish = true;
  battle.addBuff(chest, { key: markKey('chest'), flags: { untargetable: true }, persist: true, allowDead: true });
  let alive = true;
  // body overlap, not "its centre stands on the tile": a normal unit's 0.1-radius collider touches the tile when its
  // centre is within 0.5 + 0.1 of the tile centre; a huge unit's rectangle overlaps the tile. [ASSUMED] flyers count too
  // (the text does not exclude them) and the chest does not block (its record's block count is unused: the text says
  // touch, not block).
  const touches = (e) => {
    const hit = e.hitArea;
    if (hit) return Math.abs(e.x - col) <= hit.w / 2 + 0.5 + 1e-9 && Math.abs(e.y - row) <= hit.h / 2 + 0.5 + 1e-9;
    return hypot(e.x - col, e.y - row) <= 0.6 + 1e-9;
  };
  battle.on('tick', () => {
    if (!alive) return;
    if (!chest.alive) { alive = false; return; }
    for (const e of battle.enemies) {
      if (e === chest || !e.alive || e.hidden) continue;
      if (touches(e)) {
        alive = false;
        battle._remove(chest, 'retreat', null, true); // 触碰即永久消失, no kill / death bookkeeping
        return;
      }
    }
  });
  battle.on('battleEnd', () => {
    if (alive && chest.alive) battle.addCoins(ps.playerId, Math.max(1, Math.floor(num(m.coin, 1))));
  });
}

/** 电气化！: every deployed operator of the player with a free slot holds the item until the battle ends (lent). */
function lendEquip(battle, ps, m) {
  if (!m.itemId) return;
  const slots = Math.max(1, Math.floor(num(m.slots, 2)));
  for (const u of playerOps(battle, ps.playerId, { fieldOnly: true })) {
    if ((u.items?.length ?? 0) >= slots) continue;
    installItem(battle, u, m.itemId, { lent: true });
  }
}

/**
 * 规程 阿戈尔's second direction: the first `count` members of `bondId` knocked down summon the hand's rightmost
 * member of that bond at a free tile next to where they fell (the server resolved `summon` in battleInput).
 */
function egirBench(battle, ps, m) {
  let left = Math.max(0, Math.floor(num(m.count, 0)));
  if (!(left > 0) || !m.summon || !m.summon.chessId) return;
  const seen = new Set();
  battle.on('death', (c) => {
    if (left <= 0 || c.reason !== 'killed') return;
    const u = c.unit;
    if (!u || !isOp(u) || u.ownerId !== ps.playerId || seen.has(u)) return;
    if (m.bondId && !unitBonds(u).includes(m.bondId)) return;
    const tile = findSummonTile(battle, u, 'adjacent') || findSummonTile(battle, u, 'plus');
    if (!tile) return;
    const summoned = battle.spawnOperator(ps.playerId, m.summon, tile[0], tile[1]);
    if (!summoned) return;
    seen.add(u);
    left--;
    fxOn(battle, 'summon', summoned, markKey('egir_bench'), 'band');
  });
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
