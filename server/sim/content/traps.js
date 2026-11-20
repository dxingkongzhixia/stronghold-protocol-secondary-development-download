// server/sim/content/traps.js — 后兽's 古雕伥 (trap_258_rgcssm) and the 亢角兽 (enemy_1303_mhshep_2) it spits.
//
// 古雕伥 is a 装置 in the client tables (`excel/character_table.json` → `trap_258_rgcssm`), not an enemy: it has no
// attack and no movement, block 0, taunt -1, and it is attackable (默认类, enemy faction). We spawn it as an enemy unit
// with an inline def (it is not in the act3 `enemies.json`), because everything it does — the aura, the activation,
// the summon loop — is content, not a new engine entity.
//
// PRTS 古雕伥 (numbers from the client's own talent/skill blackboards):
//   · 自身及自身周围四格的敌人，受到来自这五格以外的物理/法术伤害 -75% (`damage_resistance` 0.75, `is_four_tile` 1)
//   · 这四格内的敌人 +50 攻速 / +50% 移速, 15 s (`move_speed` .5, `attack_speed` 50, `attri_duration` 15)
//   · 四格内的我方获得【无视雕伥减伤】 (positional in our damage pipeline; the buff is the visible marker)
//   · 未激活时不召唤敌人; 后兽【无为】把场上所有古雕伥切到张嘴模式
//   · 张嘴后每 20 s 沿地块预设路径吐一只亢角兽 (skill blackboard `talent@interval` 20 / `enemy_key`), 没有路径就
//     自动生成一条 (the talent's own `interval` 15 is the unused default; PRTS and the skill both say 20)
//   · 亢角兽 初始休憩, 受击后与周围其他亢角兽一同进入临战 (`enemy_1303_mhshep_2` description)

import { hypot } from '../detmath.js';

export const TRAP_KEY = 'trap_258_rgcssm';
export const HORN_KEY = 'enemy_1303_mhshep_2';

/** Level-1 古雕伥 (`trap_258_rgcssm`): 40 000 HP / 200 DEF / 30 RES, taunt -1, no block, no attack. */
export const TRAP_DEF = Object.freeze({
  name: '古雕伥',
  rank: 'NORMAL',
  applyWay: 'NONE',
  stats: {
    maxHp: 40000, atk: 500, def: 200, res: 30, moveSpeed: 0, bat: 1, aspd: 100,
    rangeRadius: 0, blockCnt: 1, tauntLevel: -1, massLevel: 0,
  },
  abilities: [
    { text: '可以被激活，未激活时不召唤敌人；自身及自身周围四格的敌人受到来自古雕伥自身周围四格以外的物理和法术伤害降低75%', format: 'NORMAL' },
  ],
  talents: { bb: {} },
  skills: [],
  tags: ['trap'],
  notCountInTotal: true,
  staticBody: true,
  spine: TRAP_KEY,
  iconId: TRAP_KEY,
});

/** 亢角兽 (`enemy_1303_mhshep_2`): 6 500 HP / 320 ATK / 0 DEF / 0.8 speed / 2.3 s interval. */
export const HORN_DEF = Object.freeze({
  name: '亢角兽',
  rank: 'NORMAL',
  applyWay: 'MELEE',
  stats: {
    maxHp: 6500, atk: 320, def: 0, res: 0, moveSpeed: 0.8, bat: 2.3, aspd: 100,
    rangeRadius: 0, blockCnt: 1, massLevel: 2,
  },
  abilities: [
    { text: '初始处于休憩状态，受攻击后与周围其他亢角兽一同进入临战状态', format: 'NORMAL' },
  ],
  talents: { bb: {} },
  skills: [],
  notCountInTotal: true,
  spine: HORN_KEY,
  iconId: HORN_KEY,
});

/** 张嘴后的召唤间隔 (s) — skill blackboard `talent@interval`, PRTS 20. */
const SUMMON_INTERVAL = 20;
/** 闭嘴 skill: cost / duration (client `sktok_rgcssm`: `cost` 20, `duration` 150; one use per battle). */
export const TRAP_CLOSE_COST = 20, TRAP_CLOSE_SECONDS = 150;
/** 亢角兽 wakes when one of its kind is hit: the same group within radius 1.1 (PRTS 亢角兽). */
const HORN_WAKE_RANGE = 1.1;
/** 亢角兽 休憩 自缚 time (s, PRTS 亢角兽 "默认为150秒"). */
const HORN_REST_SECONDS = 150;
/** Aura refresh cadence (s); the 雕伥加速 is 15 s (PRTS), the 无视雕伥减伤 marker dies at once on leaving (0.3 s). */
const AURA_REFRESH = 0.25, HASTE_LIFE = 15, PIERCE_LIFE = 0.3;

const tileKey = (r, c) => `${Math.round(r)},${Math.round(c)}`;

function waitAt(y, x) {
  return { motion: 'WALK', start: [y, x], end: [y, x], steps: [{ t: 'wait', s: 99999 }] };
}

function toEnd(b, y, x) {
  const end = b.grid.specialTiles('end')[0] || [Math.round(y), Math.round(x)];
  return { motion: 'WALK', start: [y, x], end, checkpoints: [] };
}

function inZone(zone, u) {
  return !!u && u.alive && zone.tiles.has(tileKey(u.tileR, u.tileC));
}

/** 后兽【并济】deploy tile: a random passable, unoccupied tile in the target's 8-neighbourhood (PRTS). */
export function trapSpot(b, target) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = target.tileR + dr, c = target.tileC + dc;
      if (!b.grid.inRect(r, c) || !b.grid.groundPassable(r, c) || b.unitAt(r, c)) continue;
      out.push([r, c]);
    }
  }
  return out.length ? b.rng.pick(out) : null;
}

/** Spawn a 古雕伥 on `[r, c]` (后兽 并济). */
export function spawnTrap(b, boss, [r, c]) {
  const u = b.spawnEnemy(TRAP_KEY, {
    def: TRAP_DEF, pos: [r, c], route: waitAt(r, c), tag: 'trap', countInTotal: false,
    ownerPlayerId: boss?.ownerId ?? null, sourcePlayerId: boss?.sourcePlayerId ?? null,
  });
  if (u) {
    u.blockWeight = 0;                                  // 阻挡数 0 (the def normaliser floors it at 1)
    b.fx('summon', { x: c, y: r, id: u.id, key: TRAP_KEY, n: 1 });
  }
  return u;
}

/** 后兽【无为】: switch every 古雕伥 on the field into its open (summoning) mode. */
export function activateTraps(b) {
  for (const e of b.aliveEnemies()) if (e.defId === TRAP_KEY) activateTrap(b, e);
}

export function activateTrap(b, e) {
  const a = trapState(e);
  if (!a || a.active) return;
  a.active = true;
  a.acc = 0;
  b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'trap_open' });
}

/** The trap kit's state object (the list entry carrying `zone`), or null. */
export function trapState(u) {
  const ab = u && u.mem && u.mem.ab;
  return (ab && ab.list.find((x) => x && x.zone)) || null;
}

/**
 * 古雕伥's own skill (`sktok_rgcssm`): the player spends 20 DP to make it close its mouth for 150 s; it stops
 * spitting, summons once the moment it reopens, and can be used only once per battle (its SP never refills).
 * Called by Battle.closeTrap (server/sim/battle/traps.js) from the battle HUD / E2E.
 */
export function closeTrap(b, u) {
  if (!u || !u.alive || !u.mem || !u.mem.trap) return false;
  const a = trapState(u);
  if (!a || !a.active || a.closed || a.used) return false;
  const ps = (u.ownerId != null && typeof b.getPlayer === 'function' ? b.getPlayer(u.ownerId) : null) || b.players?.[0] || null;
  if (!ps || !(ps.dp + 1e-9 >= TRAP_CLOSE_COST)) return false;
  ps.dp = Math.max(0, ps.dp - TRAP_CLOSE_COST);
  a.closed = true;
  a.used = true;
  a.closedUntil = b.time + TRAP_CLOSE_SECONDS;
  a.acc = 0;
  b.fx('phase', { x: u.x, y: u.y, id: u.id, kind: 'trap_close' });
  return true;
}

/** Spawn one 亢角兽 at the trap, on the tile's preset path (auto-generated when the level has none). */
function spitHorn(b, trap) {
  const r = trap.tileR, c = trap.tileC;
  const u = b.spawnEnemy(HORN_KEY, {
    def: HORN_DEF, pos: [r, c], route: toEnd(b, r, c), tag: 'summon', countInTotal: false,
    ownerPlayerId: trap.ownerId ?? null,
  });
  if (u) b.fx('summon', { x: c, y: r, id: trap.id, key: HORN_KEY, n: 1 });
  return u;
}

/** Wake a resting 亢角兽 (and, from a `hit`, its group): 【临战】移动速度 +200 % (×3, PRTS). */
function wakeHorn(b, e, a) {
  if (!a.resting) return;
  a.resting = false;
  b.removeBuff(e, 'reg:hornRest');
  b.removeBuff(e, 'reg:hornBound');
  b.addBuff(e, { key: 'reg:hornReady', persist: true, visible: true, mods: { moveMul: 3 } });
}

function wakeGroup(b, src, a) {
  wakeHorn(b, src, a);
  for (const o of b.aliveEnemies()) {
    if (o === src || o.defId !== HORN_KEY || !o.mem.ab) continue;
    // PRTS: 半径 1.1 范围内的其它角兽/亢角兽.
    if (hypot(o.x - src.x, o.y - src.y) <= HORN_WAKE_RANGE) wakeHorn(b, o, o.mem.ab);
  }
}

export function kitTrap() {
  return [{
    spawn(b, e, a) {
      a.zone = { r: e.tileR, c: e.tileC, tiles: new Set() };
      a.zone.tiles.add(tileKey(e.tileR, e.tileC));
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        a.zone.tiles.add(tileKey(e.tileR + dr, e.tileC + dc));
      }
      (b.trapZones || (b.trapZones = [])).push(a.zone);
      e.blockWeight = 0;
      e.profile.noAttack = true;
      b.addBuff(e, { key: 'reg:trapRoot', persist: true, flags: { noMove: true } });   // a device holds its tile
      a.active = false;
      a.acc = 0;
      a.aura = 0;
      a.closed = false;
      a.used = false;
      e.mem.trap = true;                             // the battle's closeTrap / snapshot find it without the key
    },
    tick(b, e, a, dt) {
      // Aura (always on, activated or not): enemies in the 4-neighbourhood gain +50 ASPD / +50 % move, allies inside
      // carry the 【无视雕伥减伤】 marker. The 75 % damage cut itself is positional (sim/damage.js).
      a.aura += dt;
      if (a.aura >= AURA_REFRESH) {
        a.aura = 0;
        for (const o of b.aliveEnemies()) {
          if (!inZone(a.zone, o)) continue;
          b.addBuff(o, { key: 'reg:trapHaste', duration: HASTE_LIFE, refresh: 'replace', mods: { aspd: 50, moveMul: 1.5 } });
        }
        for (const u of b.allies()) {
          if (inZone(a.zone, u)) b.addBuff(u, { key: 'reg:trapPierce', duration: PIERCE_LIFE, refresh: 'replace', visible: true });
        }
      }
      if (a.closed) {
        if (b.time + 1e-9 < a.closedUntil) return;
        // "技能结束时会立刻召唤一次敌人，随后重新张嘴" (PRTS 古雕伥 技能1)
        a.closed = false;
        a.acc = 0;
        b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'trap_open' });
        spitHorn(b, e);
        return;
      }
      if (!a.active) return;
      a.acc += dt;
      if (a.acc + 1e-9 < SUMMON_INTERVAL) return;
      a.acc = 0;
      spitHorn(b, e);
    },
    death(c, b, e, a) {
      const zones = b.trapZones;
      if (!zones) return;
      const i = zones.indexOf(a.zone);
      if (i >= 0) zones.splice(i, 1);
      for (const o of b.aliveEnemies()) b.removeBuff(o, 'reg:trapHaste');
      for (const u of b.allies()) b.removeBuff(u, 'reg:trapPierce');
    },
  }];
}

export function kitHorn() {
  return [{
    spawn(b, e, a) {
      a.resting = true;
      // PRTS 亢角兽: 休憩 = no attack; 自缚 lasts 150 s (it may walk after that, but still does not attack until 临战).
      b.addBuff(e, { key: 'reg:hornRest', persist: true, visible: true, flags: { disarm: true } });
      b.addBuff(e, { key: 'reg:hornBound', duration: HORN_REST_SECONDS, visible: true, flags: { noMove: true } });
    },
    taken(c, b, e, a) {
      if (a.resting) wakeGroup(b, e, a);
    },
    tick(b, e, a) {
      if (a.resting && e.hp < e.s.maxHp) wakeGroup(b, e, a);   // a DoT / pool loss without a `taken` hook
    },
  }];
}

/** Kits for the two synthetic 古雕伥 units. Kept out of BOSS_KITS: `test/content/enemies_bosses.test.js` requires every
 *  BOSS_KITS key to exist in the act3 enemies.json, and both keys are spawned with inline defs (they are not table rows). */
export const TRAP_KITS = Object.freeze({
  [TRAP_KEY]: kitTrap,
  [HORN_KEY]: kitHorn,
});
